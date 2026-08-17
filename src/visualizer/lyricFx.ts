// Per-letter lyric effects.
//
// This is a second, independent dimension to the lyric look. LYRIC_STYLES in
// lyricRenderer.ts decide how a line *arrives and leaves* — drift, cascade,
// typewriter. The effects here decide what the letters themselves are *doing*
// while they sit there: colour ramps, waves, karaoke fills, neon tubes.
//
// The two compose: any style can be paired with any effect, which is why they
// are kept apart rather than folded into one list. An effect returns a small
// per-character descriptor and the renderer applies it, so adding one means
// writing a case here, not touching layout code.
//
// The vocabulary follows what karaoke and lyric-video tooling has settled on —
// colour cycling, wave/bounce/elastic motion, word-by-word highlight sweeps,
// outline/extrude/neon treatments, and VHS/glitch texture.

/** Effect groups, used to organise the picker. */
export const LYRIC_FX_GROUPS: { name: string; items: string[] }[] = [
  {
    name: "COLOR",
    items: [
      "RAINBOW", "RAINBOW WAVE", "PALETTE", "OMBRE", "FIRE", "ICE", "TOXIC",
      "GOLD", "CHROME", "NEON PULSE", "SPECTRUM", "TWO TONE", "STROBE", "HEATMAP",
    ],
  },
  {
    name: "MOTION",
    items: [
      "WAVE", "RIPPLE", "JELLO", "SHIVER", "BOUNCE", "PENDULUM", "TORNADO",
      "ELASTIC", "DRUNK", "MARCH", "ORBIT", "BASS PUMP",
    ],
  },
  {
    name: "REVEAL",
    items: ["KARAOKE", "SWEEP", "SCAN", "UNDERLINE", "HIGHLIGHT", "TYPE ON"],
  },
  {
    name: "TEXTURE",
    items: [
      "OUTLINE", "BOLD LINE", "EXTRUDE", "NEON TUBE", "GLITCH", "CHROMATIC",
      "SPARKLE", "FLICKER", "VHS", "DROP SHADOW", "EMBOSS", "BLUR PULSE",
    ],
  },
];

/** Flat list, "NONE" first. */
export const LYRIC_FX: string[] = ["NONE", ...LYRIC_FX_GROUPS.flatMap((g) => g.items)];

export interface LetterFxCtx {
  /** character index within the line, and the line's character count */
  i: number;
  n: number;
  /** row index for multi-row blocks */
  row: number;
  /** seconds */
  t: number;
  /** musical time in beats — keeps effects in phase at any tempo */
  flow: number;
  beatE: number;
  hitE: number;
  bass: number;
  /** how far through the line we are, 0..1 — drives the karaoke fill */
  frac: number;
  freq: Uint8Array;
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
  /**
   * Colour from a position along a two-hue ramp.
   *
   * Effects like FIRE and ICE are defined by fixed hues, which is the point of
   * choosing them — but it means they ignore the palette entirely. With MATCH
   * THEME on, this swaps `hueA`/`hueB` for the palette's pair while keeping the
   * effect's own lightness and saturation *shape*, so FIRE stays a hot ramp
   * with a bright core and simply wears the theme's colours instead of orange.
   */
  ramp: (f: number, hueA: number, hueB: number, sat: number, light: number, alpha?: number) => string;
}

/** Builds the ramp function for a frame. `h1`/`h2`/`palSat` come from the
 * active palette; `match` is the user's MATCH THEME switch. */
export function makeRamp(
  match: boolean, h1: number, h2: number, palSat: number,
): LetterFxCtx["ramp"] {
  // travel the short way round the wheel, or a two-hue palette can sweep
  // through every colour in between and stop reading as that palette
  let d = ((h2 - h1) % 360 + 540) % 360 - 180;
  return (f, hueA, hueB, sat, light, alpha = 1) => {
    const t = f > 0 ? (f < 1 ? f : 1) : 0;
    const l = Math.min(80, Math.max(6, light));
    if (!match) return `hsla(${hueA + (hueB - hueA) * t}, ${sat}%, ${l}%, ${alpha})`;
    // Blend toward the palette's saturation rather than taking it outright, so
    // a deliberately muted effect stays muted and a vivid one stays vivid.
    const s = Math.round(Math.min(100, sat * 0.3 + palSat * 0.7));
    return `hsla(${h1 + d * t}, ${s}%, ${l}%, ${alpha})`;
  };
}

/** What one character should look like this frame. Everything is optional; the
 * renderer applies only what an effect actually sets. */
export interface LetterStyle {
  color?: string;
  /** offsets in em (multiples of the font size) so they scale with the text */
  dx?: number;
  dy?: number;
  scale?: number;
  scaleY?: number;
  rot?: number;
  alpha?: number;
  /** extra shadow blur in px */
  glow?: number;
  glowColor?: string;
  /** stroke colour and width in em; when set with no fill, the glyph is hollow */
  stroke?: string;
  strokeW?: number;
  hollow?: boolean;
  /** depth copies behind the glyph, in em */
  extrude?: number;
  extrudeColor?: string;
  /** offset colour copies drawn behind, for chromatic/glitch looks */
  ghosts?: { dx: number; dy: number; color: string }[];
}

const hash01 = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const TAU = Math.PI * 2;

/** Narrow bump centred on 0 — used for highlight bands sweeping along a word. */
const gauss = (d: number, k: number): number => Math.exp(-(d * d) / k);
/** positive modulo, so a band can wrap past the end of the line */
const wrap = (v: number, m: number): number => ((v % m) + m) % m;

/**
 * Returns the per-character treatment for `fx`.
 *
 * `p` is the character's position along the line, 0..1 — most effects are just
 * a function of it plus musical time, which is what makes them read as a wave
 * moving through the words rather than as each letter doing its own thing.
 */
export function letterFx(fx: string, x: LetterFxCtx): LetterStyle {
  const { i, n, t, flow, beatE, hitE, bass, frac } = x;
  const p = n > 1 ? i / (n - 1) : 0;
  const r = hash01(i * 7.13 + x.row * 3.7);

  switch (fx) {
    // ── COLOUR ─────────────────────────────────────────────────────────────
    case "RAINBOW":
      // matched, the "rainbow" becomes a full sweep of the palette pair
      return { color: x.ramp(p, 0, 360, 92, 66) };
    case "RAINBOW WAVE":
      return { color: x.ramp(wrap(p - flow * 0.35, 1), 0, 360, 95, 66) };
    case "PALETTE":
      return { color: x.CMix(p, 1, 68) };
    case "OMBRE":
      // vertical ramp is faked by lightness, which reads the same at this size
      return { color: x.CMix(0.5, 1, 44 + (1 - p) * 34) };
    case "FIRE": {
      const f = (1 - p) * 0.6 + hash01(i + Math.floor(t * 12)) * 0.4;
      return { color: x.ramp(f, 6, 52, 100, 46 + f * 26), glow: 10 + beatE * 8, glowColor: x.ramp(0.5, 24, 24, 100, 50, 0.8) };
    }
    case "ICE":
      return { color: x.ramp(p, 186, 210, 88, 62 + Math.sin(flow * 2 + p * 5) * 10), glow: 8, glowColor: x.ramp(0.3, 196, 196, 100, 60, 0.7) };
    case "TOXIC":
      // deliberately two-tone: it maps onto the palette's two ends
      return { color: x.ramp(p < 0.5 ? 0 : 1, 86, 292, 100, 58 + beatE * 12) };
    case "GOLD": {
      // a highlight band sliding along the word, which is what sells "metal"
      const band = gauss(wrap(p - flow * 0.3, 1.4) - 0.2, 0.012);
      return { color: x.ramp(band, 44, 48, 90, 48 + band * 30), glow: 6 + band * 14, glowColor: x.ramp(0.8, 48, 48, 100, 60, 0.85) };
    }
    case "CHROME": {
      const band = gauss(wrap(p - flow * 0.35, 1.5) - 0.25, 0.014);
      // chrome is defined by being *desaturated*, so it keeps its own low
      // saturation even when matched — only the hue follows the palette
      return { color: x.ramp(band, 210, 214, 12, 52 + band * 28), glow: band * 12, glowColor: "rgba(255,255,255,0.8)" };
    }
    case "NEON PULSE":
      return {
        color: x.CMix(p, 1, 62 + beatE * 14),
        glow: 12 + beatE * 22,
        glowColor: x.C1(0.9, 62),
      };
    case "SPECTRUM": {
      // each letter reads its own slice of the spectrum
      const b = x.freq.length ? x.freq[Math.min(x.freq.length - 1, Math.floor(4 + p * 60))] / 255 : 0.4;
      return { color: x.CMix(b, 1, 42 + b * 34), scale: 1 + b * 0.14 };
    }
    case "TWO TONE":
      return { color: i % 2 === 0 ? x.C1(1, 66) : x.C2(1, 66) };
    case "STROBE":
      return { color: hitE > 0.4 ? x.C2(1, 74) : x.C1(1, 62) };
    case "HEATMAP": {
      const b = x.freq.length ? x.freq[Math.min(x.freq.length - 1, Math.floor(2 + p * 40))] / 255 : 0.4;
      return { color: x.ramp(b, 60, 0, 100, 40 + b * 32), glow: b * 14, glowColor: x.ramp(0.5, 30, 30, 100, 55, 0.7) };
    }

    // ── MOTION ─────────────────────────────────────────────────────────────
    case "WAVE":
      return { dy: Math.sin(flow * TAU * 0.5 + p * 6) * 0.12 };
    case "RIPPLE":
      // a single crest launched on the beat, travelling along the line
      return { dy: -gauss(p - wrap(flow * 0.6, 1.3), 0.006) * 0.3 * (0.4 + beatE) };
    case "JELLO": {
      const s = Math.sin(flow * TAU * 0.5 + p * 4);
      return { scale: 1 + s * 0.09 * (0.5 + beatE), scaleY: 1 - s * 0.09 * (0.5 + beatE) };
    }
    case "SHIVER":
      return { dx: (hash01(i + Math.floor(t * 30)) - 0.5) * 0.06, dy: (hash01(i * 3 + Math.floor(t * 30)) - 0.5) * 0.06 };
    case "BOUNCE": {
      const ph = wrap(flow * 0.8 - p * 0.22, 1);
      return { dy: -Math.abs(Math.sin(ph * Math.PI)) * 0.18 };
    }
    case "PENDULUM":
      return { rot: Math.sin(flow * TAU * 0.35 + p * 2.2) * 0.16 };
    case "TORNADO":
      return { rot: Math.sin(flow * TAU * 0.5 + p * 3) * (0.25 + beatE * 0.35) };
    case "ELASTIC": {
      const ph = Math.max(0, 1 - wrap(flow * 0.7 - p * 0.3, 1.4));
      return { scale: 1 + ph * 0.35 };
    }
    case "DRUNK":
      return {
        dx: Math.sin(t * 0.9 + r * 9) * 0.07,
        dy: Math.cos(t * 0.7 + r * 12) * 0.07,
        rot: Math.sin(t * 0.5 + r * 6) * 0.08,
      };
    case "MARCH":
      return { dy: (i % 2 === 0 ? -1 : 1) * Math.sin(flow * TAU * 0.5) * 0.1 };
    case "ORBIT": {
      const a = flow * TAU * 0.4 + p * 3;
      return { dx: Math.cos(a) * 0.06, dy: Math.sin(a) * 0.06 };
    }
    case "BASS PUMP":
      return { scale: 1 + bass * 0.3, glow: bass * 20, glowColor: x.C1(0.8, 64) };

    // ── REVEAL ─────────────────────────────────────────────────────────────
    case "KARAOKE":
      // the classic: sung syllables are lit, the rest is dimmed
      return p <= frac
        ? { color: x.C1(1, 70), glow: 10, glowColor: x.C1(0.8, 62) }
        : { color: "rgba(255,255,255,0.34)" };
    case "SWEEP": {
      const band = gauss(p - frac, 0.01);
      return { color: `rgba(255,255,255,${0.5 + band * 0.5})`, glow: band * 24, glowColor: x.C2(0.9, 70), scale: 1 + band * 0.1 };
    }
    case "SCAN": {
      const band = gauss(p - wrap(flow * 0.5, 1.2), 0.008);
      return { color: x.CMix(p, 0.5 + band * 0.5, 60 + band * 18), glow: band * 20, glowColor: x.C1(1, 68) };
    }
    case "UNDERLINE":
      return p <= frac ? { color: "#fff", stroke: x.C1(1, 66), strokeW: 0.03 } : { alpha: 0.5 };
    case "HIGHLIGHT":
      return p <= frac
        ? { color: x.C2(1, 24), stroke: x.C1(1, 66), strokeW: 0.22, hollow: false }
        : { color: "rgba(255,255,255,0.45)" };
    case "TYPE ON":
      // characters arrive one at a time across the line's own duration
      return { alpha: p <= frac * 1.15 ? 1 : 0 };

    // ── TEXTURE ────────────────────────────────────────────────────────────
    case "OUTLINE":
      return { hollow: true, stroke: x.C1(1, 70), strokeW: 0.028 };
    case "BOLD LINE":
      return { stroke: "#05060A", strokeW: 0.1, color: x.CMix(p, 1, 66) };
    case "EXTRUDE":
      return { color: x.C1(1, 70), extrude: 0.06 + beatE * 0.02, extrudeColor: x.C2(0.85, 30) };
    case "NEON TUBE":
      return { hollow: true, stroke: x.C1(1, 70), strokeW: 0.022, glow: 18 + beatE * 16, glowColor: x.C1(1, 60) };
    case "GLITCH": {
      const g = hitE > 0.25 || hash01(Math.floor(t * 9) + i) > 0.85;
      return g
        ? { color: "#fff", ghosts: [{ dx: -0.035, dy: 0, color: "rgba(255,0,90,0.8)" }, { dx: 0.035, dy: 0, color: "rgba(0,220,255,0.8)" }], dx: (hash01(i + Math.floor(t * 14)) - 0.5) * 0.05 }
        : { color: "#fff" };
    }
    case "CHROMATIC":
      return {
        color: "#fff",
        ghosts: [
          { dx: -0.018 - beatE * 0.02, dy: 0, color: "rgba(255,40,120,0.75)" },
          { dx: 0.018 + beatE * 0.02, dy: 0, color: "rgba(0,210,255,0.75)" },
        ],
      };
    case "SPARKLE": {
      const tw = hash01(i * 5 + Math.floor(t * 6)) > 0.8;
      return { color: "#fff", glow: tw ? 22 : 6, glowColor: tw ? "rgba(255,255,255,0.95)" : x.C1(0.7, 66), scale: tw ? 1.08 : 1 };
    }
    case "FLICKER":
      return { alpha: hash01(i * 3 + Math.floor(t * 14)) > 0.12 ? 1 : 0.25 };
    case "VHS":
      return {
        color: "#fff",
        dy: (hash01(Math.floor(t * 10) + x.row) - 0.5) * 0.05,
        ghosts: [
          { dx: -0.026, dy: 0.004, color: "rgba(255,0,80,0.55)" },
          { dx: 0.026, dy: -0.004, color: "rgba(0,255,220,0.55)" },
        ],
      };
    case "DROP SHADOW":
      return { color: "#fff", extrude: 0.05, extrudeColor: "rgba(0,0,0,0.85)" };
    case "EMBOSS":
      return {
        color: x.CMix(p, 1, 64),
        ghosts: [
          { dx: -0.012, dy: -0.012, color: "rgba(255,255,255,0.5)" },
          { dx: 0.012, dy: 0.012, color: "rgba(0,0,0,0.6)" },
        ],
      };
    case "BLUR PULSE":
      return { glow: 6 + (1 - beatE) * 26, glowColor: x.C1(0.9, 62), color: "#fff" };

    default:
      return {};
  }
}
