/**
 * Helpers for motion that has to look the same at 60fps and at 120.
 *
 * The engine hands every theme an `fs`: how much of a 60Hz frame the current
 * frame covered — 1 at 60fps, 0.5 at 120. Travel scales by it directly
 * (`p.x += p.vx * fs`). The two idioms below do not, and getting them wrong is
 * how a converted theme still ends up wrong: they are rates, not distances.
 */

/**
 * Frame-rate-independent decay: use in place of the constant in `x *= k`.
 *
 * `x *= 0.94` every frame is a half-life measured in *frames*, so it decays
 * twice as fast when frames arrive twice as often — trails shorten, sparks die
 * early, and the theme reads as thin rather than as fast. `x *= dk(0.94, fs)`
 * keeps the half-life in time: at 120fps the factor becomes √0.94, and two of
 * them multiply back to exactly 0.94 over the same span.
 */
export function dk(k: number, fs: number): number {
  return fs === 1 ? k : Math.pow(k, fs);
}

/**
 * Frame-rate-independent approach: use in place of the constant in
 * `x += (target - x) * k`, and for a per-frame fade `alpha`, which is the same
 * shape — a fraction of the remaining distance taken each frame.
 */
export function ak(k: number, fs: number): number {
  return fs === 1 ? k : 1 - Math.pow(1 - k, fs);
}
