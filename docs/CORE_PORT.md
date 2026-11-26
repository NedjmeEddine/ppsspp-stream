# Core Porting Guide — Upstream PPSSPP WebAssembly Integration

This document tracks how the upstream PPSSPP emulator core integrates with `ppsspp-stream`'s VFS and web shell.

---

## 1. Upstream Core References

* **Upstream PPSSPP:** `https://github.com/hrydgard/ppsspp` (built with Emscripten via `-DUSING_EMSCRIPTEN=ON`)
* **Active Browser Fork Reference:** `https://github.com/root-hunter/ppsspp-wasm` (pinned at commit `4d0564bc687b86d2f88e132d79ea118e290b004b`, branch `wasm`)
* **Toolchain Pin (Verified Spike 0):**
  * **Emscripten:** `6.0.12` (`emsdk install 6.0.12 && emsdk activate 6.0.12`)
  * **Worker Model:** Under Emscripten 6.0.12, pthreads bootstrap directly from `PPSSPPSDL.js` (no separate `PPSSPPSDL.worker.js` file is emitted).
  * **Required Submodules:** `assets/debugger`, `ext/SPIRV-Cross`, `ext/aemu_postoffice`, `ext/armips` (+ `ext/filesystem`), `ext/cpu_features`, `ext/freetype`, `ext/glslang`, `ext/libchdr`, `ext/lua`, `ext/miniupnp`, `ext/naett`, `ext/nanosvg`, `ext/rapidjson`, `ext/rcheevos`, `ext/zstd`, `ext/OpenXR-SDK` (`ffmpeg`, `pspautotests`, `MoltenVK`, `OpenXR-SDK` optional build disabled via `-DUSE_FFMPEG=OFF`).
  * **Build Flags:**
    `-G Ninja -DCMAKE_BUILD_TYPE=Release -DUSING_GLES2=ON -DUSING_EGL=OFF -DVULKAN=OFF -DUSE_NO_MMAP=ON -DUSE_FFMPEG=OFF -DUSE_DISCORD=OFF -DUSE_MINIUPNPC=OFF -DUSE_SYSTEM_LIBSDL2=OFF -DUSE_SYSTEM_LIBPNG=OFF -DUSE_SYSTEM_FREETYPE=OFF -DUSE_SYSTEM_LIBZIP=OFF -DWASM_MAIN_LOOP_FPS=60 -DWASM_INITIAL_MEMORY=536870912 -DWASM_MAXIMUM_MEMORY=536870912 -DWASM_MAX_PERF=ON -DWASM_ENABLE_LTO=OFF -DWASM_MALLOC=emmalloc`
    with patched link options: `-sALLOW_MEMORY_GROWTH=0`, `-sPTHREAD_POOL_SIZE=8`, `-sPTHREAD_POOL_SIZE_STRICT=2`, `-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPpssppModule`.
  * **Rule:** Record the exact pinned commit SHA and `emcmake cmake` flags here before committing any compiled `cores/ppsspp/` artifacts.

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
