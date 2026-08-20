// The whole analysis pass, off the main thread.
//
// This used to run inline, yielding every 512 FFT frames — which is several
// hundred milliseconds of solid compute between yields. That is far longer
// than an audio callback can wait, so playback crackled and dropped out while
// a track was being analysed (worst with reverb, which is expensive on its
// own). A worker never competes with the audio thread at all.
import FFT from "fft.js";
import {
  agreement,
  downbeatOffset,
  dropShapes,
  gridStrength,
  localPeriods,
  LOOSE,
  pulseSteadiness,
  refinePeak,
  TIGHT,
  trackBeats,
  type DropShape,
} from "./deepBeats";

const WIN = 2048;
const HOP = 512;
// The deep pass hops a quarter of the way the fast one does: four times the
// frames, four times the FFTs, and a time resolution of 2.9ms instead of
// 11.6ms before any sub-frame refinement. That is the cost the mode exists to
// spend.
const HOP_DEEP = 128;

export interface AnalysisResult {
  fps: number;
  bpm: number;
  bass: number[];
  mid: number[];
  treb: number[];
  rms: number[];
  beats: number[];
  hits: number[];
  drops: number[];
  sections: number[];
  /** present only on a deep pass — see analyseDeep */
  deep?: DeepExtras;
}

/** What the deep pass knows that the fast one does not. */
export interface DeepExtras {
  /** the three parts the confidence is made of, so a low one can be read */
  agree: number;
  /** beats each tracker found — a zero here explains an agreement of zero */
  found: [number, number];
  /** typical gap between the two trackers, ms */
  offsetMs: number;
  steady: number;
  strength: number;
  /**
   * 0..1, from three things that can each be wrong independently: how much
   * stronger the onset envelope is on the grid than off it, how steady the
   * spacing is, and whether a tracker run on the low end alone lands in the
   * same places. A number that is only ever 1 would be decoration.
   */
  confidence: number;
  /** BPM per beat, so a tempo that moves is visible rather than averaged away */
  tempoCurve: number[];
  /** bar lines, seconds */
  downbeats: number[];
  /** measured lead-in and decay per drop, rather than fixed constants */
  shapes: DropShape[];
}

/** Median of a plain number array, for the tempo curve. */
function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const c = [...xs].sort((a, b) => a - b);
  return c[c.length >> 1];
}

function median(arr: number[] | Float32Array): number {
  if (!arr.length) return 0;
  const c = Array.from(arr).sort((x, y) => x - y);
  return c[c.length >> 1];
}

function analyse(mono: Float32Array, rate: number, post: (p: number) => void, deep = false): AnalysisResult {
  const HOP_N = deep ? HOP_DEEP : HOP;
  const fft = new FFT(WIN);
  const out = fft.createComplexArray();
  const cin = fft.createComplexArray();
  const win = new Float32Array(WIN);
  for (let i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));

  const n = mono.length;
  const frames = Math.max(1, Math.floor((n - WIN) / HOP_N));
  const bins = WIN / 2;
  const hzPerBin = rate / WIN;
  const bassEnd = Math.max(2, Math.round(250 / hzPerBin));
  // A tighter band than `bass` for the cross-check: kick territory, and little
  // else. At 250Hz a hi-hat still contributes — the transient of any broadband
  // percussion has energy down there — and a "low band" tracker that can hear
  // the hats is not the independent second opinion it is supposed to be. It
  // locked onto the off-beat of a test track, exactly half a beat out.
  const kickEnd = Math.max(2, Math.round(120 / hzPerBin));
  const midEnd = Math.max(bassEnd + 1, Math.round(2500 / hzPerBin));

  const bass = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const treb = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const flux = new Float32Array(frames);
  // Flux of the low end alone. The deep pass tracks this separately and asks
  // whether it lands in the same places as the broadband tracker — two pieces
  // of evidence that can disagree, which is the only kind of check worth
  // reporting a confidence from.
  const lowFlux = new Float32Array(frames);
  const prevMag = new Float32Array(bins);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP_N;
    let sum = 0;
    for (let i = 0; i < WIN; i++) {
      const v = mono[off + i];
      cin[i * 2] = v * win[i];
      cin[i * 2 + 1] = 0;
      sum += v * v;
    }
    fft.transform(out, cin);
    let b = 0, m = 0, tr = 0, fl = 0, lf = 0;
    for (let k = 1; k < bins; k++) {
      const re = out[k * 2], im = out[k * 2 + 1];
      const mg = Math.sqrt(re * re + im * im);
      if (k < bassEnd) b += mg;
      else if (k < midEnd) m += mg;
      else tr += mg;
      const d = mg - prevMag[k];
      if (d > 0) { fl += d; if (k < kickEnd) lf += d; }
      prevMag[k] = mg;
    }
    bass[f] = b / bassEnd;
    mid[f] = m / Math.max(1, midEnd - bassEnd);
    treb[f] = tr / Math.max(1, bins - midEnd);
    rms[f] = Math.sqrt(sum / WIN);
    flux[f] = fl / bins;
    lowFlux[f] = lf / kickEnd;
    if ((f & 1023) === 0) post(f / frames);
  }

  const normalise = (arr: Float32Array) => {
    const sorted = Array.from(arr).sort((a, b2) => a - b2);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 1;
    for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, arr[i] / p95);
  };
  normalise(bass); normalise(mid); normalise(treb); normalise(rms);

  const fps = rate / HOP_N;
  // Frame f covers samples [f*HOP, f*HOP + WIN), so the energy it reports is
  // centred half a window later than f/fps — 23ms at a 2048 window. Reporting
  // the window's start instead put every beat that far early, uniformly: the
  // steady test track came out with a median error of 29.5ms and a *worst* of
  // 29.8ms, which is not jitter, it is an offset with jitter on top.
  const tAt = (frame: number) => (frame * HOP_N + WIN / 2) / rate;

  // ── onset envelope, whitened against a local median so a loud chorus
  // doesn't drown out onsets in a quiet verse ──
  const onset = new Float32Array(frames);
  const localWin = Math.round(fps * 1.0);
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - localWin), b = Math.min(frames, i + localWin);
    let acc = 0;
    for (let k = a; k < b; k++) acc += flux[k];
    const localMean = acc / Math.max(1, b - a);
    onset[i] = Math.max(0, flux[i] - localMean * 1.08);
  }
  const oMed = median(onset) || 1e-6;
  const oDev = median(Array.from(onset).map((v) => Math.abs(v - oMed))) || 1e-6;

  // ── tempo: score every octave candidate on how well a grid actually lands
  // on onsets, instead of trusting the strongest autocorrelation lag (which
  // routinely locks to half or double time) ──
  const minLag = Math.max(2, Math.floor((fps * 60) / 200));
  const maxLag = Math.min(frames - 1, Math.ceil((fps * 60) / 60));
  const ac = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frames; i++) acc += onset[i] * onset[i + lag];
    ac[lag] = acc / (frames - lag);
  }
  let bestLag = minLag, bestAc = -1;
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > bestAc) { bestAc = ac[lag]; bestLag = lag; }

  // Total onset energy, so a candidate grid can be judged on how much of the
  // track it actually explains rather than only on whether its own points are
  // loud. Without this, a half-tempo grid scores identically to the true one:
  // it lands on every other onset, and every one it lands on is strong.
  let onsetTotal = 0;
  for (let i = 0; i < frames; i++) onsetTotal += onset[i];

  const gridScore = (period: number): { score: number; phase: number } => {
    if (period < 2) return { score: -1, phase: 0 };
    let bestP = 0, best = -1;
    for (let p = 0; p < Math.floor(period); p++) {
      let acc = 0, cnt = 0, cov = 0;
      for (let x = p; x < frames; x += period) {
        const i = Math.round(x);
        // a little tolerance: take the best onset within a couple of frames
        let v = 0;
        for (let k = Math.max(0, i - 2); k <= Math.min(frames - 1, i + 2); k++) {
          if (onset[k] > v) v = onset[k];
          cov += onset[k]; // windows never overlap: period is >= 25 frames here
        }
        acc += v;
        cnt++;
      }
      const mean = cnt ? acc / cnt : 0;
      const coverage = onsetTotal > 0 ? Math.min(1, cov / onsetTotal) : 0;
      // strength alone picks the octave, coverage breaks the tie toward the
      // grid that accounts for the most onsets
      const sc = mean * (0.4 + 0.6 * coverage);
      if (sc > best) { best = sc; bestP = p; }
    }
    return { score: best, phase: bestP };
  };

  let period = bestLag;
  let bestCombined = -1;
  for (const mult of [0.5, 1, 2]) {
    const cand = bestLag * mult;
    const bpmCand = (60 * fps) / cand;
    if (bpmCand < 60 || bpmCand > 200) continue;
    const g = gridScore(cand);
    // prefer the candidate whose grid genuinely lands on onsets, with a mild
    // pull toward 90-150bpm where most music actually sits
    const centred = 1 - Math.min(1, Math.abs(bpmCand - 120) / 90) * 0.25;
    const sc = g.score * centred;
    if (sc > bestCombined) { bestCombined = sc; period = cand; }
  }
  const bpm = Math.round((60 * fps) / period);
  let { phase } = gridScore(period);

  // Half-beat phase check.
  //
  // Broadband flux is what picks the phase, and a hi-hat or a snare produces
  // more of it than a kick does — so on a track with strong off-beat
  // percussion the grid can settle confidently onto the off-beat, exactly half
  // a beat out. A synthesised 128bpm track with hats between the kicks came out
  // 229ms late, which at that tempo is precisely half of one.
  //
  // The low end does not have that problem: whatever else is going on, the
  // kick is where the bass is. So the two candidate phases are compared on
  // low-band onset energy alone, and the better one wins.
  {
    const lowAt = (p: number) => {
      let acc = 0;
      for (let x = p; x < frames; x += period) {
        const i = Math.round(x);
        let v = 0;
        for (let k = Math.max(0, i - 2); k <= Math.min(frames - 1, i + 2); k++) if (lowFlux[k] > v) v = lowFlux[k];
        acc += v;
      }
      return acc;
    };
    const alt = (phase + period / 2) % period;
    if (lowAt(alt) > lowAt(phase) * 1.15) phase = alt;
  }

  const beats: number[] = [];
  let deepExtras: DeepExtras | undefined;

  if (deep) {
    // ── the deep beat stage ──
    //
    // Three passes over two pieces of evidence, and the point of the third is
    // that it can come back and say the first two were wrong.
    //
    // 1. A loose pass over the broadband onset envelope, free enough to follow
    //    a tempo that moves — the penalty for departing from the expected
    //    spacing has to stay under the reward for landing on a real beat, or
    //    the tracker holds the starting tempo and picks up silence.
    // 2. A tight pass against the local tempo that first pass revealed, which
    //    locks the pulse against off-beat hits now that "expected spacing"
    //    means the spacing *here* rather than the spacing on average.
    // 3. The same two passes over the low end alone, then a comparison. Where
    //    a kick-driven tracker and a broadband one land in the same places the
    //    pulse is real; where they do not, one of them is following something
    //    that is not the beat, and the confidence says so instead of the
    //    prettier answer being picked silently.
    post(0.8);
    const lowOnset = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const a = Math.max(0, i - localWin), b = Math.min(frames, i + localWin);
      let acc = 0;
      for (let k = a; k < b; k++) acc += lowFlux[k];
      lowOnset[i] = Math.max(0, lowFlux[i] - (acc / Math.max(1, b - a)) * 1.08);
    }

    const twoPass = (env: Float32Array) => {
      const first = trackBeats(env, period, LOOSE);
      if (first.length < 4) return [] as number[];
      return trackBeats(env, localPeriods(first, frames, period), TIGHT);
    };

    post(0.86);
    const broadFrames = twoPass(onset);
    post(0.93);
    const lowFrames = twoPass(lowOnset);

    // sub-frame: the hop is 2.9ms here, and fitting the peak recovers most of
    // what is left inside it
    const toSecs = (fr: number[], env: Float32Array) =>
      fr.map((i) => +tAt(refinePeak(env, i)).toFixed(4));
    const broadSecs = toSecs(broadFrames, onset);
    const lowSecs = toSecs(lowFrames, lowOnset);

    // Which of the two to trust where they differ.
    //
    // Both grids are scored against the *same* envelope, which took two goes to
    // get right: scoring each against its own envelope compares numbers that
    // are not comparable — grid strength is relative to that envelope's mean,
    // so the sparser low band always looks better and the low tracker always
    // won, correct or not.
    //
    // The envelope they are judged on is the low one, because the disagreement
    // between them is nearly always about phase rather than tempo, and the kick
    // is what settles phase. Broadband flux favours whatever has the sharpest
    // transient — a hi-hat outruns a kick easily — so on a track with off-beat
    // percussion the broadband tracker will confidently lock half a beat out.
    // The broadband tracker gets the sequence, because it is the one that
    // follows a tempo that moves. Its *phase* is then checked against the kick.
    //
    // Choosing wholesale between the two trackers was tried and is worse: it
    // has to be right about tempo and phase at once from a single comparison,
    // and it went half a beat out on the accelerating track while getting the
    // steady one right. Phase is a separate question with a separate answer,
    // and shifting the sequence by half of each *local* interval keeps working
    // while the tempo changes underneath it.
    const halfBeatShift = (secs: number[]) =>
      secs.map((t, i) => {
        const gap = i + 1 < secs.length ? secs[i + 1] - t : t - (secs[i - 1] ?? t - 0.5);
        return t + gap / 2;
      });
    const framesOf = (secs: number[]) => secs.map((t) => (t * rate - WIN / 2) / HOP_N);

    const offBeat = halfBeatShift(broadSecs);
    const onLow = gridStrength(lowOnset, broadFrames);
    const offLow = gridStrength(lowOnset, framesOf(offBeat));
    // Only move on clear evidence: a grid that is genuinely on the beat and one
    // that is half a beat away are not a close-run thing on the low end.
    const flipped = offLow > onLow * 1.3;
    const chosen = flipped ? offBeat : broadSecs;
    const chosenFrames = framesOf(chosen);
    const broadScore = gridStrength(onset, broadFrames);
    const lowScore = Math.max(onLow, offLow);

    beats.push(...chosen);

    // ── how much to trust this ──
    //
    // The first version of this compared the two trackers to each other, which
    // sounds like a cross-check and is not one: the low-band tracker locks to
    // whatever is periodic in the low band, and on a track with off-beat
    // percussion that is the off-beat. It reported 0% agreement on a grid that
    // was accurate to 7ms — measuring a disagreement between two tools rather
    // than anything about the answer.
    //
    // What it measures now is the answer itself, three ways that can each fail
    // on their own: whether *both* envelopes support the grid that was chosen,
    // whether the spacing is steady, and whether the phase was resolved
    // decisively rather than being a coin toss between the beat and the
    // off-beat.
    const support = Math.min(
      Math.min(1, gridStrength(onset, chosenFrames) / 3),
      Math.min(1, gridStrength(lowOnset, chosenFrames) / 3)
    );
    const steady = pulseSteadiness(chosen);
    const hiLo = Math.max(onLow, offLow);
    const loLo = Math.max(1e-6, Math.min(onLow, offLow));
    const phaseMargin = Math.min(1, Math.log(hiLo / loLo) / Math.log(2));
    const confidence = +Math.max(0, Math.min(1, support * 0.4 + steady * 0.3 + phaseMargin * 0.3)).toFixed(3);
    // kept for diagnostics: where the low band's own tracker landed relative
    // to the grid that was chosen
    const agree = agreement(chosen, lowSecs, 0.045);
    const strength = +support.toFixed(3);

    const tempoCurve: number[] = [];
    for (let i = 1; i < chosen.length; i++) {
      const gap = chosen[i] - chosen[i - 1];
      tempoCurve.push(gap > 0 ? +(60 / gap).toFixed(1) : 0);
    }

    const barOff = downbeatOffset(bass, chosenFrames, 4);
    const downbeats = chosen.filter((_, i) => i % 4 === barOff);

    deepExtras = {
      confidence,
      agree: +agree.toFixed(3),
      found: [broadSecs.length, lowSecs.length],
      offsetMs: +(medianOf(broadSecs.map((t) => {
        let best = Infinity;
        for (const u of lowSecs) if (Math.abs(u - t) < Math.abs(best)) best = u - t;
        return best;
      }).filter((v) => Number.isFinite(v))) * 1000).toFixed(1),
      steady: +steady.toFixed(3),
      strength: +strength.toFixed(3),
      tempoCurve,
      downbeats,
      shapes: [],
    };
  } else {
    const snap = Math.max(1, Math.round(period * 0.12));
    for (let x = phase; x < frames; x += period) {
      const centre = Math.round(x);
      let bi = centre, bv = -1;
      for (let k = Math.max(0, centre - snap); k <= Math.min(frames - 1, centre + snap); k++) {
        if (onset[k] > bv) { bv = onset[k]; bi = k; }
      }
      beats.push(+tAt(bi).toFixed(3));
    }
  }

  // ── hits: every real onset peak, on or off the grid. Fast drum patterns and
  // fills produce several of these per beat, which is what makes double-time
  // passages flash at their own pace instead of the tempo's. ──
  const hits: number[] = [];
  const minGap = Math.max(1, Math.round(fps * 0.075)); // 75ms refractory
  const thresh = oMed + oDev * 1.6;
  let lastHit = -1e9;
  for (let i = 1; i < frames - 1; i++) {
    if (onset[i] < thresh) continue;
    if (onset[i] < onset[i - 1] || onset[i] < onset[i + 1]) continue; // local peak
    if (i - lastHit < minGap) continue;
    lastHit = i;
    hits.push(+tAt(i).toFixed(3));
  }

  // ── drops: where the mix lifts hardest ──
  //
  // This used to demand an absolute shape — the three seconds before a drop had
  // to be quieter than the whole track's average, then the low end had to jump
  // 70%. That describes a build-and-drop dance record and nothing else. On music
  // that is loud all the way through (funk, hip-hop, most modern pop) the
  // "quieter than average" test is never true, so the detector returned an empty
  // list and every feature downstream of it silently did nothing.
  //
  // Two changes. Ranking is relative — score every position by how much the mix
  // lifts across it and take the strongest few — so a track's biggest moments
  // are always found whatever its absolute dynamics. And the lift is measured
  // over two spans at once: a short one that catches an abrupt drop, and a
  // four-second one that catches a section change, which a short window smears
  // into nothing because the transition is longer than the window itself.
  let meanBass = 0;
  for (let i = 0; i < frames; i++) meanBass += bass[i];
  meanBass /= Math.max(1, frames);
  const sum = (from: number, to: number): number => {
    let v = 0;
    const a = Math.max(0, from), b = Math.min(frames, to);
    for (let k = a; k < b; k++) v += bass[k];
    return v / Math.max(1, b - a);
  };
  const shortW = Math.round(fps * 1.5);
  const longW = Math.round(fps * 4);
  const cands: { t: number; score: number }[] = [];
  for (let i = shortW; i < frames - shortW; i += Math.round(fps * 0.25)) {
    const sBefore = sum(i - shortW * 2, i), sAfter = sum(i, i + shortW);
    const lBefore = sum(i - longW, i), lAfter = sum(i, i + longW);
    const lift = Math.max((sAfter + 1e-4) / (sBefore + 1e-4), (lAfter + 1e-4) / (lBefore + 1e-4));
    // it still has to *land* somewhere loud: a lift into a quiet passage is a
    // change, but it is not a drop
    if (lift < 1.05 || Math.max(sAfter, lAfter) < meanBass * 0.8) continue;
    // rank by the lift and by how hard it lands, so a loud song's chorus
    // outranks a small swell in its intro
    cands.push({ t: +(i / fps).toFixed(2), score: lift * (Math.max(sAfter, lAfter) / Math.max(1e-4, meanBass)) });
  }
  cands.sort((a, b) => b.score - a.score);
  const drops: number[] = [];
  // greedy, strongest first, kept apart — otherwise one long build contributes a
  // dozen neighbouring candidates and fills the whole ladder by itself
  for (const cd of cands) {
    if (drops.length >= 8) break;
    if (drops.every((d) => Math.abs(d - cd.t) > 8)) drops.push(cd.t);
  }
  drops.sort((a, b) => a - b);

  // ── sections: where the arrangement's character changes. Compare the
  // spectral balance of adjacent 4s windows and mark the big shifts. ──
  const sections: number[] = [];
  const sw = Math.round(fps * 4);
  let lastSec = -1e9;
  for (let i = sw; i + sw < frames; i += Math.round(fps * 0.5)) {
    const avg = (arr: Float32Array, a: number, b: number) => {
      let s = 0;
      for (let k = a; k < b; k++) s += arr[k];
      return s / Math.max(1, b - a);
    };
    const d =
      Math.abs(avg(bass, i - sw, i) - avg(bass, i, i + sw)) +
      Math.abs(avg(mid, i - sw, i) - avg(mid, i, i + sw)) +
      Math.abs(avg(treb, i - sw, i) - avg(treb, i, i + sw));
    if (d > 0.34) {
      const t = +(i / fps).toFixed(2);
      if (t - lastSec > 8) { sections.push(t); lastSec = t; }
    }
  }

  if (deepExtras) deepExtras.shapes = dropShapes(bass, drops, fps);

  const r3 = (a: Float32Array) => Array.from(a, (v) => +v.toFixed(3));
  return {
    fps, bpm: deepExtras && deepExtras.tempoCurve.length ? Math.round(medianOf(deepExtras.tempoCurve)) : bpm,
    bass: r3(bass), mid: r3(mid), treb: r3(treb), rms: r3(rms),
    beats, hits, drops, sections,
    ...(deepExtras ? { deep: deepExtras } : {}),
  };
}

self.onmessage = (e: MessageEvent<{ mono: ArrayBuffer; rate: number; deep?: boolean }>) => {
  const mono = new Float32Array(e.data.mono);
  try {
    const res = analyse(mono, e.data.rate, (p) => {
      (self as unknown as Worker).postMessage({ type: "progress", value: p });
    }, e.data.deep === true);
    (self as unknown as Worker).postMessage({ type: "done", result: res });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: (err as Error).message });
  }
};
