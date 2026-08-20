// Deep beat tracking: the algorithms, kept free of any worker or DOM plumbing
// so they can be run and checked directly against synthesised audio.
//
// The fast analyser assumes one tempo for the whole track and places beats on a
// fixed grid from a single phase. That is right for most produced music and
// wrong in the cases people notice: anything played rather than programmed
// drifts, and a grid pinned at the start of a five-minute track can be most of
// a beat out by the end — which reads as the visuals "losing the beat" even
// though the tempo was detected correctly.
//
// So the beat sequence is found by dynamic programming instead. Every frame
// gets the best cumulative score of any beat sequence ending there, where the
// score of a step is the onset strength at the landing frame minus a penalty
// for the interval departing from the expected period. Backtracking from the
// best ending gives a sequence that is free to follow a drifting tempo while
// still being held to a regular pulse — the penalty is what keeps it from
// simply chasing every loud moment.
//
// (The shape of this is Ellis's 2007 dynamic-programming beat tracker.)


const minOf = (a: Float32Array) => {
  let v = Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] < v) v = a[i];
  return v;
};
const maxOf = (a: Float32Array) => {
  let v = -Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] > v) v = a[i];
  return v;
};

/**
 * A period per frame, from the intervals a first pass actually produced.
 *
 * Median-filtered over several beats, so a single dropped or doubled beat does
 * not bend the local tempo around it, and clamped to within a quarter of the
 * global period so a bad stretch cannot run away.
 */
export function localPeriods(beatFrames: number[], n: number, global: number): Float32Array {
  const out = new Float32Array(n).fill(global);
  if (beatFrames.length < 6) return out;
  const gaps: number[] = [];
  for (let i = 1; i < beatFrames.length; i++) gaps.push(beatFrames[i] - beatFrames[i - 1]);

  const W = 4; // beats either side
  const smooth = gaps.map((_, i) => {
    const a = Math.max(0, i - W), b = Math.min(gaps.length, i + W + 1);
    return median(gaps.slice(a, b));
  });

  const loP = global * 0.75, hiP = global * 1.35;
  for (let i = 0; i < smooth.length; i++) {
    const p = Math.min(hiP, Math.max(loP, smooth[i]));
    const from = Math.round(beatFrames[i]);
    const to = Math.round(beatFrames[i + 1]);
    for (let k = Math.max(0, from); k < Math.min(n, to); k++) out[k] = p;
  }
  // before the first beat and after the last, hold the nearest estimate
  const firstP = out[Math.max(0, Math.round(beatFrames[0]))];
  for (let k = 0; k < Math.min(n, Math.round(beatFrames[0])); k++) out[k] = firstP;
  const lastIdx = Math.min(n - 1, Math.round(beatFrames[beatFrames.length - 1]));
  const lastP = out[lastIdx];
  for (let k = lastIdx; k < n; k++) out[k] = lastP;
  return out;
}

/**
 * How hard the tracker resists an interval that isn't the expected period.
 *
 * This is the one number the whole tracker turns on, and it has to be read
 * against the reward: landing on a beat is worth at most 1, since the onset
 * envelope is normalised. At 90 — where this started — an 18% tempo change
 * costs 3.3, so on a track that accelerates the tracker prefers *silence at
 * the original spacing* to the actual beat, which is precisely what it did:
 * it held 120bpm through a stretch that had reached 132 and picked up noise
 * between the onsets.
 *
 * So the first pass is loose enough that following the music always beats
 * ignoring it, and the second pass — which measures deviation against a local
 * tempo rather than a global one, so the number means something different —
 * is tight enough to hold that pulse against off-beat hits.
 */
export const LOOSE = 6;
export const TIGHT = 40;

/**
 * The best beat sequence through an onset envelope, as frame indices.
 *
 * `period` is the expected spacing in frames, and may be a single number or a
 * value per frame; the result is allowed to depart from it at a cost growing
 * with the square of the log ratio, so a 5% drift is nearly free and a doubled
 * interval is not.
 *
 * A per-frame period is what makes this follow a tempo that *changes*. With a
 * single period and a penalty strong enough to ignore off-beat hits, a track
 * accelerating from 120 to 132bpm gets tracked at 120 until the accumulated
 * error is half a beat, at which point it snaps across and starts again —
 * median error 0.4ms, worst error 228ms, which is the shape of a tracker that
 * is right nearly all the time and badly wrong exactly where it matters.
 */
export function trackBeats(onset: Float32Array, period: number | Float32Array, tightness = LOOSE): number[] {
  const n = onset.length;
  const scalar = typeof period === "number";
  const pAt = (i: number) => (scalar ? (period as number) : (period as Float32Array)[i]);
  const pMin = scalar ? (period as number) : minOf(period as Float32Array);
  const pMax = scalar ? (period as number) : maxOf(period as Float32Array);
  if (n < 4 || pMin < 2) return [];

  // Normalising means the tightness constant is about the *shape* of the
  // envelope rather than about how loud the track was mastered.
  let mx = 0;
  for (let i = 0; i < n; i++) if (onset[i] > mx) mx = onset[i];
  if (mx <= 0) return [];

  const score = new Float32Array(n);
  const from = new Int32Array(n).fill(-1);
  const lo = Math.max(1, Math.round(pMin * 0.5));
  const hi = Math.max(lo + 1, Math.round(pMax * 2));

  // Logs of every interval and of every frame's expected period, so the inner
  // loop is a subtract and a multiply rather than a log. This is the hot loop
  // of the whole analysis — roughly frames × 1.5 periods of iterations.
  const logD = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) logD[d] = Math.log(d);

  for (let i = 0; i < n; i++) {
    const here = onset[i] / mx;
    const logP = Math.log(pAt(i));
    let best = -Infinity;
    let bestJ = -1;
    const jStart = i - Math.round(pAt(i) * 2);
    const jEnd = i - Math.round(pAt(i) * 0.5);
    for (let j = Math.max(0, jStart); j <= jEnd; j++) {
      const d = i - j;
      if (d < lo || d > hi) continue;
      const r = logD[d] - logP;
      const v = score[j] - tightness * r * r;
      if (v > best) { best = v; bestJ = j; }
    }
    if (bestJ < 0) {
      // no predecessor in range: this frame can start a sequence
      score[i] = here;
      from[i] = -1;
    } else {
      score[i] = here + best;
      from[i] = bestJ;
    }
  }

  // End on the best score in the final stretch, not simply the global best:
  // the cumulative score grows along the track, so the global maximum is
  // almost always in the last few frames anyway, but a fade-out can leave the
  // true end a little earlier.
  let endI = n - 1;
  let endV = -Infinity;
  for (let i = Math.max(0, n - Math.round(pMax * 2)); i < n; i++) {
    if (score[i] > endV) { endV = score[i]; endI = i; }
  }

  const out: number[] = [];
  for (let i = endI; i >= 0; i = from[i]) {
    out.push(i);
    if (from[i] < 0) break;
  }
  out.reverse();
  return out;
}

/**
 * Sub-frame position of the onset peak at or beside `i`, in frames.
 *
 * Beat times are otherwise quantised to the hop — 11.6ms at the fast
 * analyser's settings, which is audible as looseness when a flash is supposed
 * to land on a kick. Fitting a parabola through the peak and its two
 * neighbours recovers the position between frames, which is most of the
 * precision a smaller hop would buy at none of the cost.
 */
export function refinePeak(onset: Float32Array, i: number): number {
  if (i <= 0 || i >= onset.length - 1) return i;
  const a = onset[i - 1], b = onset[i], c = onset[i + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return i;
  const delta = (0.5 * (a - c)) / denom;
  // a well-formed peak puts the vertex inside the middle sample
  return Math.abs(delta) <= 1 ? i + delta : i;
}

/** Strongest onset frame within `snap` of `centre`. */
export function snapToOnset(onset: Float32Array, centre: number, snap: number): number {
  let bi = centre, bv = -Infinity;
  const a = Math.max(0, centre - snap);
  const b = Math.min(onset.length - 1, centre + snap);
  for (let k = a; k <= b; k++) if (onset[k] > bv) { bv = onset[k]; bi = k; }
  return bi;
}

/**
 * How much stronger the onset envelope is at these frames than everywhere
 * else. 1 means the beats are exactly average — i.e. the grid explains
 * nothing — and higher is better.
 */
export function gridStrength(onset: Float32Array, frames: number[]): number {
  if (!frames.length) return 0;
  let total = 0;
  for (let i = 0; i < onset.length; i++) total += onset[i];
  const mean = total / Math.max(1, onset.length);
  if (mean <= 0) return 0;
  let at = 0;
  for (const f of frames) {
    const i = Math.round(f);
    if (i >= 0 && i < onset.length) at += onset[i];
  }
  return at / frames.length / mean;
}

/** Median of a numeric array. Copies, so the caller's order is preserved. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const c = [...xs].sort((a, b) => a - b);
  return c[c.length >> 1];
}

/**
 * What fraction of `a`'s beats have a partner in `b` within `tol` seconds.
 *
 * This is the cross-check that matters. Two trackers run on different evidence
 * — the whole spectrum, and the low end alone — should land in the same places
 * if the pulse is real. Where they disagree, one of them is following
 * something that isn't the beat, and the honest thing is to say so rather than
 * to pick the prettier answer.
 */
export function agreement(a: number[], b: number[], tol: number): number {
  if (!a.length || !b.length) return 0;
  let hit = 0;
  let j = 0;
  for (const t of a) {
    while (j < b.length - 1 && b[j] < t - tol) j++;
    // the pointer only moves forward, so this stays linear
    for (let k = j; k < b.length && b[k] <= t + tol; k++) {
      if (Math.abs(b[k] - t) <= tol) { hit++; break; }
    }
  }
  return hit / a.length;
}

/**
 * How steady the beat spacing is: 1 for a perfectly regular pulse, falling
 * toward 0 as the intervals scatter. Measured with a median absolute
 * deviation rather than a standard deviation, so one dropped or doubled beat
 * doesn't dominate the answer for the whole track.
 */
export function pulseSteadiness(beats: number[]): number {
  if (beats.length < 4) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
  const m = median(gaps);
  if (m <= 0) return 0;
  const dev = median(gaps.map((g) => Math.abs(g - m)));
  return Math.max(0, 1 - (dev / m) * 4);
}

/**
 * Which position in a bar of `bar` beats carries the most low-end weight.
 *
 * Downbeats are not a stronger onset — plenty of tracks hit hardest on the
 * backbeat — they are where the *bass* lands. Scoring the low band by beat
 * position and taking the best offset finds the bar line without needing to
 * know anything about the genre.
 */
export function downbeatOffset(low: Float32Array, beatFrames: number[], bar = 4): number {
  if (beatFrames.length < bar * 2) return 0;
  const sums = new Array(bar).fill(0);
  beatFrames.forEach((f, i) => {
    const k = Math.round(f);
    if (k >= 0 && k < low.length) sums[i % bar] += low[k];
  });
  let best = 0;
  for (let i = 1; i < bar; i++) if (sums[i] > sums[best]) best = i;
  return best;
}

export interface DropShape {
  /** when it lands, seconds */
  t: number;
  /** seconds of build before it — how long to swell for */
  lead: number;
  /** seconds it takes the low end to fall back — how long to fade out over */
  decay: number;
  /** 0..1, how much the mix lifts across it */
  strength: number;
}

/**
 * Measure the shape of each drop rather than assuming one.
 *
 * The visuals swell into a drop and decay out of it, and both durations were
 * fixed constants — 1.5s of build, 3s of decay — which is right for a dance
 * record and wrong for everything else. A drop that arrives after an eight-bar
 * build gets a swell that starts far too late; one that stops dead gets three
 * seconds of afterglow over the silence that was the point.
 *
 * So each is measured: the lead is how far back the low end was still climbing,
 * and the decay is how long it stays above the level it jumped to.
 */
export function dropShapes(bass: Float32Array, dropSecs: number[], fps: number): DropShape[] {
  const at = (t: number) => Math.max(0, Math.min(bass.length - 1, Math.round(t * fps)));
  const avg = (from: number, to: number) => {
    const a = Math.max(0, from), b = Math.min(bass.length, to);
    if (b <= a) return 0;
    let s = 0;
    for (let k = a; k < b; k++) s += bass[k];
    return s / (b - a);
  };
  return dropSecs.map((t) => {
    const i = at(t);
    const before = avg(i - Math.round(fps * 2), i - Math.round(fps * 0.2));
    const after = avg(i, i + Math.round(fps * 2));
    const jump = Math.max(0, after - before);

    // Lead: walk back while the low end is still lower than it is at the drop,
    // capped — a long quiet intro is not an eight-second build.
    let lead = 0;
    const maxLead = Math.round(fps * 6);
    for (let k = 1; k < maxLead; k++) {
      const j = i - k;
      if (j < 1) break;
      if (bass[j] > after * 0.82) break;
      lead = k / fps;
    }

    // Decay: how long the low end stays up before falling back most of the way
    // toward where it was.
    const floor = before + jump * 0.35;
    let decay = 0;
    const maxDecay = Math.round(fps * 12);
    for (let k = 1; k < maxDecay; k++) {
      const j = i + k;
      if (j >= bass.length) break;
      decay = k / fps;
      if (bass[j] < floor) break;
    }

    return {
      t: +t.toFixed(3),
      lead: +Math.min(6, Math.max(0.4, lead)).toFixed(2),
      decay: +Math.min(12, Math.max(0.8, decay)).toFixed(2),
      strength: +Math.min(1, jump * 2).toFixed(3),
    };
  });
}
