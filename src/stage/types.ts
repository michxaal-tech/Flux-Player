// What a stage mode is given each frame, and what it must provide.
//
// Two kinds of mode share one contract. Shader modes are a fragment program run
// over the whole frame on the GPU; canvas modes draw with the 2D API into their
// own canvas, which the compositor uploads as a texture. Either way the result
// lands in the same compositor, so transitions, grading and grain apply to all
// of them identically.

export interface LyricState {
  /** active line text, "" when between lines */
  text: string;
  /** per-word timing for the active line, when the source had it */
  words: { text: string; t: number; e: number }[] | null;
  /** audible time, seconds */
  t: number;
  /** line start / next line start */
  start: number;
  end: number;
  /** index of the active line (-1 none) — changes mark a line transition */
  index: number;
  timed: boolean;
}

export interface Frame {
  /** scene time, seconds — advances with movement speed and a little with energy */
  time: number;
  dt: number;
  /** canvas size in device pixels */
  w: number;
  h: number;
  /** pixel ratio actually in use (device ratio × quality scale) */
  px: number;
  /** five colours, dark → light, as CSS strings and as 0..1 rgb */
  css: [string, string, string, string, string];
  rgb: Float32Array;
  // ── music, already scaled by the look's reactivity and the calm factor ──
  level: number;
  energy: number;
  sub: number; bass: number; lowMid: number; mid: number; high: number; air: number;
  transient: number;
  /** the honest "hit": beat pulse where the grid is trusted, transients otherwise */
  accent: number;
  /** 0..1 how much this mode may lock to the beat grid (rhythm setting × confidence) */
  grid: number;
  phase: number;
  barPhase: number;
  beatIndex: number;
  onBeat: boolean;
  onBar: boolean;
  onset: boolean;
  drop: number;
  playing: boolean;
  spectrum: Float32Array;
  wave: Float32Array;
  /** the two style dials, 0..1 */
  a: number;
  b: number;
  /** self-motion when quiet, 0..1 */
  drift: number;
  /** 1 when drawn as a dim backdrop behind the interface, 0 when immersive */
  calm: number;
  lyric: LyricState;
  title: string;
  artist: string;
}

export interface ModeDef {
  id: string;
  name: string;
  /** one line describing the composition */
  line: string;
  /** what the music does to it, shown in the studio */
  reacts: string;
  /** names of the two dials */
  dials: [string, string];
  /** the mode draws the lyrics itself; the overlay stays out of its way */
  ownsLyrics?: boolean;
  kind: "gl" | "2d";
  /** gl: body of `vec3 scene(vec2 uv)` plus any helpers it declares first */
  frag?: string;
  /** gl: per-frame extra uniforms */
  uniforms?: (f: Frame, st: Record<string, unknown>) => Record<string, number | number[]>;
  /** 2d: draw a frame */
  draw?: (c: CanvasRenderingContext2D, f: Frame, st: Record<string, unknown>) => void;
}
