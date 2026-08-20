// The deep beat tracker, checked against pulses whose true times are known.
//
// "The beats line up" is the least verifiable-by-eye claim in this project:
// a grid that is a fifth of a beat late looks fine in a screenshot and feels
// wrong for a whole track. So the tracker is run against synthesised onset
// envelopes where every beat time was chosen in advance, and the error is
// reported in milliseconds.
//
// This runs the TypeScript directly — the algorithms are deliberately free of
// worker and DOM plumbing so they can be tested without a browser at all.
//
// Usage: node --experimental-strip-types scripts/deepbeats-check.mjs
import {
  trackBeats,
  localPeriods,
  LOOSE,
  TIGHT,
  refinePeak,
  agreement,
  pulseSteadiness,
  gridStrength,
  dropShapes,
} from "../src/audio/deepBeats.ts";

const FPS = 172; // frames a second, as the deep pass runs

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

/** An onset envelope with a peak at each of `times`, plus noise and decoys. */
function envelope(times, secs, { noise = 0.04, decoys = 0, jitter = 0 } = {}) {
  const n = Math.round(secs * FPS);
  const env = new Float32Array(n);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) env[i] = rnd() * noise;
  const stamp = (t, amp) => {
    const c = t * FPS;
    for (let k = -3; k <= 3; k++) {
      const i = Math.round(c) + k;
      if (i < 0 || i >= n) continue;
      // a short asymmetric attack, like a real onset
      const d = Math.abs(c - i);
      env[i] += amp * Math.exp(-d * d * 0.55);
    }
  };
  for (const t of times) stamp(t + (rnd() - 0.5) * jitter, 1);
  // off-grid events, to make sure the tracker is held to a pulse rather than
  // chasing whatever is loudest
  for (let i = 0; i < decoys; i++) stamp(rnd() * secs, 0.75);
  return env;
}

const errorsMs = (got, want, tol = 0.25) => {
  // pair each true beat with the nearest reported one
  const errs = [];
  for (const t of want) {
    let best = Infinity;
    for (const g of got) {
      const d = Math.abs(g - t);
      if (d < best) best = d;
    }
    if (best <= tol) errs.push(best * 1000);
  }
  return errs;
};

// Two passes, as the worker runs it: the first with one period for the whole
// track, then a period per frame taken from the intervals that pass actually
// produced. The second pass is what lets it follow a tempo that changes.
const run = (env, period) => {
  const first = trackBeats(env, period, LOOSE);
  const local = localPeriods(first, env.length, period);
  return trackBeats(env, local, TIGHT).map((i) => refinePeak(env, i) / FPS);
};

console.log("\na steady 120bpm pulse");
{
  const want = [];
  for (let t = 0.5; t < 60; t += 0.5) want.push(t);
  const env = envelope(want, 61);
  const got = run(env, FPS * 0.5);
  const errs = errorsMs(got, want);
  const worst = Math.max(...errs);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  check("finds every beat", errs.length >= want.length * 0.97, `${errs.length}/${want.length} matched`);
  check("lands within 12ms", worst < 12, `mean ${mean.toFixed(1)}ms, worst ${worst.toFixed(1)}ms`);
  check("the pulse reads as steady", pulseSteadiness(got) > 0.9, pulseSteadiness(got).toFixed(2));
  check("the grid explains the onsets", gridStrength(env, got.map((t) => t * FPS)) > 3, gridStrength(env, got.map((t) => t * FPS)).toFixed(1));
}

console.log("\na tempo that drifts from 120 to 132bpm — what a fixed grid cannot do");
{
  // each interval a little shorter than the last
  const want = [];
  let t = 0.5, gap = 0.5;
  while (t < 60) { want.push(t); gap *= 0.9985; t += gap; }
  const env = envelope(want, 61);
  const got = run(env, FPS * 0.5);
  const errs = errorsMs(got, want);
  const worst = Math.max(...errs);
  check("follows the drift", errs.length >= want.length * 0.95, `${errs.length}/${want.length} matched`);
  check("stays within 20ms all the way", worst < 20, `worst ${worst.toFixed(1)}ms`);

  // what the old approach would have done: one period, one phase, all the way
  const fixedPeriod = (want[8] - want[4]) / 4;
  const fixed = [];
  for (let k = 0; k * fixedPeriod + want[0] < 60; k++) fixed.push(want[0] + k * fixedPeriod);
  const fixedWorst = Math.max(...errorsMs(fixed, want, 1));
  check(
    "and beats a fixed grid at it",
    worst < fixedWorst / 3,
    `fixed grid drifts to ${fixedWorst.toFixed(0)}ms by the end`
  );
}

console.log("\nwith off-beat decoys and jitter");
{
  const want = [];
  for (let t = 0.5; t < 45; t += 0.462) want.push(+t.toFixed(4)); // ~130bpm
  const env = envelope(want, 46, { noise: 0.09, decoys: 40, jitter: 0.006 });
  const got = run(env, FPS * 0.462);
  const errs = errorsMs(got, want);
  check("still finds the pulse", errs.length >= want.length * 0.9, `${errs.length}/${want.length} matched`);
  check("is not dragged off by the decoys", Math.max(...errs) < 30, `worst ${Math.max(...errs).toFixed(1)}ms`);
}

console.log("\ncross-checking two trackers against each other");
{
  const want = [];
  for (let t = 0.5; t < 40; t += 0.5) want.push(t);
  const broad = envelope(want, 41, { noise: 0.05, decoys: 25 });
  // the low band: same beats, fewer decoys, as a kick track would be
  const low = envelope(want, 41, { noise: 0.03, decoys: 3 });
  const a = run(broad, FPS * 0.5);
  const b = run(low, FPS * 0.5);
  check("they agree", agreement(a, b, 0.04) > 0.9, `${(agreement(a, b, 0.04) * 100).toFixed(0)}% within 40ms`);

  // and disagreement has to be visible, or the confidence number is decoration
  const halfTime = b.filter((_, i) => i % 2 === 0);
  check(
    "and disagreement shows up",
    agreement(b, halfTime, 0.04) < 0.75,
    `${(agreement(b, halfTime, 0.04) * 100).toFixed(0)}% against a half-time grid`
  );
}

console.log("\ndrop shapes");
{
  // low end: quiet, an eight-second build, a slam at 30s, holding for 10s
  const secs = 60;
  const n = Math.round(secs * FPS);
  const bass = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    if (t < 22) bass[i] = 0.12;
    else if (t < 30) bass[i] = 0.12 + ((t - 22) / 8) * 0.25;   // build
    else if (t < 40) bass[i] = 0.9;                             // the drop
    else bass[i] = 0.15;
  }
  const [shape] = dropShapes(bass, [30], FPS);
  check("measures a build rather than assuming one", shape.lead > 2, `${shape.lead}s of lead`);
  check("measures how long it holds", shape.decay > 8 && shape.decay < 12, `${shape.decay}s of decay`);
  check("and how hard it hits", shape.strength > 0.7, `strength ${shape.strength}`);
}

console.log(failed ? `\n${failed} check(s) failed\n` : "\ndeep beats ok\n");
process.exit(failed ? 1 : 0);
