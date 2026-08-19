// Lyric line styles.
//
// Every style here is a *continuous function of time*. That is the whole design,
// and it is why this replaced twenty hand-written branches.
//
// The old styles each did their own thing: their own screen position, their own
// entry ramp, their own idea of what happens when a line leaves. WAVE was the
// one people liked, and the reason is that it never makes a decision — each
// frame is a smooth function of (time, character index), so there is nothing to
// jump. The others keyed off spring and settle ramps at scattered positions, so
// they arrived somewhere, sat, and were replaced. Twenty branches also meant
// twenty handovers to get right, and they were not right.
//
// So a style is now just: an optional per-character offset, an optional
// whole-line offset, and where the block sits. The renderer owns everything
// else — layout, the crossfade in and out, the dwell cap, letter effects — so
// every style behaves identically at the seams and differs only in its motion.
//
// Offsets are in em, so they scale with the font rather than the screen.

export interface StyleArg {
  /** character index within the whole block, and how many there are */
  i: number;
  n: number;
  /** which wrapped row this character is on, and how many rows there are */
  row: number;
  rows: number;
  /** seconds, continuous — never resets, so nothing driven by it can jump */
  flow: number;
  /** 0..1 through this line's own span */
  frac: number;
  /** seconds since this line appeared */
  age: number;
}

export interface CharMotion {
  dx?: number;
  dy?: number;
  rot?: number;
  scale?: number;
  alpha?: number;
}

export interface LineMotion {
  dx?: number;
  dy?: number;
  rot?: number;
  scale?: number;
}

export interface LyricStyleDef {
  id: string;
  /** one line for the picker */
  blurb: string;
  /** vertical anchor as a fraction of height; everything centres horizontally */
  anchorY?: number;
  /** per-character motion — the fluid part */
  char?: (a: StyleArg) => CharMotion;
  /** whole-line motion */
  line?: (a: StyleArg) => LineMotion;
  /** light the line progressively as it is sung, karaoke style */
  fill?: boolean;
}

/** ease a value in over `secs`, without ever snapping */
const rise = (age: number, secs: number): number => {
  const t = Math.min(1, Math.max(0, age / secs));
  return t * t * (3 - 2 * t);
};

export const LYRIC_STYLE_DEFS: LyricStyleDef[] = [
  {
    id: "WAVE",
    blurb: "characters ride a travelling wave",
    char: ({ i, flow }) => ({ dy: Math.sin(flow * 1.7 - i * 0.5) * 0.13 }),
  },
  {
    id: "RIPPLE",
    blurb: "a wave that runs down through the rows",
    char: ({ i, row, flow }) => ({ dy: Math.sin(flow * 1.4 - i * 0.34 - row * 0.9) * 0.11 }),
  },
  {
    id: "TIDE",
    blurb: "letters sway sideways",
    char: ({ i, flow }) => ({ dx: Math.sin(flow * 1.05 - i * 0.26) * 0.1 }),
  },
  {
    id: "FLOAT",
    blurb: "each letter bobs on its own",
    char: ({ i, flow }) => ({ dy: Math.sin(flow * 0.9 + i * 0.7) * 0.075 }),
  },
  {
    id: "SWELL",
    blurb: "size breathes along the line",
    char: ({ i, flow }) => ({ scale: 1 + Math.sin(flow * 1.5 - i * 0.4) * 0.085 }),
  },
  {
    id: "PENDULUM",
    blurb: "letters rock in sequence",
    char: ({ i, flow }) => ({ rot: Math.sin(flow * 1.15 - i * 0.3) * 0.1 }),
  },
  {
    id: "SPIRAL",
    blurb: "a turning, growing wave",
    char: ({ i, flow }) => {
      const s = Math.sin(flow * 1.3 - i * 0.36);
      return { rot: s * 0.09, scale: 1 + s * 0.06 };
    },
  },
  {
    id: "SHIMMER",
    blurb: "brightness travels through the words",
    char: ({ i, flow }) => ({ alpha: 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(flow * 2 - i * 0.6)) }),
  },
  {
    id: "TWINKLE",
    blurb: "letters glimmer out of step",
    char: ({ i, flow }) => {
      // a fixed irrational stride keeps neighbours out of phase without random
      const ph = i * 2.399963;
      return { alpha: 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(flow * 1.6 + ph)) };
    },
  },
  {
    id: "DRIFT",
    blurb: "the line floats slowly upward",
    line: ({ age, flow }) => ({ dy: 0.3 - rise(age, 0.6) * 0.3 - age * 0.02, dx: Math.sin(flow * 0.35) * 0.05 }),
  },
  {
    id: "GLIDE",
    blurb: "slides in and settles",
    line: ({ age }) => ({ dx: (1 - rise(age, 0.55)) * -0.9 }),
  },
  {
    id: "BREATHE",
    blurb: "the whole line breathes",
    line: ({ flow }) => ({ scale: 1 + Math.sin(flow * 0.55) * 0.022 }),
  },
  {
    id: "LEAN",
    blurb: "a slow tilt back and forth",
    line: ({ flow }) => ({ rot: Math.sin(flow * 0.45) * 0.022 }),
  },
  {
    id: "ORBIT",
    blurb: "the line traces a slow circle",
    line: ({ flow }) => ({ dx: Math.cos(flow * 0.4) * 0.12, dy: Math.sin(flow * 0.4) * 0.07 }),
  },
  {
    id: "ZOOM",
    blurb: "grows almost imperceptibly",
    line: ({ age }) => ({ scale: 0.97 + rise(age, 1.2) * 0.03 + age * 0.004 }),
  },
  {
    id: "REVEAL",
    blurb: "words light up as they are sung",
    char: ({ i, n, frac }) => {
      // a soft edge that sweeps the line rather than a hard cut
      const at = frac * (n + 6) - 3;
      return { alpha: 0.32 + 0.68 * Math.min(1, Math.max(0, (at - i) / 4 + 0.5)) };
    },
  },
  {
    id: "SPOTLIGHT",
    blurb: "a light follows the singing",
    char: ({ i, n, frac }) => {
      const at = frac * n;
      const d = Math.abs(i - at);
      return { alpha: 0.35 + 0.65 * Math.exp(-(d * d) / 18) };
    },
  },
  {
    id: "KARAOKE",
    blurb: "subtitle at the bottom, filling as it goes",
    anchorY: 0.68,
    fill: true,
  },
  {
    id: "CASCADE",
    blurb: "letters fall into place one after another",
    char: ({ i, n, age }) => {
      // each character has its own start, so the line assembles smoothly
      const lead = (i / Math.max(1, n)) * 0.4;
      const k = rise(age - lead, 0.55);
      // a short drop, not a plunge: half an em of travel reads as letters being
      // thrown at the screen rather than settling onto it
      return { dy: (1 - k) * -0.22, alpha: 0.2 + k * 0.8 };
    },
  },
  {
    id: "STILL",
    blurb: "no movement at all",
  },
];

export const LYRIC_STYLES: string[] = LYRIC_STYLE_DEFS.map((s) => s.id);

const BY_ID = new Map(LYRIC_STYLE_DEFS.map((s) => [s.id, s]));

/**
 * The styles this replaced, pointed at their nearest survivor.
 *
 * Saved looks and share codes carry a style name, and the store's own default
 * was "FADE" — which was never in the old list either, so it fell through every
 * branch to a generic path. Anything unrecognised lands on WAVE.
 */
const LEGACY: Record<string, string> = {
  FADE: "STILL",
  SCATTER: "FLOAT",
  STACK: "DRIFT",
  POP: "SWELL",
  RISE: "DRIFT",
  SPIN: "SPIRAL",
  FLIP: "PENDULUM",
  SLIDE: "GLIDE",
  FOCUS: "ZOOM",
  PULSE: "BREATHE",
  TYPE: "CASCADE",
  BOUNCE: "FLOAT",
  GLITCH: "TWINKLE",
  ECHO: "SHIMMER",
  SWEEP: "REVEAL",
};

/** the id a saved name resolves to, so old looks keep working rather than
 * silently reverting to the default */
export const normaliseStyle = (name: string): string => styleFor(name).id;

export function styleFor(name: string): LyricStyleDef {
  return BY_ID.get(name) ?? BY_ID.get(LEGACY[name] ?? "") ?? LYRIC_STYLE_DEFS[0];
}
