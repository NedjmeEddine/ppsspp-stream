# Architecture — PPSSPP-Stream

## 1. System Topology (3-Thread Pipeline)

```text
+----------------------------------------------------------------------------------+
| Main Thread (web/index.html)                                                     |
| - PSP Channel Launcher, Keyboard/Gamepad input (e.code Set), WebAudio PCM        |
| - WebGL2 Canvas (#emulator-canvas) + 2D Memory Slab HUD (#hud-canvas)            |
+----------------------------------------------------------------------------------+
                                       |
                        (MessagePort / OffscreenCanvas)
                                       v
+----------------------------------------------------------------------------------+
| Worker A: Emscripten Core + VFS Sync Reader (web/worker_a.js / emu_worker.js)    |
| - PPSSPP Core (MIPS HLE + WebGL2) + DiscIO::VfsBlockDevice (2048 B UMD sectors)  |
| - Synchronous reads via vfs_fs_pread / vfs_read_sync (blocks on io_futex)        |
+----------------------------------------------------------------------------------+
                                       |
               (64 MB SharedArrayBuffer: 256 x 256 KB Frames, Dekker seq_cst)
                                       v
+----------------------------------------------------------------------------------+
| Worker B: Async Fetch, OPFS Cache & Markov Prefetcher (web/worker_b.js)          |
| - Wraps upstream WorkerBCore (externals/vfs-streamer @ a3b8bd6)                  |
| - Parallel HTTP 206 ranges (/games/{id}/packs/*.bin), 4x OPFS lock retry         |
| - OPFS persistence: cache_${gameId}.opfs + /saves/${gameId}/                     |
+----------------------------------------------------------------------------------+
                                       |
                          (HTTP 206 Partial Content)
                                       v
+----------------------------------------------------------------------------------+
| Go Server (cmd/ppsspp-server)                                                    |
| - Stdlib HTTP 206 via io.NewSectionReader (thread-safe pread, strips If-Range)   |
| - /games.json, /games/{id}/manifest.bin, /games/{id}/packs/*, /telemetry/...     |
| - COOP/COEP/CORP headers on all static web assets                                |
+----------------------------------------------------------------------------------+
```

---

## 2. WASM Memory Topology (Option A vs Option B)

Two integration modes are supported when linking PPSSPP:

* **Option B — Decoupled Two-WASM (Current Scaffold):**
  `web/vfs.wasm` owns the 64 MB `SharedArrayBuffer` arena (`VfsClientContext`), while the PPSSPP WASM core keeps its own `WebAssembly.Memory` and reads disc sectors through a pre-allocated `4 MiB` `scratchBufPtr` bounce buffer. Easiest to swap PPSSPP builds without modifying PPSSPP's Emscripten memory flags.
* **Option A — Single-WASM Zero-Copy (Target Production):**
  Compile `vfs_client.c`, `vfs_fs.c`, `vfs_hal.c`, `vfs_policy.c`, and `src/disc_io/vfs_block_device.cpp` directly into PPSSPP's WASM build with `-pthread` and `shared: true` `WebAssembly.Memory`. PPSSPP's `BlockDevice::ReadBlock()` reads straight from the 64 MB slab with zero JS bounce copies.

---

## 3. Disc Containers & Header Identification

* **Slicing Granularity:** `markov-pack` slices images into fixed **256 KB** (`block-shift 18`) content-addressed blocks.
* **Uncompressed `.iso` (Preferred):** PSP UMDs use standard **ISO9660** (`2048`-byte logical sectors, `CD001` Primary Volume Descriptor at offset `0x8000`). Uncompressed ISOs preserve 1:1 sector locality so 1st-order Markov prefetching hits adjacent asset/stream blocks reliably.
* **Compressed `.cso` / `.pbp` / `.chd`:** If supported later, decompression **must sit above `VfsBlockDevice`** (PPSSPP's `CISOFileBlockDevice` wraps `VfsBlockDevice` for raw backing reads). Never infer game ID, platform, or CPU clock from file size; always inspect sector 16 (`0x8000` `CD001`) and `UMD_DATA.BIN` / `PSP_GAME/PARAM.SFO`.
