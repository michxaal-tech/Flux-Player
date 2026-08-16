// Web Worker that runs MDX-Net source separation off the main thread so the
// player and visualizer stay smooth while a track is being processed.
import * as ort from "onnxruntime-web/wasm";
import { Fft6144 } from "./fft";
import { DIM_F, DIM_T, SEG_SAMPLES, istftSegment, stftSegment } from "./stft";

interface Req {
  modelBuf: ArrayBuffer;
  left: Float32Array;
  right: Float32Array;
  /** absolute base URL for the ORT wasm binaries */
  wasmBase: string;
}

const PLANE = DIM_F * DIM_T;
/** overlap between neighbouring segments, cross-faded to hide seams */
const OVERLAP = 16384;

self.onmessage = async (e: MessageEvent<Req>) => {
  const { modelBuf, left, right, wasmBase } = e.data;
  try {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = wasmBase;
    const session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ["wasm"],
    });

    const len = left.length;
    const step = SEG_SAMPLES - OVERLAP;
    const nSegs = Math.max(1, Math.ceil((len - OVERLAP) / step));
    const outL = new Float32Array(len);
    const outR = new Float32Array(len);
    const acc = new Float32Array(len);
    const fft = new Fft6144();
    const segL = new Float32Array(SEG_SAMPLES);
    const segR = new Float32Array(SEG_SAMPLES);
    const spec = new Float32Array(4 * PLANE);

    for (let s = 0; s < nSegs; s++) {
      const start = s * step;
      segL.fill(0);
      segR.fill(0);
      const avail = Math.min(SEG_SAMPLES, len - start);
      segL.set(left.subarray(start, start + avail));
      segR.set(right.subarray(start, start + avail));

      // layout: [L_re, L_im, R_re, R_im], each plane indexed [f * DIM_T + t]
      stftSegment(segL, fft, spec.subarray(0, PLANE), spec.subarray(PLANE, 2 * PLANE));
      stftSegment(segR, fft, spec.subarray(2 * PLANE, 3 * PLANE), spec.subarray(3 * PLANE, 4 * PLANE));

      const input = new ort.Tensor("float32", spec, [1, 4, DIM_F, DIM_T]);
      const res = await session.run({ [session.inputNames[0]]: input });
      const o = res[session.outputNames[0]].data as Float32Array;

      const wavL = istftSegment(o.subarray(0, PLANE) as Float32Array, o.subarray(PLANE, 2 * PLANE) as Float32Array, fft);
      const wavR = istftSegment(o.subarray(2 * PLANE, 3 * PLANE) as Float32Array, o.subarray(3 * PLANE, 4 * PLANE) as Float32Array, fft);

      for (let i = 0; i < avail; i++) {
        // trapezoid blend: ramp over the overlap zones
        const w = Math.min(1, (i + 1) / OVERLAP, (SEG_SAMPLES - i) / OVERLAP);
        const idx = start + i;
        outL[idx] += wavL[i] * w;
        outR[idx] += wavR[i] * w;
        acc[idx] += w;
      }
      (self as unknown as Worker).postMessage({ type: "progress", p: (s + 1) / nSegs });
    }
    for (let i = 0; i < len; i++) {
      if (acc[i] > 1e-6) {
        outL[i] /= acc[i];
        outR[i] /= acc[i];
      }
    }
    (self as unknown as Worker).postMessage({ type: "done", left: outL, right: outR }, [
      outL.buffer,
      outR.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
