# Dossier: webgl2-canvas-threading

Evidence lane: docs. Raw technical claims only (no verdicts).

```yaml:claim
id: WC-D01
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 PROXY_TO_PTHREAD proxies Module['canvas'] only if present and if OFFSCREENCANVAS_SUPPORT is enabled; the docs state this is the only chance to transfer the canvas from the browser main thread."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "This proxies Module['canvas'], if present, and if OFFSCREENCANVAS_SUPPORT"
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-D02
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREENCANVASES_TO_PTHREAD takes a comma-separated list of CSS ID selectors proxied at program startup and defaults to only #canvas."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "Default value: \"#canvas\""
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-D03
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREENCANVAS_SUPPORT enables transferring canvases to pthreads and creating WebGL contexts in them but requires browser support for the OffscreenCanvas specification; default false."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "This needs browser support for the OffscreenCanvas specification."
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-D04
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREEN_FRAMEBUFFER can polyfill multithreaded WebGL access where OffscreenCanvas is absent, at the cost of performance and latency."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "support in browser, at the cost of some performance and latency."
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-D05
axis: "webgl2-canvas-threading"
claim: "In Emscripten 4.0.0 html5.h, EMSCRIPTEN_WEBGL_CONTEXT_PROXY_DISALLOW OffscreenCanvas contexts are pinned to the creating pthread; other threads cannot activate them via emscripten_webgl_make_context_current()."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "Other threads will not be able to activate rendering to the context"
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D06
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 EMSCRIPTEN_WEBGL_CONTEXT_PROXY_ALWAYS creates the WebGLRenderingContext on the main browser thread and proxies all WebGL API calls there as asynchronous messages; such contexts are shareable across any number of pthreads but incur performance and latency impact."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "all WebGL API calls will be proxied as asynchronous messages from the pthread into the main thread."
receipt: "docs:emscripten-4.0.0"
```

```yaml:claim
id: WC-D07
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 EMSCRIPTEN_WEBGL_CONTEXT_PROXY_FALLBACK requires building with both OFFSCREEN_FRAMEBUFFER and OFFSCREENCANVAS_SUPPORT linker flags."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "code should be compiled with both ``-sOFFSCREEN_FRAMEBUFFER`` and ``-sOFFSCREENCANVAS_SUPPORT`` linker flags."
receipt: "docs:emscripten-4.0.0"
```

```yaml:claim
id: WC-D08
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 renderViaOffscreenBackBuffer must be enabled when performing WebGL context accesses from multiple threads simultaneously, independent of OffscreenCanvas support."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "when performing WebGL context accesses from multiple threads simultaneously"
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D09
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 pthreads docs state Atomics.wait is forbidden on the main browser thread and that a deadlock can occur if the main thread blocks while a worker attempts to proxy to it."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/porting/pthreads.rst"
anchor: "If the main thread blocks while a worker attempts to proxy to it, a deadlock can occur."
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D10
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 recommends PROXY_TO_PTHREAD to move main() off the browser main thread so that thread handles proxied events such as rendering while the main thread stays free."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/porting/pthreads.rst"
anchor: "which leaves the main browser thread to focus only on receiving proxied events."
receipt: "docs:emscripten-4.0.0"
```

```yaml:claim
id: WC-D11
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 states a single binary cannot both use threads when available and fall back to single-threaded execution; two separate builds must be selected at runtime."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/porting/pthreads.rst"
anchor: "The best you can do is two separate builds, one with and one without threads, and pick between them at runtime."
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D12
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 documents a fixed default limit of 20 workers per domain in Firefox Nightly, controlled by dom.workers.maxPerDomain."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/porting/pthreads.rst"
anchor: "there exists a fixed limit (by default 20) of threads that can be spawned when running in Firefox Nightly."
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D13
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1972240, filed against Firefox 141 and still open, reports that calling offscreenCanvas.getContext('webgl2') in a worker while the main thread spin-waits on SharedArrayBuffer hangs for five seconds and throws."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1972240"
anchor: "Observed: the page hangs for five seconds and then raises an exception"
receipt: "issue:#1972240"
escalate: true
```

```yaml:claim
id: WC-D14
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1972240 comment 4 bisects the OffscreenCanvas worker WebGL2 hang to Firefox enabling OffscreenCanvas by default from Firefox 104 onwards."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1972240"
anchor: "Firefox >= 104: the test page hangs by default."
receipt: "issue:#1972240"
escalate: true
```

```yaml:claim
id: WC-D15
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1888109 remains open and records that blocking the main thread while assuming Worker creation can progress without it causes deadlock; the reporter cites Unity3D startup as affected."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1888109"
anchor: "assuming Worker creation can happen without the main thread being available can cause deadlock"
receipt: "issue:#1888109"
escalate: true
```



```yaml:claim
id: WC-D17
axis: "webgl2-canvas-threading"
claim: "WHATWG HTML standard states that once a canvas becomes a placeholder for an OffscreenCanvas its natural size can no longer be changed and it cannot have a rendering context, and that setting width or height on a placeholder throws InvalidStateError."
url: "https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-transfercontroltooffscreen"
anchor: "its natural size can no longer be"
receipt: "docs:html-2026-11-26"
escalate: true
```





```yaml:claim
id: WC-D20
axis: "webgl2-canvas-threading"
claim: "MDN states that after webglcontextrestored, WebGL resources such as textures and buffers created before the loss are no longer valid and application state and resources must be recreated."
url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event"
anchor: "WebGL resources such as textures and buffers that were created before the context was lost are no longer valid."
receipt: "docs:MDN-content-main"
escalate: true
```

```yaml:claim
id: WC-D21
axis: "webgl2-canvas-threading"
claim: "MDN WebGL best practices warns that getError, getParameter and similar synchronous entry points cause stalls and should be avoided especially on the browser main thread where they jank the whole page."
url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices"
anchor: "avoid such entry points, especially on the browser main thread where they can cause the entire page to jank"
receipt: "docs:MDN-2026-10-31"
```

```yaml:claim
id: WC-D22
axis: "webgl2-canvas-threading"
claim: "MDN WebGL best practices recommends ResizeObserver with device-pixel-content-box and resizing before drawing because changing the size of a canvas clears it."
url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices"
anchor: "because changing the size of a canvas clears it."
receipt: "docs:MDN-2026-10-31"
escalate: true
```



```yaml:claim
id: WC-D24
axis: "webgl2-canvas-threading"
claim: "Godot stable web export docs state multithreading requires server-side headers and complete cross-origin isolation, and that since Godot 4.3 single-threaded export is the preferred default."
url: "https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html"
anchor: "requiring specific server-side headers and complete cross-origin isolation"
receipt: "docs:godot-stable"
escalate: true
```

```yaml:claim
id: WC-D25
axis: "webgl2-canvas-threading"
claim: "Godot class reference warns that exhausting the emscripten thread pool may cause deadlock and that some browsers have a hard cap on allocatable threads."
url: "https://docs.godotengine.org/en/latest/classes/class_editorexportplatformweb.html"
anchor: "Some browsers have a hard cap on the number of threads that can be allocated"
receipt: "docs:godot-latest"
escalate: true
```

```yaml:claim
id: WC-D26
axis: "webgl2-canvas-threading"
claim: "Godot master platform/web/detect.py links -sMAX_WEBGL_VERSION=2, -sOFFSCREEN_FRAMEBUFFER=1 and, when proxy_to_pthread is set, -sPROXY_TO_PTHREAD=1 to run the main application in a web worker."
url: "https://github.com/godotengine/godot/blob/master/platform/web/detect.py"
anchor: "# Run the main application in a web worker"
receipt: "docs:godot-master"
```

```yaml:claim
id: WC-D27
axis: "webgl2-canvas-threading"
claim: "Unity 6000.0 documentation states multithreaded WebGL builds only enable multithreading at the native C/C++ language level, not for C# code, and require COOP, COEP and CORP headers."
url: "https://docs.unity.com/en-us/engine/6000.0/script-reference/unityeditor/playersettings/webgl/threadssupport"
anchor: "Currently, multithreaded WebGL builds only enable multithreading on the native C/C++ language level."
receipt: "docs:unity-6000.0"
escalate: true
```

```yaml:claim
id: WC-D28
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 pthreads docs call pthreads combined with ALLOW_MEMORY_GROWTH especially tricky and note that JS HEAP views may need updating because memory growth replaces typed array views."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/porting/pthreads.rst"
anchor: "Pthreads + memory growth (``ALLOW_MEMORY_GROWTH``) is especially tricky"
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D29
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1657375, fixed in Firefox 96, records a crash in ClientWebGLContext::CreateHostContext with OffscreenCanvas because the canvas element principal could not be accessed off the main thread."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1657375"
anchor: "We cannot access ClientWebGLContext::mCanvasElement or its associated nsIPrincipal off the main thread."
receipt: "issue:#1657375"
escalate: true
```



```yaml:claim
id: WC-D31
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 html5.h exposes emscripten_set_webglcontextlost_callback, emscripten_set_webglcontextrestored_callback and emscripten_is_webgl_context_lost for teardown and loss handling."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "Queries the given WebGL context if it is in a lost context state."
receipt: "docs:emscripten-4.0.0"
```

```yaml:claim
id: WC-D32
axis: "webgl2-canvas-threading"
claim: "Emscripten 4.0.0 emscripten_set_canvas_element_size resizes the pixel width and height of the DOM canvas element, which is distinct from the placeholder constraint on a transferred canvas."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "Resizes the pixel width and height of the given Canvas element in the DOM."
receipt: "docs:emscripten-4.0.0"
escalate: true
```

```yaml:claim
id: WC-D33
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 sets MAX_WEBGL_VERSION=2 to target WebGL 2 and documents that there is no automatic fallback to WebGL1 when WebGL2 is unsupported."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "Note that there is no automatic fallback to WebGL1 if WebGL2 is not supported"
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-D34
axis: "webgl2-canvas-threading"
claim: "MDN states the webglcontextlost event does not bubble, so a listener must be attached to the specific canvas or OffscreenCanvas."
url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event"
anchor: "This event does not bubble."
receipt: "docs:MDN-2026-10-26"
```



```yaml:claim
id: WC-R02
axis: "webgl2-canvas-threading"
claim: "transferControlToOffscreen() throws InvalidStateError if the canvas already had getContext() called or has already transferred control, so the current banner 2D context and any re-transfer on game switch are invalid."
url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen"
anchor: "the canvas has already transferred its control to offscreen."
receipt: "commit:515d03ad8572b96e88916888156444626dcba193"
escalate: true
```













```yaml:claim
id: WC-R09
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREENCANVAS_SUPPORT defaults to false and enables transferring canvases to pthreads plus WebGL contexts in them, but requires browser OffscreenCanvas support."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "This needs browser support for the OffscreenCanvas specification."
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-R10
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREENCANVASES_TO_PTHREAD is a comma-separated list of CSS ID selectors proxied at program startup and defaults to only #canvas."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "Default value: \"#canvas\""
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-R11
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 PROXY_TO_PTHREAD proxies Module['canvas'] only if present and only with OFFSCREENCANVAS_SUPPORT, described as the only chance to transfer the canvas from the browser main thread."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "This proxies Module['canvas'], if present, and if OFFSCREENCANVAS_SUPPORT"
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-R12
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 requires four conditions for an OffscreenCanvas-based WebGL context (browser support, -sOFFSCREENCANVAS_SUPPORT, prior emscripten_pthread_attr_settransferredcanvases transfer, no existing context) and such contexts are pinned to the creating pthread."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "OffscreenCanvas-based contexts are essentially \"pinned\" to the pthread that created them."
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-R13
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 EMSCRIPTEN_WEBGL_CONTEXT_PROXY_ALWAYS creates the WebGLRenderingContext on the main browser thread, proxies all WebGL calls asynchronously from pthreads, is shareable across pthreads and has performance/latency impact."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "all WebGL API calls will be proxied as asynchronous messages from the pthread into the main thread."
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-R14
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 EMSCRIPTEN_WEBGL_CONTEXT_PROXY_FALLBACK requires both -sOFFSCREEN_FRAMEBUFFER and -sOFFSCREENCANVAS_SUPPORT at link time."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/api_reference/html5.h.rst"
anchor: "code should be compiled with both ``-sOFFSCREEN_FRAMEBUFFER`` and ``-sOFFSCREENCANVAS_SUPPORT`` linker flags."
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-R15
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 OFFSCREEN_FRAMEBUFFER disables implicit WebGL swapping in favor of explicit emscripten_webgl_commit_frame() and can polyfill multithreaded WebGL where OffscreenCanvas is absent at a performance/latency cost."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/tools_reference/settings_reference.rst"
anchor: "the swap function emscripten_webgl_commit_frame() is then explicitly called"
receipt: "docs:emscripten-7.0.0"
```

```yaml:claim
id: WC-R16
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 pthreads docs warn that proxying can deadlock if the main thread blocks while a worker proxies to it, and that PROXY_TO_PTHREAD leaves the browser main thread handling events and rendering."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/porting/pthreads.rst"
anchor: "attempts to proxy to it, a deadlock can occur."
receipt: "docs:emscripten-7.0.0"
escalate: true
```



```yaml:claim
id: WC-R18
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 states a single binary cannot use threads when available and fall back to single-threaded mode; two builds must be chosen at runtime."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/porting/pthreads.rst"
anchor: "multithreading when available and fall back to single threaded when not."
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-R19
axis: "webgl2-canvas-threading"
claim: "Emscripten 7.0.0 documents a default 20-worker per-domain limit in Firefox Nightly controlled by dom.workers.maxPerDomain and Mozilla bug 1052398."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/site/source/docs/porting/pthreads.rst"
anchor: "there exists a fixed limit (by default 20) of threads that can be spawned when running in Firefox Nightly."
receipt: "docs:emscripten-7.0.0"
escalate: true
```

```yaml:claim
id: WC-R20
axis: "webgl2-canvas-threading"
claim: "Emscripten issue 5437 records emscripten_webgl_commit_frame failing with OffscreenCanvas not supported under Firefox, while Chrome did not show the bug; the maintainer's recipe requires -s OFFSCREENCANVAS_SUPPORT=1, emscripten_pthread_attr_settransferredcanvases and explicitSwapControl=1."
url: "https://github.com/emscripten-core/emscripten/issues/5437"
anchor: "It looks like the relevant bit in Firefox Nightly is that WebGL 2 is not working with OffscreenCanvas."
receipt: "issue:#5437"
escalate: true
```

```yaml:claim
id: WC-R21
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1388299 (Enable OffscreenCanvas with WebGL 2) was closed as a duplicate of bug 1736177 Add initial implementation of OffscreenCanvas + WebGL, which is RESOLVED FIXED with Firefox 97 marked fixed."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1736177"
anchor: "Add initial implementation of OffscreenCanvas + WebGL"
receipt: "issue:#1736177"
```

```yaml:claim
id: WC-R22
axis: "webgl2-canvas-threading"
claim: "Mozilla bug 1972240 remains open and reports that a worker calling OffscreenCanvas.getContext('webgl2') while the main thread spin-waits on SharedArrayBuffer hangs five seconds then throws; Firefox 104 enabled OffscreenCanvas by default."
url: "https://bugzilla.mozilla.org/show_bug.cgi?id=1972240"
anchor: "Observed: the page hangs for five seconds and then raises an exception"
receipt: "issue:#1972240"
escalate: true
```

```yaml:claim
id: WC-R23
axis: "webgl2-canvas-threading"
claim: "Emscripten issue 24099 (open) reports that on a transferred-canvas pthread with -sOFFSCREEN_FRAMEBUFFER=1 -sOFFSCREENCANVAS_SUPPORT=1, emscripten_set_webglcontextlost_callback/restored never fire although emscripten_is_webgl_context_lost returns true."
url: "https://github.com/emscripten-core/emscripten/issues/24099"
anchor: "Registered lose/restored webgl context callbacks never called"
receipt: "issue:#24099"
escalate: true
```

```yaml:claim
id: WC-R24
axis: "webgl2-canvas-threading"
claim: "Emscripten issue 20418 shows an SDL2 shared GL context in a pthread has GLctx undefined; a maintainer points to emscripten_pthread_attr_settransferredcanvases to pass a canvas to a newly created thread."
url: "https://github.com/emscripten-core/emscripten/issues/20418"
anchor: "in order to pass a canvas to a newly created thread"
receipt: "issue:#20418"
escalate: true
```





```yaml:claim
id: WC-R27
axis: "webgl2-canvas-threading"
claim: "emscripten-ports/SDL2 PR 127 adds commits proxying mouse and framebuffer canvas access to the main thread for USE_PTHREADS=1; it remains open in the archived repo and was later merged as libsdl-org/SDL#5365."
url: "https://github.com/emscripten-ports/SDL2/pull/127"
anchor: "emscripten: framebuffer: proxy canvas access to main thread"
receipt: "issue:#127"
escalate: true
```

```yaml:claim
id: WC-R28
axis: "webgl2-canvas-threading"
claim: "Godot 4.4-stable web build flags set -sMAX_WEBGL_VERSION=2 and -sOFFSCREEN_FRAMEBUFFER=1, and only add -sPROXY_TO_PTHREAD=1 when proxy_to_pthread is set, disabling it when threads=no or GDExtensions are enabled."
url: "https://raw.githubusercontent.com/godotengine/godot/4.4-stable/platform/web/detect.py"
anchor: "# This setting just makes WebGL 2 APIs available, it does NOT disable WebGL 1."
receipt: "version:4.4"
```

```yaml:claim
id: WC-R29
axis: "webgl2-canvas-threading"
claim: "Godot 4.4 web export docs state Godot 4 targets only WebGL 2.0 and that multithreaded web exports require cross-origin isolation; since 4.3 single-threaded export is the default."
url: "https://docs.godotengine.org/en/4.4/tutorials/export/exporting_for_web.html"
anchor: "Godot 4.0 and later can only target WebGL 2.0"
receipt: "docs:godot-4.4"
```

```yaml:claim
id: WC-R30
axis: "webgl2-canvas-threading"
claim: "PPSSPP upstream issue 18861 reports the Emscripten GLES build freezing in GLRenderManager waiting on another thread; the maintainer stated no interest and the reporter closed it citing an unupstreamed EmulatorJS fork fix."
url: "https://github.com/hrydgard/ppsspp/issues/18861"
anchor: "Emscripten isn't a platform that the project (or at least I) care about, you're on your own."
receipt: "issue:#18861"
escalate: true
```

```yaml:claim
id: WC-R31
axis: "webgl2-canvas-threading"
claim: "The EmulatorJS PPSSPP fix commit changes GLFLAGS to keep -DGLES but comment out -DUSING_GLES2, alongside Emscripten-specific libchdr/SSE2 exclusions; no upstream merge is recorded."
url: "https://github.com/EmulatorJS/ppsspp/commit/7e9a311092186d5bb18bb0477f6857b6ab70b45d.patch"
anchor: "GLFLAGS += -DGLES # -DUSING_GLES2"
receipt: "commit:7e9a311092186d5bb18bb0477f6857b6ab70b45d"
escalate: true
```


```
