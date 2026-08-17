// Offline track analysis: decode the whole file once and build a timeline of
// energy, onsets, a beat grid and drop points.
//
// Live FFT can only ever react — it sees a beat as it arrives, through a
// smoothing window, and can never know what is coming. Analysing ahead of
// time gives exact beat positions (fitted to a tempo grid over the whole
// track rather than guessed from the last few seconds) and lets the visuals
// anticipate a drop instead of catching up to it.
import FFT from "fft.js";
import { blobStore, getUrl } from "../store/blobStore";
import { useStore } from "../store/useStore";

const WIN = 2048;
const HOP = 512;
/** timeline resolution — one slot per ~11.6ms at 44.1k */
export interface Analysis {
  version: number;
  /** frames per second of the band arrays */
  fps: number;
  duration: number;
  bpm: number;
  bass: number[];
  mid: number[];
  treb: number[];
  rms: number[];
  /** beat times in seconds */
  beats: number[];
  /** times where the track lifts hard out of a quieter passage */
  drops: number[];
}

const KEY = (fileId: string) => `anal-${fileId}`;
const VERSION = 2; // bump to re-analyse cached tracks after a detector change

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

async function saveAnalysis(fileId: string, a: Analysis): Promise<void> {
  await blobStore.put(KEY(fileId), new Blob([JSON.stringify(a)], { type: "application/json" }));
}

/** median of a copy — used for the adaptive onset threshold */
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const c = [...arr].sort((x, y) => x - y);
  return c[c.length >> 1];
}

/** Yields to the event loop so a long analysis never freezes the UI. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

export async function analyzeTrack(
  fileId: string,
  onProgress?: (msg: string) => void
): Promise<Analysis | null> {
  const cached = await loadAnalysis(fileId);
  if (cached) return cached;

  const url = await getUrl(fileId);
  if (!url) return null;
  onProgress?.("decoding…");
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // mono mixdown
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const d = audio.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i];
  }
  if (audio.numberOfChannels > 1) for (let i = 0; i < n; i++) mono[i] /= audio.numberOfChannels;
  ac.close();

  const fft = new FFT(WIN);
  const out = fft.createComplexArray();
  // fft.js takes an interleaved complex input; the imaginary half stays zero
  const cin = fft.createComplexArray();
  const win = new Float32Array(WIN);
  for (let i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1)); // hann

  const frames = Math.max(1, Math.floor((n - WIN) / HOP));
  const bass: number[] = [], mid: number[] = [], treb: number[] = [], rms: number[] = [], flux: number[] = [];
  const bins = WIN / 2;
  const hzPerBin = rate / WIN;
  const bassEnd = Math.max(2, Math.round(250 / hzPerBin));
  const midEnd = Math.max(bassEnd + 1, Math.round(2500 / hzPerBin));
  const prevMag = new Float32Array(bins);
  const mag = new Float32Array(bins);
  const frame = new Float32Array(WIN);

  onProgress?.("analysing…");
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let sum = 0;
    for (let i = 0; i < WIN; i++) {
      const v = mono[off + i];
      frame[i] = v * win[i];
      sum += v * v;
    }
    for (let i = 0; i < WIN; i++) { cin[i * 2] = frame[i]; cin[i * 2 + 1] = 0; }
    fft.transform(out, cin);
    let b = 0, m = 0, tr = 0, fl = 0;
    for (let k = 1; k < bins; k++) {
      const re = out[k * 2], im = out[k * 2 + 1];
      const mg = Math.sqrt(re * re + im * im);
      mag[k] = mg;
      if (k < bassEnd) b += mg;
      else if (k < midEnd) m += mg;
      else tr += mg;
      const d = mg - prevMag[k];
      if (d > 0) fl += d;
      prevMag[k] = mg;
    }
    bass.push(b / bassEnd);
    mid.push(m / Math.max(1, midEnd - bassEnd));
    treb.push(tr / Math.max(1, bins - midEnd));
    rms.push(Math.sqrt(sum / WIN));
    flux.push(fl / bins);
    if ((f & 511) === 0) {
      onProgress?.(`analysing… ${Math.round((f / frames) * 100)}%`);
      await breathe();
    }
  }

  // normalise the bands to 0..1 against a high percentile so quiet tracks
  // still drive the visuals fully
  const normalise = (arr: number[]) => {
    const sorted = [...arr].sort((a, b2) => a - b2);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 1;
    for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, arr[i] / p95);
  };
  normalise(bass); normalise(mid); normalise(treb); normalise(rms);

  const fps = rate / HOP;

  // ── tempo: autocorrelate the onset envelope over plausible beat periods ──
  onProgress?.("finding the beat…");
  const med = median(flux);
  const dev = median(flux.map((v) => Math.abs(v - med))) || 1e-6;
  const onset = flux.map((v) => Math.max(0, (v - med) / dev));

  const minLag = Math.floor(fps * 60 / 200); // 200 bpm
  const maxLag = Math.ceil(fps * 60 / 60);   // 60 bpm
  let bestLag = minLag, bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < onset.length; i++) acc += onset[i] * onset[i + lag];
    // normalise by overlap so long lags aren't penalised
    const sc = acc / (onset.length - lag);
    if (sc > bestScore) { bestScore = sc; bestLag = lag; }
  }
  let bpm = Math.round((60 * fps) / bestLag);
  // fold into a musical range
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  bpm = Math.round(bpm);
  const period = (60 / bpm) * fps;

  // best phase for the grid: the offset whose grid lands on the most onset energy
  let bestPhase = 0, bestPhaseScore = -1;
  for (let p = 0; p < Math.floor(period); p++) {
    let acc = 0;
    for (let i = p; i < onset.length; i += period) acc += onset[Math.round(i)] ?? 0;
    if (acc > bestPhaseScore) { bestPhaseScore = acc; bestPhase = p; }
  }

  // emit beats on the grid, snapped to a nearby onset peak where one exists
  const beats: number[] = [];
  const snap = Math.max(1, Math.round(period * 0.12));
  for (let i = bestPhase; i < onset.length; i += period) {
    const centre = Math.round(i);
    let bi = centre, bv = -1;
    for (let k = Math.max(0, centre - snap); k <= Math.min(onset.length - 1, centre + snap); k++) {
      if (onset[k] > bv) { bv = onset[k]; bi = k; }
    }
    beats.push(+(bi / fps).toFixed(3));
  }

  // ── drops: a sustained lift in low-end after a calmer passage ──
  // Thresholds are relative to the track's own loudness: absolute cutoffs
  // missed real drops entirely, because a kick-driven bass band spends most of
  // each window decaying and averages far lower than it sounds.
  const drops: number[] = [];
  const meanBass = bass.reduce((a, b2) => a + b2, 0) / Math.max(1, bass.length);
  const win2 = Math.round(fps * 1.5);
  for (let i = win2 * 2; i < bass.length - win2; i += Math.round(fps * 0.25)) {
    let before = 0, after = 0;
    for (let k = i - win2 * 2; k < i; k++) before += bass[k];
    for (let k = i; k < i + win2; k++) after += bass[k];
    before /= win2 * 2; after /= win2;
    if (before < meanBass * 0.75 && after > before * 1.7 && after > meanBass * 1.05) {
      const t = +(i / fps).toFixed(2);
      if (!drops.length || t - drops[drops.length - 1] > 6) drops.push(t);
    }
  }

  const round3 = (a: number[]) => a.map((v) => +v.toFixed(3));
  const analysis: Analysis = {
    version: VERSION, fps, duration, bpm,
    bass: round3(bass), mid: round3(mid), treb: round3(treb), rms: round3(rms),
    beats, drops,
  };
  await saveAnalysis(fileId, analysis);
  onProgress?.("");
  return analysis;
}

/** Kicks off analysis for a track if it isn't cached, reporting progress. */
export async function ensureAnalysis(fileId: string): Promise<Analysis | null> {
  const cached = await loadAnalysis(fileId);
  if (cached) return cached;
  useStore.setState({ analyzeStatus: "decoding…" });
  try {
    const a = await analyzeTrack(fileId, (msg) => useStore.setState({ analyzeStatus: msg }));
    useStore.setState({ analyzeStatus: a ? "" : "couldn't analyse that file" });
    if (!a) setTimeout(() => useStore.setState({ analyzeStatus: "" }), 4000);
    return a;
  } catch {
    useStore.setState({ analyzeStatus: "analysis failed" });
    setTimeout(() => useStore.setState({ analyzeStatus: "" }), 4000);
    return null;
  }
}
