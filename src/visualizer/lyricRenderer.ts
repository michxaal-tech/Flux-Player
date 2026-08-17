// Draws synced lyrics over any visualizer theme as fluid, floating text.
// Lines are split into two sequential halves (when longer than 4 words), so
// what's on screen is short and large; long halves still wrap to ≤3 rows and
// are never shrunk into a tiny strip.
import type { LiveState } from "./live";
import { LYRIC_FX, letterFx, makeRamp, type LetterFxCtx } from "./lyricFx";

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

export const LYRIC_STYLES = [
  "DRIFT", "SCATTER", "STACK", "POP", "RISE", "SPIN", "FLIP", "SLIDE",
  "FOCUS", "PULSE", "ORBIT", "CASCADE", "TYPE", "KARAOKE",
  "WAVE", "BOUNCE", "GLITCH", "ECHO", "SWEEP", "SPOTLIGHT",
];

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

/** split a line into two halves when it has 5+ words */
const splitTxt = (t: string): string[] => {
  const ws = t.split(" ").filter(Boolean);
  if (ws.length < 5) return [t];
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

/** golden-ratio scatter: varied but evenly balanced positions, per unit index */
const posFor = (i: number, w: number, h: number): [number, number] => {
  const fx = (i * 0.618033988 + 0.31) % 1;
  const fy = (i * 0.381966011 + 0.12) % 1;
  return [w * (0.28 + fx * 0.44), h * (0.22 + fy * 0.42)];
};

/**
 * Position for a unit that is guaranteed to be far from the previous unit's.
 * The golden-ratio scatter above walks in small steps, so consecutive chunks
 * landed almost on top of each other. This walks a 3x3 zone grid with a
 * stride co-prime to 9, so successive units jump across the frame, with
 * deterministic jitter inside each zone so it never looks like a grid.
 */
const zonePos = (unit: number, w: number, h: number): [number, number] => {
  const z = ((unit % 9) + 9) % 9;
  const slot = (z * 5) % 9; // 0,5,1,6,2,7,3,8,4 — neighbours land far apart
  const col = slot % 3;
  const row = Math.floor(slot / 3);
  const jx = (((unit * 2654435761) % 101) / 101 - 0.5) * 0.12;
  const jy = (((unit * 40503) % 89) / 89 - 0.5) * 0.1;
  const fx = 0.5 + (col - 1) * 0.26 + jx;
  const fy = 0.44 + (row - 1) * 0.22 + jy;
  return [w * Math.min(0.82, Math.max(0.18, fx)), h * Math.min(0.76, Math.max(0.2, fy))];
};

/** deterministic gentle tilt per unit, ±0.09 rad, never harsh */
const angFor = (i: number): number => (((i * 2654435761) % 97) / 97 - 0.5) * 0.18;

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
  fx: string;
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

  if (letterCtx && letterCtx.fx !== "NONE") {
    drawBlockLetters(c, m, o, letterCtx.fx, letterCtx.base, letterCtx);
    c.restore();
    return;
  }

  m.rows.forEach((row, i) => {
    c.fillText(row, 0, (i - (m.rows.length - 1) / 2) * m.lineH);
  });
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
  fx: string,
  base: Omit<LetterFxCtx, "i" | "n" | "row">,
  lc: { match: boolean; glowColor: string },
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
        const st = letterFx(fx, { ...base, i: seen, n: Math.max(1, total), row: ri });
        const a = (st.alpha ?? 1) * o.alpha;
        if (a > 0.01) {
          c.save();
          c.globalAlpha = a;
          // position at the glyph's centre so scale and rotation pivot there
          c.translate(x + adv / 2 + (st.dx ?? 0) * em, y + (st.dy ?? 0) * em);
          if (st.rot) c.rotate(st.rot);
          if (st.scale !== undefined || st.scaleY !== undefined) c.scale(st.scale ?? 1, (st.scale ?? 1) * (st.scaleY ?? 1));
          // A matched effect that sets no glow of its own still gets a soft
          // palette bloom, which is what stops translucent letters reading as
          // washed out and gives them the WAVE style's halo.
          if (st.glow !== undefined) c.shadowBlur = st.glow;
          else if (lc.match) c.shadowBlur = Math.max(o.glowAmt, 13 + base.beatE * 16);
          if (st.glowColor) c.shadowColor = st.glowColor;
          else if (lc.match) c.shadowColor = lc.glowColor;
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
const WAVE_PAL: string[] = new Array<string>(9).fill("");

/** deterministic 0..1 hash — stable jitter without per-frame allocation */
const hash01 = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export function drawLyricOverlay(x: LyricCtx): void {
  const { c, w, h, time, beatE, vt, TK, C1, C2, CMix, L } = x;
  const lines = L.lyricLines;
  if (!lines) return;
  const raw = currentLyric(lines, time);
  if (!raw) return;
  const style = LYRIC_STYLES.includes(L.lyricStyle) ? L.lyricStyle : "DRIFT";
  const size = Math.min(w * 0.058, h * 0.072);
  c.save();
  c.globalCompositeOperation = "source-over";

  // Arm the per-letter path for this frame. Kept as module state rather than
  // threaded through every style branch: the styles all funnel into drawBlock,
  // so this is the one place that needs to know.
  const fx = L.lyricFx && LYRIC_FX.includes(L.lyricFx) ? L.lyricFx : "NONE";
  const fxMatch = !!L.lyricFxMatch;
  letterCtx = fx === "NONE" ? null : {
    fx,
    match: fxMatch,
    glowColor: C1(0.85, 62),
    base: {
      t: time, flow: L.flow, beatE, hitE: L.hitE,
      bass: Math.min(1, L.energy), frac: raw.frac,
      freq: x.freq ?? new Uint8Array(0), C1, C2, CMix,
      ramp: makeRamp(!!L.lyricFxMatch, x.h1 ?? 187, x.h2 ?? 317, x.sat ?? 100),
    },
  };

  if (style === "KARAOKE") {
    const cur = halved(raw);
    if (cur.text) {
      c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
      const block = layoutBlock(c, cur.text, size, w * 0.84);
      const sizePx = size * block.scale;
      const lineH = sizePx * 1.16;
      const y = h * 0.68;
      c.font = `700 ${Math.floor(sizePx)}px 'Space Grotesk', sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      const totalChars = block.rows.reduce((a, r) => a + r.length, 0);
      let sung = Math.floor(cur.frac * totalChars);
      block.rows.forEach((row, i) => {
        const ry = y + (i - (block.rows.length - 1) / 2) * lineH;
        const rw = c.measureText(row).width;
        c.shadowBlur = 12;
        c.shadowColor = "rgba(0,0,0,0.8)";
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.fillText(row, w / 2, ry);
        const rowFrac = Math.min(1, Math.max(0, sung / row.length));
        sung -= row.length;
        if (rowFrac > 0) {
          c.save();
          c.beginPath();
          c.rect(w / 2 - rw / 2, ry - lineH / 2, rw * rowFrac, lineH);
          c.clip();
          c.shadowBlur = 18 + beatE * 18;
          c.shadowColor = C1();
          c.fillStyle = C1(1, 70);
          c.fillText(row, w / 2, ry);
          c.restore();
        }
      });
    }
    c.restore();
    return;
  }

  if (style === "CASCADE") {
    // 2-3 words at a time from the full line, crossfading between spots
    if (raw.text) {
      const words = raw.text.split(" ").filter(Boolean);
      const per = words.length <= 4 ? 2 : 3;
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(" "));
      const n = chunks.length;
      const pos2 = raw.frac * n;
      const active = Math.min(n - 1, Math.floor(pos2));
      const local = Math.min(1, pos2 - active);
      // every chunk gets its own zone across the frame, never beside the last
      const drawChunk = (k: number, alpha: number, scl: number, rise: number) => {
        if (k < 0 || k >= n || alpha <= 0.02) return;
        const unit = raw.index * 7 + k;
        const [wx, wy] = zonePos(unit, w, h);
        drawBlock(c, chunks[k], {
          x: wx, y: wy + rise, alpha, scale: scl,
          rot: angFor(unit),
          maxW: w * 0.62, size: size * 1.22,
          glowAmt: 18 + beatE * 22,
          glowColor: CMix((unit % 9) / 9),
        }, w);
      };
      // The outgoing chunk holds most of its brightness while the next one is
      // already arriving, so there is a real overlap rather than a handoff.
      const outAlpha = local < 0.42 ? 0.8 : 0.8 * (1 - smooth((local - 0.42) / 0.44));
      drawChunk(active - 1, outAlpha, 1.0, -smooth(Math.max(0, local - 0.42) / 0.6) * 14);
      const appear2 = smooth(local / 0.3);
      const out2 = local > 0.86 ? smooth((local - 0.86) / 0.14) : 0;
      drawChunk(active, appear2 * (1 - out2 * 0.5), 0.84 + appear2 * 0.16 + beatE * 0.05, (1 - appear2) * 12);
    }
    c.restore();
    return;
  }

  const cur = halved(raw);

  if (style === "SCATTER") {
    // halves pop in one at a time at scattered spots with gentle tilts and
    // stay up as a small fading collage — newest brightest
    const older = [raw.index - 1, raw.index - 2];
    older.forEach((idx, k) => {
      if (idx < 0 || !lines[idx]) return;
      const text = lastHalf(lines[idx].text);
      const unit = idx * 2 + 1;
      const [sx, sy] = posFor(unit, w, h);
      const fade = Math.max(0, 0.5 - k * 0.26 - raw.age * 0.1);
      if (fade <= 0.02) return;
      drawBlock(c, text, {
        x: sx, y: sy - (k + 1) * 8,
        alpha: fade,
        scale: 0.82 - k * 0.08,
        rot: angFor(unit),
        maxW: w * 0.44, size: size * 0.8,
        glowAmt: 6, glowColor: CMix((idx % 9) / 9),
      }, w);
    });
    if (cur.text) {
      const [sx, sy] = posFor(cur.index, w, h);
      const pop = easeOut(cur.age * 2.6);
      drawBlock(c, cur.text, {
        x: sx, y: sy + (1 - pop) * 26,
        alpha: 0.95 * pop,
        scale: 0.86 + pop * 0.14 + beatE * 0.025,
        rot: angFor(cur.index) * pop,
        maxW: w * 0.5, size,
        glowAmt: 16 + beatE * 22,
        glowColor: CMix((cur.index % 9) / 9),
      }, w);
    }
    c.restore();
    return;
  }

  if (style === "STACK") {
    // teleprompter stack: new halves push the previous ones up smoothly
    const space = size * 1.7;
    const enter = easeOut(cur.age * 2.4);
    const shift = (1 - enter) * space;
    const entries: { text: string; slot: number; alpha: number; hot: boolean }[] = [];
    if (cur.text) entries.push({ text: cur.text, slot: 0, alpha: enter, hot: true });
    if (cur.prev) entries.push({ text: cur.prev, slot: 1, alpha: 0.45, hot: false });
    const older = lines[raw.index - 1];
    if (older && cur.index % 2 === 0) entries.push({ text: lastHalf(older.text), slot: 2, alpha: 0.22, hot: false });
    for (const e of entries) {
      drawBlock(c, e.text, {
        x: w / 2,
        y: h * 0.58 - e.slot * space + shift,
        alpha: e.alpha,
        scale: e.hot ? 1 + beatE * 0.02 : 0.86,
        maxW: w * 0.62,
        size: e.hot ? size : size * 0.85,
        glowAmt: e.hot ? 16 + beatE * 20 : 4,
        glowColor: e.hot ? C1() : C2(),
      }, w);
    }
    c.restore();
    return;
  }

  // ghost of the previous half for the single-block styles
  if (cur.prev && cur.index >= 1) {
    const [px, py] = posFor(cur.index - 1, w, h);
    const gone = smooth(cur.age * 0.9);
    drawBlock(c, cur.prev, {
      x: px, y: py - 22 - cur.age * 12,
      alpha: 0.35 * (1 - gone),
      scale: 0.8 - gone * 0.08,
      maxW: w * 0.42, size: size * 0.72,
      glowAmt: 6, glowColor: C2(),
    }, w);
  }

  if (!cur.text) {
    c.restore();
    return;
  }
  const [lx, ly] = posFor(Math.max(0, cur.index), w, h);
  const appear = smooth(cur.age * 2.2);
  const leave = cur.frac > 0.84 ? smooth((cur.frac - 0.84) / 0.16) : 0;
  const alpha = appear * (1 - leave * 0.9);

  if (style === "DRIFT") {
    drawBlock(c, cur.text, {
      x: lx + Math.sin(vt * 0.008 + cur.index) * 8,
      y: ly + (1 - appear) * 24 - cur.age * 9 - leave * 14,
      alpha,
      scale: 0.92 + appear * 0.08 + beatE * 0.025,
      maxW: w * 0.52, size,
      glowAmt: 18 + beatE * 22, glowColor: C1(),
    }, w);
  } else if (style === "POP") {
    const spring = appear + Math.sin(Math.min(1, cur.age * 2.2) * Math.PI) * 0.14 * (1 - appear);
    drawBlock(c, cur.text, {
      x: lx, y: ly,
      alpha,
      scale: (0.6 + spring * 0.4) * (1 + leave * 0.35) + beatE * 0.04,
      rot: (1 - appear) * 0.06 * (cur.index % 2 ? 1 : -1),
      maxW: w * 0.52, size,
      glowAmt: 16 + beatE * 26, glowColor: CMix((cur.index % 8) / 8),
    }, w);
  } else if (style === "RISE") {
    const settle = easeOut(cur.age * 1.9);
    drawBlock(c, cur.text, {
      x: lx,
      y: h * 0.85 + (ly - h * 0.85) * settle - leave * h * 0.28,
      alpha: Math.min(1, cur.age * 3) * (1 - leave),
      scale: 0.88 + settle * 0.12 + beatE * 0.02,
      rot: angFor(cur.index) * 0.5 * settle,
      maxW: w * 0.52, size,
      glowAmt: 16 + beatE * 20, glowColor: C1(),
    }, w);
  } else if (style === "SPIN") {
    const inn = easeOut(cur.age * 2);
    drawBlock(c, cur.text, {
      x: lx, y: ly,
      alpha,
      scale: (0.6 + inn * 0.4) * (1 - leave * 0.25) + beatE * 0.03,
      rot: (1 - inn) * -0.4 + angFor(cur.index) * inn + leave * 0.45,
      maxW: w * 0.5, size,
      glowAmt: 16 + beatE * 22, glowColor: CMix((cur.index % 7) / 7),
    }, w);
  } else if (style === "FLIP") {
    // card-flip: unfolds vertically with a soft overshoot, folds away
    const inn = easeOut(cur.age * 2.6);
    const sy = inn * (1 + (1 - inn) * 0.35) * (1 - leave);
    drawBlock(c, cur.text, {
      x: lx, y: ly,
      alpha: Math.min(1, cur.age * 4) * (1 - leave * 0.7),
      scale: 0.95 + beatE * 0.03,
      scaleY: Math.max(0.02, sy),
      rot: angFor(cur.index) * 0.4,
      maxW: w * 0.52, size,
      glowAmt: 16 + beatE * 22, glowColor: C1(),
    }, w);
  } else if (style === "SLIDE") {
    // glides in from alternating sides, exits out the other side
    const dir = cur.index % 2 ? 1 : -1;
    const inn = easeOut(cur.age * 2.2);
    drawBlock(c, cur.text, {
      x: lx + dir * (1 - inn) * w * 0.4 - dir * leave * w * 0.35,
      y: ly,
      alpha: Math.min(1, cur.age * 3.5) * (1 - leave),
      scale: 0.94 + inn * 0.06 + beatE * 0.02,
      rot: dir * (1 - inn) * 0.05,
      maxW: w * 0.52, size,
      glowAmt: 16 + beatE * 20, glowColor: CMix((cur.index % 6) / 6),
    }, w);
  } else if (style === "FOCUS") {
    // materializes out of blur, razor-sharp mid-line, defocuses away
    const sharp = Math.min(appear, 1 - leave);
    const blur = (1 - sharp) * 46;
    for (const [dx2, ga] of [[-blur * 0.18, 0.2], [blur * 0.18, 0.2], [0, 1]] as const) {
      drawBlock(c, cur.text, {
        x: lx + dx2, y: ly,
        alpha: alpha * (ga === 1 ? 0.55 + sharp * 0.45 : (1 - sharp) * ga),
        scale: 1.06 - sharp * 0.06 + beatE * 0.02,
        maxW: w * 0.52, size,
        glowAmt: 8 + blur, glowColor: C1(),
      }, w);
    }
  } else if (style === "PULSE") {
    // centered, breathing with the music, kicking on every beat
    drawBlock(c, cur.text, {
      x: w / 2, y: h * 0.42,
      alpha,
      scale: 0.96 + appear * 0.04 + beatE * 0.12,
      maxW: w * 0.6, size: size * 1.08,
      glowAmt: 14 + beatE * 40, glowColor: CMix((cur.index % 5) / 5),
    }, w);
  } else if (style === "ORBIT") {
    const ang = cur.index * 2.4 + vt * 0.0015;
    const rad = Math.min(w, h) * (0.22 + ((cur.index * 37) % 10) / 10 * 0.1);
    drawBlock(c, cur.text, {
      x: w / 2 + Math.cos(ang) * rad * 1.25,
      y: h * 0.45 + Math.sin(ang) * rad * 0.75 + (1 - appear) * 18,
      alpha,
      scale: 0.9 + appear * 0.1 + beatE * 0.03,
      rot: Math.sin(ang) * 0.05,
      maxW: w * 0.44, size: size * 0.92,
      glowAmt: 16 + beatE * 20, glowColor: C1(),
    }, w);
  } else if (style === "TYPE") {
    const chars = [...cur.text];
    const shown = Math.min(chars.length, Math.floor(cur.age * Math.max(12, chars.length * 1.8)));
    const text = chars.slice(0, shown).join("");
    const cursorOn = (Math.floor(vt / 14) % 2 === 0 && shown < chars.length) || shown === 0;
    drawBlock(c, text + (cursorOn ? "▌" : shown < chars.length ? " " : ""), {
      x: w / 2, y: h * 0.45,
      alpha: 1 - leave,
      scale: 1 + beatE * 0.02,
      maxW: w * 0.66, size,
      glowAmt: 14 + beatE * 16, glowColor: C1(),
    }, w);
  } else if (style === "WAVE") {
    // characters ride a travelling sine wave; the swell grows on every beat
    const scl = 0.97 + appear * 0.03 + beatE * 0.03;
    const m = blockMetrics(c, cur.text, { x: w / 2, scale: scl, maxW: w * 0.62, size }, w);
    const amp = m.sizePx * (0.1 + beatE * 0.4) * appear;
    // colour ramp built once per frame, then indexed per character (no
    // per-character string building in the inner loop)
    const last = WAVE_PAL.length - 1;
    for (let i = 0; i <= last; i++) {
      const f2 = i / last;
      WAVE_PAL[i] = CMix(f2, alpha, 54 + f2 * 26);
    }
    c.save();
    c.translate(m.x, h * 0.45);
    c.scale(scl, scl);
    c.shadowBlur = 14 + beatE * 20;
    c.shadowColor = C1();
    c.textAlign = "center";
    c.textBaseline = "middle";
    let ci = 0;
    for (let r = 0; r < m.rows.length; r++) {
      const row = m.rows[r];
      const ry = (r - (m.rows.length - 1) / 2) * m.lineH;
      let px = -c.measureText(row).width / 2;
      for (const ch of row) {
        const cw = c.measureText(ch).width;
        const s2 = Math.sin(vt * 0.08 - ci * 0.5);
        c.fillStyle = WAVE_PAL[Math.round((s2 + 1) * 0.5 * last)];
        c.fillText(ch, px + cw / 2, ry + s2 * amp);
        px += cw;
        ci++;
      }
    }
    c.restore();
  } else if (style === "BOUNCE") {
    // drops in from above the frame and settles with decaying overshoots
    const t2 = Math.max(0, cur.age);
    const damp = Math.exp(-3.1 * t2);
    const dropY = -h * 0.34 * damp * Math.cos(7.4 * t2);
    const squash = 1 - 0.14 * damp * Math.sin(7.4 * t2);
    drawBlock(c, cur.text, {
      x: lx,
      y: ly + dropY + leave * h * 0.16,
      alpha: Math.min(1, cur.age * 6) * (1 - leave),
      scale: 0.96 + beatE * 0.03,
      scaleY: Math.max(0.05, squash),
      maxW: w * 0.56, size,
      glowAmt: 16 + beatE * 22, glowColor: C1(),
    }, w);
  } else if (style === "GLITCH") {
    // clean and readable between beats, tearing into split copies on the hits
    const gy = h * 0.45;
    const hit = Math.min(1, beatE);
    const tick = Math.floor(vt / 5) + cur.index * 13;
    const jx = (hash01(tick) - 0.5) * size * 0.9 * hit;
    const jy = (hash01(tick + 91) - 0.5) * size * 0.26 * hit;
    const off = size * (0.05 + hit * 0.45);
    const ga = alpha * (0.16 + hit * 0.5);
    const split = { y: gy, scale: 0.98 + beatE * 0.03, maxW: w * 0.6, size, glowAmt: 0, alpha };
    c.globalCompositeOperation = "lighter";
    drawBlock(c, cur.text, { ...split, x: w / 2 - off + jx, color: CMix(0, ga, 58), glowColor: C1() }, w);
    drawBlock(c, cur.text, { ...split, x: w / 2 + off - jx, color: CMix(1, ga, 58), glowColor: C2() }, w);
    c.globalCompositeOperation = "source-over";
    drawBlock(c, cur.text, {
      x: w / 2 + jx * 0.25, y: gy + jy,
      alpha,
      scale: 0.98 + beatE * 0.03,
      maxW: w * 0.6, size,
      glowAmt: 12 + hit * 26, glowColor: C1(),
    }, w);
    if (hit > 0.3) {
      // a single torn slice slides sideways for one beat
      const bh = size * (0.16 + hash01(tick + 7) * 0.3);
      const by = gy - size * 1.2 + hash01(tick + 3) * size * 2.4;
      c.save();
      c.beginPath();
      c.rect(0, by, w, bh);
      c.clip();
      drawBlock(c, cur.text, {
        x: w / 2 + (hash01(tick + 17) - 0.5) * size * 1.6, y: gy,
        alpha, scale: 0.98, maxW: w * 0.6, size,
        color: CMix(0.5, alpha, 88), glowAmt: 0, glowColor: C1(),
      }, w);
      c.restore();
    }
  } else if (style === "ECHO") {
    // a motion trail: ghost copies lag behind the live line and fade out
    const dir = cur.index % 2 ? 1 : -1;
    for (let k = 3; k >= 0; k--) {
      // each ghost samples the line's path further in the past, and is pushed
      // a little further back along the travel direction so the trail still
      // reads once the line has settled into its drift
      const tt = cur.age - k * 0.11;
      const e2 = 1 - easeOut(Math.max(0, tt) * 2.2);
      const back = Math.cos(tt * 3 + cur.index) >= 0 ? -1 : 1;
      const fade = k === 0 ? alpha : alpha * (0.3 - k * 0.06);
      drawBlock(c, cur.text, {
        x: lx + Math.sin(tt * 3 + cur.index) * w * 0.05 + dir * e2 * w * 0.12 + back * k * w * 0.016,
        y: ly + Math.cos(tt * 1.35 + cur.index) * h * 0.02 + e2 * 16 + k * 6,
        alpha: fade,
        scale: (0.95 + beatE * 0.02) * (1 - k * 0.035),
        maxW: w * 0.52, size,
        color: k === 0 ? undefined : CMix(k / 3, fade, 62),
        glowAmt: k === 0 ? 20 + beatE * 22 : 0,
        glowColor: C1(),
      }, w);
    }
  } else if (style === "SWEEP") {
    // a bright band of light travels across the line, lighting it as it goes
    const scl = 0.98 + appear * 0.02 + beatE * 0.03;
    const base = { x: w / 2, y: h * 0.45, scale: scl, maxW: w * 0.62, size, alpha };
    const m = blockMetrics(c, cur.text, base, w);
    const band = Math.max(24, m.sizePx * 1.1);
    const p = smooth(Math.min(1, Math.max(0, cur.frac / 0.72)));
    const sxp = m.x - m.widest / 2 - band + (m.widest + band * 2) * p;
    drawBlock(c, cur.text, { ...base, color: CMix(0.5, alpha * 0.5, 54), glowAmt: 6, glowColor: C2() }, w);
    c.save();
    c.beginPath();
    c.rect(0, 0, Math.max(0, sxp), h);
    c.clip();
    // no `color`: drawBlock's own full-strength fill is the lit state
    drawBlock(c, cur.text, { ...base, glowAmt: 16 + beatE * 20, glowColor: C1() }, w);
    c.restore();
    c.save();
    c.beginPath();
    c.rect(sxp - band, 0, band, h);
    c.clip();
    c.globalCompositeOperation = "lighter";
    drawBlock(c, cur.text, { ...base, color: CMix(0.1, alpha * 0.8, 88), glowAmt: 22 + beatE * 26, glowColor: C1() }, w);
    c.restore();
  } else if (style === "SPOTLIGHT") {
    // a soft pool of light walks the rows, revealing the words it lands on
    const scl = 0.98 + appear * 0.02 + beatE * 0.02;
    const cy2 = h * 0.45;
    const base = { x: w / 2, y: cy2, scale: scl, maxW: w * 0.62, size, alpha };
    const m = blockMetrics(c, cur.text, base, w);
    const n = Math.max(1, m.rows.length);
    const p = Math.min(0.9999, Math.max(0, smooth(Math.min(1, cur.frac / 0.86))));
    const ri = Math.min(n - 1, Math.floor(p * n));
    const rw = c.measureText(m.rows[ri] ?? "").width * scl;
    const px = m.x - rw / 2 + rw * (p * n - ri);
    const py = cy2 + (ri - (n - 1) / 2) * m.lineH * scl;
    const rad = Math.max(10, m.sizePx * scl * (1.45 + beatE * 0.3));
    drawBlock(c, cur.text, { ...base, color: CMix(0.5, alpha * 0.42, 52), glowAmt: 4, glowColor: C2() }, w);
    c.save();
    c.globalCompositeOperation = "lighter";
    const pool = c.createRadialGradient(px, py, 0, px, py, rad * 1.9);
    pool.addColorStop(0, C1(alpha * 0.3, 72));
    pool.addColorStop(1, C1(0, 72));
    c.fillStyle = pool;
    c.beginPath();
    c.arc(px, py, rad * 1.9, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // soft-edged reveal: a halo pass, then a hard bright core inside it
    for (const [rr, aa, li] of [[rad * 1.55, 0.45, 74], [rad, 1, 94]] as const) {
      c.save();
      c.beginPath();
      c.arc(px, py, rr, 0, Math.PI * 2);
      c.clip();
      drawBlock(c, cur.text, {
        ...base,
        color: CMix(0.15, alpha * aa, li),
        glowAmt: 16 + beatE * 18, glowColor: C1(),
      }, w);
      c.restore();
    }
  }
  c.restore();
}
