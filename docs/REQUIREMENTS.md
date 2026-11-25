# Requirements — PPSSPP-Stream

## 1. Functional Requirements

1. **Out-of-Core Streaming:** Boot and play 500 MB–1.8 GB+ PSP `.iso` images without downloading the full file upfront, within a configurable **16–64 MB** `SharedArrayBuffer` RAM slab (`RETRY_SMALLER_POOL` fallback on low-RAM tabs).
2. **Multi-Game Catalog & Partitioned OPFS:** Serve multiple titles via `games.json` (`/games/{id}/manifest.bin`, `/games/{id}/packs/*`), isolating L2 cache (`cache_${gameId}.opfs`) and saves (`/saves/${gameId}/`) per game ID.
3. **2048-Byte Sector Adapter & Header Parser:** Expose `VfsBlockDevice` (both raw ISO and mounted VFSI modes) plus ISO9660 / `UMD_DATA.BIN` identification (`ULUS`/`UCUS`/`ULES`/`NPJH`, title).
4. **Error Visibility:** Surface worker `FATAL`, `BUILD_ROTATED`, and `Read()` I/O errors directly in the UI and as `ErrnoError` / `false` to the emulator — never silent EOF or hung splash screens.
5. **Clean Teardown:** Flush telemetry (`TELEM_FLUSHED` ack) before terminating Worker B on menu exit; close `AudioContext` on game switch; release stuck keys on `window.blur`.

---

## 2. Performance & Browser Compatibility Requirements

1. **Time to Boot / First Frame:** < 2 seconds on cold local/LAN load; < 500 ms on warm OPFS reload.
2. **VFS Overhead Budget:** `totalStallNs` from VFS block misses must remain a small fraction (< 10%) of emulation wall time once warm/prefetched; no synchronous `fsync` in HTTP telemetry paths and no `malloc`/`free` on `VfsBlockDevice::Read`.
3. **Rendering & CPU:** Target 30–60 FPS via PPSSPP's HLE MIPS core + **WebGL2** (`OffscreenCanvas` or main thread), avoiding CPU software rendering for 3D scenes.
4. **Browser Requirements:** Desktop Chromium/Chrome, Edge, or Firefox with `SharedArrayBuffer` (COOP/COEP), `WebGL2`, and `OPFS` (`createSyncAccessHandle` with 4x retry on `NoModificationAllowedError`).

---

## 3. Verification Gates (Self-Contained)

* **Zero external ROM dependency:** `scripts/gen_mock_psp.mjs` generates valid minimal PSP ISO9660 UMD fixtures (< 2 MB) so all automated tests run on a fresh clone.
* Every change must pass:
  1. `make test` (C++ `VfsBlockDevice`, >2 GiB slicing, `HintCold` wrap/bounds, ISO9660 parser, real `VfsClientContext` round-trip)
  2. `go test -count=1 -race ./cmd/...` (`ppsspp-server` catalog, `If-Range` 206, telemetry)
  3. Playwright UI + DiscIO + E2E streaming tests (`npm run test:ui`, `test:disc`, `test:e2e`)
  4. **5-second Performance Gate** (once PPSSPP core is linked): track rendered frames and `totalStallNs` against baseline so thread/raster regressions are caught immediately.
