# Dossier: wasm-memory-topology

Evidence lane: docs. Raw technical claims only (no verdicts).

```yaml:claim
id: WM-D01
axis: "wasm-memory-topology"
claim: "IMPORTED_MEMORY defines the WebAssembly.Memory object outside the wasm module; -pthread, RELOCATABLE, ASYNCIFY_LAZY_LOAD_CODE and WASM2JS auto-enable it."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "Set to 1 to define the WebAssembly.Memory object outside of the wasm module."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: WM-D02
axis: "wasm-memory-topology"
claim: "SHARED_MEMORY is the Emscripten link setting that targets a shared Wasm Memory."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "If 1, target compiling a shared Wasm Memory."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: WM-D03
axis: "wasm-memory-topology"
claim: "One memory instance can be used by 0–N module instances, sharing one address space, which is what makes dynamic linking / multi-module pointer validity possible."
url: "https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API"
anchor: "these instances all share the same address space, allowing dynamic linking"
receipt: "docs:mdn-using-wasm-js-api"
```



```yaml:claim
id: WM-D05
axis: "wasm-memory-topology"
claim: "A --shared-memory link rejects object files not compiled with atomics or bulk-memory, so every object in a shared-memory build must be built with those features."
url: "https://github.com/emscripten-core/emscripten/issues/19410"
anchor: "it was not compiled with 'atomics' or 'bulk-memory' features"
receipt: "issue:#19410"
escalate: true
```

```yaml:claim
id: WM-D06
axis: "wasm-memory-topology"
claim: "With IMPORTED_MEMORY and no growth, MAXIMUM_MEMORY lets the module accept an imported memory of any size up to the maximum while never growing it; the memory must not be grown externally."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "the module accepts an imported memory of any size up to this maximum, but never grows it"
receipt: "version:7.0.2-git"
```

```yaml:claim
id: WM-D07
axis: "wasm-memory-topology"
claim: "Combining -pthread with ALLOW_MEMORY_GROWTH emits a specific linker warning identifying slow non-wasm code as the penalty."
url: "https://github.com/emscripten-core/emscripten/issues/27084"
anchor: "-pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly"
receipt: "issue:#27084"
escalate: true
```

```yaml:claim
id: WM-D08
axis: "wasm-memory-topology"
claim: "Pthreads plus ALLOW_MEMORY_GROWTH makes JS access to Wasm memory slow and forces HEAP view refresh; external Module.HEAP* consumers can see views smaller than memory."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/porting/pthreads.rst"
anchor: "external code that uses Module.HEAP* directly may encounter problems with views being smaller than memory"
receipt: "docs:6.0.14-git"
escalate: true
```

```yaml:claim
id: WM-D09
axis: "wasm-memory-topology"
claim: "GROWABLE_ARRAYBUFFERS is documented as the only way to completely remove the overhead of growable memory plus pthreads, and was unusable on Firefox until Firefox 154 (Mozilla bug 2021136)."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "This is the only way to completely remove the overhead of growable memory + pthreads."
receipt: "version:7.0.2-git"
escalate: true
```



```yaml:claim
id: WM-D11
axis: "wasm-memory-topology"
claim: "Emscripten issue #27859 records that MAXIMUM_MEMORY is dropped without ALLOW_MEMORY_GROWTH, that growth has costs and engine bugs on shared memory (-Wpthreads-mem-growth, WebKit #25905), and that the suggested workaround is disabling growth and choosing INITIAL_MEMORY at link time."
url: "https://github.com/emscripten-core/emscripten/issues/27859"
anchor: "the suggested workaround is to disable growth and pick INITIAL_MEMORY at link time"
receipt: "issue:#27859"
escalate: true
```



```yaml:claim
id: WM-D13
axis: "wasm-memory-topology"
claim: "When a Wasm Memory grows, existing views in other threads retain their unresized lengths while same-thread views become zero-length, a behavior Emscripten issue #12783 tracks as wontfix."
url: "https://github.com/emscripten-core/emscripten/issues/12783"
anchor: "all the existing views to the Memory in other threads preserve their unresized lengths"
receipt: "issue:#12783"
```

```yaml:claim
id: WM-D14
axis: "wasm-memory-topology"
claim: "The multi-memory proposal states that with one memory per module, transferring data between memories necessarily involves an individual function call into a different module per value."
url: "https://github.com/WebAssembly/multi-memory/blob/main/proposals/multi-memory/Overview.md"
anchor: "since that necessarily involves an individual function call into a different module per value"
receipt: "docs:multi-memory-proposal"
```

```yaml:claim
id: WM-D15
axis: "wasm-memory-topology"
claim: "Engines commonly reserve one register for a memory base address; multiple memories typically require an extra indirection."
url: "https://github.com/WebAssembly/multi-memory/blob/main/proposals/multi-memory/Overview.md"
anchor: "Multiple memories will typically require an extra indirection"
receipt: "docs:multi-memory-proposal"
```

```yaml:claim
id: WM-D16
axis: "wasm-memory-topology"
claim: "The multi-memory proposal notes that 32-bit Wasm memories cap efficient scaling at 4 GB; Wasm 3.0 added multiple memories and i64 address types, with web 64-bit memories limited to 16 GB."
url: "https://webassembly.org/news/2025-09-17-wasm-3.0"
anchor: "on the web, a 64-bit memory is limited to 16 gigabytes"
receipt: "version:3.0"
```

```yaml:claim
id: WM-D17
axis: "wasm-memory-topology"
claim: "Multiple memories were shipped in Firefox 120 and Chrome 125; WebKit bug 277743 was RESOLVED FIXED but Safari was described in 2025 as the only major Stage 5 browser blemish."
url: "https://bugs.webkit.org/show_bug.cgi?id=277743"
anchor: "The proposal has been shipped in Firefox 120 (21/11/2023) and Chrome 125 (11/05/2024)"
receipt: "issue:#277743"
```

```yaml:claim
id: WM-D18
axis: "wasm-memory-topology"
claim: "The WebAssembly memory-control proposal says most languages assume a single address space and are not easily able to distinguish which memory a pointer refers to, which is why it scoped the design to one linear memory."
url: "https://github.com/WebAssembly/memory-control/blob/main/proposals/memory-control/Overview.md"
anchor: "Most languages are therefore not easily able to distinguish which memory a poitner should refer to."
receipt: "docs:memory-control-overview"
```

```yaml:claim
id: WM-D19
axis: "wasm-memory-topology"
claim: "Wasm 3.0 allows one module to declare or import multiple memories and copy directly between them, removing the earlier need to split into separate modules."
url: "https://webassembly.org/news/2025-09-17-wasm-3.0"
anchor: "a single module can now declare (define or import) multiple memories and directly access them, including directly copying data between them."
receipt: "version:3.0"
```



```yaml:claim
id: WM-D21
axis: "wasm-memory-topology"
claim: "Adjacent emulator v86 exposes serial byte transfer as a bus message (serial_send_bytes loops over bytes and calls this.bus.send), i.e. an explicit copy-style boundary rather than zero-copy shared buffers."
url: "https://github.com/copy/v86/blob/master/v86.d.ts"
anchor: "The memory size in bytes, should be a power of 2."
receipt: "docs:master"
```

```yaml:claim
id: WM-D22
axis: "wasm-memory-topology"
claim: "PPSSPP upstream is GPL 2.0-or-later, and its LICENSE explicitly defines derivative works and states GPL v2 does not permit incorporating the program into proprietary programs."
url: "https://www.ppsspp.org/"
anchor: "PPSSPP is an open source project, licensed under the GPL 2.0 (or later)."
receipt: "version:1.20.4"
escalate: true
```

```yaml:claim
id: WM-D23
axis: "wasm-memory-topology"
claim: "Emscripten guidance says Wasm needs one contiguous linear heap block and can fail when process address space is fragmented even if RAM is free, recommending allocating WebAssembly.Memory up front."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/compiling/Deploying-Pages.rst"
anchor: "the address space of the process is too fragmented, and there is not enough linear address space available"
receipt: "docs:emscripten-deploying-pages"
escalate: true
```













```yaml:claim
id: "WM-R08"
axis: "wasm-memory-topology"
claim: "Emscripten's IMPORTED_MEMORY setting defines WebAssembly.Memory outside the wasm module; -pthread, RELOCATABLE, ASYNCIFY_LAZY_LOAD_CODE and WASM2JS auto-enable it."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "Set to 1 to define the WebAssembly.Memory object outside of the wasm module."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: "WM-R09"
axis: "wasm-memory-topology"
claim: "Emscripten 7.0.0 link.py emits warning category pthreads-mem-growth when ALLOW_MEMORY_GROWTH is combined with -pthread unless GROWABLE_ARRAYBUFFERS=2, which the repo's Makefile does not set."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/tools/link.py"
anchor: "'-pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly, consider -sGROWABLE_ARRAYBUFFERS=2'"
receipt: "version:7.0.0"
ecosystem: "emsdk"
name: "emscripten"
version: "7.0.0"
escalate: true
```

```yaml:claim
id: "WM-R10"
axis: "wasm-memory-topology"
claim: "Emscripten docs state GROWABLE_ARRAYBUFFERS=2 unconditionally requires resizable views and is the only way to completely remove growable-memory + pthreads overhead; the feature was not usable on Firefox until Firefox 154."
url: "https://emscripten.org/docs/tools_reference/settings_reference.html"
anchor: "Setting this to 2 will unconditionally require it. This is the only way"
receipt: "version:7.0.2-git"
```

```yaml:claim
id: "WM-R11"
axis: "wasm-memory-topology"
claim: "Emscripten issue #27859 reports V8 Liftoff atomic access to shared memory grown by another thread can trap with 'memory access out of bounds' (V8 bugs 529880019 / 533026477), fixed on V8 main for Chrome 157 but in no Node release line; a pthreads growth build trapped in 5 of 5 grow-and-read runs, and the suggested workaround is fixed memory chosen at link time."
url: "https://github.com/emscripten-core/emscripten/issues/27859"
anchor: "A pthreads build with ALLOW_MEMORY_GROWTH trapped 5 out of 5 times under Node in a small grow-and-read stress test"
receipt: "issue:#27859"
escalate: true
```

```yaml:claim
id: "WM-R12"
axis: "wasm-memory-topology"
claim: "Commit 994494bf2cbc7a855be65310ddbc290138bb87f5 keeps a user-set MAXIMUM_MEMORY with IMPORTED_MEMORY even without growth by passing --max-memory to wasm-ld; the module never grows and emscripten_resize_heap() still fails."
url: "https://github.com/emscripten-core/emscripten/commit/994494bf2cbc7a855be65310ddbc290138bb87f5"
anchor: "Without growth, an imported memory can still be any size up to a"
receipt: "commit:994494bf2cbc7a855be65310ddbc290138bb87f5"
escalate: true
```

```yaml:claim
id: "WM-R13"
axis: "wasm-memory-topology"
claim: "Wasm design issue #1271 records a benchmark where -pthread + ALLOW_MEMORY_GROWTH ran a JS-heavy AsciiToString loop in 1328 ms versus 293 ms without growth, with the -Wpthreads-mem-growth warning emitted by emcc."
url: "https://github.com/WebAssembly/design/issues/1271"
anchor: "warning: USE_PTHREADS + ALLOW_MEMORY_GROWTH may run non-wasm code slowly"
receipt: "issue:#1271"
```

```yaml:claim
id: "WM-R14"
axis: "wasm-memory-topology"
claim: "The WebAssembly multi-memory proposal states that without multiple memories in one module, transferring data between memories necessarily involves an individual function call into a different module per value, which blocks static linking of modules that each define a memory."
url: "https://raw.githubusercontent.com/WebAssembly/multi-memory/main/proposals/multi-memory/Overview.md"
anchor: "efficiently transfer data from one memory to another"
receipt: "docs:multi-memory-Overview"
escalate: true
```

```yaml:claim
id: "WM-R15"
axis: "wasm-memory-topology"
claim: "The multi-memory proposal explicitly frames multiple memories as a workaround for the 32-bit wasm32 address-space ceiling until memory64 ships."
url: "https://raw.githubusercontent.com/WebAssembly/multi-memory/main/proposals/multi-memory/Overview.md"
anchor: "As long as Wasm memories are limited to 32 bit address space, there is no way to scale out of 4 GB memory efficiently"
receipt: "docs:multi-memory-Overview"
```

```yaml:claim
id: "WM-R16"
axis: "wasm-memory-topology"
claim: "V8's 4 GB wasm post documents the pointer rebase cost: when flags allow 2 GB+ addresses Emscripten rewrites all HEAP32[(ptr+offset)>>2] accesses to unsigned >>>, a compile-time code-size and correctness change for manual signed pointer comparisons."
url: "https://v8.dev/blog/4gb-wasm-memory"
anchor: "the compiler will automatically rewrite all memory accesses to use >>> instead of >>"
receipt: "docs:v8-4gb-wasm-memory"
```

```yaml:claim
id: "WM-R17"
axis: "wasm-memory-topology"
claim: "RetroArch's Emscripten frontend statically links the core archive libretro_emscripten.a together with RARCH_OBJ into one output; with HAVE_THREADS=1 it adds -pthread -s SHARED_MEMORY to CFLAGS and -pthread -s PTHREAD_POOL_SIZE to LDFLAGS, alongside ALLOW_MEMORY_GROWTH=1 and WASMFS/OPFS."
url: "https://raw.githubusercontent.com/libretro/RetroArch/master/Makefile.emscripten"
anchor: "$(LD) -o $@ $(RARCH_OBJ) $(libretro_new) $(LIBS) $(LDFLAGS)"
receipt: "docs:RetroArch-Makefile.emscripten"
```

```yaml:claim
id: "WM-R18"
axis: "wasm-memory-topology"
claim: "v86's JIT does not link wasm modules: it exits the current module and the main loop detects when a new one can be entered, so generated code cannot address another module's linear memory directly."
url: "https://raw.githubusercontent.com/copy/v86/master/docs/how-it-works.md"
anchor: "At the moment, there is no linking of wasm modules. The current module is exited"
receipt: "docs:v86-how-it-works"
```

```yaml:claim
id: "WM-R19"
axis: "wasm-memory-topology"
claim: "v86's browser host pre-computes a wasm maximum capped at 65536 pages to reserve virtual address space up front so memory.grow() avoids realloc+copy; its growMemory() stops the VM, resizes linear memory, clears the TLB and resumes."
url: "https://raw.githubusercontent.com/aperturerobotics/v86/master/src/browser/starter.ts"
anchor: "Reserve VA upfront so memory.grow() is fast (no realloc+copy)."
receipt: "docs:v86-browser-starter"
```

```yaml:claim
id: "WM-R20"
axis: "wasm-memory-topology"
claim: "The PCSX2 browser port plan recommends fixed INITIAL_MEMORY = MAXIMUM_MEMORY = 1 GB (keep <= 2 GB) instead of its branch's 512 MB -> 2 GB growth, because with pthreads growth makes JS heap views slow."
url: "https://raw.githubusercontent.com/TabStationToo/TabStationToo/wasm/docs/web-port/PLAN.md"
anchor: "With pthreads, growth makes JS heap views slow (Emscripten warns about this in `build-wasm/headless.log`)."
receipt: "docs:pcsx2-web-port-PLAN"
```

```yaml:claim
id: "WM-R21"
axis: "wasm-memory-topology"
claim: "The same PCSX2 plan routes disc I/O through a separate worker reading user File objects, noting WORKERFS does not work with PROXY_TO_PTHREAD and that disc requests cross to the CDVD pthread via a SAB queue."
url: "https://raw.githubusercontent.com/TabStationToo/TabStationToo/wasm/docs/web-port/PLAN.md"
anchor: "A disc-I/O worker reads user `File`s."
receipt: "docs:pcsx2-web-port-PLAN"
```

```yaml:claim
id: "WM-R22"
axis: "wasm-memory-topology"
claim: "The wasm-dolphin deployment runs multi-threaded on one shared memory with a fixed 1.5 GiB heap, requires cross-origin isolation, and pins the GPL-2.0-or-later upstream at commit 50f0c362 with a rebuilt core."
url: "https://www.playagain.app/cores/dolphin/README.md"
anchor: "It is **multi-threaded** with one shared memory (a fixed 1.5 GiB heap), so"
receipt: "docs:cores-dolphin-README"
escalate: true
```

```yaml:claim
id: "WM-R23"
axis: "wasm-memory-topology"
claim: "PCem's wasm port places audio rings in static memory inside the pthreads SharedArrayBuffer heap so the AudioWorkletProcessor reads them zero-copy with no steady-state postMessage."
url: "https://raw.githubusercontent.com/va3jfl/PCem-WebAssembly/main/PORTING_NOTES.md"
anchor: "zero-copy, no postMessage in the steady state."
receipt: "docs:PCem-PORTING_NOTES"
```

```yaml:claim
id: "WM-R24"
axis: "wasm-memory-topology"
claim: "The same PCem port records that ImageData cannot wrap a SharedArrayBuffer, so the framebuffer is copied row-by-row out of the heap each presented frame (~1-2 MB per frame): a single shared-memory module does not eliminate browser-API bounce copies."
url: "https://raw.githubusercontent.com/va3jfl/PCem-WebAssembly/main/PORTING_NOTES.md"
anchor: "`ImageData` cannot wrap a `SharedArrayBuffer`"
receipt: "docs:PCem-PORTING_NOTES"
```

```yaml:claim
id: "WM-R25"
axis: "wasm-memory-topology"
claim: "Upstream PPSSPP exposes the disc seam as ReadBlock(int blockNumber, u8 *outPtr, bool uncached) with a forced 2048-byte block size; the header is GPLv2-or-later, so compiling VFS glue into the same wasm module couples the glue to GPL source rather than only to a C ABI."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/master/Core/FileSystems/BlockDevices.h"
anchor: "virtual bool ReadBlock(int blockNumber, u8 *outPtr, bool uncached = false) = 0;"
receipt: "docs:BlockDevices.h"
escalate: true
```





```yaml:claim
id: WM-P03
axis: "wasm-memory-topology"
claim: "arXiv 2509.09439 (μFork) implements POSIX fork in a single-address-space OS by copying the parent μprocess' memory to a different location within the same address space; the two stated challenges are relocating the child's absolute memory references (pointers) and providing user/kernel and μprocess isolation without impacting lightweightness, solved with CHERI hardware memory tagging and tightly bounded hardware memory capabilities. Earlier SASOSes avoided relocations with segment-relative addressing, poorly supported by modern toolchains and ISAs."
url: "https://arxiv.org/abs/2509.09439"
anchor: "relocating the child's absolute memory references (pointers)"
receipt: "arxiv:2509.09439"
package:
  ecosystem: "arxiv"
  name: "2509.09439"
escalate: true
```



```yaml:claim
id: WM-P05
axis: "wasm-memory-topology"
claim: "arXiv 2001.07450 (Occlum) implements LibOS processes as SFI-Isolated Processes (SIPs) that safely share the single address space of an Intel SGX enclave, using a novel MPX-based Multi-Domain SFI (MMDSFI) scheme plus an independent verifier for the security guarantees; reported speedups over state-of-the-art SGX LibOS are up to 6,600X on multitasking micro-benchmarks and up to 500X on application benchmarks."
url: "https://arxiv.org/abs/2001.07450"
anchor: "With SIPs safely sharing the single address space of an enclave, the LibOS can implement multitasking efficiently"
receipt: "arxiv:2001.07450"
package:
  ecosystem: "arxiv"
  name: "2001.07450"
```

```yaml:claim
id: WM-P06
axis: "wasm-memory-topology"
claim: "arXiv 2401.08287 (RichWasm) targets safe shared-memory interoperability across languages with different type systems by incorporating fine-grained memory ownership and sharing type features; compilers are given from core ML and L3 (strong updates, manually managed memory), the language is formalized in Coq with type safety proven, and RichWasm is compiled to regular Wasm for existing environments."
url: "https://arxiv.org/abs/2401.08287"
anchor: "incorporating a variety of type features that support fine-grained memory ownership and sharing"
receipt: "arxiv:2401.08287"
package:
  ecosystem: "arxiv"
  name: "2401.08287"
```

```yaml:claim
id: WM-P07
axis: "wasm-memory-topology"
claim: "arXiv 1810.00556 (TZC) uses partial serialization to split each message into a small serialized control part sent over a socket and a much larger data part placed in shared memory; the shared-memory part is never copied or serialized during its lifetime, so IPC overhead stays constant as message size grows. At 4MB, overhead drops from tens of milliseconds to hundreds of microseconds for ROS and from hundreds of milliseconds to under 1 millisecond for ROS2; socket IPC latency otherwise grew nearly linearly with message size."
url: "https://arxiv.org/abs/1810.00556"
anchor: "The part within shared memory is never copied or serialized during its lifetime"
receipt: "arxiv:1810.00556"
package:
  ecosystem: "arxiv"
  name: "1810.00556"
```







```yaml:claim
id: WM-P11
axis: "wasm-memory-topology"
claim: "ipc_shared_ptr specializes Birrell's reference listing using three pub/sub structural properties: the reference-holder set is derivable from topic membership, references flow unidirectionally publishers to subscribers, and messages are independent deallocation units. Global metadata updates are limited to per-subscriber 0-to-1 transitions of each subscriber's local count, with in-process copies triggering no global updates, giving an order-of-magnitude reduction in global communication over general-purpose distributed reference counting. Owner-driven reclaim offers more scalability but races between membership changes and reclamation; single-writer gives structural atomicity at the cost of a centralized bottleneck."
url: "https://arxiv.org/abs/2605.04226"
anchor: "limiting global metadata updates to per-subscriber 0<->1 transitions"
receipt: "arxiv:2605.04226"
package:
  ecosystem: "arxiv"
  name: "2605.04226"
```

```yaml:claim
id: WM-P12
axis: "wasm-memory-topology"
claim: "Comparative evaluation at Autoware scale (single-host multi-process target; network-distributed environments explicitly out of scope) reports that at 200 topics, two subscribers per topic and 100 Hz, Agnocast's end-to-end p99.9 is 2.9x lower than iceoryx2's, used to argue single-writer metadata management is sufficient over owner-driven reclaim. Autoware v1.7.1 baseline has 223 nodes and 227 topics with median 1 subscriber per topic; true zero-copy is claimed to avoid temporary memory allocations and improve timing predictability."
url: "https://arxiv.org/abs/2605.04226"
anchor: "at 200 topics, two subscribers per topic and 100 Hz, Agnocast's E2E p99.9 is 2.9x lower than iceoryx2's"
receipt: "arxiv:2605.04226"
package:
  ecosystem: "arxiv"
  name: "2605.04226"
```



```yaml:claim
id: WM-P14
axis: "wasm-memory-topology"
claim: "Walma reports boundary attestation cost of 1.07x to 1.69x on 53 WABench binaries, scaling with a module's exposure to the host rather than with its runtime; a VGG-16 detector reaches 95%--100% verdict accuracy on four of five CVE-affected applications with no false alarms, and a 1.9M-parameter ResNet runs inside the runtime on every host call. Stated scope limits: a single flipped flag, length field or byte falls below the detection floor, black-box evasion needs contiguous overwrites of hundreds of kilobytes to megabytes, and in cloud settings the verifier must receive snapshots intact."
url: "https://arxiv.org/abs/2603.24167"
anchor: "scaling with a module's exposure to the host rather than with its runtime"
receipt: "arxiv:2603.24167"
package:
  ecosystem: "arxiv"
  name: "2603.24167"
escalate: true
```

```yaml:claim
id: WM-P15
axis: "wasm-memory-topology"
claim: "arXiv 2003.00572 (RLBox) enables efficient sandboxing of untrusted C/C++ libraries via static information flow enforcement and lightweight dynamic checks expressed directly in the C++ type system, supporting either software-based fault isolation or multi-core process isolation; reported performance overheads are modest and transient with minor page-latency impact, and the Wasm sandbox path is in production Firefox for the libGraphite font shaping library. Sandboxed libraries include libjpeg, libpng, libtheora, libvpx, libvorbis and zlib."
url: "https://arxiv.org/abs/2003.00572"
anchor: "RLBox employs static information flow enforcement, and lightweight dynamic checks"
receipt: "arxiv:2003.00572"
package:
  ecosystem: "arxiv"
  name: "2003.00572"
```
```
