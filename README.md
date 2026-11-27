# PPSSPP-Stream

> **Instant-Play Out-of-Core WebAssembly Streaming for PPSSPP (PSP)**

Stream 500 MB–1.8 GB+ PSP UMD `.iso` disc images directly in the browser inside a bounded **64 MB `SharedArrayBuffer` cache** using `wasm-block-streamer` (`externals/vfs-streamer` @ `a3b8bd6`), pairing PPSSPP's mature HLE MIPS + WebGL2 engine with HTTP 206 range streaming, OPFS persistence, and 1st-order Markov block prefetching.

---

## Quickstart

```bash
# 1. Initialize submodule & npm Playwright link (if cloned fresh)
git submodule update --init --recursive

# 2. Build Go server & packager CLIs
cd externals/vfs-streamer && go build -o ../../bin/markov-pack ./cmd/markov-pack && cd ../..
go build -o bin/ppsspp-server ./cmd/ppsspp-server

# 3. Generate & slice mock PSP UMD ISO fixtures (no external ROMs needed)
node scripts/gen_mock_psp.mjs

# 4. Build native tests & WebAssembly VFS module (web/vfs.js + web/vfs.wasm)
make test
source ~/.local/share/emsdk/emsdk_env.sh && make wasm

# 5. Serve locally with COOP/COEP headers
./bin/ppsspp-server -data-dir ./dist -web-dir ./web -addr 127.0.0.1:8080
```

Open `http://127.0.0.1:8080/` in Chromium or Firefox.

---

## Verification Commands

```bash
# Native C++ BlockDevice + ISO9660 UMD header tests
make test

# Go multi-game server tests (with race detector)
go test -count=1 -race ./cmd/...

# Upstream VFS submodule tests
cd externals/vfs-streamer && go test -count=1 -race ./...
make -C externals/vfs-streamer/client/vfs test

# Browser Playwright integration suites
npm run test:ui
npm run test:disc
npm run test:e2e
```

---

## Repository Layout

```text
ppsspp-stream/
├── externals/vfs-streamer/     # Audited out-of-core VFS submodule (a3b8bd6)
├── cmd/ppsspp-server/          # Stdlib Go HTTP 206 catalog, range & telemetry server
├── src/disc_io/                # C++ VfsBlockDevice (2048 B sector adapter) & ISO9660 UMD parser
├── web/                        # Launcher UI, Worker A/B, Memory HUD, Playwright tests
├── scripts/gen_mock_psp.mjs    # Self-contained mock PSP ISO9660 generator & slicer
├── docs/
│   ├── ARCHITECTURE.md         # 3-thread topology, memory boundary, container rules
│   ├── REQUIREMENTS.md         # Latency, RAM budget, OPFS, and verification gates
│   └── CORE_PORT.md            # Upstream PPSSPP Emscripten build & BlockDevice seam
├── Makefile                    # Native test + Emscripten web/vfs.js build
└── AGENTS.md                   # Agent & developer invariants
```

---

## Academic Background & Prior Art

PPSSPP-Stream synthesizes research in out-of-core memory hierarchies, browser-based paging, and trace-driven predictive prefetching:

### Core Papers & Techniques
* **Predictive Prefetching via Markov Chains:**
  * Kroeger, T. M., & Long, D. D. (1996). *Predicting File-System Actions from Prior Events*. USENIX Annual Technical Conference (ATC). Explores higher-order and 1st-order Markov models for filesystem block prediction under burst access patterns.
  * Griffioen, J., & Appleton, R. (1994). *Reducing File System Latency Using a Predictive Approach*. USENIX Summer. Foundation for prefetching file blocks based on transition probability graphs.
* **Out-of-Core Memory Management & Paging:**
  * Vitter, J. S. (2001). *External Memory Algorithms and Data Structures: Dealing with Massive Data*. ACM Computing Surveys (CSUR). Theoretical foundations for optimal I/O models and hierarchical caching ($L_1$ RAM $\rightarrow$ $L_2$ SSD $\rightarrow$ $L_3$ Network).
* **Browser-Native Storage & Multi-Tier Virtual Filesystems:**
  * W3C Origin Private File System (OPFS) & `FileSystemSyncAccessHandle`: High-performance in-browser raw byte block storage providing low-overhead synchronous page reads/writes.
  * WebAssembly Threads & Synchronization: `SharedArrayBuffer` with `Atomics.wait` and `Atomics.notify` providing zero-copy synchronous block-fault resolution across web workers.

### Related Open-Source Projects & Upstream Repositories
* **[wasm-block-streamer](https://github.com/nedjmeddine/wasm-block-streamer)** (`externals/vfs-streamer`): The underlying lock-free 3-tier block streaming engine, OPFS cache manager, and Markov pack toolchain.
* **[PPSSPP](https://github.com/hrydgard/ppsspp)** (Henrik Rydgård): Upstream Sony PlayStation Portable emulator core providing HLE, GE graphics rendering, and the `BlockDevice` sector interface.
* **[ppsspp-wasm](https://github.com/root-hunter/ppsspp-wasm)**: Reference Emscripten build configuration, WebGL2 pipeline, and browser bindings for PPSSPP.
* **[sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs)** (phiresky): Pioneering browser HTTP range-request VFS for read-only SQLite databases, demonstrating on-demand page streaming over HTTP 206.
* **[DuckDB-Wasm](https://github.com/duckdb/duckdb-wasm)**: Production WebAssembly analytical engine featuring HTTPFS range fetching and out-of-core buffer management.

