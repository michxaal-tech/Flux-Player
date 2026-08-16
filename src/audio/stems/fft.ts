import FFT from "fft.js";

/**
 * Complex FFT for N = 6144 (the MDX-Net STFT size, not a power of two).
 * One Cooley-Tukey radix-3 decimation step over three 2048-point fft.js
 * transforms: X[k] = X0[k%M] + W^k·X1[k%M] + W^2k·X2[k%M].
 * Buffers are interleaved complex [re0, im0, re1, im1, …].
 */
export const N = 6144;
const M = 2048;

export class Fft6144 {
  private sub = new FFT(M);
  private twRe = new Float64Array(N);
  private twIm = new Float64Array(N);
  private s0 = new Float64Array(2 * M);
  private s1 = new Float64Array(2 * M);
  private s2 = new Float64Array(2 * M);
  private o0 = new Float64Array(2 * M);
  private o1 = new Float64Array(2 * M);
  private o2 = new Float64Array(2 * M);
  private tmp = new Float64Array(2 * N);

  constructor() {
    for (let k = 0; k < N; k++) {
      this.twRe[k] = Math.cos((-2 * Math.PI * k) / N);
      this.twIm[k] = Math.sin((-2 * Math.PI * k) / N);
    }
  }

  transform(out: Float64Array, inp: Float64Array): void {
    const { s0, s1, s2, o0, o1, o2, twRe, twIm } = this;
    for (let n = 0; n < M; n++) {
      const b = 6 * n;
      s0[2 * n] = inp[b];
      s0[2 * n + 1] = inp[b + 1];
      s1[2 * n] = inp[b + 2];
      s1[2 * n + 1] = inp[b + 3];
      s2[2 * n] = inp[b + 4];
      s2[2 * n + 1] = inp[b + 5];
    }
    this.sub.transform(o0, s0);
    this.sub.transform(o1, s1);
    this.sub.transform(o2, s2);
    for (let k = 0; k < N; k++) {
      const km = k & (M - 1);
      const k2 = (2 * k) % N;
      const w1r = twRe[k], w1i = twIm[k];
      const w2r = twRe[k2], w2i = twIm[k2];
      const x1r = o1[2 * km], x1i = o1[2 * km + 1];
      const x2r = o2[2 * km], x2i = o2[2 * km + 1];
      out[2 * k] = o0[2 * km] + w1r * x1r - w1i * x1i + w2r * x2r - w2i * x2i;
      out[2 * k + 1] = o0[2 * km + 1] + w1r * x1i + w1i * x1r + w2r * x2i + w2i * x2r;
    }
  }

  /** inverse via conjugation: IFFT(x) = conj(FFT(conj(x))) / N */
  inverse(out: Float64Array, inp: Float64Array): void {
    const t = this.tmp;
    for (let i = 0; i < N; i++) {
      t[2 * i] = inp[2 * i];
      t[2 * i + 1] = -inp[2 * i + 1];
    }
    this.transform(out, t);
    for (let i = 0; i < N; i++) {
      out[2 * i] /= N;
      out[2 * i + 1] = -out[2 * i + 1] / N;
    }
  }
}
