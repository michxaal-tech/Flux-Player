/**
 * Shared primitives for the mobile-native visualizers.
 *
 * These themes are built to one hard rule, and everything here exists to make
 * keeping it easy:
 *
 *   **Never call `glow()`.**
 *
 * That is not a style preference. The engine decides per theme whether the
 * frame needs an offscreen scene buffer, a bloom pass and a blit — and it
 * decides by watching whether the theme ever asked for glow. A theme that never
 * asks draws straight to the visible canvas, and several full-screen passes a
 * frame stop happening. That saving is what pays for drawing at nearly native
 * resolution instead of at 1200px upscaled, which is where the blur came from.
 *
 * So the look has to come from somewhere cheaper. It comes from `light()` —
 * a radial falloff rasterised once per colour and blitted — which reads as a
 * glow and costs what an image draw costs. The one trap is its cache: give it a
 * continuously varying colour and it rebuilds a canvas per point, which is
 * slower than the `shadowBlur` it replaced. Hence `q()` below: quantise the
 * colour parameter before asking for a light.
 *
 * The second rule is the ordinary one for this codebase: motion is per second,
 * not per frame. Travel takes `* fs`, decays go through `dk`, approaches
 * through `ak`. See rate.ts.
 */
import type { ThemeCtx } from "../themeTypes";
import { light } from "../light";

/** Quantise 0..1 to a small number of steps, so `light()` reuses its sprites. */
export const q = (v: number, steps = 6): number => Math.round(v * steps) / steps;

/**
 * Colour bucket index, for batching.
 *
 * A grid theme wants a slightly different colour per cell, and the naive way to
 * get that is a `fillStyle` assignment and a `fill()` per cell — two hundred
 * draw calls a frame for a lattice. Bucketing the colour into a handful of
 * steps lets every cell in a bucket be drawn in one call instead.
 *
 * The batching is done with `beginPath()` and one pass per bucket, *not* with a
 * `Path2D` per bucket, and that is a measured distinction rather than a stylistic
 * one: allocating seven paths a frame made COMB and PRISMBAR slower than the
 * per-cell version they replaced (28→33ms and 29→35ms). Without a `shadowBlur`
 * in play the per-call overhead is small, so the allocation dominated. BARS has
 * always used the pass form; these follow it.
 */
export const BUCKETS = 7;
export const bucket = (v: number): number =>
  Math.max(0, Math.min(BUCKETS - 1, Math.floor(v * BUCKETS)));

/** Clamp to 0..1, mapping NaN to 0. */
export const c01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);

/**
 * One spectrum band, 0..1, at position `f` (0..1) across the useful range.
 *
 * Falls back to a rolling synthetic shape when there is no live audio, so a
 * paused player still shows something alive rather than a flat line.
 */
export function band(x: ThemeCtx, f: number, lo = 2, hi = 200): number {
  const { freq, liveAudio, vt } = x;
  if (!liveAudio) return 0.18 + 0.14 * Math.sin(vt * 0.03 + f * 7);
  const i = Math.floor(lo + f * (hi - lo));
  return (freq[i] ?? 0) / 255;
}

/**
 * Bass-weighted band: low frequencies carry most of a track's felt energy, and
 * a linear sweep across the FFT gives them a couple of bins out of two hundred.
 * This biases the sample toward the low end so the picture moves with the kick.
 */
export function bandLog(x: ThemeCtx, f: number, lo = 2, hi = 200): number {
  return band(x, Math.pow(f, 1.7), lo, hi);
}

/** Waveform sample, -1..1, at position `f` (0..1). */
export function wav(x: ThemeCtx, f: number): number {
  const { wave, liveAudio, vt } = x;
  if (!liveAudio) return Math.sin(vt * 0.05 + f * 11) * 0.35;
  const i = Math.floor(f * (wave.length - 1));
  return ((wave[i] ?? 128) - 128) / 128;
}

/** A soft light blob, colour quantised so the sprite cache actually hits. */
export function blob(
  x: ThemeCtx,
  px: number,
  py: number,
  r: number,
  a: number,
  mix = 0.5,
  lit = 66,
): void {
  light(x.c, x.CMix(q(mix), 1, lit), px, py, r, a);
}

/**
 * Build a regular polygon path. Used instead of `arc` in several themes because
 * a faceted ring reads as designed rather than as a plain hoop, and a dozen
 * `lineTo`s cost less than a circle's tessellation.
 */
export function polyPath(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  n: number,
  rot = 0,
): void {
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.closePath();
}

/**
 * Per-theme scratch state, created on first frame.
 *
 * Themes keep their own particles and accumulators; this is the same
 * `L.scratch` bag the desktop themes use, typed at the call site.
 */
export function scratch<T>(x: ThemeCtx, key: string, make: () => T): T {
  const s = x.L.scratch as Record<string, unknown>;
  if (s[key] === undefined) s[key] = make();
  return s[key] as T;
}

/**
 * How many of a thing to draw, scaled by the particle setting and by the
 * adaptive quality signal.
 *
 * Every mobile theme routes its counts through this, so the governor can still
 * thin a struggling frame even though these themes are cheap by construction.
 */
export function count(x: ThemeCtx, base: number): number {
  const cfgP = x.cfg.particles ?? 1;
  const qy = x.L.quality ?? 1;
  return Math.max(4, Math.round(base * (0.45 + cfgP * 0.55) * (0.5 + qy * 0.5)));
}
