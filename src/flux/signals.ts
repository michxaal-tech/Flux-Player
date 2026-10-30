// Music signals: what the stage, the ambient UI and anything else reactive is
// allowed to know about the music, computed once per frame on the shared clock.
//
// The distinction this module exists to keep is between things that are
// measured and things that are inferred:
//
//   level / bands / spectrum — measured loudness, always available with audio
//   transient                — measured onsets (spectral flux), always available
//   energy                   — slow musical intensity, measured over seconds
//   tempo + beat phase       — INFERRED, so it carries a confidence, and below a
//                              threshold nothing pretends to know where the beat is
//
// Beat sources, best first:
//   1. the offline analysis timeline (exact beat times fitted over the whole
//      track, with its own confidence) sampled at the audible clock position;
//   2. a live autocorrelation tracker over the onset envelope, capped at a
//      lower confidence because it has only heard the last ten seconds;
//   3. nothing — and consumers fall back to energy and transients.
//
// Everything is indexed by *audible media time*, not wall time, so pausing,
// seeking and playback-rate changes are handled by construction: a beat is a
// position in the song, and the clock knows where in the song we are.
import { engine } from "../audio/engine";
import type { Analysis } from "../audio/analysis";
import { clock } from "./clock";

export const SPEC_BANDS = 48;

export interface Signals {
  /** audible media time, seconds */
  t: number;
  /** wall seconds since last frame (clamped) */
  dt: number;
  playing: boolean;
  /** real audio data is flowing (false when paused, silent, or YouTube) */
  live: boolean;
  /** fast loudness, 0..1 */
  level: number;
  /** slow musical intensity, 0..1 — calm verse vs driving chorus */
  energy: number;
  sub: number; bass: number; lowMid: number; mid: number; high: number; air: number;
  /** log-spaced, normalised, smoothed 0..1 */
  spectrum: Float32Array;
  /** 256-sample waveform, -1..1 */
  wave: Float32Array;
  /** onset envelope 0..1, jumps on a detected onset and decays over ~150ms */
  transient: number;
  /** an onset was detected this frame */
  onset: boolean;
  bpm: number;
  /** 0..1 — how far beat phase can be trusted */
  confidence: number;
  tempoSource: "analysis" | "live" | "none";
  /** position within the current beat, 0..1 (meaningful only with confidence) */
  phase: number;
  /** position within the bar, 0..1 */
  barPhase: number;
  /** a beat boundary was crossed this frame (never fired by a seek) */
  onBeat: boolean;
  onBar: boolean;
  beatIndex: number;
  /** beat envelope, 1 at the beat decaying through it */
  pulse: number;
  /** drop envelope from the analysis, 0..1 */
  drop: number;
  /** how many sections have gone by (analysis only) */
  section: number;
}

export const sig: Signals = {
  t: 0, dt: 0, playing: false, live: false, level: 0, energy: 0.2,
  sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0,
  spectrum: new Float32Array(SPEC_BANDS), wave: new Float32Array(256),
  transient: 0, onset: false, bpm: 0, confidence: 0, tempoSource: "none",
  phase: 0, barPhase: 0, onBeat: false, onBar: false, beatIndex: -1, pulse: 0, drop: 0, section: 0,
};

if (typeof window !== "undefined") (window as unknown as { __fluxSig: Signals }).__fluxSig = sig;

// ── analysis timeline ──────────────────────────────────────────────────────
let anal: Analysis | null = null;
let analConf = 0;
/** per beat: how well the beats around it are backed by real onsets, 0..1 */
let beatSupport: Float32Array = new Float32Array(0);
/**
 * The grid the analysis fits is one comb laid over the whole file, so it has
 * "beats" in a silent intro, a beatless breakdown, an ambient wash. What says
 * whether a stretch of it is real is whether actual onsets land on it. Each
 * beat is marked supported when a detected hit falls within 70ms, and its local
 * support is the supported fraction over the eight beats around it — so the
 * confidence follows the music section by section instead of being one number
 * for the whole track.
 */
function computeSupport(a: Analysis): { local: Float32Array; overall: number } {
  const B = a.beats, H = a.hits;
  const hit = new Uint8Array(B.length);
  let j = 0;
  for (let i = 0; i < B.length; i++) {
    while (j < H.length && H[j] < B[i] - 0.07) j++;
    if (j < H.length && Math.abs(H[j] - B[i]) <= 0.07) hit[i] = 1;
  }
  const local = new Float32Array(B.length);
  let total = 0;
  for (let i = 0; i < B.length; i++) {
    let n = 0, c = 0;
    for (let k = Math.max(0, i - 4); k <= Math.min(B.length - 1, i + 4); k++) { n++; c += hit[k]; }
    local[i] = c / n;
    total += hit[i];
  }
  return { local, overall: B.length ? total / B.length : 0 };
}
export function setAnalysis(a: Analysis | null): void {
  anal = a;
  if (a) {
    const sup = computeSupport(a);
    beatSupport = sup.local;
    // a grid that most onsets miss is not a beat, whatever its own score says
    analConf = Math.min(a.beatConf ?? a.deep?.confidence ?? 0.5, smoothstep(0.25, 0.6, sup.overall) * 1.05);
  } else {
    beatSupport = new Float32Array(0);
    analConf = 0;
  }
  lastBeatIdx = -2;
  lastBarIdx = -2;
}
export const getAnalysis = () => anal;

/** index of the last element <= t, or -1 */
function floorIndex(arr: number[], t: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

// ── live tempo tracker ─────────────────────────────────────────────────────
// Onset strength is binned at 100Hz of *media* time into a 10s ring. Every
// half second of media the autocorrelation picks a period, a comb picks the
// phase, and confidence is the normalised autocorrelation peak times how
// stable the estimate has been. It only ever drives the stage when there is no
// analysis yet (the first seconds of a track) or none is possible.
const ENV_HZ = 100;
const ENV_N = 1000;
class LiveTempo {
  env = new Float32Array(ENV_N);
  head = -1; // absolute bin index of the newest sample
  nextEval = 0;
  period = 0; // bins
  anchor = 0; // media seconds of a beat
  conf = 0;
  stable = 0;
  reset(): void { this.env.fill(0); this.head = -1; this.period = 0; this.conf = 0; this.stable = 0; this.nextEval = 0; }
  push(t: number, v: number): void {
    const bin = Math.floor(t * ENV_HZ);
    if (this.head < 0 || bin < this.head || bin - this.head > ENV_N) { this.env.fill(0); this.head = bin; }
    while (this.head < bin) { this.head++; this.env[this.head % ENV_N] = 0; }
    const k = bin % ENV_N;
    if (v > this.env[k]) this.env[k] = v;
    if (t >= this.nextEval) { this.nextEval = t + 0.5; this.evaluate(); }
  }
  private at(i: number): number { return this.env[((i % ENV_N) + ENV_N) % ENV_N]; }
  private evaluate(): void {
    const N = 800, end = this.head;
    if (end < N) { this.conf = 0; return; }
    let mean = 0;
    for (let i = end - N + 1; i <= end; i++) mean += this.at(i);
    mean /= N;
    let r0 = 0;
    for (let i = end - N + 1; i <= end; i++) { const d = this.at(i) - mean; r0 += d * d; }
    if (r0 < 1e-9) { this.conf *= 0.5; return; }
    const r = (lag: number) => {
      let acc = 0;
      for (let i = end - N + 1 + lag; i <= end; i++) acc += (this.at(i) - mean) * (this.at(i - lag) - mean);
      return acc / r0;
    };
    // 60..190 bpm → lag 31..100 bins, with a gentle prior around 120bpm so
    // half/double-time ambiguity resolves the way listeners usually tap
    let best = 0, bestS = -1, bestR = 0;
    const rs = new Float32Array(202);
    for (let lag = 28; lag <= 201; lag++) rs[lag] = r(lag);
    for (let lag = 31; lag <= 100; lag++) {
      const bpm = (60 * ENV_HZ) / lag;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
      const sc = (rs[lag] + 0.5 * rs[Math.min(201, lag * 2)]) * prior;
      if (sc > bestS) { bestS = sc; best = lag; bestR = rs[lag]; }
    }
    // parabolic refinement of the peak
    const y0 = rs[best - 1], y1 = rs[best], y2 = rs[best + 1];
    const den = y0 - 2 * y1 + y2;
    const period = best + (Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0);
    const changed = !this.period || Math.abs(period - this.period) / this.period > 0.03;
    this.stable = changed ? 0 : Math.min(4, this.stable + 1);
    this.period = this.period && !changed ? this.period * 0.8 + period * 0.2 : period;
    // phase: the comb offset that collects the most onset energy over 4s
    const P = this.period;
    let bestPhi = 0, bestC = -1;
    for (let phi = 0; phi < P; phi++) {
      let c = 0;
      for (let k = 0; k < 4 * ENV_HZ / P; k++) c += this.at(Math.round(end - phi - k * P));
      if (c > bestC) { bestC = c; bestPhi = phi; }
    }
    const beatT = (end - bestPhi) / ENV_HZ;
    const pSec = P / ENV_HZ;
    if (!changed && this.anchor) {
      // phase-locked loop: nudge the running grid toward the measured one
      let err = ((beatT - this.anchor) / pSec) % 1;
      if (err > 0.5) err -= 1;
      if (err < -0.5) err += 1;
      this.anchor += err * pSec * 0.35;
    } else this.anchor = beatT;
    const raw = Math.max(0, Math.min(1, (bestR - 0.06) / 0.3));
    this.conf = Math.min(0.78, raw * (0.35 + 0.65 * (this.stable / 4)));
  }
  bpm(): number { return this.period ? (60 * ENV_HZ) / this.period : 0; }
}
const liveTempo = new LiveTempo();

// ── per-frame state ────────────────────────────────────────────────────────
const freq = new Uint8Array(512);
const timeBuf = new Uint8Array(1024);
const rawBands = new Float32Array(SPEC_BANDS);
const prevBands = new Float32Array(SPEC_BANDS);
let bandEdges: number[] | null = null;
/** delay ring: analyser snapshots tagged with wall time, read back at the latency */
const RING = 48;
const ring = Array.from({ length: RING }, () => ({ at: 0, f: new Uint8Array(512), w: new Uint8Array(1024) }));
let ringHead = 0;
let ref = 0.25; // running loudness reference (AGC)
let fluxMean = 0.01, fluxDev = 0.01, lastOnsetT = -1;
let lastEpoch = -1;
let lastBeatIdx = -2, lastBarIdx = -2;
let lastPerf = 0;
let sensitivity = 1;
let densityAvg = 0;
let analHitIdx = -1;

export function setSensitivity(v: number): void { sensitivity = Math.max(0.2, Math.min(2, v)); }

const smooth = (cur: number, target: number, dt: number, up: number, down: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? up : down)));

function edges(sampleRate: number): number[] {
  // log spacing from 32Hz to 16kHz over the 512 bins of a 1024-point FFT
  const binHz = sampleRate / 1024;
  const out: number[] = [];
  for (let i = 0; i <= SPEC_BANDS; i++) {
    const f = 32 * Math.pow(16000 / 32, i / SPEC_BANDS);
    out.push(Math.max(1, Math.min(511, Math.round(f / binHz))));
  }
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  return out;
}

/** Advance all signals by one frame. Call once per animation frame. */
export function updateSignals(now: number): void {
  const dt = lastPerf ? Math.min(0.1, Math.max(0.001, (now - lastPerf) / 1000)) : 1 / 60;
  lastPerf = now;
  clock.tick(now);
  const t = clock.audible();
  sig.dt = dt;
  sig.t = t;
  sig.playing = clock.playing;
  sig.onset = false;
  sig.onBeat = false;
  sig.onBar = false;

  // a seek, loop or track change: forget everything that was learned on the
  // other side of it, and don't fire the beats we skipped over
  if (clock.epoch !== lastEpoch) {
    lastEpoch = clock.epoch;
    liveTempo.reset();
    lastBeatIdx = -2;
    lastBarIdx = -2;
    analHitIdx = -1;
    lastOnsetT = -1;
  }

  const n = engine.nodes;
  const haveAudio = !!n && clock.playing && clock.source === "audio" && !clock.buffering;
  let level = 0;
  if (haveAudio && n) {
    if (!bandEdges) bandEdges = edges(n.ctx.sampleRate);
    // the analyser hears audio before the speakers do: store this frame and
    // read back the one captured `latency` ago
    const slot = ring[ringHead];
    n.beatAnalyser.getByteFrequencyData(slot.f);
    n.beatAnalyser.getByteTimeDomainData(slot.w);
    slot.at = now;
    ringHead = (ringHead + 1) % RING;
    const want = now - clock.latency() * 1000;
    // newest snapshot that is at least `latency` old
    let pick = slot;
    for (let k = 0; k < RING; k++) {
      const s = ring[(ringHead - 1 - k + RING) % RING];
      if (!s.at) break;
      pick = s;
      if (s.at <= want) break;
    }
    freq.set(pick.f);
    timeBuf.set(pick.w);
    const E = bandEdges;
    let total = 0;
    for (let b = 0; b < SPEC_BANDS; b++) {
      let acc = 0;
      for (let i = E[b]; i < E[b + 1]; i++) acc += freq[i];
      const v = acc / ((E[b + 1] - E[b]) * 255);
      rawBands[b] = v;
      total += v;
    }
    let rms = 0;
    for (let i = 0; i < 1024; i += 4) { const d = (timeBuf[i] - 128) / 128; rms += d * d; }
    rms = Math.sqrt(rms / 256);
    level = Math.min(1, rms * 2.4);
    for (let i = 0; i < 256; i++) sig.wave[i] = (timeBuf[i * 4] - 128) / 128;
    // spectral flux on the log bands, half-wave rectified, low end weighted
    let flux = 0;
    for (let b = 0; b < SPEC_BANDS; b++) {
      const d = rawBands[b] - prevBands[b];
      if (d > 0) flux += d * (b < 10 ? 1.6 : 1);
      prevBands[b] = rawBands[b];
    }
    flux /= SPEC_BANDS;
    liveTempo.push(t, flux);
    fluxMean = smooth(fluxMean, flux, dt, 0.5, 0.5);
    fluxDev = smooth(fluxDev, Math.abs(flux - fluxMean), dt, 0.5, 0.5);
    densityAvg = smooth(densityAvg, flux * 30, dt, 2, 2);
    if (!anal && flux > fluxMean + 2.4 * fluxDev + 0.004 && t - lastOnsetT > 0.09) {
      lastOnsetT = t;
      sig.onset = true;
      sig.transient = Math.max(sig.transient, Math.min(1, ((flux - fluxMean) / (fluxDev * 6 + 1e-4)) * sensitivity));
    }
    // AGC: rise fast to a new loudest, sink slowly, so quiet masters still
    // move and loud ones don't pin everything at the ceiling
    const lvl = total / SPEC_BANDS;
    ref = lvl > ref ? ref + (lvl - ref) * Math.min(1, dt * 8) : Math.max(0.06, ref - dt * 0.012);
  } else {
    rawBands.fill(0);
    for (let i = 0; i < 256; i++) sig.wave[i] *= 0.9;
  }

  // ── analysis timeline: exact energy and onsets at the audible position ──
  const A = anal;
  if (A && haveAudio && t >= 0 && t <= A.duration) {
    const fi = Math.min(A.rms.length - 1, Math.max(0, Math.round(t * A.fps)));
    level = Math.max(level * 0.5, Math.min(1, A.rms[fi] * 2.6));
    // hits are the analysis' onsets; cross them in order, never on a jump
    const hi = floorIndex(A.hits, t);
    if (analHitIdx >= -1 && hi === analHitIdx + 1 && hi >= 0) {
      sig.onset = true;
      sig.transient = Math.max(sig.transient, Math.min(1, (0.55 + A.rms[fi] * 1.4) * sensitivity));
    }
    analHitIdx = hi;
    let de = 0;
    for (const d of A.drops) {
      const dd = t - d;
      if (dd > -1.5 && dd < 3) de = Math.max(de, dd < 0 ? ((1.5 + dd) / 1.5) * 0.7 : 1 - dd / 3);
    }
    sig.drop = de;
    sig.section = floorIndex(A.sections, t) + 1;
  } else {
    sig.drop = smooth(sig.drop, 0, dt, 0.1, 0.6);
  }

  // ── bands: normalise against the running reference, then attack/release ──
  const norm = (v: number) => {
    const x = (v / Math.max(0.05, ref)) * 0.55 * sensitivity;
    return 1 - Math.exp(-x * 1.6);
  };
  for (let b = 0; b < SPEC_BANDS; b++) {
    const target = norm(rawBands[b]);
    sig.spectrum[b] = smooth(sig.spectrum[b], target, dt, 0.03, 0.18);
  }
  const avgBands = (a: number, b: number) => {
    let acc = 0;
    for (let i = a; i < b; i++) acc += sig.spectrum[i];
    return acc / (b - a);
  };
  // band index boundaries for 32Hz..16k over 48 log bands (≈ 1/5.3 octave each)
  sig.sub = avgBands(0, 6);      // 32–70Hz
  sig.bass = avgBands(4, 13);    // 55–250Hz
  sig.lowMid = avgBands(13, 22); // 250–800Hz
  sig.mid = avgBands(22, 31);    // 0.8–2.5kHz
  sig.high = avgBands(31, 39);   // 2.5–7kHz
  sig.air = avgBands(39, 48);    // 7–16kHz
  sig.level = smooth(sig.level, haveAudio ? level : 0, dt, 0.04, 0.25);
  sig.live = haveAudio && sig.level > 0.01;
  sig.transient *= Math.exp(-dt / 0.15);

  // ── energy: loudness + onset density + brightness, over seconds ──
  const inst = sig.live
    ? Math.min(1, sig.level * 1.4) * 0.55 + Math.min(1, densityAvg) * 0.25 + Math.min(1, (sig.high + sig.air) * 0.9) * 0.2
    : 0.12;
  sig.energy = smooth(sig.energy, inst, dt, 1.4, 3.2);

  // ── tempo and beat phase ──
  let conf = 0, bpm = 0, phase = 0, barPhase = 0, beatIdx = -1, barIdx = -1;
  if (A && A.beats.length > 4 && clock.source === "audio") {
    const i = floorIndex(A.beats, t);
    bpm = A.bpm;
    conf = analConf;
    if (i >= 0 && i < A.beats.length - 1) {
      phase = (t - A.beats[i]) / Math.max(0.05, A.beats[i + 1] - A.beats[i]);
      beatIdx = i;
      conf *= smoothstep(0.25, 0.6, beatSupport[i] ?? 0);
    } else if (i < 0) {
      // before the first beat: count backwards along the grid so the pulse
      // is already running when the music starts
      const p = 60 / Math.max(40, A.bpm);
      phase = (((t - A.beats[0]) / p) % 1 + 1) % 1;
      conf *= 0.4;
    } else {
      const p = 60 / Math.max(40, A.bpm);
      phase = ((t - A.beats[A.beats.length - 1]) / p) % 1;
      beatIdx = i;
      conf *= 0.5;
    }
    const db = A.downbeats;
    if (db && db.length > 1) {
      const j = floorIndex(db, t);
      if (j >= 0 && j < db.length - 1) {
        barPhase = (t - db[j]) / Math.max(0.2, db[j + 1] - db[j]);
        barIdx = j;
      }
    } else if (beatIdx >= 0) {
      barPhase = ((beatIdx % 4) + phase) / 4;
      barIdx = Math.floor(beatIdx / 4);
    }
    sig.tempoSource = "analysis";
  } else if (haveAudio && liveTempo.conf > 0.05) {
    bpm = liveTempo.bpm();
    conf = liveTempo.conf;
    const p = 60 / bpm;
    const k = (t - liveTempo.anchor) / p;
    beatIdx = Math.floor(k);
    phase = k - beatIdx;
    barIdx = Math.floor(beatIdx / 4);
    barPhase = (((beatIdx % 4) + 4) % 4 + phase) / 4;
    sig.tempoSource = "live";
  } else {
    sig.tempoSource = "none";
  }
  // Beats fire only on an advance of exactly one within a stable epoch while
  // playing — so a seek lands silently on the new phase instead of flashing
  // every beat between there and here.
  if (sig.playing && beatIdx >= 0 && conf >= 0.35) {
    if (lastBeatIdx >= -1 && beatIdx === lastBeatIdx + 1) sig.onBeat = true;
    if (lastBarIdx >= -1 && barIdx === lastBarIdx + 1) sig.onBar = true;
  }
  lastBeatIdx = sig.playing ? beatIdx : -2;
  lastBarIdx = sig.playing ? barIdx : -2;
  sig.beatIndex = beatIdx;
  sig.bpm = bpm;
  // confidence eases rather than switching, so handing over from the live
  // tracker to the analysis (or losing the pulse) is a fade, not a cut
  sig.confidence = smooth(sig.confidence, sig.playing ? conf : 0, dt, 0.6, 0.6);
  sig.phase = phase;
  sig.barPhase = barPhase;
  sig.pulse = sig.playing && conf > 0 ? Math.exp(-phase * 5.5) : sig.pulse * Math.exp(-dt / 0.2);
}

/**
 * The one number most visuals want: "how hard is the music hitting right now",
 * honest about where it comes from. `rhythmWeight` (0..1) is how much the beat
 * grid is allowed to drive it — the rest comes from measured transients, so
 * low-confidence music reacts to its actual onsets rather than to an invented
 * metronome.
 */
export function accentOf(rhythmWeight: number): number {
  const w = rhythmWeight * smoothstep(0.35, 0.7, sig.confidence);
  return w * sig.pulse * (0.45 + sig.level * 0.8) + (1 - w) * sig.transient * 0.85;
}

export function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
