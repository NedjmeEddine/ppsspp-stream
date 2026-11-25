# AGENTS.md — Developer & Agent Guide for PPSSPP-Stream

PPSSPP-Stream pairs `wasm-block-streamer` (`externals/vfs-streamer`, pinned at `a3b8bd6`) with a C++ `VfsBlockDevice` sector adapter (`2048`-byte PSP UMD sectors) and a Go HTTP 206 catalog server.

---

## 1. Environment & Toolchain

* **Go 1.22+:** Root `go.mod` builds `./cmd/ppsspp-server` (zero third-party deps). Submodule `externals/vfs-streamer` has its own separate `go.mod` (`markov-pack`, `tile-gen`).
* **Emscripten (`emcc` / `em++`):** Installed at `~/.local/share/emsdk`. Activate before `make wasm`:
  ```bash
  source ~/.local/share/emsdk/emsdk_env.sh
  make wasm
  ```
  `make wasm` writes directly to `web/vfs.js` and `web/vfs.wasm` (tracked via `!web/vfs.wasm` in `.gitignore`). Never write build artifacts inside `externals/vfs-streamer`.
* **Playwright Chromium:** Cached at `~/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`. Launch with `--no-sandbox` and `--enable-features=SharedArrayBuffer`.

---

## 2. Submodule & Static Asset Rules

* **Never patch `externals/vfs-streamer` from this repo.** Keep `externals/vfs-streamer` unmodified at upstream commits (`a3b8bd6+`). If VFS core changes are ever needed, commit and push in `externals/vfs-streamer` first, then bump the submodule pointer here.
* **Web Static Files:** Go's `http.FileServer` forbids `../` traversal. Shared upstream scripts in `web/` (`vfs_offsets.js`, `worker_b_core.mjs`, `doorbell_worker.js`, `hud_overlay.mjs`) are symlinked directly into `web/`, while `web/worker_a.js`, `web/worker_b.js`, `web/vfs.js`, and `web/vfs.wasm` are owned in `ppsspp-stream/web/`.

---

## 3. Non-Negotiable Runtime Invariants

1. **Strict EOF & `wasm32` Slicing (`src/disc_io/vfs_block_device.cpp`):**
   * `VfsBlockDevice::Read(offset, size, out)` must return `false` if `offset >= m_size || size > m_size - offset`. Never clamp and return `true`.
   * Chunk reads in `<= VFS_FS_READ_SLICE_MAX` (64 MiB) slices so `uint64_t size` never truncates to 32-bit `size_t`/`ptrdiff_t` on `wasm32`.
2. **Header Hygiene (`src/disc_io/vfs_block_device.h`):**
   * Forward-declare `struct VfsFs;` in headers. Never put `#define _Atomic` or `#define _Static_assert` in `.h` files; confine C11 headers (`vfs_client.h`, `vfs_fs.h`) to `.cpp` units.
3. **`HintCold` Safety:**
   * Always clamp `[offset, offset + size)` to `m_size`, skip block `0` (ISO9660/PVD & boot headers), and avoid `uint32_t` loop wrap at `UINT32_MAX`.
4. **No Hardcoded Struct Sizes or Unshared `TextDecoder`:**
   * Allocate `VfsClientContext` and `VfsFs` in JS using `_vfs_client_ctx_size()` and `_vfs_fs_struct_size()`.
   * Always `.slice()` `SharedArrayBuffer` `TypedArray` views before passing to `TextDecoder.decode()`.
5. **Cross-Origin Isolation & OPFS Partitioning:**
   * Every HTML/worker/WASM response must include `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (plus HTTPS off `localhost`).
   * Partition OPFS by `gameId` (`cache_${gameId}.opfs` and `/saves/${gameId}/`) so switching games never wipes cached blocks on `BuildEtagHash` mismatch.
6. **Worker Teardown & Input Hygiene:**
   * Wait for `TELEM_FLUSHED` (with short timeout) before terminating `workerB` on menu exit; guard `visibilitychange` on `hidden`.
   * Keep keyboard/gamepad input bits non-overlapping, track by `e.code`, and clear on `window.blur`.
7. **Opaque Binaries Forbidden Without Source/Build Info:**
   * Any PPSSPP core `.wasm` integrated into `cores/ppsspp/` must document its exact upstream repo, commit hash, Emscripten flags, and C ABI in `docs/CORE_PORT.md`.
