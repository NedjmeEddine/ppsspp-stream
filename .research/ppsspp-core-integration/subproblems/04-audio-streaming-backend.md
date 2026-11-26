# Dossier: audio-streaming-backend

Evidence lane: docs. Raw technical claims only (no verdicts).

```yaml:claim
id: AS-D01
axis: "audio-streaming-backend"
claim: "Emscripten Wasm Audio Worklets is an Emscripten-specific integration of Web Audio AudioWorklet nodes to WebAssembly; the audio callback runs on a dedicated real-time-priority audio processing thread."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "The Emscripten Wasm Audio Worklets API is an Emscripten-specific integration of these AudioWorklet nodes to WebAssembly."
receipt: "docs:wasm-audio-worklets"
```

```yaml:claim
id: AS-D02
axis: "audio-streaming-backend"
claim: "The Emscripten Wasm Audio Worklets runtime is documented to generate no temporary JavaScript-level VM garbage, eliminating GC pauses as a source of audio synthesis stalls."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "no temporary JavaScript level VM garbage will be generated, eliminating the possibility of GC pauses"
receipt: "docs:wasm-audio-worklets"
```

```yaml:claim
id: AS-D03
axis: "audio-streaming-backend"
claim: "Only one audio processing thread exists per AudioContext; all AudioWorkletNode instances share that thread, and audio worklets always run in a Wasm Worker, not a Pthread."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "Each Web Audio context will utilize only a single audio processing thread."
receipt: "docs:wasm-audio-worklets"
escalate: true
```

```yaml:claim
id: AS-D04
axis: "audio-streaming-backend"
claim: "Emscripten Wasm Audio Worklet node processing is pull-mode callback based; the audio callback must be non-blocking and general-purpose real-time prioritized threads are not available."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "The audio callback code should execute as quickly as possible and be non-blocking."
receipt: "docs:wasm-audio-worklets"
escalate: true
```

```yaml:claim
id: AS-D05
axis: "audio-streaming-backend"
claim: "Targeting Emscripten AudioWorklets requires linking with the flags -sAUDIO_WORKLET -sWASM_WORKERS."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "-sAUDIO_WORKLET -sWASM_WORKERS"
receipt: "docs:wasm-audio-worklets"
```



```yaml:claim
id: AS-D07
axis: "audio-streaming-backend"
claim: "Emscripten WASM_WORKERS defaults to 0 and builds on Wasm SharedArrayBuffer plus the Atomics API, so enabling AudioWorklets transitively requires shared memory."
url: https://emscripten.org/docs/tools_reference/settings_reference.html
anchor: "builds on top of Wasm SharedArrayBuffer + Atomics API."
receipt: "docs:settings-reference-WASM_WORKERS"
escalate: true
```

```yaml:claim
id: AS-D08
axis: "audio-streaming-backend"
claim: "Emscripten documents that using an AudioContext created outside Wasm without shared memory or WASM_WORKERS requires adding 'worklet' to ENVIRONMENT and supplying the Wasm via -sSINGLE_FILE or a custom instantiateWasm, because Audio Worklets have no fetch API."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "because Audio Worklets do not have any kind of fetch API"
receipt: "docs:wasm-audio-worklets"
escalate: true
```

```yaml:claim
id: AS-D09
axis: "audio-streaming-backend"
claim: "Emscripten documents three ways to synchronize the audio worklet thread with other threads: AudioParams, GCC/Clang lock-free atomics or Wasm Worker synchronization primitives, and the emscripten_audio_worklet_post_function_* family."
url: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
anchor: "Data can be shared with the Audio Worklet thread using GCC/Clang lock-free atomics operations"
receipt: "docs:wasm-audio-worklets"
```

```yaml:claim
id: AS-D10
axis: "audio-streaming-backend"
claim: "ringbuf.js v0.4.0 provides a thread-safe, wait-free, single-consumer single-producer ring buffer for the web built on SharedArrayBuffer, with an AudioWriter/AudioReader wrapper for streaming PCM without postMessage."
url: https://github.com/padenot/ringbuf.js
anchor: "A thread-safe wait-free single-consumer single-producer ring buffer for the web"
receipt: "commit:4849bbed64e7cff0a245fac1b93524e8dbebb9cc"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```

```yaml:claim
id: AS-D11
axis: "audio-streaming-backend"
claim: "ringbuf.js RingBuffer stores read/write pointers as Uint32Array views on a SharedArrayBuffer and reserves one empty slot to distinguish full from empty; capacity() returns _capacity - 1."
url: https://github.com/padenot/ringbuf.js/blob/master/js/ringbuf.js
anchor: "capacity counts the empty slot to distinguish between full and empty."
receipt: "commit:4849bbed64e7cff0a245fac1b93524e8dbebb9cc"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```



```yaml:claim
id: AS-D13
axis: "audio-streaming-backend"
claim: "ringbuf.js audioqueue.js AudioWriter/AudioReader are documented as wait-free across a non-real-time thread and an AudioWorkletProcessor real-time thread, with GC possible only during initial construction and not after setup."
url: https://github.com/padenot/ringbuf.js/blob/master/js/audioqueue.js
anchor: "After the setup phase no GC is triggered on either side of the queue."
receipt: "commit:4849bbed64e7cff0a245fac1b93524e8dbebb9cc"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```

```yaml:claim
id: AS-D14
axis: "audio-streaming-backend"
claim: "ringbuf.js SharedArrayBuffer use requires the server to send Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp; upstream lists Firefox Desktop and Chrome Desktop as compatible."
url: https://github.com/padenot/ringbuf.js
anchor: "Cross-Origin-Opener-Policy: same-origin"
receipt: "commit:4849bbed64e7cff0a245fac1b93524e8dbebb9cc"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
escalate: true
```

```yaml:claim
id: AS-D15
axis: "audio-streaming-backend"
claim: "MDN states that shared memory requires a secure context and cross-origin isolation; the global SharedArrayBuffer constructor is hidden unless the two COOP/COEP headers are set."
url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
anchor: "the constructor on the global object is hidden, unless the two headers mentioned above are set"
receipt: "docs:MDN-SharedArrayBuffer-2026-10-28"
escalate: true
```

```yaml:claim
id: AS-D16
axis: "audio-streaming-backend"
claim: "MDN documents AudioContext.close() as releasing system audio resources, suspending audio time progression and stopping audio processing, returning a Promise that resolves when creation-blocking resources are released."
url: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close
anchor: "it will forcibly release any system audio resources that might prevent additional"
receipt: "docs:MDN-AudioContext-close-2024-10-08"
```

```yaml:claim
id: AS-D17
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 defines the 'closed' AudioContextState as fully released: no further audio processing and all system audio resources released."
url: https://webaudio.github.io/web-audio-api/
anchor: "This context has been released, and can no longer be used to process audio. All system audio resources have been released."
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D18
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 defines underrun as a load value greater than 1.0, i.e. the system could not render audio fast enough for real-time, and notes that a render quantum that is not a divisor of the system callback buffer increases latency and reduces the load ceiling before underrun."
url: https://webaudio.github.io/web-audio-api/
anchor: "the system could not render audio fast enough for real-time."
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D19
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 lists internal buffering in an AudioWorkletNode script as a source of added signal-path delay."
url: https://webaudio.github.io/web-audio-api/
anchor: "can run a script that buffers internally, adding delay to the signal path."
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D20
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 classifies audio glitches as a catastrophic failure that MUST be avoided, caused by scheduling latencies of audio delivery threads or DSP doing more work than is real-time feasible."
url: https://webaudio.github.io/web-audio-api/
anchor: "Audio glitches are caused by an interruption of the normal continuous audio stream, resulting in loud clicks and pops."
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D21
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 requires implementations to support sample rates from 3000 Hz to 768000 Hz inclusive, covering 44.1 kHz and 48 kHz stereo PCM contexts."
url: https://webaudio.github.io/web-audio-api/
anchor: "Implementations MUST support sample rates between 3000 Hz and 768000 Hz, inclusive."
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D22
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 assumes every AudioNode in a context runs at the context sampleRate and states that sample-rate converters or varispeed processors are not supported in real-time processing, so source-rate conversion must happen before the worklet."
url: https://webaudio.github.io/web-audio-api/
anchor: "sample-rate converters or \"varispeed\" processors are not supported in real-time processing"
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
escalate: true
```

```yaml:claim
id: AS-D23
axis: "audio-streaming-backend"
claim: "MDN states the deprecated ScriptProcessorNode ran on the main thread and blocked everything else until execution completed, motivating off-main-thread AudioWorklet processing."
url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
anchor: "was that it ran on the main thread, thus blocking everything else going on"
receipt: "docs:MDN-Using-AudioWorklet-2026-01-06"
```

```yaml:claim
id: AS-D24
axis: "audio-streaming-backend"
claim: "Web Audio API 1.1 sets the default render quantum to 128 frames and allows renderSizeHint configuration; Emscripten notes samplesPerChannel is always 128 in Web Audio 1.0 while the 1.1 API accepts renderSizeHint."
url: https://webaudio.github.io/web-audio-api/
anchor: "Its default value is 128, and it can be configured by setting"
receipt: "docs:WebAudio-1.1-ED-2026-11-17"
```

```yaml:claim
id: AS-D25
axis: "audio-streaming-backend"
claim: "MDN documents a cross-browser divergence in AudioWorkletProcessor lifetime policy: Chrome keeps the node alive when process() returns true and shuts it down on false, which the doc notes does not match the standard."
url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
anchor: "Chrome does not implement this algorithm in a manner that matches the current standard"
receipt: "docs:MDN-Using-AudioWorklet-2026-01-06"
```





```yaml:claim
id: AS-D28
axis: "audio-streaming-backend"
claim: "ringbuf.js AudioReader.dequeue() returns 0 samples when the ring buffer is empty and otherwise pops up to buf.length interleaved samples, giving a defined silence/underrun path on the real-time consumer side."
url: https://github.com/padenot/ringbuf.js/blob/master/js/audioqueue.js
anchor: "Receive interleaved audio frames to another thread, wait-free."
receipt: "commit:4849bbed64e7cff0a245fac1b93524e8dbebb9cc"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```

```yaml:claim
id: "AS-R01"
axis: "audio-streaming-backend"
claim: "ringbuf.js npm package is version 0.4.0, MPL-2.0 licensed, described as a wait-free thread-safe SPSC ring buffer using SharedArrayBuffer."
url: "https://github.com/padenot/ringbuf.js/blob/main/README.md"
anchor: "A thread-safe wait-free single-consumer single-producer ring buffer for the web,"
receipt: "version:0.4.0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```





```yaml:claim
id: "AS-R04"
axis: "audio-streaming-backend"
claim: "ringbuf.js writeCallback() is documented as allocating wrapper objects and therefore not to be used from a real-time thread such as an AudioWorkletProcessor process() method."
url: "https://github.com/padenot/ringbuf.js/blob/main/src/ringbuf.ts"
anchor: "objects and can GC, so it's best to no use this variant from a real-time"
receipt: "commit:38776a68d04c447d5cd6c3e682656d9b4dcfe1c0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```

```yaml:claim
id: "AS-R05"
axis: "audio-streaming-backend"
claim: "ringbuf.js AudioWriter/AudioReader wrap the SPSC ring buffer for interleaved PCM transfer between a non-real-time thread and an AudioWorkletProcessor, require Float32Array, and are documented wait-free with no GC after setup."
url: "https://github.com/padenot/ringbuf.js/blob/main/src/audioqueue.ts"
anchor: "Send interleaved audio frames to another thread, wait-free."
receipt: "commit:38776a68d04c447d5cd6c3e682656d9b4dcfe1c0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```



```yaml:claim
id: "AS-R07"
axis: "audio-streaming-backend"
claim: "The ringbuf.js main-thread-to-audioworklet example sizes the SAB ring buffer to sampleRate/20 (50 ms of buffering) and comments that it should be increased in case of glitches; the producer fills only while available_write() > 128."
url: "https://github.com/padenot/ringbuf.js/blob/main/public/example/main-thread-to-audioworklet/app.js"
anchor: "// 50ms of buffer, increase in case of glitches"
receipt: "version:0.4.0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```



```yaml:claim
id: "AS-R09"
axis: "audio-streaming-backend"
claim: "ringbuf.js requires SharedArrayBuffer and documents the COOP same-origin / COEP require-corp headers; it lists Firefox Desktop (incl. ESR), Firefox Android, Chrome Desktop/Chromium and Chrome Android as compatible as of 2023-05-25."
url: "https://github.com/padenot/ringbuf.js/blob/main/README.md"
anchor: "Cross-Origin-Opener-Policy: same-origin"
receipt: "version:0.4.0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
escalate: true
```

```yaml:claim
id: "AS-R10"
axis: "audio-streaming-backend"
claim: "ringbuf.js README lists emulator ports with a single execution thread and SDL_QueueAudio-style push APIs as explicit target use cases for its SPSC audio queue."
url: "https://github.com/padenot/ringbuf.js/blob/main/README.md"
anchor: "Implementing emulators for (e.g.) old consoles that only had one execution"
receipt: "version:0.4.0"
package:
  ecosystem: "npm"
  name: "ringbuf.js"
  version: "0.4.0"
```

```yaml:claim
id: "AS-R11"
axis: "audio-streaming-backend"
claim: "Emscripten libwebaudio.js enforces at build time that -sAUDIO_WORKLET requires -sWASM_WORKERS."
url: "https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebaudio.js"
anchor: "#error \"Building with -sAUDIO_WORKLET also requires enabling -sWASM_WORKERS\""
receipt: "commit:fa9168be290d38c792cc322178c3adec231117e7"
escalate: true
```



```yaml:claim
id: "AS-R13"
axis: "audio-streaming-backend"
claim: "Emscripten rejects combining -sAUDIO_WORKLET with -sSINGLE_FILE at build time."
url: "https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebaudio.js"
anchor: "#error \"-sAUDIO_WORKLET does not support -sSINGLE_FILE\""
receipt: "commit:fa9168be290d38c792cc322178c3adec231117e7"
escalate: true
```

```yaml:claim
id: "AS-R14"
axis: "audio-streaming-backend"
claim: "Emscripten warns that -sAUDIO_WORKLET cannot use -sTEXTDECODER=2 because TextDecoder is unavailable in AudioWorkletGlobalScope; it recommends -sTEXTDECODER=1 for string marshalling."
url: "https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebaudio.js"
anchor: "TextDecoder is not available in AudioWorkletGlobalScope"
receipt: "commit:fa9168be290d38c792cc322178c3adec231117e7"
escalate: true
```

```yaml:claim
id: "AS-R15"
axis: "audio-streaming-backend"
claim: "Emscripten asserts that emscripten_create_wasm_audio_worklet() may be called only once per AudioContext; one AudioWorklet thread per context is enforced."
url: "https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebaudio.js"
anchor: "Only call this function once per AudioContext"
receipt: "commit:fa9168be290d38c792cc322178c3adec231117e7"
escalate: true
```

```yaml:claim
id: "AS-R16"
axis: "audio-streaming-backend"
claim: "Emscripten emscripten_destroy_audio_context() calls AudioContext.suspend() and deletes the JS handle; the C header documents no close() entry point, while AUDIO_CONTEXT_STATE_CLOSED (2) is only readable via emscripten_audio_context_state()."
url: "https://github.com/emscripten-core/emscripten/blob/main/system/include/emscripten/webaudio.h"
anchor: "Calls .suspend() on the given AudioContext and releases the JS object table"
receipt: "commit:4a91be37f287208399b10cb336228e833d2e24e0"
escalate: true
```

```yaml:claim
id: "AS-R17"
axis: "audio-streaming-backend"
claim: "Emscripten Wasm Audio Worklets runtime states it generates no temporary JavaScript VM garbage, eliminating GC pauses from audio synthesis."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/api_reference/wasm_audio_worklets.rst"
anchor: "no temporary JavaScript level VM garbage will be generated, eliminating"
receipt: "commit:929882a8bb2b89c0be698212187219a4bf548bf7"
```

```yaml:claim
id: "AS-R18"
axis: "audio-streaming-backend"
claim: "Emscripten Audio Worklets always execute in a Wasm Worker, never a pthread, even when -pthread is enabled; one dedicated real-time-priority audio thread is shared by all worklet nodes on an AudioContext."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/api_reference/wasm_audio_worklets.rst"
anchor: "audio worklets will always run in a Wasm Worker, and not in a Pthread."
receipt: "commit:929882a8bb2b89c0be698212187219a4bf548bf7"
escalate: true
```

```yaml:claim
id: "AS-R19"
axis: "audio-streaming-backend"
claim: "Emscripten documents AudioWorklet processing as pull-mode, with the callback required to be non-blocking; a custom for(;;) spin loop is not possible."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/api_reference/wasm_audio_worklets.rst"
anchor: "Note: the audio worklet node processing is pull-mode callback based."
receipt: "commit:929882a8bb2b89c0be698212187219a4bf548bf7"
```

```yaml:claim
id: "AS-R20"
axis: "audio-streaming-backend"
claim: "Emscripten documents three main-thread-to-audio-thread synchronization options: AudioParams, GCC/Clang lock-free atomics plus Wasm Worker primitives, and emscripten_audio_worklet_post_function_*()."
url: "https://github.com/emscripten-core/emscripten/blob/main/site/source/docs/api_reference/wasm_audio_worklets.rst"
anchor: "To synchronize information between an Audio Worklet Node and other threads in"
receipt: "commit:929882a8bb2b89c0be698212187219a4bf548bf7"
```





```yaml:claim
id: "AS-R23"
axis: "audio-streaming-backend"
claim: "Emscripten webaudio.h declares emscripten_create_wasm_audio_worklet_processor_async(context, options, callback, userData) and emscripten_create_wasm_audio_worklet_node(), and warns that audio-worklet post functions are slow, high-latency, and generate JS heap garbage; it recommends atomics/mutexes for performance-critical coordination."
url: "https://github.com/emscripten-core/emscripten/blob/main/system/include/emscripten/webaudio.h"
anchor: "Passing messages between audio thread and main thread with this family of functions is relatively slow"
receipt: "commit:4a91be37f287208399b10cb336228e833d2e24e0"
escalate: true
```

```yaml:claim
id: "AS-R24"
axis: "audio-streaming-backend"
claim: "Emscripten libwebaudio.js contains a polyfill for browsers lacking AudioWorklet.port, citing Firefox support added in autoland revision ab38a1796126f2b3fc06475ffc5a625059af59c1, Chrome crbug.com/446920095 and Safari webkit.org/b/299386."
url: "https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebaudio.js"
anchor: "Firefox added support in https://hg-edge.mozilla.org/integration/autoland/rev/ab38a1796126f2b3fc06475ffc5a625059af59c1"
receipt: "commit:fa9168be290d38c792cc322178c3adec231117e7"
escalate: true
```

```yaml:claim
id: "AS-R25"
axis: "audio-streaming-backend"
claim: "Emscripten audio-worklet render quantum size can be requested via renderSizeHint; a 2025-11-08 upstream commit records Chrome Canary gating behind --enable-features=WebAudioConfigurableRenderQuantum with a 2048-sample test falling back to 128 in older browsers."
url: "https://github.com/emscripten-core/emscripten/commit/35482d30b6065f9612dfd748bf1e47e8d4ec561b"
anchor: "which in an older browser will fallback to the default 128 samples"
receipt: "commit:35482d30b6065f9612dfd748bf1e47e8d4ec561b"
```



```yaml:claim
id: "AS-R27"
axis: "audio-streaming-backend"
claim: "MDN documents AudioWorkletGlobalScope.currentFrame as an ever-increasing sample-frame counter incremented by 128 after each rendered block, and sampleRate as fixed at context instantiation."
url: "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope/currentFrame"
anchor: "It is incremented by 128 (the size of a render quantum) after the processing of each audio block."
receipt: "docs:MDN-AudioWorkletGlobalScope-currentFrame"
```











```yaml:claim
id: "AS-R33"
axis: "audio-streaming-backend"
claim: "Emscripten upstream has a separate 2025-12-23 commit adding support for running output directly in an Audio Worklet without -sAUDIO_WORKLET, explicitly for contexts where shared memory / cross-origin isolation is unavailable (issues #22979 and #25943)."
url: "https://github.com/emscripten-core/emscripten/commit/43af76f17ebd22297ce36b3c99cd88268e8351eb"
anchor: "shared memory not available (i.e. no cross origin isolation)"
receipt: "commit:43af76f17ebd22297ce36b3c99cd88268e8351eb"
```
```
