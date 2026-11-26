import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startStaticServer, launchBrowser, rootDir, webDir } from './test_helper.mjs';

const CORE_DIR = path.join(rootDir, 'cores', 'ppsspp');
const PATCH_0001 = path.join(CORE_DIR, 'patches', '0001-ppsspp-stream-vfs-loader-and-modularize.patch');
const BUILD_SCRIPT = path.join(rootDir, 'scripts', 'build_ppsspp_core.sh');
const CORE_PORT_DOC = path.join(rootDir, 'docs', 'CORE_PORT.md');

test('AC-1.1: Reproducible PPSSPP Core Build Metadata & COOP/COEP Serving', async () => {
    assert.ok(fs.existsSync(BUILD_SCRIPT), 'scripts/build_ppsspp_core.sh must exist');
    const st = fs.statSync(BUILD_SCRIPT);
    assert.ok((st.mode & 0o111) !== 0, 'scripts/build_ppsspp_core.sh must be executable');

    assert.ok(fs.existsSync(PATCH_0001), 'cores/ppsspp/patches/0001-ppsspp-stream-vfs-loader-and-modularize.patch must exist');

    const portDoc = fs.readFileSync(CORE_PORT_DOC, 'utf8');
    assert.ok(portDoc.includes('4d0564bc687b86d2f88e132d79ea118e290b004b'), 'docs/CORE_PORT.md must pin upstream commit SHA');
    assert.ok(portDoc.includes('6.0.12'), 'docs/CORE_PORT.md must document Emscripten 6.0.12');
    assert.ok(portDoc.includes('VfsIpcMailbox'), 'docs/CORE_PORT.md must document VfsIpcMailbox ABI');
    assert.ok(portDoc.includes('_ppsspp_stream_get_ipc_ptr'), 'docs/CORE_PORT.md must document exported C ABI');

    for (const fname of ['PPSSPPSDL.js', 'PPSSPPSDL.wasm', 'PPSSPPSDL.data']) {
        assert.ok(fs.existsSync(path.join(CORE_DIR, fname)), `cores/ppsspp/${fname} must exist`);
    }

    const gowPackDir = path.join(rootDir, 'dist', 'games', 'gow_coo');
    if (!fs.existsSync(path.join(gowPackDir, 'manifest.bin'))) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { server, url } = await startStaticServer({ packDir: gowPackDir });
    try {
        for (const fname of ['PPSSPPSDL.js', 'PPSSPPSDL.wasm', 'PPSSPPSDL.data']) {
            const resp = await fetch(`${url}cores/ppsspp/${fname}`);
            assert.equal(resp.status, 200, `/cores/ppsspp/${fname} must return HTTP 200`);
            assert.equal(resp.headers.get('cross-origin-opener-policy'), 'same-origin');
            assert.equal(resp.headers.get('cross-origin-embedder-policy'), 'require-corp');
            assert.equal(resp.headers.get('cross-origin-resource-policy'), 'cross-origin');
        }
    } finally {
        server.close();
    }
});

test('AC-1.2 & AC-1.3: Worker A ATTACH_VFS_IPC Mailbox Protocol, Strict EOF, and Abort Wake', async () => {
    const gowPackDir = path.join(rootDir, 'dist', 'games', 'gow_coo');
    if (!fs.existsSync(path.join(gowPackDir, 'manifest.bin'))) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { server, url } = await startStaticServer({ packDir: gowPackDir });
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const res = await page.evaluate(async () => {
            const channel = new MessageChannel();
            const workerA = new Worker('worker_a.js', { type: 'module' });
            const workerB = new Worker('worker_b.js', { type: 'module' });

            workerA.postMessage({ type: 'PORT', port: channel.port1 }, [channel.port1]);
            workerB.postMessage({ type: 'PORT', port: channel.port2 }, [channel.port2]);

            await new Promise((resolve, reject) => {
                workerB.addEventListener('message', (e) => {
                    if (e.data?.type === 'STATUS' && e.data.phase === 'running') resolve();
                });
                setTimeout(() => reject(new Error('Timeout waiting for Worker B')), 5000);
            });

            let nextId = 1;
            const sendA = (msg) => new Promise((resolve, reject) => {
                const id = nextId++;
                const onMsg = (e) => {
                    if (e.data && e.data.id === id) {
                        workerA.removeEventListener('message', onMsg);
                        resolve(e.data);
                    }
                };
                workerA.addEventListener('message', onMsg);
                workerA.postMessage({ ...msg, id });
                setTimeout(() => reject(new Error(`Timeout waiting for ${msg.type}`)), 5000);
            });

            const openRes = await sendA({ type: 'DISC_OPEN', path: 'game.iso' });
            if (!openRes.ok) throw new Error('DISC_OPEN failed');
            const discSize = BigInt(openRes.size);

            // Allocate a 1 MiB SharedArrayBuffer with non-zero 64-byte aligned byteOffset
            const BYTE_OFFSET = 128;
            const ipcSab = new SharedArrayBuffer(1024 * 1024);
            const i32 = new Int32Array(ipcSab, BYTE_OFFSET, 16);
            const u32 = new Uint32Array(ipcSab, BYTE_OFFSET, 16);
            const u64 = new BigUint64Array(ipcSab, BYTE_OFFSET, 8);
            const payload = new Uint8Array(ipcSab, BYTE_OFFSET + 64, 524288);

            u64[4] = discSize;

            const attachPromise = new Promise((resolve, reject) => {
                const onMsg = (e) => {
                    if (e.data?.type === 'VFS_IPC_ATTACHED') {
                        workerA.removeEventListener('message', onMsg);
                        resolve(e.data);
                    }
                };
                workerA.addEventListener('message', onMsg);
                setTimeout(() => reject(new Error('Timeout waiting for VFS_IPC_ATTACHED')), 5000);
            });
            workerA.postMessage({ type: 'ATTACH_VFS_IPC', ipcSab, byteOffset: BYTE_OFFSET });
            const attachRes = await attachPromise;

            // Spawn a dedicated test pthread-like worker that can block on Atomics.wait
            const testerBlob = new Blob([`
                self.onmessage = (e) => {
                    const { ipcSab, byteOffset, ops } = e.data;
                    const i32 = new Int32Array(ipcSab, byteOffset, 16);
                    const u32 = new Uint32Array(ipcSab, byteOffset, 16);
                    const u64 = new BigUint64Array(ipcSab, byteOffset, 8);
                    const payload = new Uint8Array(ipcSab, byteOffset + 64, 524288);

                    const results = [];
                    for (const op of ops) {
                        if (op.kind === 'wait_abort') {
                            const seq = Atomics.load(i32, 1);
                            self.postMessage({ type: 'WAIT_READY' });
                            while (Atomics.load(i32, 4) === 0 && Atomics.load(i32, 1) === seq) {
                                Atomics.wait(i32, 1, seq, 2000);
                            }
                            results.push({ aborted: Atomics.load(i32, 4) === 1 });
                            continue;
                        }
                        u64[3] = BigInt(op.offset);
                        Atomics.store(u32, 5, op.len);
                        Atomics.store(i32, 3, 0); // status = PENDING
                        Atomics.store(i32, 2, 1); // op = READ
                        const seq = Atomics.load(i32, 1);
                        Atomics.add(i32, 0, 1);
                        Atomics.notify(i32, 0, 1);
                        while (Atomics.load(i32, 1) === seq && Atomics.load(i32, 4) === 0) {
                            Atomics.wait(i32, 1, seq, 5000);
                        }
                        const status = Atomics.load(i32, 3);
                        const sliceCopy = status === 1 ? Array.from(payload.slice(0, Math.min(op.inspectLen || 64, op.len))) : [];
                        const tailCopy = status === 1 && op.tailOffset ? Array.from(payload.slice(op.tailOffset, op.tailOffset + 32)) : [];
                        results.push({ status, sliceCopy, tailCopy });
                    }
                    self.postMessage({ type: 'DONE', results });
                };
            `], { type: 'application/javascript' });
            const testerUrl = URL.createObjectURL(testerBlob);
            const tester = new Worker(testerUrl);

            const readResults = await new Promise((resolve, reject) => {
                tester.onmessage = (e) => {
                    if (e.data?.type === 'DONE') resolve(e.data.results);
                };
                tester.onerror = (err) => reject(err);
                tester.postMessage({
                    ipcSab,
                    byteOffset: BYTE_OFFSET,
                    ops: [
                        // 1. Sector 16 ISO9660 PVD
                        { offset: 0x8000, len: 2048, inspectLen: 64 },
                        // 2. 512 KiB read crossing 256 KiB VFS block boundary
                        { offset: 0x10000, len: 524288, inspectLen: 32, tailOffset: 262144 },
                        // 3. Unaligned offset & odd length
                        { offset: 0x8001, len: 17, inspectLen: 17 },
                        // 4. Strict EOF at exact discSize
                        { offset: Number(discSize), len: 2048 },
                        // 5. Strict EOF straddling beyond discSize
                        { offset: Number(discSize) - 512, len: 1024 }
                    ]
                });
                setTimeout(() => reject(new Error('Timeout running IPC ops')), 10000);
            });

            // 6. Test zero-lost-wakeup abort on waiting worker
            const abortPromise = new Promise((resolve, reject) => {
                tester.onmessage = (e) => {
                    if (e.data?.type === 'WAIT_READY') {
                        Atomics.store(i32, 4, 1);
                        Atomics.add(i32, 1, 1);
                        Atomics.notify(i32, 1, 1);
                        Atomics.add(i32, 0, 1);
                        Atomics.notify(i32, 0, 1);
                    } else if (e.data?.type === 'DONE') {
                        resolve(e.data.results[0]);
                    }
                };
                setTimeout(() => reject(new Error('Abort wakeup deadlocked')), 3000);
            });
            tester.postMessage({ ipcSab, byteOffset: BYTE_OFFSET, ops: [{ kind: 'wait_abort' }] });
            const abortRes = await abortPromise;

            tester.terminate();
            URL.revokeObjectURL(testerUrl);
            workerA.terminate();
            workerB.terminate();

            return {
                attachOk: attachRes.ok === true,
                pvdMagic: String.fromCharCode(...readResults[0].sliceCopy.slice(1, 6)),
                pvdSys: String.fromCharCode(...readResults[0].sliceCopy.slice(8, 16)),
                crossBlockHead: String.fromCharCode(...readResults[1].sliceCopy.slice(0, 26)),
                crossBlockTail: String.fromCharCode(...readResults[1].tailCopy.slice(0, 27)),
                unalignedStr: String.fromCharCode(...readResults[2].sliceCopy.slice(0, 5)),
                eofExactStatus: readResults[3].status,
                eofStraddleStatus: readResults[4].status,
                abortRes
            };
        });

        assert.equal(res.attachOk, true);
        assert.equal(res.pvdMagic, 'CD001');
        assert.equal(res.pvdSys, 'PSP GAME');
        assert.ok(res.crossBlockHead.startsWith('[PSP_UCUS-98653_SECTOR_32]'), `Unexpected head: ${res.crossBlockHead}`);
        assert.ok(res.crossBlockTail.startsWith('[PSP_UCUS-98653_SECTOR_160]'), `Unexpected tail across 256K boundary: ${res.crossBlockTail}`);
        assert.equal(res.unalignedStr, 'CD001');
        assert.equal(res.eofExactStatus, -1);
        assert.equal(res.eofStraddleStatus, -1);
        assert.equal(res.abortRes.aborted, true);
    } finally {
        await browser.close();
        server.close();
    }
});

test('AC-1.2 & AC-1.3: Real PPSSPPSDL WASM Core Boots /vfs/game.iso via WasmVfsFileLoader IPC and Shuts Down Without Deadlock', async () => {
    const gowPackDir = path.join(rootDir, 'dist', 'games', 'gow_coo');
    if (!fs.existsSync(path.join(gowPackDir, 'manifest.bin'))) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    // Custom HTTP server wrapping pack + rootDir so we can count Range bytes transferred on /packs/
    let packBytesTransferred = 0;
    const MIME = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
        '.data': 'application/octet-stream'
    };
    const server = http.createServer((req, res) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');

        let reqPath = req.url.split('?')[0];
        let filePath;
        if (reqPath === '/manifest.bin' || reqPath.startsWith('/packs/')) {
            filePath = path.join(gowPackDir, path.basename(reqPath));
        } else if (reqPath.startsWith('/cores/')) {
            filePath = path.join(rootDir, reqPath);
        } else {
            if (reqPath === '/') reqPath = '/index.html';
            filePath = path.join(webDir, reqPath);
        }

        if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }
        res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
            const stat = fs.statSync(filePath);
            const m = rangeHeader.match(/bytes=(\d+)-(\d+)/);
            if (m) {
                const start = parseInt(m[1], 10);
                const end = parseInt(m[2], 10);
                if (reqPath.startsWith('/packs/')) {
                    packBytesTransferred += (end - start + 1);
                }
                res.statusCode = 206;
                res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                res.setHeader('Content-Length', end - start + 1);
                fs.createReadStream(filePath, { start, end }).pipe(res);
                return;
            }
        }
        fs.createReadStream(filePath).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const runResult = await page.evaluate(async () => {
            const channel = new MessageChannel();
            const workerA = new Worker('worker_a.js', { type: 'module' });
            const workerB = new Worker('worker_b.js', { type: 'module' });

            workerA.postMessage({ type: 'PORT', port: channel.port1 }, [channel.port1]);
            workerB.postMessage({ type: 'PORT', port: channel.port2 }, [channel.port2]);

            await new Promise((resolve, reject) => {
                workerB.addEventListener('message', (e) => {
                    if (e.data?.type === 'STATUS' && e.data.phase === 'running') resolve();
                });
                setTimeout(() => reject(new Error('Timeout waiting for Worker B')), 5000);
            });

            let nextId = 1;
            const sendA = (msg) => new Promise((resolve, reject) => {
                const id = nextId++;
                const onMsg = (e) => {
                    if (e.data && e.data.id === id) {
                        workerA.removeEventListener('message', onMsg);
                        resolve(e.data);
                    }
                };
                workerA.addEventListener('message', onMsg);
                workerA.postMessage({ ...msg, id });
                setTimeout(() => reject(new Error(`Timeout waiting for ${msg.type}`)), 5000);
            });

            const openRes = await sendA({ type: 'DISC_OPEN', path: 'game.iso' });
            const discSize = openRes.size;

            const canvas = document.getElementById('emulator-canvas');
            const { default: createPpssppModule } = await import('/cores/ppsspp/PPSSPPSDL.js');

            let firstFrame = false;
            let shutdownCompleted = false;
            let shutdownResolve = null;
            const shutdownPromise = new Promise((r) => { shutdownResolve = r; });

            const logs = [];
            const mod = await createPpssppModule({
                noInitialRun: true,
                canvas,
                locateFile: (p) => `/cores/ppsspp/${p}`,
                print: (txt) => logs.push(txt),
                printErr: (txt) => logs.push(txt),
                onFirstFrame: () => { firstFrame = true; },
                onShutdownComplete: () => {
                    shutdownCompleted = true;
                    if (shutdownResolve) shutdownResolve();
                }
            });

            const isSab = mod.HEAPU8.buffer instanceof SharedArrayBuffer;
            const ipcPtr = mod._ppsspp_stream_get_ipc_ptr();
            mod._ppsspp_stream_set_disc_size(BigInt(discSize));

            const attached = await new Promise((resolve, reject) => {
                const onMsg = (e) => {
                    if (e.data?.type === 'VFS_IPC_ATTACHED') {
                        workerA.removeEventListener('message', onMsg);
                        resolve(e.data);
                    }
                };
                workerA.addEventListener('message', onMsg);
                workerA.postMessage({
                    type: 'ATTACH_VFS_IPC',
                    ipcSab: mod.HEAPU8.buffer,
                    byteOffset: ipcPtr
                });
                setTimeout(() => reject(new Error('Timeout waiting for VFS_IPC_ATTACHED')), 5000);
            });

            mod.callMain(['/vfs/game.iso']);

            // Wait for at least 1 rendered frame or 5s
            const deadline = performance.now() + 8000;
            while (performance.now() < deadline && mod._ppsspp_stream_get_frame_count() < 1) {
                await new Promise((r) => setTimeout(r, 50));
            }
            const framesBeforeShutdown = mod._ppsspp_stream_get_frame_count();

            // Trigger non-blocking shutdown
            const t0 = performance.now();
            mod._ppsspp_stream_request_shutdown();
            await Promise.race([
                shutdownPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown deadlocked after 4000ms')), 4000))
            ]);
            const shutdownMs = performance.now() - t0;

            mod.PThread?.terminateAllThreads?.();
            workerA.terminate();
            workerB.terminate();

            return {
                isSab,
                ipcPtrAligned: (ipcPtr % 64) === 0,
                attachedOk: attached.ok === true,
                discSize,
                framesBeforeShutdown,
                firstFrame,
                shutdownCompleted,
                shutdownMs,
                sawVfsProbe: logs.some((l) => l.includes('/vfs/game.iso') || l.includes('CD001') || l.includes('Identify'))
            };
        });

        assert.equal(runResult.isSab, true, 'PPSSPPSDL memory must be SharedArrayBuffer');
        assert.equal(runResult.ipcPtrAligned, true, 'g_ipc_mailbox pointer must be 64-byte aligned');
        assert.equal(runResult.attachedOk, true);
        assert.ok(runResult.framesBeforeShutdown >= 1, `Expected >= 1 rendered frame, got ${runResult.framesBeforeShutdown}`);
        assert.equal(runResult.firstFrame, true);
        assert.equal(runResult.shutdownCompleted, true);
        assert.ok(runResult.shutdownMs < 3000, `Shutdown took too long: ${runResult.shutdownMs}ms`);
        assert.ok(packBytesTransferred > 0 && packBytesTransferred <= runResult.discSize,
            `Expected partial range transfer <= ${runResult.discSize}, got ${packBytesTransferred}`);
    } finally {
        await browser.close();
        server.close();
    }
});
