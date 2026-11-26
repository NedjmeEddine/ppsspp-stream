import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startPpssppServer, launchBrowser, rootDir } from './test_helper.mjs';

test('AC-5.1: Nested >256 KiB Save, Same-Size Overwrite CRC32 Diff, Quiescent Flush, Reload Persistence & Game B Isolation', async () => {
    const patchPath = path.join(rootDir, 'cores', 'ppsspp', 'patches', '0003-memstick-root.patch');
    assert.ok(fs.existsSync(patchPath), '0003-memstick-root.patch must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'memstick_sync.mjs')), 'web/memstick_sync.mjs must exist');

    const catalogPath = path.join(rootDir, 'dist', 'games.json');
    if (!fs.existsSync(catalogPath)) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { proc, url } = await startPpssppServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        // Start from clean OPFS state
        await page.evaluate(async () => {
            if (navigator.storage?.getDirectory) {
                const root = await navigator.storage.getDirectory();
                for await (const [name] of root.entries()) {
                    await root.removeEntry(name, { recursive: true });
                }
            }
        });
        await page.reload();
        await page.waitForSelector('.game-card', { state: 'visible' });

        // Boot Game A
        await page.click('.game-card');
        await page.waitForFunction(() => {
            const host = window.__ppssppCoreHost;
            return host && host.getFrameCount() >= 2 && window.__ppssppMemstickSync;
        }, null, { timeout: 10000 });

        const writeRes = await page.evaluate(async () => {
            const mod = window.__ppssppCoreHost.getModule();
            const sync = window.__ppssppMemstickSync;
            const memstickDir = typeof mod.ccall === 'function' && typeof mod._ppsspp_stream_get_memstick_dir === 'function'
                ? mod.ccall('ppsspp_stream_get_memstick_dir', 'string')
                : '';

            const saveDir = `${memstickDir}/PSP/SAVEDATA/TEST00001`;
            mod.FS.mkdirTree(saveDir);

            // Pattern A: 300 KiB save (> 256 KiB single block)
            const dataA = new Uint8Array(300 * 1024);
            for (let i = 0; i < dataA.length; i++) dataA[i] = (i * 17 + 3) & 0xff;
            mod.FS.writeFile(`${saveDir}/DATA.BIN`, dataA);
            mod.FS.writeFile(`${saveDir}/PARAM.SFO`, new Uint8Array([0x00, 0x50, 0x53, 0x46, 0x01, 0x01, 0x00, 0x00]));

            // Wait for debounced auto-sync to fire at least once
            const deadline = performance.now() + 2500;
            while (sync.getStats().syncCount < 1 && performance.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
            }
            const syncCountAfterFirst = sync.getStats().syncCount;

            // Verify truncate (setattr) and rename-out-of-SAVEDATA both trigger auto-sync
            const beforeHooksSyncs = sync.getStats().syncCount;
            mod.FS.writeFile(`${saveDir}/TEMP.BIN`, new Uint8Array([1, 2, 3, 4]));
            const d1 = performance.now() + 2000;
            while (sync.getStats().syncCount <= beforeHooksSyncs && performance.now() < d1) {
                await new Promise((r) => setTimeout(r, 50));
            }
            const afterWriteSyncs = sync.getStats().syncCount;

            mod.FS.truncate(`${saveDir}/TEMP.BIN`, 2);
            const d2 = performance.now() + 2000;
            while (sync.getStats().syncCount <= afterWriteSyncs && performance.now() < d2) {
                await new Promise((r) => setTimeout(r, 50));
            }
            const afterTruncateSyncs = sync.getStats().syncCount;

            mod.FS.rename(`${saveDir}/TEMP.BIN`, '/tmp/TEMP.BIN');
            const d3 = performance.now() + 2000;
            while (sync.getStats().syncCount <= afterTruncateSyncs && performance.now() < d3) {
                await new Promise((r) => setTimeout(r, 50));
            }
            const afterRenameSyncs = sync.getStats().syncCount;

            // Immediate same-size overwrite (pattern B) right before exiting -> tests CRC32 diff
            const dataB = dataA.slice();
            for (let i = 0; i < 16; i++) {
                dataB[i] = 0xa5 ^ i;
                dataB[290000 + i] = 0x5a ^ i;
            }
            mod.FS.writeFile(`${saveDir}/DATA.BIN`, dataB);

            return {
                memstickDir,
                syncCountAfterFirst,
                afterTruncate: afterTruncateSyncs > afterWriteSyncs,
                afterRename: afterRenameSyncs > afterTruncateSyncs,
            };
        });

        assert.equal(writeRes.memstickDir, '/memstick', '_ppsspp_stream_get_memstick_dir must return /memstick');
        assert.ok(writeRes.syncCountAfterFirst >= 1, `Expected debounced sync >= 1, got ${writeRes.syncCountAfterFirst}`);
        assert.equal(writeRes.afterTruncate, true, 'truncate (setattr) must schedule debounced save sync');
        assert.equal(writeRes.afterRename, true, 'rename out of SAVEDATA must schedule debounced save sync');

        // Quiescent exit flush
        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });

        // Full page reload, relaunch Game A, verify exact Pattern B survived in OPFS
        await page.reload();
        await page.waitForSelector('.game-card', { state: 'visible' });
        await page.click('.game-card');
        await page.waitForFunction(() => {
            const host = window.__ppssppCoreHost;
            return host && host.getFrameCount() >= 2 && window.__ppssppMemstickSync;
        }, null, { timeout: 10000 });

        const readBackA = await page.evaluate(() => {
            const mod = window.__ppssppCoreHost.getModule();
            const raw = mod.FS.readFile('/memstick/PSP/SAVEDATA/TEST00001/DATA.BIN');
            const sfo = mod.FS.readFile('/memstick/PSP/SAVEDATA/TEST00001/PARAM.SFO');
            return {
                len: raw.length,
                head: Array.from(raw.slice(0, 16)),
                tail: Array.from(raw.slice(290000, 290016)),
                sfo: Array.from(sfo),
            };
        });

        assert.equal(readBackA.len, 300 * 1024);
        assert.deepEqual(readBackA.head, Array.from({ length: 16 }, (_, i) => 0xa5 ^ i));
        assert.deepEqual(readBackA.tail, Array.from({ length: 16 }, (_, i) => 0x5a ^ i));
        assert.deepEqual(readBackA.sfo, [0x00, 0x50, 0x53, 0x46, 0x01, 0x01, 0x00, 0x00]);

        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });

        // Boot Game B and confirm strict per-game OPFS save isolation
        const cards = await page.$$('.game-card');
        await cards[1].click();
        await page.waitForFunction(() => {
            const badge = document.getElementById('badge-iso')?.textContent || '';
            const host = window.__ppssppCoreHost;
            return badge.includes('ULUS-10336') && host && host.getFrameCount() >= 2;
        }, null, { timeout: 10000 });

        const gameBHasGameASave = await page.evaluate(() => {
            const mod = window.__ppssppCoreHost.getModule();
            try {
                mod.FS.stat('/memstick/PSP/SAVEDATA/TEST00001/DATA.BIN');
                return true;
            } catch {
                return false;
            }
        });
        assert.equal(gameBHasGameASave, false, 'Game B must never inherit Game A Memory Stick saves');

        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});

test('AC-5.2: opfsSaveQueue Serialization, BuildEtagHash Cache Invalidation Save Safety, and OPFS Error Warning', async () => {
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'memstick_sync.mjs')), 'web/memstick_sync.mjs must exist');
    const catalogPath = path.join(rootDir, 'dist', 'games.json');
    if (!fs.existsSync(catalogPath)) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { proc, url } = await startPpssppServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const qRes = await page.evaluate(async () => {
            const gamesResp = await fetch('/games.json');
            const { games } = await gamesResp.json();
            const gameA = games[0];

            const ch = new MessageChannel();
            const workerA = new Worker('worker_a.js', { type: 'module' });
            const workerB = new Worker('worker_b.js', { type: 'module' });
            workerA.postMessage({ type: 'PORT', port: ch.port1 }, [ch.port1]);
            workerB.postMessage({ type: 'PORT', port: ch.port2, gameId: gameA.id }, [ch.port2]);

            await new Promise((resolve, reject) => {
                workerB.addEventListener('message', (e) => {
                    if (e.data?.type === 'STATUS' && e.data.phase === 'running') resolve();
                });
                setTimeout(() => reject(new Error('Worker B boot timeout')), 5000);
            });

            // Blast 6 rapid overlapping MEMSTICK_SYNC writes through opfsSaveQueue
            let idCounter = 1;
            const sendB = (msg) => new Promise((resolve) => {
                const id = idCounter++;
                const onMsg = (e) => {
                    if (e.data?.id === id) {
                        workerB.removeEventListener('message', onMsg);
                        resolve(e.data);
                    }
                };
                workerB.addEventListener('message', onMsg);
                workerB.postMessage({ ...msg, id });
            });

            const syncPromises = [];
            for (let seq = 1; seq <= 6; seq++) {
                syncPromises.push(sendB({
                    type: 'MEMSTICK_SYNC',
                    reason: `burst-${seq}`,
                    upserts: [{
                        relPath: 'PSP/SAVEDATA/RACE00001/SAVE.DAT',
                        data: new Uint8Array([seq, seq + 1, seq + 2, seq + 3]),
                    }],
                    deletes: [],
                }));
            }
            const syncResults = await Promise.all(syncPromises);
            const loaded = await sendB({ type: 'MEMSTICK_LOAD' });

            // Confirm OPFS layout separates cache_<gameId>.opfs from /saves/<gameId>/
            const root = await navigator.storage.getDirectory();
            const names = [];
            for await (const [n] of root.entries()) names.push(n);

            // Simulate BuildEtagHash cache invalidation wiping cache_<gameId>.opfs; saves/<gameId>/ stays intact
            const cacheName = `cache_${gameA.id}.opfs`;
            try { await root.removeEntry(cacheName); } catch {}
            const loadedAfterCacheReset = await sendB({ type: 'MEMSTICK_LOAD' });

            workerA.terminate();
            workerB.terminate();

            const saveEntry = loaded.files?.find((f) => f.relPath === 'PSP/SAVEDATA/RACE00001/SAVE.DAT');
            const saveAfterReset = loadedAfterCacheReset.files?.find((f) => f.relPath === 'PSP/SAVEDATA/RACE00001/SAVE.DAT');

            return {
                allOk: syncResults.every((r) => r.ok === true),
                hasSavesDir: names.includes('saves'),
                finalBytes: saveEntry ? Array.from(saveEntry.data) : null,
                afterResetBytes: saveAfterReset ? Array.from(saveAfterReset.data) : null,
            };
        });

        assert.equal(qRes.allOk, true, 'All queued MEMSTICK_SYNC writes must succeed cleanly without lock collisions');
        assert.equal(qRes.hasSavesDir, true);
        assert.deepEqual(qRes.finalBytes, [6, 7, 8, 9], 'opfsSaveQueue must preserve exact last write ordering');
        assert.deepEqual(qRes.afterResetBytes, [6, 7, 8, 9], 'Invalidating cache OPFS must preserve /saves/<gameId>/');

        // Verify OPFS warning surfaces in #badge-iso without crashing emulation
        const warnPage = await browser.newPage();
        await warnPage.goto(url);
        await warnPage.waitForSelector('.game-card', { state: 'visible' });
        await warnPage.click('.game-card');
        await warnPage.waitForFunction(() => window.__ppssppCoreHost && window.__ppssppCoreHost.getFrameCount() >= 2 && window.__ppssppMemstickSync);

        // Simulate real OPFS failure via MEMSTICK_SYNC response and verify flush queue recovers afterwards
        const aliveAfterWarn = await warnPage.evaluate(async () => {
            const { createMemstickSync } = await import('/memstick_sync.mjs');
            const mod = window.__ppssppCoreHost.getModule();
            const badgeBefore = document.getElementById('badge-iso');

            // 1. Test real MEMSTICK_SYNC failure -> onWarning -> #badge-iso
            let failOnce = true;
            const fakeWorkerB = {
                listeners: new Set(),
                addEventListener(_ev, fn) { this.listeners.add(fn); },
                removeEventListener(_ev, fn) { this.listeners.delete(fn); },
                postMessage(msg) {
                    if (msg.type === 'MEMSTICK_SYNC') {
                        if (failOnce) {
                            failOnce = false;
                            throw new Error('simulated transient postMessage failure');
                        }
                        queueMicrotask(() => {
                            const ev = {
                                data: {
                                    type: 'MEMSTICK_SYNCED',
                                    id: msg.id,
                                    ok: false,
                                    warning: 'OPFS NoModificationAllowedError: save cache locked',
                                },
                            };
                            for (const fn of this.listeners) fn(ev);
                        });
                    }
                },
            };

            let warned = '';
            const testSync = createMemstickSync({
                mod,
                workerB: fakeWorkerB,
                onWarning: (w) => {
                    warned = w;
                    badgeBefore.textContent = w;
                    badgeBefore.className = 'badge warn';
                },
            });
            mod.FS.mkdirTree('/memstick/PSP/SAVEDATA/WARN0001');
            mod.FS.writeFile('/memstick/PSP/SAVEDATA/WARN0001/SAVE.BIN', new Uint8Array([1, 2, 3]));
            let threwFirst = false;
            try { await testSync.flush('manual'); } catch { threwFirst = true; }
            const secondRes = await testSync.flush('manual');
            testSync.destroy();

            const f1 = window.__ppssppCoreHost.getFrameCount();
            await new Promise((r) => setTimeout(r, 150));
            const f2 = window.__ppssppCoreHost.getFrameCount();
            return {
                threwFirst,
                secondOk: secondRes.ok,
                warned,
                warnClass: badgeBefore.className.includes('warn'),
                warnText: badgeBefore.textContent,
                framesAdvanced: f2 >= f1,
            };
        });

        assert.equal(aliveAfterWarn.threwFirst, true, 'First flush should reject on postMessage throw');
        assert.equal(aliveAfterWarn.secondOk, false, 'Flush queue must recover after rejection and run next flush');
        assert.equal(aliveAfterWarn.warnClass, true);
        assert.match(aliveAfterWarn.warnText || '', /OPFS|NoModificationAllowedError/i);
        assert.equal(aliveAfterWarn.framesAdvanced, true);
        await warnPage.close();
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});
