// Offline track analysis: decode the file once and build a timeline of energy,
// onsets, a beat grid, percussive hits, drops and section changes.
//
// Live FFT can only react — it sees a beat as it arrives, through a smoothing
// window, and can never know what is coming. Analysing ahead of time gives
// exact beat positions (fitted across the whole track rather than guessed from
// the last few seconds) and lets the visuals anticipate a drop.
//
// The heavy pass runs in a Web Worker. Inline it starved the audio callback
// and made playback crackle — badly so with reverb, which is expensive on its
// own — because hundreds of milliseconds of FFT sat between yields.
import { blobStore, getUrl } from "../store/blobStore";
import { getCurrentTrack, useStore } from "../store/useStore";
import type { AnalysisResult } from "./analysisWorker";

export interface Analysis extends AnalysisResult {
  version: number;
  duration: number;
}

const KEY = (fileId: string) => `anal-${fileId}`;
const VERSION = 9; // bump invalidates cached analyses after a detector change

export async function loadAnalysis(fileId: string): Promise<Analysis | null> {
  try {
    const b = await blobStore.get(KEY(fileId));
    if (!b) return null;
    const a = JSON.parse(await b.text()) as Analysis;
    return a.version === VERSION ? a : null;
  } catch {
    return null;
  }
}

export async function clearAnalysis(fileId: string): Promise<void> {
  await blobStore.del(KEY(fileId)).catch(() => {});
}

/** Decodes the audio and hands the samples to the worker. */
async function runAnalysis(fileId: string, onProgress: (msg: string) => void, deep = false): Promise<Analysis | null> {
  const url = await getUrl(fileId);
  if (!url) return null;
  onProgress("decoding…");
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // decodeAudioData isn't available to workers, so decoding stays here — but
  // it's a single native call, not a long JS loop, so it doesn't stall audio
  const ac = new Ctx();
  let audio: AudioBuffer;
  try {
    audio = await ac.decodeAudioData(buf.slice(0));
  } catch {
    ac.close();
    return null;
  }
  const rate = audio.sampleRate;
  const duration = audio.duration;
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const d = audio.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i];
  }
  if (audio.numberOfChannels > 1) for (let i = 0; i < n; i++) mono[i] /= audio.numberOfChannels;
  ac.close();

  onProgress(deep ? "deep analysing… 0%" : "analysing… 0%");
  const worker = new Worker(new URL("./analysisWorker.ts", import.meta.url), { type: "module" });
  const result = await new Promise<AnalysisResult | null>((resolve) => {
    worker.onmessage = (e: MessageEvent<{ type: string; value?: number; result?: AnalysisResult }>) => {
      const d = e.data;
      if (d.type === "progress") onProgress(`${deep ? "deep " : ""}analysing… ${Math.round((d.value ?? 0) * 100)}%`);
      else if (d.type === "done") resolve(d.result ?? null);
      else resolve(null);
    };
    worker.onerror = () => resolve(null);
    // transfer the samples so nothing is copied
    worker.postMessage({ mono: mono.buffer, rate, deep }, [mono.buffer]);
  });
  worker.terminate();
  if (!result) return null;

  const analysis: Analysis = { ...result, version: VERSION, duration };
  await blobStore.put(KEY(fileId), new Blob([JSON.stringify(analysis)], { type: "application/json" }));
  return analysis;
}

const inFlight = new Map<string, Promise<Analysis | null>>();
/** whether the job in `inFlight` for a file is a deep one */
const inFlightDeep = new Map<string, boolean>();
const inFlightId = new Map<string, number>();
let jobSeq = 0;

/**
 * Analyses a track if it isn't already cached. `force` re-runs it.
 *
 * A cached *fast* analysis does not satisfy a request for a deep one — the
 * whole point of asking is to get the better timing — so a deep request
 * re-runs unless what is cached is already deep.
 */
export async function ensureAnalysis(fileId: string, force = false, deep = false): Promise<Analysis | null> {
  // A job already running for this file is only an answer if it is the same
  // kind of job. A deep or forced request arriving while the automatic fast
  // pass runs used to be handed the fast result — so it waits for that pass
  // to land (and store its result) and then runs its own, rather than racing it.
  const existing = inFlight.get(fileId);
  if (existing) {
    if (!force && inFlightDeep.get(fileId) === deep) return existing;
    await existing.catch(() => null);
  }
  if (force) await clearAnalysis(fileId);
  else {
    const cached = await loadAnalysis(fileId);
    if (cached && (!deep || cached.deep)) return cached;
    if (cached) await clearAnalysis(fileId);
  }
  const again = inFlight.get(fileId);
  if (again && !force && inFlightDeep.get(fileId) === deep) return again;

  const id = ++jobSeq;
  const job = (async () => {
    useStore.setState({ analyzeStatus: "decoding…" });
    try {
      const a = await runAnalysis(fileId, (msg) => useStore.setState({ analyzeStatus: msg }), deep);
      useStore.setState({ analyzeStatus: a ? "" : "couldn't analyse that file" });
      if (!a) setTimeout(() => useStore.setState({ analyzeStatus: "" }), 4000);
      return a;
    } catch {
      useStore.setState({ analyzeStatus: "analysis failed" });
      setTimeout(() => useStore.setState({ analyzeStatus: "" }), 4000);
      return null;
    } finally {
      if (inFlightId.get(fileId) === id) { inFlight.delete(fileId); inFlightDeep.delete(fileId); inFlightId.delete(fileId); }
    }
  })();
  inFlight.set(fileId, job);
  inFlightDeep.set(fileId, deep);
  inFlightId.set(fileId, id);
  return job;
}

// Debug handle, companion to `__flux` and `__fluxThemes`: analyses whatever is
// playing and hands back the result. A test cannot reach the module graph of a
// production bundle, and the alternative — running these checks against the dev
// server — would be testing a different build from the one that ships.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__fluxAnalyse = (deep: boolean) => {
    const tr = getCurrentTrack(useStore.getState());
    return tr ? ensureAnalysis(tr.fileId, true, deep) : Promise.resolve(null);
  };
}
