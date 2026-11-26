import { createCoreHost } from './core_host.mjs';
import { createInputBridge } from './input_bridge.mjs';
import { createAudioBridge } from './audio_bridge.mjs';
import { createMemstickSync } from './memstick_sync.mjs';

/**
 * Manages the active PSP game session (workers, WebGL2 core, input, audio, and Memory Stick OPFS sync).
 */
export function createGameSession({
    viewport,
    gameLabel,
    badgeIso,
    badgeStream,
    onDrawBanner,
    onHideBanner,
    onResetCanvas,
    onResizeHud,
    onHudSnapshot,
}) {
    let workerA = null;
    let workerB = null;
    let coreHost = null;
    let inputBridge = null;
    let audioBridge = null;
    let memstickSync = null;
    let exitPromise = null;
    let launchGen = 0;
    let latestSnapshot = null;
    let opfsMode = 'stream-only';
    let activePoolMb = 64;

    function setWarnBadge(text) {
        badgeIso.textContent = text;
        badgeIso.className = 'badge warn';
    }

    async function teardownResources(reason = 'menu') {
        const oldInput = inputBridge;
        inputBridge = null;
        window.__ppssppInputBridge = null;
        if (oldInput) oldInput.destroy();

        const oldAudio = audioBridge;
        audioBridge = null;
        window.__ppssppAudioBridge = null;
        if (oldAudio) await oldAudio.close();

        const oldHost = coreHost;
        coreHost = null;
        window.__ppssppCoreHost = null;
        if (oldHost) await oldHost.shutdown();

        const oldMemstick = memstickSync;
        memstickSync = null;
        window.__ppssppMemstickSync = null;
        if (oldMemstick) {
            await oldMemstick.flush(reason);
            oldMemstick.destroy();
        }

        if (workerA) {
            workerA.terminate();
            workerA = null;
        }
        const oldB = workerB;
        workerB = null;
        if (oldB) {
            await new Promise((resolve) => {
                let done = false;
                const stop = () => {
                    if (!done) {
                        done = true;
                        oldB.terminate();
                        resolve();
                    }
                };
                oldB.onmessage = (ev) => {
                    if (ev.data?.type === 'TELEM_FLUSHED') stop();
                };
                oldB.postMessage({ type: 'FLUSH_TELEMETRY', reason });
                setTimeout(stop, 150);
            });
        }
    }

    function exitToMenu() {
        ++launchGen;
        if (exitPromise) return exitPromise;

        exitPromise = teardownResources('menu')
            .then(() => {
                viewport.style.display = 'none';
            })
            .finally(() => {
                exitPromise = null;
            });

        return exitPromise;
    }

    async function launchGame(game) {
        const myGen = ++launchGen;
        // Start AudioContext creation immediately inside click gesture if available.
        const audioInitPromise = createAudioBridge({ sampleRate: 44100 }).catch(() => null);

        if (exitPromise) {
            await exitPromise;
            if (myGen !== launchGen) {
                const ab = await audioInitPromise;
                if (ab) await ab.close();
                return;
            }
        }

        await teardownResources('switch');
        if (myGen !== launchGen) {
            const ab = await audioInitPromise;
            if (ab) await ab.close();
            return;
        }

        audioBridge = await audioInitPromise;
        if (myGen !== launchGen) {
            if (audioBridge) {
                await audioBridge.close();
                audioBridge = null;
            }
            return;
        }
        window.__ppssppAudioBridge = audioBridge;

        viewport.style.display = 'flex';
        gameLabel.textContent = `${game.title} (PSP)`;
        onResizeHud();
        const targetCanvas = onResetCanvas();
        onDrawBanner(game.title, '');

        const ch = new MessageChannel();
        const myWorkerA = new Worker('worker_a.js', { type: 'module' });
        const myWorkerB = new Worker('worker_b.js', { type: 'module' });
        workerA = myWorkerA;
        workerB = myWorkerB;

        let nextId = 1;
        const pending = new Map();
        let coreBootStarted = false;

        function callA(msg) {
            return new Promise((resolve) => {
                const id = nextId++;
                pending.set(id, resolve);
                myWorkerA.postMessage({ ...msg, id });
            });
        }

        myWorkerA.onmessage = (e) => {
            const d = e.data || {};
            if (d.type === 'BUILD_ROTATED') {
                setWarnBadge('Build Updated — Reload');
                return;
            }
            if (d.id && pending.has(d.id)) {
                const res = pending.get(d.id);
                pending.delete(d.id);
                res(d);
            }
        };

        myWorkerB.onmessage = async (e) => {
            if (myGen !== launchGen) return;
            const { type, snapshot, opfsMode: mode, effectivePoolMB, reason } = e.data || {};
            if (type === 'STATUS') {
                if (mode) opfsMode = mode;
                if (effectivePoolMB) activePoolMb = effectivePoolMB;
                badgeStream.textContent = `${activePoolMb} MB RAM Pool (${opfsMode})`;
                myWorkerB.postMessage({ type: 'ENABLE_HUD', enabled: true });

                if (coreBootStarted) return;
                coreBootStarted = true;

                const openRes = await callA({ type: 'DISC_OPEN', path: 'game.iso' });
                if (myGen !== launchGen) return;
                if (!openRes.ok) {
                    setWarnBadge('Disc Open Failed');
                    return;
                }

                const idRes = await callA({ type: 'DISC_IDENTIFY' });
                if (myGen !== launchGen) return;
                badgeIso.textContent = idRes.ok ? `UMD Ready (${idRes.discId})` : 'Raw Stream Ready';
                badgeIso.className = 'badge ok';
                onDrawBanner(idRes.title || game.title, idRes.discId || '');

                try {
                    const host = await createCoreHost({
                        canvas: targetCanvas,
                        workerA: myWorkerA,
                        discSize: openRes.size || game.discSize,
                        getLatestSnapshot: () => latestSnapshot,
                        onBeforeCallMain: async (mod) => {
                            if (myGen !== launchGen) {
                                throw new Error('Launch canceled');
                            }
                            const memstickDir =
                                typeof mod.ccall === 'function' && typeof mod._ppsspp_stream_get_memstick_dir === 'function'
                                    ? mod.ccall('ppsspp_stream_get_memstick_dir', 'string')
                                    : '/memstick';
                            const sync = createMemstickSync({
                                mod,
                                workerB: myWorkerB,
                                memstickDir,
                                onWarning: (msg) => {
                                    if (myGen === launchGen) setWarnBadge(msg);
                                },
                            });
                            await sync.hydrate();
                            if (myGen !== launchGen) {
                                sync.destroy();
                                throw new Error('Launch canceled');
                            }
                            if (memstickSync) memstickSync.destroy();
                            memstickSync = sync;
                            window.__ppssppMemstickSync = sync;
                            sync.installHook();
                        },
                        onFrame: (_, mod) => {
                            inputBridge?.poll();
                            audioBridge?.pump(mod);
                        },
                        onFirstFrame: () => {
                            if (myGen === launchGen) onHideBanner();
                        },
                        onShutdownComplete: () => {
                            if (myGen === launchGen) exitToMenu();
                        },
                        onFatal: (msg) => {
                            if (myGen === launchGen) setWarnBadge(msg || 'WebGL2 Error');
                        },
                    });
                    if (myGen !== launchGen) {
                        await host.shutdown();
                        return;
                    }
                    coreHost = host;
                    if (inputBridge) inputBridge.destroy();
                    inputBridge = createInputBridge({
                        target: window,
                        getModule: () => coreHost?.getModule(),
                    });
                    window.__ppssppInputBridge = inputBridge;
                    window.__ppssppCoreHost = host;
                } catch (err) {
                    if (myGen === launchGen) {
                        setWarnBadge(err?.message || 'WebGL2 Boot Error');
                    }
                }
            } else if (type === 'HUD_SNAPSHOT') {
                latestSnapshot = snapshot || e.data;
                onHudSnapshot(latestSnapshot);
            } else if (type === 'BUILD_ROTATED') {
                setWarnBadge('Build Updated — Reload');
            } else if (type === 'FATAL') {
                setWarnBadge(`Worker Err: ${reason}`);
            }
        };

        myWorkerA.postMessage({ type: 'PORT', port: ch.port1 }, [ch.port1]);
        myWorkerB.postMessage({ type: 'PORT', port: ch.port2, gameId: game.id }, [ch.port2]);
    }

    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            if (audioBridge) audioBridge.suspend().catch(() => {});
            if (memstickSync) memstickSync.flush('visibility').catch(() => {});
            if (workerB) workerB.postMessage({ type: 'FLUSH_TELEMETRY', reason: 'pagehide' });
        } else if (document.visibilityState === 'visible') {
            if (audioBridge && coreHost) audioBridge.resume().catch(() => {});
        }
    }

    function handlePageHide() {
        if (audioBridge) audioBridge.close().catch(() => {});
    }

    return {
        launchGame,
        exitToMenu,
        handleVisibilityChange,
        handlePageHide,
        getHudContext() {
            return {
                storageMode: opfsMode,
                gpuStatus: coreHost ? `WebGL2 (${coreHost.getFrameCount()}f)` : 'WebGL2 Target',
                vramLabel: `Unified Slab (${activePoolMb} MB)`,
            };
        },
        getLatestSnapshot() {
            return latestSnapshot;
        },
    };
}
