// High-level instrumental generation (Route B: fully on-device).
// Downloads the MDX-Net model once (cached in persistent storage), decodes
// the track, runs separation in a Web Worker, and stores the instrumental
// as an alternate audio blob for the track.
import { blobStore, cacheUrl } from "../../store/blobStore";
import { useStore } from "../../store/useStore";
import type { Track } from "../../types";
import { encodeWav } from "../encoders";

// Overridable so tests / self-hosted deployments can serve the model themselves.
const MODEL_URL =
  (globalThis as { __FLUX_MODEL_URL?: string }).__FLUX_MODEL_URL ??
  "https://huggingface.co/seanghay/uvr_models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx";
const MODEL_KEY = "model-mdx-inst-hq3";
const MODEL_SIZE = 66759214;
// self-hosted ORT wasm runtime (public/ort/) — works offline, no CDN
const ORT_WASM_BASE = new URL(`${import.meta.env.BASE_URL}ort/`, location.href).href;

async function ensureModel(onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const cached = await blobStore.get(MODEL_KEY);
  if (cached) return cached.arrayBuffer();
  const resp = await fetch(MODEL_URL);
  if (!resp.ok || !resp.body) throw new Error(`model download failed (${resp.status})`);
  const total = Number(resp.headers.get("content-length")) || MODEL_SIZE;
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const blob = new Blob(chunks as BlobPart[]);
  await blobStore.put(MODEL_KEY, blob).catch(() => {});
  return blob.arrayBuffer();
}

export async function generateInstrumental(tr: Track): Promise<void> {
  const setP = (msg: string) => useStore.setState({ stemProgress: msg });
  if (useStore.getState().stemProgress) return;
  try {
    setP("Loading AI model…");
    const modelBuf = await ensureModel((p) => setP(`Downloading AI model… ${Math.round(p * 100)}% (one time)`));

    setP("Decoding audio…");
    const blob = await blobStore.get(tr.fileId);
    if (!blob) throw new Error("audio missing from storage");
    const ab = await blob.arrayBuffer();
    const decodeCtx = new OfflineAudioContext(2, 44100, 44100);
    const buf = await decodeCtx.decodeAudioData(ab);
    const len = Math.ceil(buf.duration * 44100);
    const rctx = new OfflineAudioContext(2, len, 44100);
    const src = rctx.createBufferSource();
    src.buffer = buf;
    src.connect(rctx.destination);
    src.start();
    const rendered = await rctx.startRendering();
    const left = rendered.getChannelData(0).slice();
    const right = (rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : rendered.getChannelData(0)).slice();

    setP("Separating… 0%");
    const worker = new Worker(new URL("./stemWorker.ts", import.meta.url), { type: "module" });
    const result = await new Promise<{ left: Float32Array; right: Float32Array }>((resolve, reject) => {
      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === "progress") setP(`Separating… ${Math.round(d.p * 100)}%`);
        else if (d.type === "done") resolve(d);
        else if (d.type === "error") reject(new Error(d.message));
      };
      worker.onerror = (ev) => reject(new Error(ev.message || "worker failed"));
      worker.postMessage({ modelBuf, left, right, wasmBase: ORT_WASM_BASE }, [modelBuf, left.buffer, right.buffer]);
    }).finally(() => worker.terminate());

    setP("Saving instrumental…");
    const octx = new OfflineAudioContext(2, result.left.length, 44100);
    const outBuf = octx.createBuffer(2, result.left.length, 44100);
    outBuf.copyToChannel(result.left, 0);
    outBuf.copyToChannel(result.right, 1);
    const wav = encodeWav(outBuf);
    cacheUrl(`inst-${tr.fileId}`, wav);
    await blobStore.put(`inst-${tr.fileId}`, wav);
    useStore.getState().updateTrack(tr.id, { hasInst: true });
    setP("");
  } catch (e) {
    console.error("Instrumental generation failed:", e);
    setP("");
    alert(`Instrumental failed: ${e instanceof Error ? e.message : e}`);
  }
}
