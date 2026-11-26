# Synthesis — PPSSPP WebAssembly Core Integration (Phase 3)

Scope: 310 `yaml:claim` blocks in `subproblems/0[1-5]-*.md`. All five axes are `HARD_TO_REVERSE` after Phase 2 escalation. Verdicts below are compositional, not product decisions; file paths are research artifacts only.

## Step 1 — Binary elimination (kill-criteria violations)

| Candidate | Axis | Decision | Cited reason |
|---|---|---|---|
| Option A: compile `vfs_block_device.cpp` directly into PPSSPP core WASM | wasm-memory-topology | ELIMINATED | WM-R25 / PB-D05: GPLv2-or-later header makes glue a derivative coupling, violating the license-separation kill criterion; WM-R24 shows `ImageData` cannot wrap SAB, so the promised zero-copy is partial anyway. |
| Shipped `-pthread + ALLOW_MEMORY_GROWTH` flag pair as-is | wasm-memory-topology | ELIMINATED (flags) | WM-R09 / WM-R11 / WM-D11: Emscripten 7.0.0 emits `pthreads-mem-growth` and shared-memory growth was observed to trap 5/5 runs; WM-R12 / WM-R20 give the fixed-`INITIAL_MEMORY` replacement. |
| Unmodified upstream PPSSPP master `emcmake` build | ppsspp-emscripten-build | ELIMINATED | PB-D18 / PB-D18: hard SDL3 requirement; PB-D01: no `USING_EMSCRIPTEN` option; PB-R22: libretro `Makefile.common` has no Emscripten branch; PB-R03: no official 7.0.0 validation. |
| SQLite `opfs-sahpool` as Memory Stick backend | memstick-opfs-bridge | ELIMINATED | MO-R21: auto-wipe on init failure contradicts "never delete saves on cache invalidation"; MO-R20: exclusive directory ownership; MO-R19: second tab fails. |
| Transferred `OffscreenCanvas` WebGL2 as the *sole* render path | webgl2-canvas-threading | ELIMINATED (sole path) | WC-D13 / WC-R22: open Firefox main-thread-spin deadlock; WC-R23: loss/restore callbacks never fire; WC-R02 / WC-R02 / WC-R02: current 2D banner context and canvas reuse make transfer illegal. |
| Emscripten Wasm Audio Worklets as the *sole* PCM path | audio-streaming-backend | ELIMINATED (sole path) | AS-R16: no C `close()` entry point (only `suspend()`), breaking deterministic teardown; AS-R11 / AS-R13 / AS-R14: hard build constraints (no `SINGLE_FILE`, `TEXTDECODER=1`). |

## Step 2 — Normalized survivor comparison

### wasm-memory-topology

| Survivor | Spec coverage | Exit cost | Maintenance / issue radar | Transferability |
|---|---|---|---|---|
| Decoupled modules, one imported fixed-size SAB, pass block offsets (not copied buffers) | Full slab budget; no bounce for core reads; WM-D03 pointer validity | Moderate: swap core build without touching VFS | WM-R12 fixed-memory commit, WM-R20 PCSX2 precedent, WM-R22 wasm-dolphin fixed 1.5 GiB | Strong: microkernel/SASOS zero-copy literature (WM-P05, WM-P07) |
| Current bounce-buffer two-WASM scaffold | Partial: 4 MiB IPC ceiling (WM-R24), `.slice()` copy (WM-R24) | Low: already built | WM-R09 growth warning must be fixed; no core yet | Weak: copy-style boundary like v86 (WM-R18) |

### ppsspp-emscripten-build

| Survivor | Spec coverage | Exit cost | Maintenance / issue radar | Transferability |
|---|---|---|---|---|
| Pinned `root-hunter/ppsspp-wasm` fork @ 4d0564b / audited 0dbfaca, emcmake flags | Full: WebGL2-only, pthread pool, SDL, shared memory (PB-D10/R09/R10/R11) | High: fork rebase cost, WASM_* CMake options (PB-D12) | 6.0.12 pin (PB-R03/R03), LTO freeze unresolved (PB-R19/R19), no 7.0.0 proof | Moderate: libretro/RetroArch single-archive link pattern (WM-R17) |
| Upstream libretro `emscripten` stanza only | Partial: `.bc` static archive, `-pthread` (PB-D01) | Low | PB-R22: no Emscripten branch in `Makefile.common`; no web shell integration | Low |

### webgl2-canvas-threading

| Survivor | Spec coverage | Exit cost | Maintenance / issue radar | Transferability |
|---|---|---|---|---|
| Main-thread WebGL2 context + `PROXY_ALWAYS` GL calls from pthread | Meets "never silently 2D"; cross-pthread shareable (WC-D06/R13) | Low: no canvas transfer, no one-shot lifecycle | Latency cost documented (WC-D06); Godot 4.3+ prefers single-thread (WC-R29) | Strong: SDL PR 127 proxy pattern (WC-R27) |
| OffscreenCanvas in Worker A + conditional fallback | Best-case latency | High: fresh canvas per game required | Open Firefox bugs (WC-R22, WC-R23, WC-R20), Asyncify workaround (WC-D23) | Moderate: Godot flags (WC-R28) |

### audio-streaming-backend

| Survivor | Spec coverage | Exit cost | Maintenance / issue radar | Transferability |
|---|---|---|---|---|
| `ringbuf.js` SPSC SAB ring + JS `AudioWorkletProcessor`, explicit JS `AudioContext.close()` | Full: 44.1/48 kHz stereo, wait-free, 50 ms buffer (AS-R05/R07/R08), bounded-latency AC-4.1 | Low: one npm dep, MPL-2.0 (compat.json RESOLVES) | Maintained v0.4.0, pinned commit 38776a6; no open blocker in evidence | Strong: emulator single-thread use case is an explicit upstream target (AS-R10) |
| Emscripten Wasm Audio Worklets | Full DSP, no GC (AS-D02) | High: replaces teardown API, build flags | AS-R16 no `close()`, AS-R24 polyfills, Chrome lifetime divergence (AS-D25) | Moderate |

### memstick-opfs-bridge

| Survivor | Spec coverage | Exit cost | Maintenance / issue radar | Transferability |
|---|---|---|---|---|
| Keep repo `vfs_save_write_sync` futex + Worker B OPFS, add explicit flush/ack | Full: per-game partition already present (MO-R04/R05), C-visible durability point (MO-R14) | Low: no VFS core changes (submodule invariant) | MO-R29: close alone does not flush; MO-R30: 30 s bounded sync precedent; local `onSaveWrite` fire-and-forget must be fixed | Strong: opfs-vfs and IDBFS write-back-on-close patterns (MO-R09/R28) |
| Emscripten WASMFS OPFS directly under PPSSPP | Full FS transparency + flush | High: custom core build, `-sWASMFS` requires malloc (MO-D06) | MO-R15/R16: `readwrite-unsafe` EIO on unlink/rename; MO-R11: no IDBFS | Moderate |

## Step 3 — Per-axis compositional verdicts

| axis | verdict | primary sources | reversibility |
|---|---|---|---|
| wasm-memory-topology | COMPOSE | WM-D03, WM-R12, WM-R24, WM-D22 | HARD_TO_REVERSE |
| ppsspp-emscripten-build | CLONE_OR_FORK | PB-R05, PB-R05, PB-R03, PB-D10 | HARD_TO_REVERSE |
| webgl2-canvas-threading | STEAL_PATTERN | WC-D06, WC-R13, WC-R28, WC-R02 | HARD_TO_REVERSE |
| audio-streaming-backend | ADOPT | AS-R05, AS-D10, AS-D16, AS-R11 | HARD_TO_REVERSE |
| memstick-opfs-bridge | COMPOSE | MO-R13, MO-R14, MO-R29, MO-R05 | HARD_TO_REVERSE |

Rationale in one line each: compose decoupled modules onto one fixed-size imported SAB; clone the pinned fork because it is the only evidenced working WebGL2/pthread build; steal Emscripten's proxy-context and Godot's flag pattern without transferring the canvas; adopt the MPL-2.0 ring buffer for the wait-free audio queue with JS-owned teardown; compose the existing save futex with an explicit flush/ack barrier.

## Step 4 — Co-existence audit

### Layer 1 — Deterministic package audit

`compat-dryrun.py --ecosystem npm --add ringbuf.js@0.4.0 --forbidden-licenses GPL,AGPL` → `RESOLVES`, MPL-2.0, no blocked/unknown packages. Result written to `compat.json`. No package adoption on the other four axes (core is a pinned source fork, not a registry package); GPL core stays outside `package.json`.

### Layer 2 — Runtime & ownership boundary checklist

| Boundary | Pair | Status | Note |
|---|---|---|---|
| ESM vs CJS | `vfs.js` (ES6 module) vs PPSSPP core JS glue | BOUNDARY_RISK | Core fork emits `-sMODULARIZE/-sEXPORT_ES6`; verify the same module shape, no CJS `require` in workers. |
| Sync vs async event-loop contention | Worker A `Atomics.wait` vs Worker B doorbell | BOUNDARY_RISK | WC-D09 / WC-R22: proxy + main-thread spin deadlocks; keep waits in workers only. |
| OS/Node syscalls in browser/WASM | upstream POSIX `write`/`ftruncate` in core vs OPFS | BOUNDARY_RISK | MO-R01 / MO-R02 / MO-R12: no `fsync` on PPSSPP save path; WASMFS OPFS cannot run on main thread. |
| Native extension build requirements | core fork CMake vs `make wasm` VFS build | BOUNDARY_RISK | PB-D12 `WASM_*` options exist only in the fork; two build systems must share flags. |
| Toolchain version | local emsdk 7.0.0 vs fork 6.0.12 | INCOMPATIBLE (unresolved) | PB-D23 / PB-R03 / PB-D22: no evidence of a 7.0.0 build; needs the build spike. |
| Duplicate ownership: OPFS saves | Worker B `/saves/${gameId}/` vs core MEMFS | BOUNDARY_RISK | MO-R20 / MO-R21: avoid a second VFS owning the same directory. |
| Duplicate ownership: module exports | `_vfs_*` C ABI in `web/vfs.js` vs core exports | CLEAR | Current ABI is name-prefixed and size-queried (`_vfs_client_ctx_size`); no collision evidenced. |
| License boundary | GPL core vs MPL/npm audio package | CLEAR | `compat.json` permits MPL-2.0; core is documented provenance in `docs/CORE_PORT.md`, not an npm dep. |

### Layer 3 — Proposed spike plans (human approval required; not executed)

1. wasm-memory-topology — fixed-SAB spike (temp dir)
   - Goal: prove two modules can share one imported `WebAssembly.Memory` with block offsets passed over `MessagePort`, no `.slice()` bounce.
   - Steps: clone VFS `wasm` build with `-sALLOW_MEMORY_GROWTH=0`, fixed `INITIAL_MEMORY=MAXIMUM_MEMORY`, `-pthread`, `-sIMPORTED_MEMORY=1`.
   - Write a tiny second WASM module importing the same memory; export a function reading `ctx.slab[offset]` and returning a checksum.
   - Have the harness post only `{offset, length}`; assert checksum equals a direct C read.
   - Measure `totalStallNs` for 1000 sector reads; require < 10% of wall time.
   - Run under Chromium and Firefox with COOP/COEP; assert no `pthreads-mem-growth` warning.
   - Try 64/32/16 MB pool sizes; confirm `RETRY_SMALLER_POOL` still works.
   - Failure condition: any view detachment, trap, or need to copy bytes → reject COMPOSE and fall back to bounded bounce.
   - Report: flag set, checksums, timings, browser matrix, decision memo.

2. ppsspp-emscripten-build — toolchain spike (temp dir)
   - Goal: reproduce the pinned fork build, then test 7.0.0.
   - Clone `root-hunter/ppsspp-wasm` @ 4d0564b and `ppsspp-web` @ ea176fd in a temp dir; do not touch `externals/vfs-streamer`.
   - Build with local emsdk 6.0.12 first using documented `WASM_*` flags; record success and SHA.
   - Switch emsdk to 7.0.0; apply `-D_LIBCPP_KEEP_TRANSITIVE_INCLUDES_LLVM23` if needed (PB-D22).
   - Record every failure verbatim; do not patch the submodule.
   - Confirm LTO-off default reproduces; try LTO once with a hard timeout and record freeze/no-freeze.
   - Confirm IR interpreter only (`IRJit::RunLoopUntil`, PB-D20), no native JIT.
   - Verify `BlockDevice` adapter seam accepts a VFS-backed subclass.
   - Emit `docs/CORE_PORT.md` candidate text: repo, SHA, flags, C ABI.
   - Decision: if 7.0.0 fails, escalate toolchain version to the human gate before proceeding.

3. webgl2-canvas-threading — GL proxy spike (temp dir)
   - Goal: prove main-thread WebGL2 + `PROXY_ALWAYS` renders without a transferred canvas.
   - Build a minimal Emscripten 7.0.0 module with `-sMAX_WEBGL_VERSION=2 -sPROXY_TO_PTHREAD=1`, no `OFFSCREENCANVAS_SUPPORT`.
   - Create `#emulator-canvas` on the main thread; never call `getContext('2d')` on it.
   - Render a frame from a pthread via `EMSCRIPTEN_WEBGL_CONTEXT_PROXY_ALWAYS`; assert non-blank pixels.
   - Repeat across 3 game-switch simulations with a fresh canvas element each time.
   - In Firefox, assert no five-second WebGL2 context hang (WC-R22).
   - Register loss/restore callbacks and assert they fire on forced context loss.
   - Measure proxy latency over 300 frames; flag if it threatens 30 FPS.
   - Decision: adopt proxy path if CLEAR; otherwise escalate.

4. audio-streaming-backend — ring buffer spike (temp dir)
   - Goal: prove `ringbuf.js@0.4.0` carries stereo PCM with deterministic teardown.
   - `npm install ringbuf.js@0.4.0` in the temp dir only; verify MPL-2.0 (already `RESOLVES`).
   - Construct `AudioWriter`/`AudioReader` on a 50 ms SAB ring from `processorOptions`.
   - Feed 44.1 kHz stereo frames from a simulated producer; assert no underrun over 5 s.
   - Assert `dequeue()` returns silence on empty buffer (AS-D28).
   - Call `AudioContext.close()` during simulated game switch; assert promise resolves and no worklet remains.
   - Avoid `writeCallback()` in the real-time thread (AS-R04).
   - Decision: proceed with ADOPT if all assertions pass.

5. memstick-opfs-bridge — save durability spike (temp dir)
   - Goal: prove save writes reach OPFS with an explicit flush/ack and per-game isolation.
   - Reuse Worker B's existing `cache_${gameId}.opfs` / `/saves/${gameId}/` layout (no VFS patch).
   - Replace fire-and-forget `onSaveWrite` with a job that calls `syncHandle.flush()` then `close()` (MO-R11/MO-R14).
   - Send an ack back to Worker A over the existing save futex; assert the producer sees success only after flush.
   - Assert save bytes survive a simulated reload for game A and are absent for game B.
   - Simulate `NoModificationAllowedError` and assert warning + no crash (MO-R17).
   - Assert `visibilitychange` triggers the same flush path (MO-D32).
   - Decision: proceed with COMPOSE if no dirty-write loss is observed.
