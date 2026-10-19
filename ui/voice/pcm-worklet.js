// Mic -> 20 ms frames of 16-bit mono PCM (+ loudness) for push-to-talk.
// Runs on the audio thread; the AudioContext is created at 16 kHz, so the
// browser resamples the mic for us.
const FRAME = 320; // 20 ms at 16 kHz

class Pcm16 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(FRAME);
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sum += s * s;
      if (this.n === FRAME) {
        const out = this.buf.slice(0);
        this.port.postMessage(
          { pcm: out.buffer, rms: Math.sqrt(this.sum / FRAME) },
          [out.buffer],
        );
        this.n = 0;
        this.sum = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm16', Pcm16);
