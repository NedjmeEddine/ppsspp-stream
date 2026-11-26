import * as Offsets from './vfs_offsets.js';
import { validateManifest, computeGeometry, WorkerBCore } from './worker_b_core.mjs';

let portA = null;
let core = null;
let hudEnabled = false;
let lastHudTime = 0;
let activeGameId = null;
let opfsSaveQueue = Promise.resolve();

function sanitizeSaveRelPath(relPath) {
    if (typeof relPath !== 'string' || !relPath || relPath.startsWith('/')) return null;
    const parts = relPath.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    for (const p of parts) {
        if (p === '.' || p === '..' || p.includes('\\')) return null;
    }
    return parts;
}

function enqueueSaveOp(fn) {
    const p = opfsSaveQueue.then(fn, fn);
    opfsSaveQueue = p.catch(() => {});
    return p;
}

async function openGameSavesDir(create = true) {
    if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
        return null;
    }
    const root = await navigator.storage.getDirectory();
    const baseSaves = await root.getDirectoryHandle('saves', { create });
    return activeGameId ? await baseSaves.getDirectoryHandle(activeGameId, { create }) : baseSaves;
}

async function collectSaveFiles(dirHandle, prefix = '') {
    const out = [];
    for await (const [name, handle] of dirHandle.entries()) {
        const relPath = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') {
            out.push(...await collectSaveFiles(handle, relPath));
        } else if (handle.kind === 'file') {
            const file = await handle.getFile();
            out.push({ relPath, data: new Uint8Array(await file.arrayBuffer()) });
        }
    }
    return out;
}

async function writeOpfsFileWithRetry(dirHandle, leafName, bytes) {
    const fileHandle = await dirHandle.getFileHandle(leafName, { create: true });
    if (typeof fileHandle.createSyncAccessHandle === 'function') {
        let syncHandle = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                syncHandle = await fileHandle.createSyncAccessHandle();
                break;
            } catch (err) {
                if (attempt < 3 && err && err.name === 'NoModificationAllowedError') {
                    await new Promise((r) => setTimeout(r, 50));
                } else {
                    throw err;
                }
            }
        }
        try {
            syncHandle.truncate(0);
            syncHandle.write(bytes, { at: 0 });
            if (typeof syncHandle.flush === 'function') syncHandle.flush();
        } finally {
            syncHandle.close();
        }
        return;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
}

self.onmessage = async (e) => {
    const { type, port, gameId, manifestUrl, id, upserts, deletes } = e.data || {};
    if (type === 'PORT') {
        portA = port;
        activeGameId = gameId || null;
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
    } else if (type === 'MEMSTICK_LOAD') {
        enqueueSaveOp(async () => {
            try {
                let savesDir = null;
                try {
                    savesDir = await openGameSavesDir(true);
                } catch (err) {
                    self.postMessage({
                        type: 'MEMSTICK_LOADED',
                        id,
                        ok: true,
                        files: [],
                        warning: `OPFS saves unavailable: ${err?.message || err}`,
                    });
                    return;
                }
                if (!savesDir) {
                    self.postMessage({ type: 'MEMSTICK_LOADED', id, ok: true, files: [] });
                    return;
                }
                const files = await collectSaveFiles(savesDir);
                const transfers = files.map((f) => f.data.buffer);
                self.postMessage({ type: 'MEMSTICK_LOADED', id, ok: true, files }, transfers);
            } catch (err) {
                self.postMessage({
                    type: 'MEMSTICK_LOADED',
                    id,
                    ok: false,
                    files: [],
                    warning: `OPFS save load failed: ${err?.message || err}`,
                });
            }
        });
    } else if (type === 'MEMSTICK_SYNC') {
        enqueueSaveOp(async () => {
            try {
                const savesDir = await openGameSavesDir(true);
                if (!savesDir) {
                    self.postMessage({
                        type: 'MEMSTICK_SYNCED',
                        id,
                        ok: false,
                        warning: 'OPFS unavailable for save persistence',
                    });
                    return;
                }

                for (const delPath of (deletes || [])) {
                    const parts = sanitizeSaveRelPath(delPath);
                    if (!parts) continue;
                    let cur = savesDir;
                    let found = true;
                    for (let i = 0; i < parts.length - 1; i++) {
                        try {
                            cur = await cur.getDirectoryHandle(parts[i], { create: false });
                        } catch {
                            found = false;
                            break;
                        }
                    }
                    if (found) {
                        try {
                            await cur.removeEntry(parts[parts.length - 1], { recursive: true });
                        } catch {
                            // Ignore missing entries.
                        }
                    }
                }

                for (const item of (upserts || [])) {
                    const parts = sanitizeSaveRelPath(item?.relPath);
                    if (!parts || !item.data) continue;
                    let cur = savesDir;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cur = await cur.getDirectoryHandle(parts[i], { create: true });
                    }
                    const bytes = item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data);
                    await writeOpfsFileWithRetry(cur, parts[parts.length - 1], bytes);
                }

                self.postMessage({ type: 'MEMSTICK_SYNCED', id, ok: true });
            } catch (err) {
                self.postMessage({
                    type: 'MEMSTICK_SYNCED',
                    id,
                    ok: false,
                    warning: `OPFS save error (${err?.name || 'Error'}): ${err?.message || err}`,
                });
            }
        });
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
                    }
                } catch {
                    opfsHandle = null;
                    opfsMode = 'stream-only';
                }

                core = new WorkerBCore({
                    wasmMemory,
                    arenaOffset,
                    manifest,
                    neighbors,
                    opfsHandle,
                    initialSaves: new Map(),
                    onSaveWrite: null,
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
