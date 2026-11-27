const GL_FAIL_RE = /SDL_GL_CreateContext failed|Could not create WebGL|Failed to initialize graphics/i;

function attachVfsIpc(workerA, ipcSab, byteOffset, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            workerA.removeEventListener('message', onMsg);
            reject(new Error('Timed out waiting for VFS_IPC_ATTACHED'));
        }, timeoutMs);

        function onMsg(e) {
            if (e.data && e.data.type === 'VFS_IPC_ATTACHED') {
                clearTimeout(timer);
                workerA.removeEventListener('message', onMsg);
                resolve(e.data);
            }
        }
        workerA.addEventListener('message', onMsg);
        workerA.postMessage({ type: 'ATTACH_VFS_IPC', ipcSab, byteOffset });
    });
}

/**
 * Instantiate and run the PPSSPP Emscripten core on a dedicated canvas & Worker A IPC channel.
 */
export async function createCoreHost({
    canvas,
    workerA,
    discSize,
    bootPath = '/vfs/game.iso',
    coreUrl = '/cores/ppsspp/PPSSPPSDL.js?v=2',
    locateFile = (p) => `/cores/ppsspp/${p}?v=2`,
    onFirstFrame,
    onShutdownComplete,
    onFatal,
    onBeforeCallMain,
    onFrame,
    getLatestSnapshot,
}) {
    if (!canvas) throw new Error('createCoreHost requires a target canvas');
    if (!workerA) throw new Error('createCoreHost requires workerA');

    let shuttingDown = false;
    let terminated = false;
    let fatalReported = false;
    let shutdownPromise = null;
    let shutdownResolve = null;
    let mod = null;
    let rafId = 0;
    let lastFrameCount = 0;
    let cleanupListeners = () => {};

    const reportFatal = (msg) => {
        if (shuttingDown || fatalReported) return;
        fatalReported = true;
        if (onFatal) onFatal(msg);
    };

    const shutdownDonePromise = new Promise((resolve) => {
        shutdownResolve = resolve;
    });

    const host = {
        getFrameCount() {
            if (mod && !terminated && typeof mod._ppsspp_stream_get_frame_count === 'function') {
                lastFrameCount = mod._ppsspp_stream_get_frame_count();
            }
            return lastFrameCount;
        },
        getModule() {
            return mod;
        },
        getLatestSnapshot() {
            return typeof getLatestSnapshot === 'function' ? getLatestSnapshot() : null;
        },
        async shutdown() {
            if (shutdownPromise) return shutdownPromise;
            shuttingDown = true;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }

            shutdownPromise = (async () => {
                try {
                    if (mod && !terminated) {
                        if (typeof mod._ppsspp_stream_get_frame_count === 'function') {
                            lastFrameCount = mod._ppsspp_stream_get_frame_count();
                        }
                        if (typeof mod._ppsspp_stream_request_shutdown === 'function') {
                            mod._ppsspp_stream_request_shutdown();
                            await Promise.race([
                                shutdownDonePromise,
                                new Promise((r) => setTimeout(r, 1500)),
                            ]);
                        }
                        try {
                            mod.PThread?.terminateAllThreads?.();
                        } catch {
                            // Ignore errors if runtime already exited.
                        }
                    }
                } finally {
                    terminated = true;
                    cleanupListeners();
                }
            })();

            return shutdownPromise;
        },
    };

    if (typeof globalThis.WebGL2RenderingContext === 'undefined') {
        const msg = 'WebGL2RenderingContext is not supported in this browser';
        reportFatal(msg);
        throw new Error(msg);
    }

    const onContextLost = (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        reportFatal('WebGL2 context lost');
    };
    const onContextCreationError = (e) => {
        reportFatal(`WebGL2 context creation failed${e?.statusMessage ? `: ${e.statusMessage}` : ''}`);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextcreationerror', onContextCreationError);
    cleanupListeners = () => {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextcreationerror', onContextCreationError);
    };

    try {
        const { default: createPpssppModule } = await import(coreUrl);
        if (shuttingDown) {
            cleanupListeners();
            return host;
        }

        mod = await createPpssppModule({
            noInitialRun: true,
            canvas,
            locateFile,
            print: (txt) => {
                if (typeof txt === 'string' && GL_FAIL_RE.test(txt)) {
                    reportFatal(`WebGL2 error: ${txt}`);
                }
            },
            printErr: (txt) => {
                if (typeof txt === 'string' && GL_FAIL_RE.test(txt)) {
                    reportFatal(`WebGL2 error: ${txt}`);
                }
            },
            onFirstFrame: () => {
                if (!shuttingDown) onFirstFrame?.();
            },
            onShutdownComplete: () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                terminated = true;
                cleanupListeners();
                if (shutdownResolve) shutdownResolve();
                onShutdownComplete?.();
            },
            onAbort: (what) => {
                reportFatal(`WebGL2 / Core aborted: ${what || 'unknown error'}`);
            },
        });

        if (shuttingDown) {
            try {
                mod.PThread?.terminateAllThreads?.();
            } catch {
                // Ignore if pthreads haven't started.
            }
            terminated = true;
            cleanupListeners();
            return host;
        }

        const buffer = mod.HEAPU8?.buffer;
        if (!(buffer instanceof SharedArrayBuffer)) {
            throw new Error('PPSSPP heap is not backed by SharedArrayBuffer (missing COOP/COEP)');
        }

        const ipcPtr = mod._ppsspp_stream_get_ipc_ptr();
        mod._ppsspp_stream_set_disc_size(BigInt(discSize));

        if (onBeforeCallMain) {
            await onBeforeCallMain(mod);
            if (shuttingDown) {
                terminated = true;
                cleanupListeners();
                return host;
            }
        }

        const attached = await attachVfsIpc(workerA, buffer, ipcPtr);
        if (!attached?.ok) {
            throw new Error('Worker A rejected ATTACH_VFS_IPC');
        }
        if (shuttingDown) {
            terminated = true;
            cleanupListeners();
            return host;
        }

        let exitCode = 0;
        try {
            const xres = String(canvas.width || 480);
            const yres = String(canvas.height || 272);
            console.info('[ppsspp-stream] booting core', { xres, yres, coreUrl });
            exitCode = mod.callMain(['--xres', xres, '--yres', yres, bootPath]);
        } catch (err) {
            if (err && typeof err.status === 'number') {
                exitCode = err.status;
            } else {
                reportFatal(`WebGL2 / Core boot failed: ${err?.message || err}`);
                throw err;
            }
        }

        if (typeof exitCode === 'number' && exitCode !== 0 && !shuttingDown) {
            const msg = `WebGL2 / GL init failed (exit ${exitCode})`;
            reportFatal(msg);
            throw new Error(msg);
        }

        if (typeof onFrame === 'function') {
            const tick = () => {
                if (shuttingDown || terminated) return;
                onFrame(host.getFrameCount(), mod);
                rafId = requestAnimationFrame(tick);
            };
            rafId = requestAnimationFrame(tick);
        }

        return host;
    } catch (err) {
        if (mod && !terminated) {
            try {
                mod.PThread?.terminateAllThreads?.();
            } catch {
                // Ignore if pthreads haven't started or already exited.
            }
            terminated = true;
        }
        cleanupListeners();
        reportFatal(`WebGL2 / Core initialization failed: ${err?.message || err}`);
        throw err;
    }
}
