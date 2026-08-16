// STFT/iSTFT matching UVR's MDX-Net pipeline: torch.stft(n_fft=6144,
// hop=1024, hann window, center=True with reflect padding), keeping the
// first dim_f=3072 of 3073 bins.
import { Fft6144, N } from "./fft";

export const N_FFT = N;
export const HOP = 1024;
export const DIM_F = 3072;
export const DIM_T = 256;
/** raw samples per model segment: hop * (frames - 1) */
export const SEG_SAMPLES = HOP * (DIM_T - 1);

const HALF = N_FFT / 2;

const win = new Float64Array(N_FFT);
for (let n = 0; n < N_FFT; n++) win[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / N_FFT));

/** center-reflect-pad a segment into a Float64Array of SEG_SAMPLES + N_FFT */
function padReflect(x: Float32Array): Float64Array {
  const out = new Float64Array(SEG_SAMPLES + N_FFT);
  for (let i = 0; i < SEG_SAMPLES; i++) out[HALF + i] = x[i];
  for (let i = 0; i < HALF; i++) {
    out[HALF - 1 - i] = x[Math.min(i + 1, SEG_SAMPLES - 1)];
    out[HALF + SEG_SAMPLES + i] = x[Math.max(SEG_SAMPLES - 2 - i, 0)];
  }
  return out;
}

/** analyze one segment into re/im planes laid out [f * DIM_T + t] */
export function stftSegment(x: Float32Array, fft: Fft6144, outRe: Float32Array, outIm: Float32Array): void {
  const padded = padReflect(x);
  const inp = new Float64Array(2 * N_FFT);
  const out = new Float64Array(2 * N_FFT);
  for (let t = 0; t < DIM_T; t++) {
    const start = t * HOP;
    for (let n = 0; n < N_FFT; n++) {
      inp[2 * n] = padded[start + n] * win[n];
      inp[2 * n + 1] = 0;
    }
    fft.transform(out, inp);
    for (let f = 0; f < DIM_F; f++) {
      outRe[f * DIM_T + t] = out[2 * f];
      outIm[f * DIM_T + t] = out[2 * f + 1];
    }
  }
}

/** synthesize one segment from re/im planes (missing Nyquist bin treated as 0) */
export function istftSegment(specRe: Float32Array, specIm: Float32Array, fft: Fft6144): Float32Array {
  const acc = new Float64Array(SEG_SAMPLES + N_FFT);
  const wsum = new Float64Array(SEG_SAMPLES + N_FFT);
  const inp = new Float64Array(2 * N_FFT);
  const out = new Float64Array(2 * N_FFT);
  for (let t = 0; t < DIM_T; t++) {
    // bins 0..DIM_F-1 direct, bin HALF zero, upper half conjugate mirror
    for (let f = 0; f < DIM_F; f++) {
      inp[2 * f] = specRe[f * DIM_T + t];
      inp[2 * f + 1] = specIm[f * DIM_T + t];
    }
    inp[2 * HALF] = 0;
    inp[2 * HALF + 1] = 0;
    for (let f = 1; f < HALF; f++) {
      inp[2 * (N_FFT - f)] = inp[2 * f];
      inp[2 * (N_FFT - f) + 1] = -inp[2 * f + 1];
    }
    fft.inverse(out, inp);
    const start = t * HOP;
    for (let n = 0; n < N_FFT; n++) {
      acc[start + n] += out[2 * n] * win[n];
      wsum[start + n] += win[n] * win[n];
    }
  }
  const res = new Float32Array(SEG_SAMPLES);
  for (let i = 0; i < SEG_SAMPLES; i++) {
    const w = wsum[HALF + i];
    res[i] = w > 1e-8 ? acc[HALF + i] / w : 0;
  }
  return res;
}
