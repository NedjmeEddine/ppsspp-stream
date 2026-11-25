import * as Offsets from './vfs_offsets.js';
import { validateManifest, computeGeometry, WorkerBCore } from './worker_b_core.mjs';

let portA = null;
let core = null;
let hudEnabled = false;
let lastHudTime = 0;

self.onmessage = async (e) => {
    const { type, port, gameId, manifestUrl } = e.data || {};
    if (type === 'PORT') {
        portA = port;
        boot(gameId, manifestUrl);
    } else if (type === 'FLUSH_TELEMETRY') {
        if (core) await core.flushTelemetry(e.data.reason || 'manual');
        self.postMessage({ type: 'TELEM_FLUSHED' });
    } else if (type === 'ENABLE_HUD') {
        hudEnabled = Boolean(e.data.enabled);
        if (hudEnabled && core) {
            self.postMessage({ type: 'HUD_SNAPSHOT', ...core.getHudSnapshot() });
        }
    } else if (type === 'GET_HUD_SNAPSHOT' && core) {
        self.postMessage({ type: 'HUD_SNAPSHOT', ...core.getHudSnapshot() });
    }
};

async function boot(gameId, manifestUrl) {
    try {
        const url = manifestUrl || (gameId ? `/games/${gameId}/manifest.bin` : '/manifest.bin');
        let isGameSpecific = Boolean(gameId);
        let resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok && !manifestUrl && url !== '/manifest.bin') {
            isGameSpecific = false;
            resp = await fetch('/manifest.bin', { cache: 'no-cache' });
        }
        if (!resp.ok) {
            self.postMessage({ type: 'FATAL', reason: `fetch manifest.bin failed: ${resp.status}` });
            return;
        }

        const manifestBuf = await resp.arrayBuffer();
        const dv = new DataView(manifestBuf);
        const manifest = validateManifest(dv, manifestBuf.byteLength);

        const neighborIdBytes = manifest.neighborIdBytes;
        const topK = manifest.topK;
        const totalBlocks = manifest.totalBlocks;
        const neighbors = (neighborIdBytes === 4)
            ? new Uint32Array(manifestBuf, 32, totalBlocks * topK)
            : new Uint16Array(manifestBuf, 32, totalBlocks * topK);

        let geom = computeGeometry(manifest);
        manifest.numSets = geom.numSets;
        const hdrBytes = new Uint8Array(manifestBuf, 0, 32);

        portA.onmessage = async (e) => {
            const { type: aType, wasmMemory, arenaOffset, reason } = e.data || {};
            if (aType === 'ARENA_READY') {
                let opfsHandle = null;
                let opfsMode = 'stream-only';
                const initialSaves = new Map();
                let savesDir = null;

                try {
                    if (navigator.storage && navigator.storage.getDirectory) {
                        const root = await navigator.storage.getDirectory();
                        const cacheName = gameId ? `cache_${gameId}.opfs` : 'cache.opfs';
                        const fileHandle = await root.getFileHandle(cacheName, { create: true });
                        if (fileHandle.createSyncAccessHandle) {
                            for (let attempt = 0; attempt < 4; attempt++) {
                                try {
                                    opfsHandle = await fileHandle.createSyncAccessHandle();
                                    opfsMode = 'persistent';
                                    break;
                                } catch (lockErr) {
                                    if (attempt < 3 && lockErr && lockErr.name === 'NoModificationAllowedError') {
                                        await new Promise(r => setTimeout(r, 50));
                                    } else {
                                        throw lockErr;
                                    }
                                }
                            }
                        }
                        try {
                            const baseSaves = await root.getDirectoryHandle('saves', { create: true });
                            savesDir = gameId ? await baseSaves.getDirectoryHandle(gameId, { create: true }) : baseSaves;
                            for await (const [name, handle] of savesDir.entries()) {
                                if (handle.kind === 'file') {
                                    const file = await handle.getFile();
                                    initialSaves.set(name, new Uint8Array(await file.arrayBuffer()));
                                }
                            }
                        } catch {
                            savesDir = null;
                        }
                    }
                } catch {
                    opfsHandle = null;
                    opfsMode = 'stream-only';
                }

                const onSaveWrite = async (name, buf) => {
                    if (!savesDir) return;
                    try {
                        const fileHandle = await savesDir.getFileHandle(name, { create: true });
                        if (fileHandle.createSyncAccessHandle) {
                            const syncHandle = await fileHandle.createSyncAccessHandle();
                            syncHandle.truncate(0);
                            syncHandle.write(buf, { at: 0 });
                            if (syncHandle.flush) syncHandle.flush();
                            syncHandle.close();
                        } else {
                            const writable = await fileHandle.createWritable();
                            await writable.write(buf);
                            await writable.close();
                        }
                    } catch {}
                };

                core = new WorkerBCore({
                    wasmMemory,
                    arenaOffset,
                    manifest,
                    neighbors,
                    opfsHandle,
                    initialSaves,
                    onSaveWrite,
                    fetchFn: (reqUrl, reqOpts) => {
                        const target = (isGameSpecific && typeof reqUrl === 'string' && reqUrl.startsWith('/packs/'))
                            ? `/games/${gameId}${reqUrl}`
                            : reqUrl;
                        return fetch(target, reqOpts);
                    },
                    postMessageFn: (m) => self.postMessage(m)
                });
                if (!core.opfsEnabled) opfsMode = 'stream-only';

                self.postMessage({
                    type: 'STATUS',
                    phase: 'running',
                    opfsMode,
                    effectivePoolMB: geom.effectivePoolMB
                });

                startDoorbellLoop();
            } else if (aType === 'RETRY_SMALLER_POOL') {
                if (geom.effectivePoolMB <= 16) {
                    self.postMessage({ type: 'FATAL', reason: `WebAssembly.Memory failed at minimum 16 MB pool: ${reason}` });
                    return;
                }
                const smallerMB = Math.max(16, Math.floor(geom.effectivePoolMB / 2));
                geom = computeGeometry(manifest, smallerMB);
                manifest.numSets = geom.numSets;
                portA.postMessage({
                    type: 'GEOMETRY',
                    manifestHeaderBytes: hdrBytes,
                    effectivePoolMB: geom.effectivePoolMB,
                    arenaBytes: geom.arenaBytes
                });
            } else if (aType === 'BOOT_ERROR') {
                self.postMessage({ type: 'FATAL', reason });
            }
        };

        portA.postMessage({
            type: 'GEOMETRY',
            manifestHeaderBytes: hdrBytes,
            effectivePoolMB: geom.effectivePoolMB,
            arenaBytes: geom.arenaBytes
        });
    } catch (err) {
        self.postMessage({ type: 'FATAL', reason: err.message });
    }
}

async function startDoorbellLoop() {
    let doorbellWorker = null;
    if (typeof Atomics.waitAsync !== 'function') {
        try {
            doorbellWorker = new Worker('./doorbell_worker.js');
            await new Promise((resolve) => {
                doorbellWorker.onmessage = (e) => { if (e.data?.type === 'INIT_OK') resolve(); };
                doorbellWorker.postMessage({ type: 'INIT', wasmMemory: core.wasmMemory, missFutexIndex: Offsets.MISS_FUTEX_INDEX });
            });
        } catch {
            doorbellWorker = null;
        }
    }

    while (true) {
        if (hudEnabled && Date.now() - lastHudTime >= 200) {
            lastHudTime = Date.now();
            self.postMessage({ type: 'HUD_SNAPSHOT', ...core.getHudSnapshot() });
        }

        const expected = await core.runPass();
        let timeoutMs = (core.pendingDemand.size > 0 || core.blocksWrittenSinceFlush > 0) ? 2 : 1000;
        if (hudEnabled) timeoutMs = Math.min(timeoutMs, 200);

        if (typeof Atomics.waitAsync === 'function') {
            const res = Atomics.waitAsync(core.i32, Offsets.MISS_FUTEX_INDEX, expected, timeoutMs);
            if (res.async) await res.value;
        } else if (doorbellWorker) {
            await new Promise((resolve) => {
                doorbellWorker.onmessage = (e) => { if (e.data?.type === 'WAKE') resolve(); };
                doorbellWorker.postMessage({ type: 'WAIT', expected, timeoutMs });
            });
        } else {
            await new Promise((r) => setTimeout(r, timeoutMs));
        }
    }
}
