import { RingBuffer, AudioReader, deinterleave } from './vendor/ringbuf.js';

class PpssppAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const { sab } = options.processorOptions;
        const ring = new RingBuffer(sab, Float32Array);
        this.reader = new AudioReader(ring);
        this.staging = new Float32Array(128 * 2);
        this.underruns = 0;
    }

    process(_inputs, outputs) {
        const out = outputs[0];
        if (!out || out.length < 2) return true;
        const got = this.reader.dequeue(this.staging);
        if (got < this.staging.length) {
            this.staging.fill(0, got);
            if (got === 0) this.underruns++;
        }
        deinterleave(this.staging, out);
        return true;
    }
}

registerProcessor('ppsspp-audio-processor', PpssppAudioProcessor);
