import { RingBuffer, AudioWriter } from './vendor/ringbuf.js';

/**
 * Create a bounded 80ms AudioWorklet + SharedArrayBuffer RingBuffer bridge.
 * Constructs AudioContext synchronously so browser click-gesture activation stays intact.
 */
export async function createAudioBridge({ sampleRate = 44100 } = {}) {
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) {
        throw new Error('WebAudio AudioContext is not supported in this browser');
    }

    const audioCtx = new AudioCtx({ sampleRate, latencyHint: 'interactive' });
    const actualSampleRate = audioCtx.sampleRate || sampleRate;
    const capacityFrames = Math.ceil(actualSampleRate * 0.08);
    const sab = RingBuffer.getStorageForCapacity(capacityFrames * 2, Float32Array);
    const ring = new RingBuffer(sab, Float32Array);
    const writer = new AudioWriter(ring);

    let workletNode = null;
    let scratchPtr = 0;
    let scratchMod = null;
    let closePromise = null;
    let enqueuedFrames = 0;

    try {
        await audioCtx.audioWorklet.addModule('./audio_worklet.js');
        if (audioCtx.state === 'closed') {
            throw new Error('AudioContext closed before AudioWorklet finished loading');
        }

        workletNode = new AudioWorkletNode(audioCtx, 'ppsspp-audio-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { sab },
        });
        workletNode.connect(audioCtx.destination);
    } catch (err) {
        await audioCtx.close().catch(() => {});
        throw err;
    }

    if (audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch {
            // May require subsequent user interaction if created outside click gesture.
        }
    }

    return {
        pump(mod) {
            if (closePromise || audioCtx.state === 'closed' || !mod || typeof mod._ppsspp_stream_drain_audio !== 'function') {
                return 0;
            }
            if (!scratchPtr || scratchMod !== mod) {
                if (scratchPtr && scratchMod && typeof scratchMod._free === 'function') {
                    try { scratchMod._free(scratchPtr); } catch { /* runtime exited */ }
                }
                scratchPtr = mod._malloc(2048 * 2 * 4);
                scratchMod = mod;
            }
            if (!scratchPtr) return 0;

            const availSamples = writer.availableWrite();
            const maxFrames = Math.min(2048, Math.floor(availSamples / 2));
            if (maxFrames <= 0) return 0;

            const frames = mod._ppsspp_stream_drain_audio(scratchPtr, maxFrames, actualSampleRate);
            if (frames <= 0) return 0;

            const pcmView = new Float32Array(mod.HEAPU8.buffer, scratchPtr, frames * 2);
            const writtenSamples = writer.enqueue(pcmView);
            const writtenFrames = Math.floor(writtenSamples / 2);
            enqueuedFrames += writtenFrames;
            return writtenFrames;
        },

        async suspend() {
            if (!closePromise && audioCtx.state === 'running') {
                await audioCtx.suspend();
            }
        },

        async resume() {
            if (!closePromise && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
        },

        async close() {
            if (closePromise) return closePromise;
            closePromise = (async () => {
                if (workletNode) {
                    try { workletNode.disconnect(); } catch { /* ignore */ }
                    workletNode = null;
                }
                if (scratchPtr && scratchMod && typeof scratchMod._free === 'function') {
                    try { scratchMod._free(scratchPtr); } catch { /* ignore */ }
                }
                scratchPtr = 0;
                scratchMod = null;
                if (audioCtx.state !== 'closed') {
                    await audioCtx.close();
                }
            })();
            return closePromise;
        },

        getStats() {
            return {
                state: audioCtx.state,
                sampleRate: actualSampleRate,
                capacityFrames,
                enqueuedFrames,
            };
        },
    };
}
