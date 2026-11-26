import createVfsModule from './vfs.js';
import * as Offsets from './vfs_offsets.js';

let portB = null;
let wasmModule = null;
let wasmMemory = null;
let ctxPtr = 0;
let arenaPtr = 0;
let fsPtr = 0;
let blockDevPtr = 0;
let scratchBufPtr = 0;
let tocBufPtr = 0;
let tocBufCap = 4 * 1024 * 1024;
const FS_IPC_MAX_READ_BYTES = 4 * 1024 * 1024;
let pathBufPtr = 0;
let outBufPtr = 0;
let buildRotatedPosted = false;

function postBuildRotated() {
    if (!buildRotatedPosted) {
        buildRotatedPosted = true;
        self.postMessage({ type: 'BUILD_ROTATED' });
    }
}

self.onmessage = async (e) => {
    const msg = e.data || {};
    const type = msg.type;

    if (type === 'PORT') {
        portB = msg.port;
        setupPortB();
        return;
    }

    if (!wasmModule || !ctxPtr) {
        const tBuf = msg.transferBuffer || null;
        self.postMessage(
            { type: `${type}_RES`, id: msg.id, ok: false, code: -1, error: 'WASM not initialized', buffer: tBuf },
            tBuf ? [tBuf] : []
        );
        return;
    }

    if (type === 'HINT_COLD') {
        wasmModule._vfs_hint_cold(ctxPtr, Number(msg.blockId));
        return;
    }

    if (type === 'DISC_OPEN') {
        const pathBytes = new TextEncoder().encode((msg.path || 'game.iso') + '\0');
        if (pathBytes.length > 1024) {
            self.postMessage({ type: 'DISC_OPEN_RES', id: msg.id, ok: false, error: 'path too long' });
            return;
        }
        if (blockDevPtr) {
            wasmModule._vfs_block_close(blockDevPtr);
            blockDevPtr = 0;
        }
        new Uint8Array(wasmMemory.buffer, pathBufPtr, pathBytes.length).set(pathBytes);
        blockDevPtr = wasmModule._vfs_block_open(fsPtr, pathBufPtr);
        if (blockDevPtr) {
            const size = wasmModule._vfs_block_size(blockDevPtr);
            const sectors = wasmModule._vfs_block_num_sectors(blockDevPtr);
            self.postMessage({ type: 'DISC_OPEN_RES', id: msg.id, ok: true, size, sectors });
        } else {
            self.postMessage({ type: 'DISC_OPEN_RES', id: msg.id, ok: false });
        }
        return;
    }

    if (type === 'DISC_IDENTIFY') {
        if (!blockDevPtr) {
            self.postMessage({ type: 'DISC_IDENTIFY_RES', id: msg.id, ok: false, error: 'no open disc' });
            return;
        }
        const idBufPtr = outBufPtr;
        const titleBufPtr = pathBufPtr;
        const okCode = wasmModule._vfs_block_identify(blockDevPtr, idBufPtr, 16, titleBufPtr, 64);
        let discId = '';
        let title = '';
        if (okCode === 1) {
            const idBytes = new Uint8Array(wasmMemory.buffer, idBufPtr, 16);
            const titleBytes = new Uint8Array(wasmMemory.buffer, titleBufPtr, 64);
            const idEnd = idBytes.indexOf(0);
            const titleEnd = titleBytes.indexOf(0);
            discId = new TextDecoder().decode(idBytes.slice(0, idEnd >= 0 ? idEnd : 16));
            title = new TextDecoder().decode(titleBytes.slice(0, titleEnd >= 0 ? titleEnd : 64));
        }
        self.postMessage({
            type: 'DISC_IDENTIFY_RES',
            id: msg.id,
            ok: okCode === 1,
            platform: okCode === 1 ? 'psp' : 'unknown',
            discId,
            title
        });
        return;
    }

    if (type === 'DISC_READ') {
        if (!blockDevPtr) {
            self.postMessage({ type: 'DISC_READ_RES', id: msg.id, ok: false, error: 'no open disc' });
            return;
        }
        const len = Number(msg.len);
        if (!Number.isSafeInteger(len) || len < 0 || len > FS_IPC_MAX_READ_BYTES) {
            self.postMessage({ type: 'DISC_READ_RES', id: msg.id, ok: false, error: 'invalid length' });
            return;
        }
        let offset;
        try {
            offset = BigInt(msg.offset || 0);
        } catch {
            self.postMessage({ type: 'DISC_READ_RES', id: msg.id, ok: false, error: 'invalid offset' });
            return;
        }
        const success = wasmModule._vfs_block_read(blockDevPtr, offset, BigInt(len), scratchBufPtr);
        if (success === 1) {
            const bytes = len > 0 ? new Uint8Array(wasmMemory.buffer, scratchBufPtr, len).slice() : new Uint8Array(0);
            self.postMessage({ type: 'DISC_READ_RES', id: msg.id, ok: true, bytes: bytes.buffer }, len > 0 ? [bytes.buffer] : []);
        } else {
            if (wasmModule._vfs_read_sync) {
                const probe = Number(wasmModule._vfs_read_sync(ctxPtr, 0n, outBufPtr, 1));
                if (probe === -2) postBuildRotated();
            }
            self.postMessage({ type: 'DISC_READ_RES', id: msg.id, ok: false });
        }
        return;
    }

    if (type === 'DISC_READ_SECTORS') {
        if (!blockDevPtr) {
            self.postMessage({ type: 'DISC_READ_SECTORS_RES', id: msg.id, ok: false, error: 'no open disc' });
            return;
        }
        const minSector = Number(msg.minSector || 0);
        const count = Number(msg.count || 0);
        const byteLen = count * 2048;
        if (!Number.isSafeInteger(minSector) || minSector < 0 || !Number.isSafeInteger(count) || count < 0 || byteLen > FS_IPC_MAX_READ_BYTES) {
            self.postMessage({ type: 'DISC_READ_SECTORS_RES', id: msg.id, ok: false, error: 'invalid sector range' });
            return;
        }
        const success = wasmModule._vfs_block_read_sectors(blockDevPtr, minSector, count, scratchBufPtr);
        if (success === 1) {
            const bytes = byteLen > 0 ? new Uint8Array(wasmMemory.buffer, scratchBufPtr, byteLen).slice() : new Uint8Array(0);
            self.postMessage({ type: 'DISC_READ_SECTORS_RES', id: msg.id, ok: true, bytes: bytes.buffer }, byteLen > 0 ? [bytes.buffer] : []);
        } else {
            self.postMessage({ type: 'DISC_READ_SECTORS_RES', id: msg.id, ok: false });
        }
        return;
    }

    if (type === 'DISC_CLOSE') {
        if (blockDevPtr) {
            wasmModule._vfs_block_close(blockDevPtr);
            blockDevPtr = 0;
        }
        self.postMessage({ type: 'DISC_CLOSE_RES', id: msg.id, ok: true });
        return;
    }

    if (type === 'FS_MOUNT') {
        const mountFlags = msg.mountFlags !== undefined ? Number(msg.mountFlags) : Offsets.VFS_FS_MOUNT_TELEM_HYBRID;
        const dv = new DataView(wasmMemory.buffer, outBufPtr, 4);
        dv.setUint32(0, 0, true);
        const rc = wasmModule._vfs_fs_mount(fsPtr, ctxPtr, tocBufPtr, tocBufCap, mountFlags, outBufPtr);
        self.postMessage({
            type: 'FS_MOUNT_RES',
            id: msg.id,
            ok: rc === Offsets.VFS_FS_OK,
            code: rc,
            requiredBytes: dv.getUint32(0, true)
        });
        if (rc === -2) postBuildRotated();
    }
};

function setupPortB() {
    portB.onmessage = async (e) => {
        const { type, manifestHeaderBytes, arenaBytes } = e.data || {};
        if (type === 'GEOMETRY') {
            try {
                const arenaPages = Math.ceil(arenaBytes / 65536);
                const initialPages = 1024 + arenaPages;
                const maximumPages = initialPages;

                try {
                    wasmMemory = new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages, shared: true });
                } catch (memErr) {
                    portB.postMessage({ type: 'RETRY_SMALLER_POOL', reason: memErr.message });
                    return;
                }

                wasmModule = await createVfsModule({ wasmMemory });
                arenaPtr = wasmModule._aligned_alloc(65536, arenaBytes);
                if (!arenaPtr) {
                    portB.postMessage({ type: 'BOOT_ERROR', reason: 'aligned_alloc failed' });
                    return;
                }

                const hdrPtr = wasmModule._malloc(32);
                new Uint8Array(wasmMemory.buffer, hdrPtr, 32).set(manifestHeaderBytes);

                const ctxSize = wasmModule._vfs_client_ctx_size ? Number(wasmModule._vfs_client_ctx_size()) : 64;
                ctxPtr = wasmModule._malloc(ctxSize);
                const rc = wasmModule._vfs_init_arena(ctxPtr, arenaPtr, hdrPtr);
                wasmModule._free(hdrPtr);
                if (rc !== 0) {
                    portB.postMessage({ type: 'BOOT_ERROR', reason: `vfs_init_arena failed: ${rc}` });
                    return;
                }

                const fsSize = wasmModule._vfs_fs_struct_size ? Number(wasmModule._vfs_fs_struct_size()) : 8192;
                fsPtr = wasmModule._malloc(fsSize);
                new Uint8Array(wasmMemory.buffer, fsPtr, fsSize).fill(0);
                new DataView(wasmMemory.buffer, fsPtr, 4).setUint32(0, ctxPtr, true);

                scratchBufPtr = wasmModule._malloc(FS_IPC_MAX_READ_BYTES);
                tocBufPtr = wasmModule._malloc(tocBufCap);
                pathBufPtr = wasmModule._malloc(1024);
                outBufPtr = wasmModule._malloc(16);

                portB.postMessage({ type: 'ARENA_READY', wasmMemory, arenaOffset: arenaPtr });
            } catch (err) {
                portB.postMessage({ type: 'BOOT_ERROR', reason: err.message });
            }
        }
    };
}
