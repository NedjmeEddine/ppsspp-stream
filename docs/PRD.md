# PRD: PPSSPP WebAssembly Core Integration

## 1. Problem & Goal
- **User / Operator:** Desktop browser player (Chromium or Firefox) launching 500 MB–1.8 GB+ PSP UMD `.iso` titles served by `ppsspp-server` without upfront full-disc downloads.
- **Core Job:** Integrate a reproducible upstream PPSSPP WebAssembly core into the existing `ppsspp-stream` VFS + launcher shell so users can boot, render, hear, control, and save real PSP games over 256 KB HTTP 206 block streaming.
- **Success Metric:** Any valid sliced PSP `.iso` boots to live WebGL2 frames in `< 2s` cold local load (`< 500ms` warm OPFS reload), sustains `>= 30 FPS` with VFS `totalStallNs < 10%` of emulation wall time over a 5-second warm window, stays inside the 16–64 MB SAB slab, and persists Memory Stick saves across reloads.

## 2. Non-Goals (Out of Scope for V1)
- Compressed disc containers (`.cso`, `.chd`, `.pbp`); raw ISO9660 `.iso` only.
- Savestates (quick save/load), rewind, netplay, or cheat engines.
- Safari/WebKit support, mobile browsers, or on-screen touch controls.
- Real-ISO ingestion/packaging CLI or catalog management UI beyond `markov-pack` and `games.json`.
- Patching `externals/vfs-streamer` directly from this repo (must remain pinned at upstream `a3b8bd6+`).

## 3. Kill Criteria & Hard Constraints
- **Runtime / Platform:** Desktop Chromium and Firefox with `SharedArrayBuffer` (COOP `same-origin` + COEP `require-corp`), `WebGL2`, `WebAudio`, `Gamepad API`, and `OPFS` (`createSyncAccessHandle` with 4x lock retry). Emscripten build via `~/.local/share/emsdk`.
- **License Policy:** Upstream PPSSPP core binary/sources may be GPLv2+; all `ppsspp-stream` shell, Go server, and `VfsBlockDevice` glue stay cleanly separated from upstream PPSSPP sources. No opaque/undocumented `.wasm` binaries—`docs/CORE_PORT.md` must record upstream repo URL, commit SHA, build flags, and C ABI.
- **Security / Trust Boundaries:** Server serves only validated `gameId` paths (`^[a-zA-Z0-9_-]{1,64}$`). Client isolates OPFS per `gameId` (`cache_${gameId}.opfs`, `/saves/${gameId}/`). All `SharedArrayBuffer` views must be `.slice()`d before `TextDecoder.decode()`. Struct sizes must come from `_vfs_client_ctx_size()` / `_vfs_fs_struct_size()`.
- **Performance / Size Bounds:** Configurable 16–64 MB `SharedArrayBuffer` VFS slab (`RETRY_SMALLER_POOL` fallback down to 16 MB); `VfsBlockDevice::Read` enforces strict EOF and `<= 64 MiB` `wasm32` slices with zero `malloc`/`free` per read; cold local boot `< 2s`, warm OPFS `< 500ms`, `>= 30 FPS`, VFS stall `< 10%` when warm.

## 4. Technical Unknowns (`[RDD-NEEDED]`)
- `wasm-memory-topology`: Should V1 use **Option A** (single-WASM zero-copy compiling `VfsBlockDevice` + VFS C client inside PPSSPP's shared-memory WASM) or **Option B** (decoupled `web/vfs.wasm` + PPSSPP WASM via bounce buffer)? Hard to reverse because it dictates memory layout, Emscripten link flags, copy overhead, and upstream rebase cost.
- `ppsspp-emscripten-build`: Which upstream PPSSPP commit/fork and Emscripten build configuration (`-pthread`, HLE CPU interpreter/IR/JIT, GLES3/WebGL2, `BlockDevice` seam) compiles reproducibly with local `emsdk` without unmaintained patches? Hard to reverse once the C ABI and build pipeline are pinned.
- `webgl2-canvas-threading`: Should PPSSPP own a WebGL2 `OffscreenCanvas` in Worker A or proxy GL calls via the main thread across Chromium and Firefox? Moderate-to-hard to reverse due to canvas transfer ownership, resize handling, and pthread deadlock risks.
- `audio-streaming-backend`: How should Worker A stream stereo 44.1/48 kHz PCM to WebAudio (`AudioWorklet` + SAB ring buffer vs main-thread ring) to avoid underruns while guaranteeing deterministic `AudioContext.close()` teardown? Moderate to reverse.
- `memstick-opfs-bridge`: How should PPSSPP's `/PSP/SAVEDATA` writes synchronize to Worker B's OPFS `/saves/${gameId}/` without stalling the emulation thread or losing dirty saves on exit/reload? Moderate to reverse.

## 5. Vertical Slices & Acceptance Criteria

### Slice 1: Reproducible PPSSPP Core Build & `VfsBlockDevice` Seam
- **Scope:** `cores/ppsspp/` build target (`Makefile` / build script), PPSSPP `BlockDevice` -> `VfsBlockDevice` adapter, and `docs/CORE_PORT.md` provenance spec.
- **Acceptance Checks (TDD Spec):**
  - `AC-1.1`: Given a clean checkout with `emsdk` activated, when the documented core build command runs, then `cores/ppsspp/` WASM/JS outputs build reproducibly and `docs/CORE_PORT.md` documents the exact upstream repo, commit SHA, Emscripten flags, and C ABI.
  - `AC-1.2`: Given a valid sliced PSP `.iso` served by `ppsspp-server`, when the core opens the disc through `VfsBlockDevice`, then it reads ISO9660 PVD (`CD001`), `UMD_DATA.BIN`, and `PSP_GAME/PARAM.SFO` via 256 KB block fetches without downloading the full disc.
  - `AC-1.3` (error/edge): Given an out-of-bounds sector request, missing pack, or `BUILD_ROTATED` (`-2`) VFS error, when the core calls `ReadBlock`/`ReadBlocks`, then `VfsBlockDevice` returns `false` (never silent EOF) and the UI displays an explicit error badge without hanging.
- **Invariants:** `externals/vfs-streamer` unmodified; `make test` and `go test -count=1 -race ./cmd/...` pass; `VfsBlockDevice` strict EOF and `<= 64 MiB` slicing preserved.

### Slice 2: WebGL2 Video Pipeline & Frame-Paced Boot
- **Scope:** Worker A emulator loop (`web/worker_a.js`), canvas lifecycle (`web/index.html`), and `#hud-canvas` coexistence.
- **Acceptance Checks (TDD Spec):**
  - `AC-2.1`: Given a valid sliced PSP `.iso` launched from the catalog in Chromium or Firefox, when boot completes, then `#emulator-canvas` renders live WebGL2 frames (non-blank, updating output) in `< 2s` cold local load / `< 500ms` warm OPFS reload while `#hud-canvas` displays live slab telemetry.
  - `AC-2.2`: Given a 5-second warm emulation run, when metrics are sampled, then rendered frame rate is `>= 30 FPS` and `totalStallNs` is `< 10%` of emulation wall time.
  - `AC-2.3` (error/edge): Given a WebGL2 initialization failure or `FATAL` worker error, when launch runs, then the UI surfaces the failure reason in `#badge-iso` and never falls back silently to a 2D context on a transferred canvas.
- **Invariants:** COOP/COEP headers on all web assets; `RETRY_SMALLER_POOL` (64 -> 32 -> 16 MB) fallback intact.

### Slice 3: Keyboard & Gamepad Input Bridge
- **Scope:** Main-thread input controller (`web/index.html` / input helper) and Worker A input injection.
- **Acceptance Checks (TDD Spec):**
  - `AC-3.1`: Given an active session, when mapped keys (keyed by `e.code`) or a standard Gamepad (buttons + analog stick `0..255`, center `128`) are pressed/moved, then the core observes the matching non-overlapping PSP button bitmask and analog axes on the next frame.
  - `AC-3.2` (error/edge): Given keys held when `window.blur` fires or the user exits to menu, when focus changes, then all digital bits clear to `0` and analog axes reset to `(128, 128)` with zero stuck inputs.
- **Invariants:** Non-overlapping PSP button bitmask; no duplicate event listeners across repeated game launches.

### Slice 4: WebAudio PCM Output & Deterministic Session Teardown
- **Scope:** Audio output bridge (`AudioWorklet`/WebAudio) and menu-exit / game-switch teardown across `web/index.html`, `web/worker_a.js`, and `web/worker_b.js`.
- **Acceptance Checks (TDD Spec):**
  - `AC-4.1`: Given user-initiated game launch, when the core emits stereo 44.1/48 kHz PCM samples, then WebAudio outputs audio with bounded latency and no unbounded buffer growth.
  - `AC-4.2` (error/edge): Given an active game when "XMB Menu" is clicked, another game is launched, or `visibilitychange` transitions to `hidden`, then `AudioContext` closes cleanly, Worker B receives `FLUSH_TELEMETRY` and acks `TELEM_FLUSHED` (or hits bounded timeout) before termination, and launching a second game succeeds without leaks.
- **Invariants:** Existing `npm run test:ui`, `test:disc`, and `test:e2e` suites remain green.

### Slice 5: Persistent PSP Memory Stick Saves (OPFS)
- **Scope:** PPSSPP Memory Stick (`/PSP/SAVEDATA`) persistence bridged to Worker B OPFS `/saves/${gameId}/`.
- **Acceptance Checks (TDD Spec):**
  - `AC-5.1`: Given a running game writes a Memory Stick save file, when the user exits to menu or reloads the page and relaunches the same `gameId`, then the exact saved bytes are present on Memory Stick.
  - `AC-5.2` (error/edge): Given two catalog titles (`gameA`, `gameB`), when `gameA` writes saves or OPFS fails (`NoModificationAllowedError` / unavailable), then `gameB`'s `/saves/gameB/` and `cache_gameB.opfs` remain unaffected and OPFS failure warns visibly without crashing emulation.
- **Invariants:** OPFS strictly partitioned by `gameId`; `BuildEtagHash` cache invalidation never deletes `/saves/${gameId}/`.

## 6. Open Decisions for Human
- **Automated Playable CI Fixture:** Choose what legal playable PSP `.iso` (e.g., an open-source homebrew EBOOT/ISO fixture checked into tests vs a user-supplied local retail `.iso` env var) should back the automated Slice 2–5 Playwright gates in CI.
- **Core Artifact Storage:** Decide whether compiled `cores/ppsspp/` binaries are git-tracked (like `web/vfs.wasm`), built on-demand via `make`, or fetched from pinned release artifacts.
