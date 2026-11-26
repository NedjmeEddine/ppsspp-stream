const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tbl[i] = c >>> 0;
    }
    return tbl;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function walkSaveTree(FS, saveRootPath) {
    const out = new Map();

    function walk(absDir, relPrefix) {
        let entries;
        try {
            entries = FS.readdir(absDir);
        } catch {
            return;
        }
        for (const name of entries) {
            if (name === '.' || name === '..') continue;
            const absPath = `${absDir}/${name}`;
            const relPath = relPrefix ? `${relPrefix}/${name}` : name;
            let st;
            try {
                st = FS.lstat(absPath);
            } catch {
                continue;
            }
            if (FS.isDir(st.mode)) {
                walk(absPath, relPath);
            } else if (FS.isFile(st.mode)) {
                try {
                    const data = FS.readFile(absPath);
                    out.set(relPath, {
                        data,
                        size: data.byteLength,
                        crc32: crc32(data),
                    });
                } catch {
                    // Ignore unreadable transient node.
                }
            }
        }
    }

    walk(saveRootPath, '');
    return out;
}

/**
 * Release-safe MEMFS <-> Worker B OPFS Memory Stick sync bridge.
 */
export function createMemstickSync({ mod, workerB, memstickDir = '/memstick', onWarning, debounceMs = 450 } = {}) {
    if (!mod || !mod.FS) throw new Error('createMemstickSync requires Emscripten Module with FS');
    if (!workerB) throw new Error('createMemstickSync requires workerB');

    const normalizedRoot = memstickDir.replace(/\/+$/, '') || '/memstick';
    const saveRootPath = `${normalizedRoot}/PSP/SAVEDATA`;

    let nextId = 1;
    let lastSynced = new Map(); // relPath -> { size, crc32 }
    let debounceTimer = null;
    let flushQueue = Promise.resolve();
    let destroyed = false;
    let syncCount = 0;
    let lastWarning = null;
    let restoreOps = null;

    function callB(msg, transfer = [], timeoutMs = 10000) {
        return new Promise((resolve) => {
            const id = nextId++;
            const expectedType = msg.type === 'MEMSTICK_LOAD' ? 'MEMSTICK_LOADED' : 'MEMSTICK_SYNCED';
            const timer = setTimeout(() => {
                workerB.removeEventListener('message', onMsg);
                resolve({ ok: false, warning: `Worker B timed out waiting for ${expectedType}` });
            }, timeoutMs);

            function onMsg(e) {
                const d = e.data;
                if (d && d.id === id && d.type === expectedType) {
                    clearTimeout(timer);
                    workerB.removeEventListener('message', onMsg);
                    resolve(d);
                }
            }
            workerB.addEventListener('message', onMsg);
            workerB.postMessage({ ...msg, id }, transfer);
        });
    }

    function warn(msg) {
        lastWarning = msg;
        if (typeof onWarning === 'function') {
            onWarning(msg);
        }
    }

    function scheduleSync() {
        if (destroyed) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            flush('debounced').catch(() => {});
        }, debounceMs);
    }

    async function hydrate() {
        const FS = mod.FS;
        FS.mkdirTree(saveRootPath);

        const res = await callB({ type: 'MEMSTICK_LOAD' });
        if (res?.warning) warn(res.warning);
        if (!res?.ok) {
            return { ok: false, restored: 0 };
        }

        const nextSynced = new Map();
        const files = Array.isArray(res.files) ? res.files : [];
        for (const entry of files) {
            if (!entry || typeof entry.relPath !== 'string' || !entry.data) continue;
            // Worker B stores paths relative to /saves/<gameId>/, usually prefixed PSP/SAVEDATA/...
            const cleanRel = entry.relPath.replace(/^\/+/, '');
            const targetPath = cleanRel.startsWith('PSP/SAVEDATA/')
                ? `${normalizedRoot}/${cleanRel}`
                : `${saveRootPath}/${cleanRel}`;
            const slashIdx = targetPath.lastIndexOf('/');
            if (slashIdx > 0) {
                FS.mkdirTree(targetPath.slice(0, slashIdx));
            }
            const bytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
            FS.writeFile(targetPath, bytes);
            const saveRel = targetPath.slice(saveRootPath.length + 1);
            nextSynced.set(saveRel, { size: bytes.byteLength, crc32: crc32(bytes) });
        }

        lastSynced = nextSynced;
        return { ok: true, restored: files.length };
    }

    function installHook() {
        if (restoreOps) return;
        const FS = mod.FS;
        FS.mkdirTree(saveRootPath);

        const lookup = FS.lookupPath(saveRootPath, { follow: true });
        const rootNode = lookup?.node;
        if (!rootNode) return;

        // Share MEMFS node_ops/stream_ops across MEMFS files & subdirs cleanly without FS_DEBUG
        const probeDir = `${saveRootPath}/.__probe_dir__`;
        const probeFile = `${saveRootPath}/.__probe_file__`;
        try {
            FS.mkdirTree(probeDir);
            FS.writeFile(probeFile, new Uint8Array(0));
            const dirNode = FS.lookupPath(probeDir, { follow: false }).node;
            const fileNode = FS.lookupPath(probeFile, { follow: false }).node;

            const wrapped = [];
            const wrapMethod = (obj, prop, wrapperFactory) => {
                if (!obj || typeof obj[prop] !== 'function') return;
                const orig = obj[prop];
                obj[prop] = wrapperFactory(orig);
                wrapped.push(() => { obj[prop] = orig; });
            };

            const isSaveNodeOrStream = (nodeOrStream) => {
                if (!nodeOrStream) return true;
                if (typeof nodeOrStream.path === 'string') {
                    return nodeOrStream.path.startsWith(saveRootPath) || nodeOrStream.path.includes('SAVEDATA');
                }
                let cur = nodeOrStream.node || nodeOrStream;
                for (let depth = 0; cur && depth < 16; depth++) {
                    if (cur === rootNode) return true;
                    if (!cur.parent || cur.parent === cur) break;
                    cur = cur.parent;
                }
                return false;
            };

            for (const targetNodeOps of new Set([rootNode.node_ops, dirNode.node_ops])) {
                wrapMethod(targetNodeOps, 'mknod', (orig) => function (...args) {
                    const out = orig.apply(this, args);
                    if (isSaveNodeOrStream(args[0])) scheduleSync();
                    return out;
                });
                wrapMethod(targetNodeOps, 'rename', (orig) => function (...args) {
                    const out = orig.apply(this, args);
                    if (isSaveNodeOrStream(args[0]) || isSaveNodeOrStream(args[1])) scheduleSync();
                    return out;
                });
                wrapMethod(targetNodeOps, 'unlink', (orig) => function (...args) {
                    const check = isSaveNodeOrStream(args[0]);
                    const out = orig.apply(this, args);
                    if (check) scheduleSync();
                    return out;
                });
                wrapMethod(targetNodeOps, 'rmdir', (orig) => function (...args) {
                    const check = isSaveNodeOrStream(args[0]);
                    const out = orig.apply(this, args);
                    if (check) scheduleSync();
                    return out;
                });
            }

            wrapMethod(fileNode.stream_ops, 'write', (orig) => function (...args) {
                const out = orig.apply(this, args);
                if (isSaveNodeOrStream(args[0])) scheduleSync();
                return out;
            });
            wrapMethod(fileNode.stream_ops, 'close', (orig) => function (...args) {
                const check = isSaveNodeOrStream(args[0]);
                const out = orig.apply(this, args);
                if (check) scheduleSync();
                return out;
            });

            restoreOps = () => {
                for (let i = wrapped.length - 1; i >= 0; i--) wrapped[i]();
            };
        } finally {
            try { FS.unlink(probeFile); } catch { /* ignore */ }
            try { FS.rmdir(probeDir); } catch { /* ignore */ }
        }
    }

    function flush(reason = 'manual') {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        flushQueue = flushQueue.then(async () => {
            if (!mod?.FS) return { ok: true, changed: 0 };
            const current = walkSaveTree(mod.FS, saveRootPath);
            const upserts = [];
            const deletes = [];
            const nextSynced = new Map();

            for (const [relPath, entry] of current.entries()) {
                nextSynced.set(relPath, { size: entry.size, crc32: entry.crc32 });
                const prev = lastSynced.get(relPath);
                if (!prev || prev.size !== entry.size || prev.crc32 !== entry.crc32) {
                    const copy = entry.data.slice();
                    upserts.push({
                        relPath: `PSP/SAVEDATA/${relPath}`,
                        data: copy,
                    });
                }
            }

            for (const prevRel of lastSynced.keys()) {
                if (!current.has(prevRel)) {
                    deletes.push(`PSP/SAVEDATA/${prevRel}`);
                }
            }

            if (upserts.length === 0 && deletes.length === 0) {
                return { ok: true, changed: 0 };
            }

            const transfers = upserts.map((u) => u.data.buffer);
            const res = await callB({
                type: 'MEMSTICK_SYNC',
                reason,
                upserts,
                deletes,
            }, transfers);

            if (res?.ok) {
                lastSynced = nextSynced;
                syncCount++;
                return { ok: true, changed: upserts.length + deletes.length };
            }

            warn(res?.warning || 'OPFS Memory Stick save sync failed');
            return { ok: false, changed: 0, warning: res?.warning };
        });

        return flushQueue;
    }

    return {
        hydrate,
        installHook,
        flush,
        triggerTestWarning: warn,
        getStats() {
            return {
                memstickDir: normalizedRoot,
                syncCount,
                fileCount: lastSynced.size,
                lastWarning,
            };
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            if (restoreOps) {
                restoreOps();
                restoreOps = null;
            }
        },
    };
}
