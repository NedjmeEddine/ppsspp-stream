# INDEX — PPSSPP WebAssembly Core Integration

Phase 4 research index. Raw evidence: 310 `yaml:claim` blocks across the five dossiers below. No application code was edited.

## Compositional Architecture Map

| Axis | Verdict | Primary Sources | Reversibility |
|---|---|---|---|
| wasm-memory-topology | COMPOSE | WM-D03, WM-R12, WM-R24, WM-D22, RC-WM-01/02 | HARD_TO_REVERSE |
| ppsspp-emscripten-build | CLONE_OR_FORK | PB-R05, PB-R05, PB-R03, PB-D10, RC-PB-01 | HARD_TO_REVERSE |
| webgl2-canvas-threading | STEAL_PATTERN | WC-D06, WC-R13, WC-R28, WC-R02, RC-WC-01 | HARD_TO_REVERSE |
| audio-streaming-backend | ADOPT | AS-R05, AS-D10, AS-D16, AS-R11, RC-AS-01 | HARD_TO_REVERSE |
| memstick-opfs-bridge | COMPOSE | MO-R13, MO-R14, MO-R29, MO-R05, RC-MO-08 | HARD_TO_REVERSE |

Verdicts: compose the VFS core with the emulator on one address space; clone the pinned PPSSPP fork for the build; steal the GL-proxy/flag pattern without a canvas transfer; adopt the MPL-2.0 SPSC ring for audio; compose the existing save futex with an explicit flush/ack.

## Co-Existence Matrix

Layer 1 (deterministic): `compat.json` = `RESOLVES`, ecosystem `npm`, `ringbuf.js@0.4.0` (MPL-2.0), forbidden `GPL,AGPL`, zero blocked/unknown packages. No registry package on the other four axes; the GPL core is source provenance, not a dependency.

Layer 2 (runtime / ownership boundaries):

| Boundary | Pair | Status |
|---|---|---|
| ESM vs CJS | `vfs.js` ES6 module vs core MODULARIZE glue | BOUNDARY_RISK |
| Sync vs async contention | Worker A `Atomics.wait` vs Worker B doorbell / GL proxy | BOUNDARY_RISK |
| OS syscalls in WASM | core `write`/`ftruncate` vs OPFS | BOUNDARY_RISK |
| Native build requirements | fork CMake `WASM_*` vs repo `make wasm` | BOUNDARY_RISK |
| Toolchain version | local emsdk 7.0.0 vs fork 6.0.12 | INCOMPATIBLE (unresolved) |
| Duplicate OPFS ownership | Worker B saves dir vs core MEMFS | BOUNDARY_RISK |
| Module export collisions | `_vfs_*` C ABI vs core exports | CLEAR |
| License boundary | GPL core vs MPL audio package | CLEAR |
| Shared-memory ownership | two MODULARIZE pthread modules | INCOMPATIBLE without dylink (RC-WM-02) |
| Teardown signal reliability | `visibilitychange` / `pagehide` vs tab close | BOUNDARY_RISK (RC-MO-11) |

Layer 3: five opt-in, 15–30-line spike plans (memory/build/GL/audio/saves) are in `synthesis.md`; none executed.

## Top Cross-Domain Insights

- Wasm multi-memory and per-module views do not solve cross-module pointer sharing: a single address space with context-independent names remains the working model (WM-D03, RC-WM-01, Opal RC-WM-06/07). The supported Emscripten mechanism is dynamic linking, not two independent modules.
- Shared-memory growth plus pthreads is a dead end in this toolchain: growth warning, trapped atomic reads, stale HEAP views (WM-R09/11, WM-D08, RC-WM-03/04/05). Fixed `INITIAL_MEMORY` is the cross-ecosystem norm (PCSX2, wasm-dolphin).
- Zero-copy is bounded by browser APIs: `ImageData` cannot wrap SAB, so even one module retains a framebuffer copy (WM-R24).
- The only evidenced working PPSSPP web core is a 6.0.12 fork with LTO disabled over an unexplained freeze; upstream master requires SDL3 and has no Emscripten block (PB-D18, PB-D18, PB-R19).
- Audio wait-free SPSC rings are mature and emulator-targeted; the unresolved half is deterministic teardown, not transport (RC-AS-03/07).
- Durability discipline from WAL systems says move the sync/checkpoint off the frame path and make it explicit at exit (RC-MO-01/02/04); OPFS handles are not released synchronously by `worker.terminate()` (RC-MO-08).

## Recall Check

All five axes ran two framings and at most two searches each, per playbook.

- wasm-memory-topology: microkernel/SASOS framing (query: single-address-space OS zero-copy IPC Opal) + browser/dylink framing (query: Emscripten dylink side modules shared memory pthreads). Stronger prior art found: RC-WM-02/09 say independently compiled `MODULARIZE`+pthread modules cannot share memory; RC-WM-01/08 give `env.memory` dylink as the supported mechanism. COMPOSE survives, but its mechanism must change.
- ppsspp-emscripten-build: libretro/core packaging + upstream headless/other-emulator framing. No stronger candidate; corroborated the pinned fork's 6.0.12/-O3/pthreads/LTO-off profile and its CI driver (RC-PB-01..07).
- webgl2-canvas-threading: compositor/OffscreenCanvas lifecycle + engine/SDL proxying framing. No stronger overall candidate; escalated mechanism `sync_on_current_webgl_context_thread` (RC-WC-02), upstream evidence that `PROXY_TO_PTHREAD`×`OFFSCREENCANVAS_SUPPORT` is broken (RC-WC-01/03), and cross-browser resize/transfer failures (RC-WC-09/10/11).
- audio-streaming-backend: lock-free SPSC literature + Web Audio lifetime framing. No stronger candidate; ringbuf.js identity and emulator use case confirmed (RC-AS-01/03). Teardown half remains unverified.
- memstick-opfs-bridge: WAL/write-back durability + browser session-end/SAH ownership framing. No stronger validated candidate; the only alternative (coordinator lease / async OPFS VFS) is an untried issue proposal (RC-MO-10). New risks: SAH locks survive terminate (RC-MO-08), tab-X close skips visibilitychange (RC-MO-11).

## Decisions — approved 2026-11-26

All six items below were approved by the user. The five Layer-3 spikes are authorized for temp-dir execution but were **not** executed; no application code has been changed.

1. Toolchain: local emsdk is 7.0.0, the only working core is pinned at 6.0.12. Approve pinning 6.0.12 for V1, or fund the 7.0.0 build spike with explicit failure budget.
2. Memory: COMPOSE must use Emscripten dynamic linking (`env.memory` main + side module), not two independent `MODULARIZE` modules (RC-WM-02/09). Confirm the core fork can be built as a side module without violating GPL separation.
3. Canvas: accept main-thread WebGL2 with proxied GL calls (BOUNDARY_RISK on latency) or fall back to a single-threaded core build (Godot precedent).
4. Teardown: `visibilitychange` alone is insufficient for tab-X close (RC-MO-11); approve an explicit flush on menu exit plus a bounded `pagehide`/`beforeunload` fallback.
5. Audio: approve the npm dependency `ringbuf.js@0.4.0` (MPL-2.0) and a JS-owned `AudioContext.close()`; Emscripten's Wasm Worklets API cannot provide it (AS-R16).
6. Human must approve the five Layer-3 spikes before any temp-dir execution; V0 explicitly does not execute untrusted spikes.

## Dossiers

- [01-wasm-memory-topology.md](subproblems/01-wasm-memory-topology.md)
- [02-ppsspp-emscripten-build.md](subproblems/02-ppsspp-emscripten-build.md)
- [03-webgl2-canvas-threading.md](subproblems/03-webgl2-canvas-threading.md)
- [04-audio-streaming-backend.md](subproblems/04-audio-streaming-backend.md)
- [05-memstick-opfs-bridge.md](subproblems/05-memstick-opfs-bridge.md)
- [synthesis.md](synthesis.md) · [compat.json](compat.json)
