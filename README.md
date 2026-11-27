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

## Acknowledgments & Credits

This project stands on the shoulders of giants. We are deeply grateful to the researchers, emulator authors, and open-source pioneers whose work made this possible:

### Upstream Projects & Pioneers
* **[Henrik Rydgård](https://github.com/hrydgard) & the [PPSSPP Team](https://github.com/hrydgard/ppsspp)** — For creating and maintaining PPSSPP, one of the most mature, performant, and cleanly architected open-source emulators in existence. Its modular `BlockDevice` interface and clean graphics pipeline are what make web-based sector streaming possible.
* **[root-hunter](https://github.com/root-hunter) ([ppsspp-wasm](https://github.com/root-hunter/ppsspp-wasm))** — For pioneering modern Emscripten configurations, WebGL2 scaffolding, and browser threading work for PPSSPP.
* **[phiresky](https://github.com/phiresky) ([sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs))** — For demonstrating to the web development world that large, complex binary data structures (SQLite) can be queried efficiently on-demand over HTTP range requests without downloading entire files.
* **The [DuckDB](https://github.com/duckdb/duckdb-wasm) Team** — For setting the gold standard in robust out-of-core buffer management and range-fetching within WebAssembly.

### Foundational Research
The caching, prefetching, and out-of-core designs used here build directly on foundational academic computer systems research:
* **Thomas M. Kroeger & Darrell D. E. Long** — *Predicting File-System Actions from Prior Events* (USENIX ATC 1996), which laid out how Markov models can anticipate filesystem block accesses.
* **Jim Griffioen & Randy Appleton** — *Reducing File System Latency Using a Predictive Approach* (USENIX Summer 1994), early groundwork demonstrating how graph-based transition modeling effectively hides I/O wait times.
* **Jeffrey Scott Vitter** — *External Memory Algorithms and Data Structures: Dealing with Massive Data* (ACM Computing Surveys, 2001), the cornerstone reference for hierarchical cache modeling ($L_1 \rightarrow L_2 \rightarrow L_3$) and out-of-core algorithmic efficiency.
* **The W3C WebAssembly & Web Performance Working Groups** — For standardizing `SharedArrayBuffer`, `Atomics`, and the Origin Private File System (`FileSystemSyncAccessHandle`), providing the raw browser primitives needed to build near-native virtual filesystems.

