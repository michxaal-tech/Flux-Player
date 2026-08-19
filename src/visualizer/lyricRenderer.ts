// Draws synced lyrics over any visualizer theme.
//
// One path for every style. A style (see lyricStyles.ts) contributes only its
// motion; layout, the crossfade in and out, the dwell cap and the letter effects
// all live here, so every style behaves identically at the seams. That is the
// point of the rewrite: the twenty hand-written branches this replaced each had
// their own position, their own entry ramp and their own handover, which meant
// twenty different ways for a line to jump, collide or vanish — and they did.
//
// Lines are split into two sequential halves when they are long, so what's on
// screen is short and large; halves still wrap to ≤3 rows and are never shrunk
// into a tiny strip.
import type { LiveState } from "./live";
import { LYRIC_FX, letterFx, makeRamp, type LetterFxCtx, type LetterStyle } from "./lyricFx";
import { styleFor, type CharMotion, type StyleArg } from "./lyricStyles";

export interface LyricCtx {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** current playback time in seconds */
  time: number;
  beatE: number;
  vt: number;
  TK: number;
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
  /** live spectrum, for effects that colour letters by frequency */
  freq?: Uint8Array;
  /** active palette, for MATCH THEME letter effects */
  h1?: number;
  h2?: number;
  sat?: number;
  L: LiveState;
}

export { LYRIC_STYLES } from "./lyricStyles";

export interface CurrentLyric {
  prev: string;
  text: string;
  next: string;
  frac: number;
  age: number;
  index: number;
}

export function currentLyric(lines: { t: number; text: string }[], time: number): CurrentLyric | null {
  if (!lines.length) return null;
  let i = -1;
  while (i + 1 < lines.length && lines[i + 1].t <= time) i++;
  if (i < 0) return { prev: "", text: "", next: lines[0].text, frac: 0, age: 0, index: -1 };
  const end = i + 1 < lines.length ? lines[i + 1].t : lines[i].t + 6;
  const span = Math.max(0.5, end - lines[i].t);
  return {
    prev: lines[i - 1]?.text ?? "",
    text: lines[i].text,
    next: lines[i + 1]?.text ?? "",
    frac: Math.min(1, (time - lines[i].t) / span),
    age: time - lines[i].t,
    index: i,
  };
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return 1 - Math.pow(1 - t, 3);
};

/**
 * Split a line into two halves when it has 5+ words, or when it is long enough
 * to wrap however few words it has.
 *
 * The word count alone left a gap: four long words wrap to two or three rows
 * and were shown as one unit, so that line held the screen for its whole span
 * while its neighbours were split into halves showing for half as long. That is
 * the "sometimes it lingers, only once in a few" — and it correlated with the
 * tall blocks, because those are exactly the lines the word count missed.
 */
const SPLIT_CHARS = 26;
const splitTxt = (t: string): string[] => {
  const ws = t.split(" ").filter(Boolean);
  if (ws.length < 2) return [t];
  if (ws.length < 5 && t.length <= SPLIT_CHARS) return [t];
  const m = Math.ceil(ws.length / 2);
  return [ws.slice(0, m).join(" "), ws.slice(m).join(" ")];
};
const lastHalf = (t: string): string => {
  const p = splitTxt(t);
  return p[p.length - 1] ?? "";
};

/** re-time the current lyric onto its active half, so each half gets its own
 * appear/leave animation and its own screen position */
function halved(cur: CurrentLyric): CurrentLyric {
  const parts = splitTxt(cur.text);
  if (parts.length === 1) return { ...cur, index: cur.index * 2 };
  const hi = cur.frac < 0.5 ? 0 : 1;
  const span = cur.frac > 0.02 ? cur.age / cur.frac : 3;
  return {
    prev: hi === 0 ? lastHalf(cur.prev) : parts[0],
    text: parts[hi],
    next: hi === 0 ? parts[1] : splitTxt(cur.next)[0] ?? "",
    frac: hi === 0 ? cur.frac * 2 : (cur.frac - 0.5) * 2,
    age: Math.max(0, hi === 0 ? cur.age : cur.age - span * 0.5),
    index: cur.index * 2 + hi,
  };
}

// ── multi-row text blocks ───────────────────────────────────────
interface Block {
  rows: string[];
  scale: number;
}

function wrapRows(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const rows: string[] = [];
  let row = "";
  for (const wd of words) {
    const tryRow = row ? `${row} ${wd}` : wd;
    if (c.measureText(tryRow).width <= maxW || !row) row = tryRow;
    else {
      rows.push(row);
      row = wd;
    }
  }
  if (row) rows.push(row);
  return rows;
}

/** wrap into ≤3 rows, only shrinking as a last resort (never below 0.68×) */
function layoutBlock(c: CanvasRenderingContext2D, text: string, sizePx: number, maxW: number): Block {
  for (const s of [1, 0.9, 0.8, 0.68]) {
    c.font = `700 ${Math.floor(sizePx * s)}px 'Space Grotesk', sans-serif`;
    const rows = wrapRows(c, text, maxW);
    const widest = Math.max(...rows.map((r) => c.measureText(r).width));
    if (rows.length <= 3 && widest <= maxW) return { rows, scale: s };
  }
  c.font = `700 ${Math.floor(sizePx * 0.68)}px 'Space Grotesk', sans-serif`;
  return { rows: wrapRows(c, text, maxW).slice(0, 3), scale: 0.68 };
}

interface BlockOpts {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  scaleY?: number;
  rot?: number;
  maxW: number;
  size: number;
  glowAmt: number;
  color?: string;
  glowColor: string;
  /**
   * Progress through *this* block's own line, 0..1, for the letter effects that
   * key off it (karaoke fills, sweeps, type-on). A finished line passes 1 and a
   * preview passes 0. Without this they all read the current line's progress,
   * so a type-on effect drove the previous line's letters to zero alpha the
   * instant a new line began and it vanished instead of fading.
   */
  fxFrac?: number;
  /** the style's continuous per-character motion, if it has one */
  motion?: (a: StyleArg) => CharMotion;
  /** the arguments a motion needs that the block itself doesn't know */
  motionArg?: { flow: number; frac: number; age: number };
  /** 0..1 of the line that has been sung, for the styles that light up as they go */
  fill?: number;
}

/** geometry of a laid-out block, exactly as drawBlock would place it. Leaves
 * the context font set to the block's font so rows/chars can be measured. */
interface BlockMetrics {
  rows: string[];
  /** font size actually used, in px (before o.scale) */
  sizePx: number;
  lineH: number;
  /** widest row in device px, already multiplied by o.scale */
  widest: number;
  /** on-screen centre x after edge clamping */
  x: number;
}

function blockMetrics(
  c: CanvasRenderingContext2D,
  text: string,
  o: { x: number; scale: number; maxW: number; size: number },
  w: number,
): BlockMetrics {
  const block = layoutBlock(c, text, o.size, o.maxW);
  const sizePx = o.size * block.scale;
  c.font = `700 ${Math.floor(sizePx)}px 'Space Grotesk', sans-serif`;
  let widest = 0;
  for (const r of block.rows) widest = Math.max(widest, c.measureText(r).width);
  widest *= o.scale;
  const lo = widest / 2 + 14;
  const hi = w - widest / 2 - 14;
  const x = hi > lo ? Math.min(Math.max(o.x, lo), hi) : w / 2;
  return { rows: block.rows, sizePx, lineH: sizePx * 1.16, widest, x };
}

/** Set by drawLyricOverlay for the duration of a frame. When non-null, blocks
 * are drawn a character at a time so per-letter effects can be applied. */
let letterCtx: {
  fxs: string[];
  base: Omit<LetterFxCtx, "i" | "n" | "row">;
  /** MATCH THEME is on — matched letters get a soft palette bloom by default */
  match: boolean;
  glowColor: string;
} | null = null;


function drawBlock(c: CanvasRenderingContext2D, text: string, o: BlockOpts, w: number): void {
  if (o.alpha <= 0.01 || !text) return;
  const m = blockMetrics(c, text, o, w);
  c.save();
  c.translate(m.x, o.y);
  if (o.rot) c.rotate(o.rot);
  c.scale(o.scale, o.scale * (o.scaleY ?? 1));
  c.shadowBlur = o.glowAmt;
  c.shadowColor = o.glowColor;
  c.fillStyle = o.color ?? `rgba(255,255,255,${o.alpha})`;
  c.textAlign = "center";
  c.textBaseline = "middle";

  // The style's motion and the letter effects both want per-character control,
  // so either one sends the block down the same path and they compose there.
  if (o.motion || (letterCtx && letterCtx.fxs.length)) {
    drawBlockLetters(c, m, o, letterCtx?.base, letterCtx);
    c.restore();
    return;
  }

  const rowY = (i: number) => (i - (m.rows.length - 1) / 2) * m.lineH;
  if (o.fill !== undefined) {
    // Sung-so-far lighting: the whole line dim, then the part that has been
    // sung again at full strength, clipped. Two passes rather than per-character
    // alpha so the unsung text stays readable instead of disappearing.
    const dim = c.fillStyle;
    c.globalAlpha = 0.42;
    m.rows.forEach((row, i) => c.fillText(row, 0, rowY(i)));
    c.globalAlpha = 1;
    c.fillStyle = dim;
    const total = m.rows.reduce((acc, r) => acc + r.length, 0);
    let sung = o.fill * total;
    m.rows.forEach((row, i) => {
      const part = Math.min(1, Math.max(0, sung / Math.max(1, row.length)));
      sung -= row.length;
      if (part <= 0) return;
      const rw = c.measureText(row).width;
      c.save();
      c.beginPath();
      c.rect(-rw / 2, rowY(i) - m.lineH / 2, rw * part, m.lineH);
      c.clip();
      c.fillText(row, 0, rowY(i));
      c.restore();
    });
    c.restore();
    return;
  }

  m.rows.forEach((row, i) => c.fillText(row, 0, rowY(i)));
  c.restore();
}

/**
 * Per-character render path. Only used when a letter effect is active — the
 * whole-row fillText above is much cheaper, and most of the time nothing needs
 * character-level control.
 *
 * Characters are laid out by walking each row's measured advances, so spacing
 * and kerning match the single-call path exactly and switching an effect on
 * never shifts the text.
 */
function drawBlockLetters(
  c: CanvasRenderingContext2D,
  m: BlockMetrics,
  o: BlockOpts,
  base: Omit<LetterFxCtx, "i" | "n" | "row"> | undefined,
  lc: { fxs: string[]; match: boolean; glowColor: string } | null | undefined,
): void {
  const em = m.sizePx;                    // offsets are in em so they scale
  const total = m.rows.reduce((s, r) => s + r.length, 0);
  c.textAlign = "left";
  let seen = 0;

  m.rows.forEach((row, ri) => {
    const rowW = c.measureText(row).width;
    let x = -rowW / 2;
    const y = (ri - (m.rows.length - 1) / 2) * m.lineH;

    for (let ci = 0; ci < row.length; ci++) {
      const ch = row[ci];
      const adv = c.measureText(ch).width;
      if (ch !== " ") {
        // The style moves the character first; letter effects then compose on
        // top of that, so picking an effect never cancels the style's motion.
        const mo = o.motion && o.motionArg
          ? o.motion({
            i: seen, n: Math.max(1, total), row: ri, rows: m.rows.length,
            flow: o.motionArg.flow, frac: o.motionArg.frac, age: o.motionArg.age,
          })
          : null;
        const arg = base
          ? { ...base, frac: o.fxFrac ?? base.frac, i: seen, n: Math.max(1, total), row: ri }
          : null;
        // Effects stack. Offsets add, scales and alphas multiply, glow takes
        // the strongest, and anything that names a colour or a treatment lets
        // the later one win — so a colour ramp, a motion and a reveal compose
        // into one letter instead of the last pick silently replacing the rest.
        const st: LetterStyle = !lc || !arg || lc.fxs.length === 0
          ? {}
          : lc.fxs.length === 1
          ? letterFx(lc.fxs[0], arg)
          : lc.fxs.reduce<LetterStyle>((acc, f) => {
            const s2 = letterFx(f, arg);
            if (s2.color !== undefined) acc.color = s2.color;
            if (s2.glowColor !== undefined) acc.glowColor = s2.glowColor;
            if (s2.stroke !== undefined) { acc.stroke = s2.stroke; acc.strokeW = s2.strokeW; }
            if (s2.hollow !== undefined) acc.hollow = s2.hollow;
            if (s2.extrude !== undefined) { acc.extrude = s2.extrude; acc.extrudeColor = s2.extrudeColor; }
            if (s2.ghosts) acc.ghosts = [...(acc.ghosts ?? []), ...s2.ghosts];
            acc.dx = (acc.dx ?? 0) + (s2.dx ?? 0);
            acc.dy = (acc.dy ?? 0) + (s2.dy ?? 0);
            acc.rot = (acc.rot ?? 0) + (s2.rot ?? 0);
            acc.scale = (acc.scale ?? 1) * (s2.scale ?? 1);
            acc.scaleY = (acc.scaleY ?? 1) * (s2.scaleY ?? 1);
            acc.alpha = (acc.alpha ?? 1) * (s2.alpha ?? 1);
            if (s2.glow !== undefined) acc.glow = Math.max(acc.glow ?? 0, s2.glow);
            return acc;
          }, {});
        // A sung-so-far style with a letter effect on top can't use the clipped
        // two-pass fill, so it dims the characters that haven't been reached.
        const lit = o.fill === undefined ? 1 : seen / Math.max(1, total) <= o.fill ? 1 : 0.42;
        const a = (st.alpha ?? 1) * (mo?.alpha ?? 1) * lit * o.alpha;
        if (a > 0.01) {
          c.save();
          c.globalAlpha = a;
          // position at the glyph's centre so scale and rotation pivot there
          c.translate(x + adv / 2 + ((st.dx ?? 0) + (mo?.dx ?? 0)) * em, y + ((st.dy ?? 0) + (mo?.dy ?? 0)) * em);
          const rot = (st.rot ?? 0) + (mo?.rot ?? 0);
          if (rot) c.rotate(rot);
          const sc = (st.scale ?? 1) * (mo?.scale ?? 1);
          if (sc !== 1 || st.scaleY !== undefined) c.scale(sc, sc * (st.scaleY ?? 1));
          // A matched effect that sets no glow of its own still gets a soft
          // palette bloom, which is what stops translucent letters reading as
          // washed out and gives them the WAVE style's halo.
          if (st.glow !== undefined) c.shadowBlur = st.glow;
          else if (lc?.match && base) c.shadowBlur = Math.max(o.glowAmt, 13 + base.beatE * 16);
          if (st.glowColor) c.shadowColor = st.glowColor;
          else if (lc?.match) c.shadowColor = lc.glowColor;
          c.textBaseline = "middle";

          // depth copies first, so the glyph itself lands on top
          if (st.extrude) {
            c.fillStyle = st.extrudeColor ?? "rgba(0,0,0,0.8)";
            const steps = 5;
            for (let d = steps; d >= 1; d--) {
              const k = (d / steps) * st.extrude * em;
              c.fillText(ch, -adv / 2 + k, k);
            }
          }
          if (st.ghosts) {
            for (const g of st.ghosts) {
              c.fillStyle = g.color;
              c.fillText(ch, -adv / 2 + g.dx * em, g.dy * em);
            }
          }

          if (st.stroke) {
            c.strokeStyle = st.stroke;
            c.lineWidth = (st.strokeW ?? 0.03) * em;
            c.lineJoin = "round";
            c.strokeText(ch, -adv / 2, 0);
          }
          if (!st.hollow) {
            c.fillStyle = st.color ?? o.color ?? "#fff";
            c.fillText(ch, -adv / 2, 0);
          }
          c.restore();
        }
        seen++;
      }
      x += adv;
    }
  });
  c.textAlign = "center";
}

/** reusable colour ramp for the per-character WAVE style (filled each frame) */

/**
 * How long an outgoing line takes to fade to nothing.
 *
 * Every line sits at the same anchor now, so the line leaving and the line
 * arriving share a spot — which is how WAVE always worked, and is why it never
 * had lines colliding. At one anchor the crossfade has to be quick, or two
 * solid texts are printed over each other.
 */
const OUT_SECS = 0.5;
/** ease *out*: a symmetric curve holds ~93% opacity for 200ms and then drops,
 * which measures like a fade and watches like the line popping */
const outAlpha = (age: number): number => Math.pow(1 - Math.min(1, Math.max(0, age / OUT_SECS)), 1.6);

/** how long a line may hold the screen before it fades on its own, in seconds */
const MAX_DWELL = 5.5;

/** A line that has gone, still fading on its own clock. */
interface Ghost { text: string; unit: number; t0: number }
interface GhostState { last: number; items: Ghost[] }

export function drawLyricOverlay(x: LyricCtx): void {
  const { c, w, h, time, beatE, C1, C2, CMix, L } = x;
  const lines = L.lyricLines;
  if (!lines) return;
  const raw = currentLyric(lines, time);
  if (!raw) return;

  const def = styleFor(L.lyricStyle);
  const size = Math.min(w * 0.058, h * 0.072);
  c.save();
  c.globalCompositeOperation = "source-over";

  // Arm the per-letter path for this frame. Module state rather than an
  // argument, because drawBlock is the one place that needs it.
  const fxs = (L.lyricFxs ?? []).filter((f) => f !== "NONE" && LYRIC_FX.includes(f));
  letterCtx = fxs.length === 0 ? null : {
    fxs,
    match: !!L.lyricFxMatch,
    glowColor: C1(0.85, 62),
    base: {
      t: time, flow: L.flow, beatE, hitE: L.hitE,
      bass: Math.min(1, L.energy), frac: raw.frac,
      freq: x.freq ?? new Uint8Array(0), C1, C2, CMix,
      ramp: makeRamp(!!L.lyricFxMatch, x.h1 ?? 187, x.h2 ?? 317, x.sat ?? 100),
    },
  };

  const cur = halved(raw);

  // A line records when it left and finishes its own fade, so the next line
  // arriving cannot cut it short. One at a time: each is drawn at full size, and
  // a pile of them is a wall of text rather than a fade.
  const G = (L.scratch.lyrGhosts ??= { last: -1, items: [] as Ghost[] }) as GhostState;
  if (cur.index !== G.last) {
    if (G.last >= 0 && cur.prev) G.items.push({ text: cur.prev, unit: G.last, t0: time });
    G.last = cur.index;
    if (G.items.length > 1) G.items.splice(0, G.items.length - 1);
  }
  for (let i = G.items.length - 1; i >= 0; i--) {
    const age = time - G.items[i].t0;
    // the second test catches a seek backwards, which would otherwise strand a
    // line with a start time in the future
    if (age > OUT_SECS || age < 0) G.items.splice(i, 1);
  }

  // `time` is playback seconds and never resets, so every motion driven by it
  // is continuous across lines — nothing restarts, so nothing can jump.
  const flow = time;
  const anchorY = h * (def.anchorY ?? 0.45);
  const maxW = w * (def.anchorY ? 0.84 : 0.62);

  const drawUnit = (text: string, age: number, frac: number, alpha: number): void => {
    if (!text || alpha <= 0.02) return;
    const lm = def.line?.({ i: 0, n: 1, row: 0, rows: 1, flow, frac, age }) ?? {};
    drawBlock(c, text, {
      x: w / 2 + (lm.dx ?? 0) * size,
      y: anchorY + (lm.dy ?? 0) * size,
      rot: lm.rot,
      scale: lm.scale ?? 1,
      alpha,
      maxW,
      size,
      // the halo fades with the letters. A constant blur radius leaves a wide
      // bright cloud hanging around text that is nearly gone, which is both
      // wrong to look at and why the outgoing line measured at 82% of its ink
      // when its opacity was down to 29%.
      glowAmt: 16 * alpha,
      glowColor: C1(alpha),
      fxFrac: frac,
      motion: def.char,
      motionArg: { flow, frac, age },
      fill: def.fill ? frac : undefined,
    }, w);
  };

  // The line that just left. It is drawn as settled — its entry animation is
  // over — so it only loses opacity while it goes.
  for (const g of G.items) {
    drawUnit(g.text, 3, 1, outAlpha(time - g.t0));
  }

  // The live line. It fades in over the same sort of ramp it fades out on, and
  // gives up on its own after MAX_DWELL: a line's span is the gap to the next
  // one, so an instrumental break used to leave the last words hanging for the
  // length of the break.
  const appear = smooth(cur.age / 0.4);
  const overstay = smooth((cur.age - MAX_DWELL) / 0.9);
  drawUnit(cur.text, cur.age, cur.frac, appear * (1 - overstay));

  c.restore();
  letterCtx = null;
}
