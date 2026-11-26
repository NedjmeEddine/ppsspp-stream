# Salvaged leads from failed Phase 2 subagents (UNVERIFIED)

> Source: transcripts of 11 subagents that died on 429 quota. They produced **no `yaml:claim` blocks**, so nothing here is cite-checked. Treat as search leads only; re-verify before writing claims.
> Raw extracts (tool results + reasoning, ~1.5 MB): `/home/nedjmo/.gemini/antigravity/brain/2a4091f4-a5aa-4252-ad36-7be4b09bcdfa/scratch/{mem,build,gl,audio,memstick}-{repos,docs,papers}.txt`
> Full transcripts: `/home/nedjmo/.gemini/antigravity/brain/<subagent-id>/.system_generated/logs/transcript_full.jsonl`

## Leads per axis
- **wasm-memory-topology**: Emscripten issue #27859, "honour MAXIMUM_MEMORY with IMPORTED_MEMORY" (imported memory larger than INITIAL_MEMORY without growth). Subagents read the 7.0.0 linker source (`link.py`, `settings`) to check slab sizing and thread flags. Paper search was unresolved: one search summary misattributed a paper ID, so every paper ID needs direct verification.
- **ppsspp-emscripten-build**: Local `emcc` is 7.0.0 at commit `777e6e5db7b4990bcaeb1b9998ed642cc84e6629`, and the emsdk source is on disk (`~/.local/share/emsdk/upstream/emscripten`), so flags can be checked locally. The subagent's reasoning says PPSSPP's legacy JIT docs describe a system since replaced by the IR-based one. Treat that as a lead only. Docs vs source mismatch on `GL_ENABLE_GET_PROC_ADDRESS` (docs say default false, 7.0.0 source says true).
- **webgl2-canvas-threading**: Lead on `OffscreenCanvas` commit semantics: the subagent reasoned that explicit context swaps are implicit in current browser specs, and traced Emscripten's offscreen frame-commit routines. Unconfirmed.
- **audio-streaming-backend**: Lead on a build-time clash between `AUDIO_WORKLET` and `-pthread`/`WASM_WORKERS` (preprocessor guards in Emscripten's audio/worker libs). **Highest-priority item to verify**, since it could decide the audio design.
- **memstick-opfs-bridge**: Lead on the browser support matrix for `FileSystemSyncAccessHandle` and `createWritable` in Firefox (a search summary looked conflated; check MDN/release notes). Also: `FS.trackingDelegate` only exists in debug-flag builds, so it can't be relied on for dirty-file tracking in release builds.

## Caveats
- The GitHub API was rate-limited for several agents; some fell back to reading local emsdk files.
- Subagent reasoning is the model's own notes, not evidence.
