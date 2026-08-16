// Draws synced lyrics over any visualizer theme as fluid, floating text.
// Lines are split into two sequential halves (when longer than 4 words), so
// what's on screen is short and large; long halves still wrap to ≤3 rows and
// are never shrunk into a tiny strip.
import type { LiveState } from "./live";

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
  L: LiveState;
}

export const LYRIC_STYLES = [
  "DRIFT", "SCATTER", "STACK", "POP", "RISE", "SPIN", "FLIP", "SLIDE",
  "FOCUS", "PULSE", "ORBIT", "CASCADE", "TYPE", "KARAOKE",
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

function drawBlock(c: CanvasRenderingContext2D, text: string, o: BlockOpts, w: number): void {
  if (o.alpha <= 0.01 || !text) return;
  const block = layoutBlock(c, text, o.size, o.maxW);
  const sizePx = o.size * block.scale;
  const lineH = sizePx * 1.16;
  c.font = `700 ${Math.floor(sizePx)}px 'Space Grotesk', sans-serif`;
  const widest = Math.max(...block.rows.map((r) => c.measureText(r).width)) * o.scale;
  const x = Math.min(Math.max(o.x, widest / 2 + 14), w - widest / 2 - 14);
  c.save();
  c.translate(x, o.y);
  if (o.rot) c.rotate(o.rot);
  c.scale(o.scale, o.scale * (o.scaleY ?? 1));
  c.shadowBlur = o.glowAmt;
  c.shadowColor = o.glowColor;
  c.fillStyle = o.color ?? `rgba(255,255,255,${o.alpha})`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  block.rows.forEach((row, i) => {
    c.fillText(row, 0, (i - (block.rows.length - 1) / 2) * lineH);
  });
  c.restore();
}

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
      const drawChunk = (k: number, alpha: number, scl: number) => {
        if (k < 0 || k >= n || alpha <= 0.02) return;
        const [wx, wy] = posFor(raw.index * 13 + k * 5, w, h);
        drawBlock(c, chunks[k], {
          x: wx, y: wy, alpha, scale: scl,
          rot: angFor(raw.index + k),
          maxW: w * 0.62, size: size * 1.22,
          glowAmt: 18 + beatE * 22,
          glowColor: CMix(((raw.index + k) % 9) / 9),
        }, w);
      };
      drawChunk(active - 1, (1 - smooth(local * 2.4)) * 0.7, 1.02);
      const appear2 = smooth(local * 2.6);
      const out2 = local > 0.72 ? smooth((local - 0.72) / 0.28) : 0;
      drawChunk(active, appear2 * (1 - out2 * 0.85), 0.86 + appear2 * 0.14 + beatE * 0.04);
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
  }
  c.restore();
}
