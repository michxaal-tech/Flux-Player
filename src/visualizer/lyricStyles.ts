// Lyric line styles.
//
// A style is a continuous function of time: an optional per-character offset, an
// optional whole-line one, and where the block sits. The renderer owns layout,
// opacity and timing, so every style behaves identically at the seams and
// differs only in how it moves.
//
// Two faults this went through, both self-inflicted and worth stating:
//
// The change from one line to the next used to be opacity and nothing else — a
// line dimmed out, the screen went briefly empty, the next dimmed in. Correct,
// and lifeless. A style now gets `enter` and `exit` (0→1) alongside the clock,
// so it carries the line on and off with the same motion that defines it, and
// the line leaving moves *away* while the next arrives. That is what makes the
// change read as one thing becoming another instead of a swap.
//
// And the amplitudes were far too small. They had been tuned down until they
// passed a check that rewarded a line for holding still, which is the opposite
// of what these are for. Motion here should be obvious across a room.
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
  /** 0→1 as the line arrives */
  enter: number;
  /** 0→1 as the line leaves */
  exit: number;
  /** beat punch envelope, 0..1 — only WAVE uses it, deliberately */
  beat: number;
}

export interface CharMotion {
  dx?: number;
  dy?: number;
  rot?: number;
  scale?: number;
  alpha?: number;
  /**
   * 0..1 along the palette, for styles that colour each character by where it
   * is in their motion rather than leaving it white. This is most of what WAVE
   * is: the same sine that lifts a letter also picks its colour, so the line
   * carries a travelling gradient. Rebuilding WAVE without it kept the movement
   * and lost the look.
   */
  tint?: number;
}

export interface LineMotion {
  dx?: number;
  dy?: number;
  rot?: number;
  scale?: number;
  /** shadow blur in px, when a style wants its own rather than the default */
  glow?: number;
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
  /**
   * How a per-character `tint` maps onto the palette. Left out, a tint slides
   * lightness with the value; a style that wants a flat ramp across the whole
   * line sets its own.
   */
  tintLight?: number;
  tintAlpha?: number;
  /** tint the glow to match each character, rather than the line's colour */
  tintGlow?: boolean;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/**
 * A per-character version of a 0→1 ramp: character `i` starts later than the one
 * before it, so a line assembles and disperses across itself rather than moving
 * as one slab. This is most of what makes an entrance feel designed.
 */
const wash = (k: number, i: number, n: number, spread = 0.55): number => {
  const start = (i / Math.max(1, n)) * spread;
  return ease((k - start) / Math.max(0.08, 1 - spread));
};

export const LYRIC_STYLE_DEFS: LyricStyleDef[] = [
  {
    // The first one, recovered from git rather than rebuilt from memory.
    //
    // What makes it is the colour, not the movement: a rainbow spanning the
    // whole line — one hue per character from start to end — that scrolls
    // along it over time, with each character's glow tinted to match. The
    // wobble is small and quick underneath that. Every later version replaced
    // this with colour taken from the sine's height, which loses the ramp and
    // the scroll, and that is what was missing each time this got "restored".
    //
    // The numbers are the originals: 7.2 rad/s of travel (the old frame-counter
    // speed at 60fps), a hue that walks the palette every ~4 seconds, and a
    // wobble of about 0.05em rising to 0.13 on a beat.
    id: "WAVE",
    blurb: "a rainbow scrolls along the line while the letters wobble",
    tintLight: 78,
    tintAlpha: 0.95,
    tintGlow: true,
    char: ({ i, n, flow, enter, exit, beat }) => ({
      dy: Math.sin(flow * 7.2 + i * 0.55) * (0.046 + beat * 0.083) * ease(enter) - ease(exit) * 1.2,
      tint: ((i / Math.max(1, n - 1)) + flow * 0.24) % 1,
    }),
    // The one deviation, deliberate: the outgoing line lifts away rather than
    // sitting on the incoming one. The original left them stacked at the same
    // anchor, which is the complaint that has come back more than any other.
    line: ({ beat }) => ({ glow: 14 + beat * 12 }),
  },
  {
    id: "RIPPLE",
    blurb: "a wave that runs down through the rows",
    char: ({ i, row, flow, enter, exit }) => {
      const e = ease(enter - row * 0.18);
      return {
        dy: Math.sin(flow * 1.4 - i * 0.34 - row * 0.9) * 0.16 + (1 - e) * 0.9 - ease(exit) * 1.1,
        scale: 0.7 + e * 0.3,
      };
    },
  },
  {
    id: "TIDE",
    blurb: "letters sway sideways and wash out",
    char: ({ i, n, flow, enter, exit }) => {
      const e = wash(enter, i, n);
      const o = wash(exit, i, n);
      return { dx: Math.sin(flow * 1.05 - i * 0.26) * 0.16 - (1 - e) * 1.6 + o * 1.8 };
    },
  },
  {
    id: "FLOAT",
    blurb: "each letter bobs on its own and drifts off",
    char: ({ i, n, flow, enter, exit }) => {
      const e = wash(enter, i, n, 0.7);
      const o = wash(exit, i, n, 0.7);
      return {
        dy: Math.sin(flow * 0.9 + i * 0.7) * 0.13 + (1 - e) * 0.7 - o * 1.2,
        rot: (1 - e) * 0.3 - o * 0.3,
      };
    },
  },
  {
    id: "SWELL",
    blurb: "size breathes along the line",
    char: ({ i, flow, enter, exit }) => ({
      scale: (1 + Math.sin(flow * 1.5 - i * 0.4) * 0.14) * (0.5 + ease(enter) * 0.5) * (1 - ease(exit) * 0.45),
    }),
  },
  {
    id: "PENDULUM",
    blurb: "letters rock in sequence, swinging in and out",
    char: ({ i, n, flow, enter, exit }) => {
      const e = wash(enter, i, n);
      const o = wash(exit, i, n);
      return {
        rot: Math.sin(flow * 1.15 - i * 0.3) * 0.16 + (1 - e) * 0.9 - o * 0.9,
        dy: (1 - e) * 0.5 + o * 0.6,
      };
    },
  },
  {
    id: "SPIRAL",
    blurb: "a turning, growing wave that unwinds away",
    char: ({ i, n, flow, enter, exit }) => {
      const s = Math.sin(flow * 1.3 - i * 0.36);
      const e = wash(enter, i, n);
      const o = wash(exit, i, n);
      return {
        rot: s * 0.14 + (1 - e) * 1.6 - o * 1.6,
        scale: (1 + s * 0.1) * (0.35 + e * 0.65) * (1 - o * 0.6),
      };
    },
  },
  {
    id: "SHIMMER",
    blurb: "brightness travels through the words",
    char: ({ i, n, flow, enter, exit }) => {
      const e = wash(enter, i, n, 0.75);
      const o = wash(exit, i, n, 0.75);
      return {
        alpha: (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(flow * 2 - i * 0.6))) * e,
        dy: (1 - e) * 0.35 + o * 0.5,
      };
    },
  },
  {
    id: "TWINKLE",
    blurb: "letters glimmer out of step and wink out one by one",
    char: ({ i, n, flow, enter, exit }) => {
      // a fixed irrational stride keeps neighbours out of phase without random
      const ph = i * 2.399963;
      const e = wash(enter, i, n, 0.8);
      const o = wash(exit, i, n, 0.8);
      return {
        alpha: (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(flow * 1.6 + ph))) * e,
        scale: (0.75 + e * 0.25) * (1 - o * 0.5),
      };
    },
  },
  {
    id: "DRIFT",
    blurb: "the line floats up through the frame",
    line: ({ age, flow, enter, exit }) => ({
      dy: (1 - ease(enter)) * 1.2 - age * 0.05 - ease(exit) * 1.4,
      dx: Math.sin(flow * 0.35) * 0.09,
    }),
  },
  {
    id: "GLIDE",
    blurb: "slides in from one side and out the other",
    line: ({ enter, exit }) => ({ dx: (1 - ease(enter)) * -2.2 + ease(exit) * 2.2 }),
  },
  {
    id: "BREATHE",
    blurb: "the whole line breathes, opening and closing",
    line: ({ flow, enter, exit }) => ({
      scale: (1 + Math.sin(flow * 0.55) * 0.06) * (0.55 + ease(enter) * 0.45) * (1 - ease(exit) * 0.4),
    }),
  },
  {
    id: "LEAN",
    blurb: "tips in, rocks, and tips away",
    line: ({ flow, enter, exit }) => ({
      rot: Math.sin(flow * 0.45) * 0.05 + (1 - ease(enter)) * 0.35 - ease(exit) * 0.35,
      dy: (1 - ease(enter)) * 0.5 + ease(exit) * 0.6,
    }),
  },
  {
    id: "ORBIT",
    blurb: "the line swings around a slow circle",
    line: ({ flow, enter, exit }) => {
      const r = ease(enter) * (1 - ease(exit));
      return { dx: Math.cos(flow * 0.4) * 0.22 * r + (1 - r) * 1.4, dy: Math.sin(flow * 0.4) * 0.14 * r };
    },
  },
  {
    id: "ZOOM",
    blurb: "rushes in close and pulls back out",
    line: ({ age, enter, exit }) => ({
      scale: (0.4 + ease(enter) * 0.6 + age * 0.012) * (1 + ease(exit) * 0.7),
    }),
  },
  {
    id: "REVEAL",
    blurb: "words light up as they are sung",
    char: ({ i, n, frac, enter, exit }) => {
      // a soft edge that sweeps the line rather than a hard cut
      const at = frac * (n + 6) - 3;
      const e = wash(enter, i, n, 0.5);
      return {
        alpha: (0.22 + 0.78 * clamp01((at - i) / 4 + 0.5)) * e,
        dx: (1 - e) * -0.5 + ease(exit) * 0.9,
      };
    },
  },
  {
    id: "SPOTLIGHT",
    blurb: "a light follows the singing",
    char: ({ i, n, frac, enter, exit }) => {
      const at = frac * n;
      const d = Math.abs(i - at);
      const near = Math.exp(-(d * d) / 18);
      const e = wash(enter, i, n, 0.5);
      return {
        alpha: (0.25 + 0.75 * near) * e,
        scale: (0.85 + 0.15 * near) * (0.8 + e * 0.2) * (1 + ease(exit) * 0.5),
      };
    },
  },
  {
    id: "KARAOKE",
    blurb: "subtitle at the bottom, filling as it goes",
    anchorY: 0.68,
    fill: true,
    line: ({ enter, exit }) => ({ dy: (1 - ease(enter)) * 0.6 + ease(exit) * 0.6 }),
  },
  {
    id: "CASCADE",
    blurb: "letters fall into place one after another, then fall away",
    char: ({ i, n, enter, exit }) => {
      const e = wash(enter, i, n, 0.65);
      const o = wash(exit, i, n, 0.65);
      return { dy: (1 - e) * -0.85 + o * 1.1, scale: 0.8 + e * 0.2 };
    },
  },
  {
    id: "STILL",
    blurb: "no movement — it fades in and out and nothing else",
  },
];

export const LYRIC_STYLES: string[] = LYRIC_STYLE_DEFS.map((s) => s.id);

const BY_ID = new Map(LYRIC_STYLE_DEFS.map((s) => [s.id, s]));

/**
 * The styles this replaced, pointed at their nearest survivor, so saved looks
 * and share codes keep working. Anything unrecognised lands on WAVE.
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
