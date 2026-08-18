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

/**
 * Light treatments — how a palette is turned into actual colours.
 *
 * NORMAL is the plain mapping every theme has always used: the hue you asked
 * for, at the lightness and alpha you asked for.
 *
 * WAVE is the look the WAVES theme gets from its receding terrain, lifted out
 * so any theme can wear it. Nothing about it is specific to that geometry:
 * WAVES takes its colour position from row depth, and depth there is just how
 * *present* a row is — near rows are drawn bright and thick, far ones faint and
 * thin. So the same treatment falls out of mapping the requested alpha onto the
 * ramp. Two other things make the look, and they matter more than the hue ramp:
 * the stroke runs toward white as it brightens while the bloom around it keeps
 * the saturated palette colour, and faint things fall off harder than linearly,
 * which is what reads as translucent rather than merely dim.
 */
export const LIGHT_FX = ["NORMAL", "WAVE"];

export interface Lighting {
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
  /**
   * Blur radius for a full-frame bloom pass, in canvas px at 1× scale; 0 for
   * none.
   *
   * The bloom deliberately is *not* a shadow floor under every primitive. That
   * was tried and it triples a busy theme's frame time — shadow blur is priced
   * per draw call, and a theme that strokes a few hundred paths pays for every
   * one. Blurring the finished frame once costs the same whatever the theme
   * did, and looks better besides, because the halo comes from the whole
   * composition rather than from each stroke in isolation.
   */
  bloom: number;
}

export function lighting(ramp: HueRamp, pos: (f: number) => number, sat: number, style: string): Lighting {
  const hueAt = (f: number) => ramp.at(pos(f));
  if (style !== "WAVE") {
    return {
      C1: (a = 1, l = 62) => `hsla(${hueAt(0)}, ${sat}%, ${l}%, ${a})`,
      C2: (a = 1, l = 62) => `hsla(${hueAt(1)}, ${sat}%, ${l}%, ${a})`,
      CMix: (f: number, a = 1, l = 62) => `hsla(${hueAt(f)}, ${sat}%, ${l}%, ${a})`,
      bloom: 0,
    };
  }
  const col = (f: number, a: number, l: number) => {
    const t = a > 1 ? 1 : a > 0 ? a : 0;
    // Brightness *shifts* the theme's own ramp position rather than replacing
    // it. Weighting the two evenly pulls everything a theme draws at middling
    // alpha toward the middle of the palette, which collapses the contrast
    // between its two colours and reads as muddy — the theme has to stay in
    // charge of where on the ramp it is.
    const p = f * 0.7 + t * 0.3;
    // Toward white as it brightens — scaled by how light the element already
    // is, which is the part that took three attempts to get right.
    //
    // Blending toward a constant puts a floor under everything. Adding a flat
    // `t * t * 28` instead looks safe, because it vanishes as alpha goes to
    // zero — but a theme's background is usually a large fill drawn at *full*
    // alpha and low lightness, so it took the full lift and a dark backdrop
    // became a bright one. Over a whole screen that is a colour fog with the
    // visualizer somewhere behind it.
    //
    // Scaling by l/100 ties the lift to what the theme was already treating as
    // light: a stroke at 62 goes to 84 and reads white-hot, a backdrop at 20
    // moves by one and stays a backdrop.
    const lm = Math.min(92, l + t * t * (l / 100) * 35);
    return `hsla(${hueAt(p)}, ${sat}%, ${lm}%, ${Math.min(0.93, Math.pow(t, 1.06))})`;
  };
  return {
    C1: (a = 1, l = 62) => col(0, a, l),
    C2: (a = 1, l = 62) => col(1, a, l),
    CMix: (f: number, a = 1, l = 62) => col(f, a, l),
    bloom: 13,
  };
}

/** CSS gradient showing every stop, for palette swatches. */
export function swatchCss(stops: number[], sat: number, angle = 90, l = 60): string {
  const list = stops.length > 2 ? [...stops, stops[0]] : stops;
  const parts = list.map((h, i) => `hsl(${h},${sat}%,${l}%) ${(i / (list.length - 1)) * 100}%`);
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}
