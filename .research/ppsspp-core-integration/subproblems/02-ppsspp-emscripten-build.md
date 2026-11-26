# Dossier: ppsspp-emscripten-build

Evidence lane: docs. Raw technical claims only (no verdicts).

```yaml:claim
id: PB-D01
axis: "ppsspp-emscripten-build"
claim: "PPSSPP master libretro/Makefile has an 'emscripten' platform stanza producing a wasm32 static .bc archive with GLES=1 and flags -msimd128 -pthread -D__EMSCRIPTEN__ -DNO_MMAP."
url: "https://github.com/hrydgard/ppsspp/blob/master/libretro/Makefile"
anchor: "PLATCFLAGS += -msimd128 -msse3 -mssse3 -msse4.1 -pthread -D__EMSCRIPTEN__ -DNO_MMAP"
receipt: "docs:master"
```







```yaml:claim
id: PB-D05
axis: "ppsspp-emscripten-build"
claim: "PPSSPP BlockDevices.h is licensed GNU GPL version 2.0 or later, with source-availability obligations on redistribution of builds."
url: "https://github.com/hrydgard/ppsspp/blob/master/Core/FileSystems/BlockDevices.h"
anchor: "the Free Software Foundation, version 2.0 or later versions."
receipt: "docs:master"
escalate: true
```

```yaml:claim
id: PB-D06
axis: "ppsspp-emscripten-build"
claim: "root-hunter/ppsspp-wasm is an unofficial PPSSPP WebAssembly/Emscripten fork on the 'wasm' branch that preserves upstream credits and GPL 2.0-or-later terms."
url: "https://github.com/root-hunter/ppsspp-wasm"
anchor: "This is a community fork, not an official PPSSPP release."
receipt: "docs:wasm"
```







```yaml:claim
id: PB-D10
axis: "ppsspp-emscripten-build"
claim: "root-hunter reports that with LTO enabled the emulator UI starts but launching games froze the entire browser page; root cause not isolated."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/docs/browser-stability.md"
anchor: "launching games froze the entire browser page."
receipt: "docs:wasm"
escalate: true
```

```yaml:claim
id: PB-D11
axis: "ppsspp-emscripten-build"
claim: "root-hunter's Makefile configures PPSSPP via emcmake with USING_GLES2=ON, USING_EGL=OFF, VULKAN=OFF, USE_NO_MMAP=ON and all system libraries bundled."
url: "https://github.com/root-hunter/ppsspp-wasm/blob/wasm/Makefile"
anchor: "-DUSE_NO_MMAP=ON"
receipt: "docs:wasm"
```

```yaml:claim
id: PB-D12
axis: "ppsspp-emscripten-build"
claim: "root-hunter's wasm build passes WASM_MAX_PERF, WASM_ENABLE_LTO, WASM_MALLOC, WASM_MAIN_LOOP_FPS, WASM_INITIAL_MEMORY and WASM_MAXIMUM_MEMORY CMake variables that do not appear in upstream master's option block."
url: "https://github.com/root-hunter/ppsspp-wasm/blob/wasm/Makefile"
anchor: "-DWASM_MAX_PERF=OFF -DWASM_ENABLE_LTO=OFF -DWASM_MALLOC=emmalloc"
receipt: "docs:wasm"
escalate: true
```

```yaml:claim
id: PB-D13
axis: "ppsspp-emscripten-build"
claim: "root-hunter Makefile defaults WASM_INITIAL_MEMORY to 536870912 bytes (512 MiB), WASM_MAXIMUM_MEMORY to 4294967296 bytes (4 GiB), and WASM_MAIN_LOOP_FPS to 60."
url: "https://github.com/root-hunter/ppsspp-wasm/blob/wasm/Makefile"
anchor: "WASM_INITIAL_MEMORY ?= 536870912"
receipt: "docs:wasm"
```

```yaml:claim
id: PB-D14
axis: "ppsspp-emscripten-build"
claim: "root-hunter's audited web core uses SDL, WebGL2, SIMD, shared memory and an existing pthread pool; WASM_THREADED_ADHOC=ON is default."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/docs/multiplayer.md"
anchor: "WebAssembly uses SDL, WebGL2, SIMD, shared memory and an existing pthread pool."
receipt: "commit:0dbfaca62a8a924abc2c5dd5dd0733b668e5e68a"
```

```yaml:claim
id: PB-D15
axis: "ppsspp-emscripten-build"
claim: "root-hunter records Emscripten 6.0.12 rebuilds of FFmpeg and the full Release core with LTO, SIMD and pthreads; it explicitly limits this to build/startup compatibility, not measured gameplay FPS."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/docs/browser-stability.md"
anchor: "This establishes build/startup compatibility, not a measured gameplay FPS improvement."
receipt: "docs:wasm"
```

```yaml:claim
id: PB-D16
axis: "ppsspp-emscripten-build"
claim: "root-hunter's Pages workflow builds the exact pinned deps/ppsspp-wasm revision and rejects publishing a CMake build configured without FFmpeg."
url: "https://github.com/root-hunter/ppsspp-web"
anchor: "publishing a build configured without FFmpeg is rejected."
receipt: "docs:wasm"
```



```yaml:claim
id: PB-D18
axis: "ppsspp-emscripten-build"
claim: "Upstream PPSSPP master requires SDL3 via find_package(SDL3 QUIET) and emits a FATAL_ERROR when absent, unless LIBRETRO, IOS, HEADLESS_CROSS or ANDROID."
url: "https://github.com/hrydgard/ppsspp/blob/master/CMakeLists.txt"
anchor: "SDL3 not found. Install dependencies with: sudo apt install libsdl3-dev libsdl3-ttf-dev"
receipt: "docs:master"
escalate: true
```

```yaml:claim
id: PB-D19
axis: "ppsspp-emscripten-build"
claim: "Upstream PPSSPP master has a HEADLESS_CROSS option whose comment states it skips the desktop SDL frontend entirely and defines HEADLESS_NO_SDL."
url: "https://github.com/hrydgard/ppsspp/blob/master/CMakeLists.txt"
anchor: "skip the desktop SDL frontend entirely."
receipt: "docs:master"
```

```yaml:claim
id: PB-D20
axis: "ppsspp-emscripten-build"
claim: "PPSSPP headless docs state the headless build defaults to JIT despite a force-set INTERPRETER; -i selects interpreter and --cpu=ir selects the IR interpreter because -r is ambiguous."
url: "https://github.com/hrydgard/ppsspp/blob/master/docs/debugging.md"
anchor: "The headless build defaults to JIT"
receipt: "docs:master"
```

```yaml:claim
id: PB-D21
axis: "ppsspp-emscripten-build"
claim: "PPSSPP master documents PPSSPPHeadless built with cmake -DHEADLESS=ON."
url: "https://github.com/hrydgard/ppsspp/blob/master/headless/README.md"
anchor: "cmake -DHEADLESS=ON -B build-headless"
receipt: "docs:master"
```

```yaml:claim
id: PB-D22
axis: "ppsspp-emscripten-build"
claim: "Emscripten 7.0.0 updates libcxx/libcxxabi/libunwind/compiler-rt to LLVM 23.1.3; libc++ 23 drops transitive header includes, with -D_LIBCPP_KEEP_TRANSITIVE_INCLUDES_LLVM23 as a temporary workaround."
url: "https://github.com/emscripten-core/emscripten/releases/tag/7.0.0"
anchor: "libc++ 23 removes many transitive header includes by default"
receipt: "version:7.0.0"
escalate: true
```







```yaml:claim
id: PB-D26
axis: "ppsspp-emscripten-build"
claim: "Emscripten 7.0.x compiler settings reference marks WASM_BIGINT deprecated with default value true, avoiding i64-to-i32-pair legalization at the wasm boundary."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "When enabled we don’t need to legalize i64s into pairs of i32s"
receipt: "docs:7.0.2-git"
```

```yaml:claim
id: PB-D27
axis: "ppsspp-emscripten-build"
claim: "Emscripten pthreads documentation states SharedArrayBuffer is gated behind COOP and COEP headers and pthread code will not work in deployed environments without them."
url: "https://emscripten.org/docs/porting/pthreads.html"
anchor: "are gating it behind Cross Origin Opener Policy (COOP)"
receipt: "docs:7.0.2-git"
```

```yaml:claim
id: PB-D28
axis: "ppsspp-emscripten-build"
claim: "Emscripten cannot build one binary that uses threads when available and falls back to single-threaded; two separate builds are required."
url: "https://emscripten.org/docs/porting/pthreads.html"
anchor: "It is not possible to build one binary that would be able to leverage"
receipt: "docs:7.0.2-git"
escalate: true
```





```yaml:claim
id: PB-D31
axis: "ppsspp-emscripten-build"
claim: "Emscripten MAXIMUM_MEMORY defaults to 2147483648 bytes (2 GB) and only applies with ALLOW_MEMORY_GROWTH or IMPORTED_MEMORY; larger heaps must opt in explicitly."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "Set the maximum size of memory in the wasm module (in bytes). This is only"
receipt: "docs:7.0.2-git"
```

```yaml:claim
id: PB-D32
axis: "ppsspp-emscripten-build"
claim: "Emscripten marks USE_WEBGL2 deprecated and directs -sMAX_WEBGL_VERSION=2; MIN_WEBGL_VERSION and MAX_WEBGL_VERSION both default to 1."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "Deprecated. Pass -sMAX_WEBGL_VERSION=2 to target WebGL 2.0."
receipt: "docs:7.0.2-git"
```









```yaml:claim
id: "PB-R05"
axis: "ppsspp-emscripten-build"
claim: "The ppsspp-web wasm branch pins its deps/ppsspp-wasm submodule at 4d0564bc687b86d2f88e132d79ea118e290b004b."
url: "https://github.com/root-hunter/ppsspp-web/tree/wasm/deps"
anchor: "ppsspp-wasm @ 4d0564b"
receipt: "commit:ea176fd67a0a46c5ff4a1e20fde27cde4268e2a5"
```

```yaml:claim
id: "PB-R06"
axis: "ppsspp-emscripten-build"
claim: "The ppsspp-web CI verifies the checked-out ppsspp-wasm revision equals the git tree submodule entry before configuring the build."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/.github/workflows/wasm-pages.yml"
anchor: "git -C deps/ppsspp-wasm rev-parse HEAD"
receipt: "commit:ea176fd67a0a46c5ff4a1e20fde27cde4268e2a5"
```

```yaml:claim
id: "PB-R07"
axis: "ppsspp-emscripten-build"
claim: "root-hunter/ppsspp-wasm describes itself as an unofficial community fork of hrydgard/ppsspp that retains the original GPL 2.0-or-later license terms."
url: "https://github.com/root-hunter/ppsspp-wasm/blob/wasm/README.md"
anchor: "This is a community fork, not an official PPSSPP release."
receipt: "commit:4d0564bc687b86d2f88e132d79ea118e290b004b"
```























```yaml:claim
id: "PB-R19"
axis: "ppsspp-emscripten-build"
claim: "ppsspp-web keeps LTO disabled by default in the web Makefile and core release configuration after a reported game-launch page freeze whose root cause was not isolated."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/docs/browser-stability.md"
anchor: "is the current default in the web Makefile and core release configuration;"
receipt: "commit:ea176fd67a0a46c5ff4a1e20fde27cde4268e2a5"
escalate: true
```

```yaml:claim
id: "PB-R20"
axis: "ppsspp-emscripten-build"
claim: "The ppsspp-web CI freeze investigation records that build metadata does not record compiler flags or source commits."
url: "https://github.com/root-hunter/ppsspp-web/blob/wasm/docs/ci-game-launch-investigation.md"
anchor: "Build metadata does not record compiler flags or source commits, so policy and"
receipt: "commit:ea176fd67a0a46c5ff4a1e20fde27cde4268e2a5"
escalate: true
```



```yaml:claim
id: "PB-R22"
axis: "ppsspp-emscripten-build"
claim: "Upstream PPSSPP's libretro Makefile.common gates native dynarec sources behind WITH_DYNAREC and has no Emscripten platform branch."
url: "https://github.com/hrydgard/ppsspp/blob/master/libretro/Makefile.common"
anchor: "ifeq ($(WITH_DYNAREC),1)"
receipt: "commit:fda355e53abf22989f43b8d6a159048e5cc23f11"
```

```yaml:claim
id: "PB-R23"
axis: "ppsspp-emscripten-build"
claim: "root-hunter/ppsspp-wasm has an open pull request titled Added FFmpeg support for ppsspp-wasm."
url: "https://github.com/root-hunter/ppsspp-wasm/pull/1"
anchor: "Added FFmpeg support for ppsspp-wasm"
receipt: "issue:#1"
```
```
