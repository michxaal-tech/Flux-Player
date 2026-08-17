// Palette hue ramps.
//
// A palette used to be a pair of hues, and every colour in the app was a lerp
// between them. That caps a look at two colours no matter what the theme does,
// which is why there was no way to have a real rainbow, an oil-slick or an
// iridescent pastel palette.
//
// A palette is now a list of hue stops of any length. Two-stop palettes behave
// exactly as they always did — same lerp, same unclamped extrapolation past the
// ends, so none of the 31 original looks moves. Three or more stops turn the
// ramp into a *cycle*, taking the short way round the wheel between each pair,
// which is what makes a wrap from violet back to red read as one continuous
// spectrum rather than a sweep backwards through everything.
import type { Palette } from "./constants";

/** The hue stops a palette resolves to; CUSTOM takes the user's own pair. */
export const stopsOf = (pal: Palette, h1: number, h2: number): number[] =>
  pal.h && pal.h.length ? pal.h : [h1, h2];

export interface HueRamp {
  /** hue at position f. Cyclic ramps wrap; two-stop ramps extrapolate. */
  at: (f: number) => number;
  /** true when the ramp has more than two stops and therefore wraps */
  cyclic: boolean;
}

export function hueRamp(stops: number[]): HueRamp {
  const n = stops.length;
  if (n < 2) {
    const h = stops[0] ?? 0;
    return { at: () => h, cyclic: false };
  }
  if (n === 2) {
    // the original behaviour, extrapolation included — themes do pass f
    // outside 0..1 and rely on running off the end of the ramp
    const [a, b] = stops;
    return { at: (f) => a + (b - a) * f, cyclic: false };
  }
  return {
    cyclic: true,
    at: (f) => {
      const s = ((((f % 1) + 1) % 1)) * n;
      const i = Math.floor(s) % n;
      let d = stops[(i + 1) % n] - stops[i];
      // shortest path round the wheel, so red→violet closes the loop directly
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return stops[i] + d * (s - Math.floor(s));
    },
  };
}

/**
 * Where along the ramp C1 and C2 sample.
 *
 * Most themes only ever ask for C1 and C2, which can only be two colours — so
 * on a multi-stop palette the rest of the ramp would never reach them. Sliding
 * the sample window round the cycle is what lets a rainbow palette actually
 * look like a rainbow in a theme that draws two colours: C1 and C2 stay half a
 * cycle apart and complementary, and CMix stays consistent with both, but the
 * pair walks the whole spectrum over about half a minute.
 *
 * Two-stop palettes get the identity, so they never move.
 */
export const rampPos = (ramp: HueRamp, drift: number) =>
  ramp.cyclic ? (f: number) => drift + f * 0.5 : (f: number) => f;

/** Frames for one full pass of a cyclic palette, at speed 1. */
export const DRIFT_FRAMES = 2160;

/** CSS gradient showing every stop, for palette swatches. */
export function swatchCss(stops: number[], sat: number, angle = 90, l = 60): string {
  const list = stops.length > 2 ? [...stops, stops[0]] : stops;
  const parts = list.map((h, i) => `hsl(${h},${sat}%,${l}%) ${(i / (list.length - 1)) * 100}%`);
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}
