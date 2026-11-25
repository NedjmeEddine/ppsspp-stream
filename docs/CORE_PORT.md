# Core Porting Guide — Upstream PPSSPP WebAssembly Integration

This document tracks how the upstream PPSSPP emulator core integrates with `ppsspp-stream`'s VFS and web shell.

---

## 1. Upstream Core References

* **Upstream PPSSPP:** `https://github.com/hrydgard/ppsspp` (built with Emscripten via `-DUSING_EMSCRIPTEN=ON`)
* **Active Browser Fork Reference:** `https://github.com/root-hunter/ppsspp-wasm` + `https://github.com/root-hunter/ppsspp-web`
* **Rule:** Record the exact pinned commit SHA and `emcmake cmake` flags here before committing any compiled `cores/ppsspp/ppsspp.wasm` binary.

---

## 2. Primary VFS Integration Seam: `BlockDevice`

In PPSSPP (`Core/FileSystems/BlockDevices.h`), disc reading goes through `BlockDevice` (`2048`-byte UMD sectors):

```cpp
class BlockDevice {
public:
    virtual ~BlockDevice() {}
    virtual bool ReadBlock(int blockNumber, u8 *outPtr, bool uncached = false) = 0;
    virtual bool ReadBlocks(u32 minBlock, u32 count, u8 *outPtr) = 0;
    virtual u32 GetNumBlocks() const = 0;
};
```

`src/disc_io/vfs_block_device.h` mirrors this exact `2048`-byte sector interface (`ReadBlock`, `ReadBlocks`, `GetNumBlocks`) on top of `vfs_fs_pread` / `vfs_read_sync`:
* `sectorOffset = static_cast<uint64_t>(blockNumber) * 2048ULL`
* Strict EOF: returns `false` if `blockNumber` or `minBlock + count` exceeds `GetNumBlocks()`.
* For `.cso` / `.chd` later, wrap `VfsBlockDevice` underneath PPSSPP's `CISOFileBlockDevice` / `CHDFileBlockDevice` rather than modifying the 256 KB VFS layer.

---

## 3. Graphics, Threads, Audio, and Input Contract

* **Graphics (WebGL2):** PPSSPP's GLES2/GLES3 backend maps directly to **WebGL2** in Emscripten (`-sUSE_WEBGL2=1 -sFULL_ES3=1`). Prefer running the GE/WebGL2 context on the worker owning the `OffscreenCanvas` (or main thread if Safari/compat required), never falling back silently to a broken `2D` context on a transferred canvas.
* **CPU:** PPSSPP uses HLE for PSP syscalls (no BIOS file needed) and supports Emscripten pthreads (`-pthread`) + IR interpreter / JIT fallback.
* **Audio:** Stream stereo 44.1 kHz / 48 kHz PCM via `AudioWorklet` (or bounded `AudioBufferSourceNode` schedule with `AudioContext.close()` on exit).
* **Input Bitmask:** Reserve strictly non-overlapping bits for PSP buttons (`CROSS`, `CIRCLE`, `SQUARE`, `TRIANGLE`, `L`, `R`, `START`, `SELECT`, `DPAD_*`) and separate analog stick `x/y` (`0..255`, centered `128`).
