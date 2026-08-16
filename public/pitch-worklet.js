// Granular (dual-tap doppler delay) pitch shifter — the classic Web Audio
// approach: two read taps sweep a ring buffer at a rate offset of (1 - ratio),
// half a grain apart, crossfaded by triangle windows. Pitch changes, tempo
// doesn't. Registered as "flux-pitch"; `pitch` is in semitones.
class FluxPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "pitch", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" }];
  }

  constructor() {
    super();
    this.bufSize = 16384;
    this.buffers = [];
    this.writePos = 0;
    this.grain = 3200; // ~72ms at 44.1k — good compromise for music
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp.length || !out.length) return true;
    const semis = parameters.pitch[0];
    const ratio = Math.pow(2, semis / 12);
    const N = out[0].length;
    const gs = this.grain;
    const D = gs * (1 - ratio);
    const mod = gs * Math.max(1, ratio) + 4;
    const startWp = this.writePos;
    const startPh = this.phase;

    for (let ch = 0; ch < out.length; ch++) {
      if (!this.buffers[ch]) this.buffers[ch] = new Float32Array(this.bufSize);
      const buf = this.buffers[ch];
      const src = inp[ch] || inp[0];
      const dst = out[ch];
      let wp = startWp;
      let ph = startPh;
      for (let i = 0; i < N; i++) {
        buf[wp] = src ? src[i] : 0;
        let acc = 0;
        for (let tap = 0; tap < 2; tap++) {
          const p = (ph + tap * 0.5) % 1;
          let delay = p * D;
          delay = ((delay % mod) + mod) % mod;
          const gain = 1 - Math.abs(2 * p - 1); // triangle crossfade
          let rp = wp - 2 - delay;
          rp = ((rp % this.bufSize) + this.bufSize) % this.bufSize;
          const i0 = Math.floor(rp);
          const frac = rp - i0;
          const s0 = buf[i0];
          const s1 = buf[(i0 + 1) % this.bufSize];
          acc += (s0 + (s1 - s0) * frac) * gain;
        }
        dst[i] = acc;
        wp = (wp + 1) % this.bufSize;
        ph = (ph + 1 / gs) % 1;
      }
    }
    this.writePos = (startWp + N) % this.bufSize;
    this.phase = (startPh + N / gs) % 1;
    return true;
  }
}

registerProcessor("flux-pitch", FluxPitchProcessor);
