// Draws synced lyrics over any visualizer theme as fluid, floating text.
// Long lines WRAP into up to three rows at a readable size — they are never
// shrunk into a tiny single strip. Each line materializes somewhere new
// (golden-ratio scatter) and dissolves as the next appears.
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

export const LYRIC_STYLES = ["DRIFT", "SCATTER", "POP", "RISE", "SPIN", "ORBIT", "CASCADE", "TYPE", "KARAOKE"];

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

/** golden-ratio scatter: varied but evenly balanced positions, per line index */
const posFor = (i: number, w: number, h: number): [number, number] => {
  const fx = (i * 0.618033988 + 0.31) % 1;
  const fy = (i * 0.381966011 + 0.12) % 1;
  return [w * (0.28 + fx * 0.44), h * (0.22 + fy * 0.42)];
};

/** deterministic gentle tilt per line, ±0.09 rad, never harsh */
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
  c.scale(o.scale, o.scale);
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
  const cur = currentLyric(lines, time);
  if (!cur) return;
  const style = LYRIC_STYLES.includes(L.lyricStyle) ? L.lyricStyle : "DRIFT";
  const size = Math.min(w * 0.058, h * 0.072);
  c.save();
  c.globalCompositeOperation = "source-over";

  if (style === "KARAOKE") {
    if (cur.text) {
      c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
      const block = layoutBlock(c, cur.text, size, w * 0.84);
      const sizePx = size * block.scale;
      const lineH = sizePx * 1.16;
      const y = h * 0.68;
      c.font = `700 ${Math.floor(sizePx)}px 'Space Grotesk', sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      // char-progress across the whole block
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
    // one word at a time: each word owns a slice of the line's duration,
    // fading out as the next fades in at a fresh spot
    if (cur.text) {
      const words = cur.text.split(" ").filter(Boolean);
      const n = words.length;
      const pos2 = cur.frac * n;
      const active = Math.min(n - 1, Math.floor(pos2));
      const local = Math.min(1, pos2 - active);
      const drawWord = (k: number, alpha: number, scl: number) => {
        if (k < 0 || k >= n || alpha <= 0.02) return;
        const [wx, wy] = posFor(cur.index * 13 + k * 5, w, h);
        drawBlock(c, words[k], {
          x: wx,
          y: wy,
          alpha,
          scale: scl,
          rot: angFor(cur.index + k),
          maxW: w * 0.7,
          size: size * 1.4,
          glowAmt: 18 + beatE * 22,
          glowColor: CMix(((cur.index + k) % 9) / 9),
        }, w);
      };
      // outgoing previous word overlaps the incoming one briefly
      drawWord(active - 1, (1 - smooth(local * 2.4)) * 0.7, 1.02);
      const appear = smooth(local * 2.6);
      const out = local > 0.72 ? smooth((local - 0.72) / 0.28) : 0;
      drawWord(active, appear * (1 - out * 0.85), 0.86 + appear * 0.14 + beatE * 0.04);
    }
    c.restore();
    return;
  }

  if (style === "SCATTER") {
    // lines pop in one at a time at scattered spots with gentle tilts and
    // stay up as a small fading collage — newest brightest
    const KEEP = 3;
    for (let k = KEEP - 1; k >= 0; k--) {
      const idx = cur.index - k;
      if (idx < 0 || !lines[idx]) continue;
      const [sx, sy] = posFor(idx, w, h);
      const lineAge = time - lines[idx].t;
      const pop = easeOut(lineAge * 2.6);
      const fade = k === 0 ? 1 : Math.max(0, 0.55 - (k - 1) * 0.28 - cur.age * 0.1);
      if (fade <= 0.02) continue;
      drawBlock(c, lines[idx].text, {
        x: sx,
        y: sy + (1 - pop) * 26 - lineAge * 2,
        alpha: k === 0 ? 0.95 * pop : fade,
        scale: (0.86 + pop * 0.14) * (1 - k * 0.1) + (k === 0 ? beatE * 0.025 : 0),
        rot: angFor(idx) * pop,
        maxW: w * 0.5,
        size: size * (k === 0 ? 1 : 0.8),
        glowAmt: k === 0 ? 16 + beatE * 22 : 6,
        glowColor: CMix((idx % 9) / 9),
      }, w);
    }
    c.restore();
    return;
  }

  // ghost of the previous line, still drifting away from its own spot
  if (cur.prev && cur.index >= 1) {
    const [px, py] = posFor(cur.index - 1, w, h);
    const gone = smooth(cur.age * 0.7);
    drawBlock(c, cur.prev, {
      x: px,
      y: py - 26 - cur.age * 12,
      alpha: 0.4 * (1 - gone),
      scale: 0.85 - gone * 0.1,
      maxW: w * 0.45,
      size: size * 0.75,
      glowAmt: 6,
      glowColor: C2(),
    }, w);
  }

  if (!cur.text) {
    c.restore();
    return;
  }
  const [lx, ly] = posFor(Math.max(0, cur.index), w, h);
  const appear = smooth(cur.age * 2.2);
  const leave = cur.frac > 0.86 ? smooth((cur.frac - 0.86) / 0.14) : 0;
  const alpha = appear * (1 - leave * 0.9);

  if (style === "DRIFT") {
    drawBlock(c, cur.text, {
      x: lx + Math.sin(vt * 0.008 + cur.index) * 8,
      y: ly + (1 - appear) * 24 - cur.age * 9 - leave * 14,
      alpha,
      scale: 0.92 + appear * 0.08 + beatE * 0.025,
      maxW: w * 0.56,
      size,
      glowAmt: 18 + beatE * 22,
      glowColor: C1(),
    }, w);
  } else if (style === "POP") {
    const spring = appear + Math.sin(Math.min(1, cur.age * 2.2) * Math.PI) * 0.14 * (1 - appear);
    drawBlock(c, cur.text, {
      x: lx,
      y: ly,
      alpha,
      scale: (0.6 + spring * 0.4) * (1 + leave * 0.35) + beatE * 0.04,
      rot: (1 - appear) * 0.06 * (cur.index % 2 ? 1 : -1),
      maxW: w * 0.56,
      size,
      glowAmt: 16 + beatE * 26,
      glowColor: CMix((cur.index % 8) / 8),
    }, w);
  } else if (style === "RISE") {
    const settle = easeOut(cur.age * 1.7);
    const exitY = leave * h * 0.28;
    drawBlock(c, cur.text, {
      x: lx,
      y: h * 0.85 + (ly - h * 0.85) * settle - exitY,
      alpha: Math.min(1, cur.age * 3) * (1 - leave),
      scale: 0.88 + settle * 0.12 + beatE * 0.02,
      rot: angFor(cur.index) * 0.5 * settle,
      maxW: w * 0.56,
      size,
      glowAmt: 16 + beatE * 20,
      glowColor: C1(),
    }, w);
  } else if (style === "SPIN") {
    const inn = easeOut(cur.age * 2);
    const rot = (1 - inn) * -0.4 + angFor(cur.index) * inn + leave * 0.45;
    drawBlock(c, cur.text, {
      x: lx,
      y: ly,
      alpha,
      scale: (0.6 + inn * 0.4) * (1 - leave * 0.25) + beatE * 0.03,
      rot,
      maxW: w * 0.54,
      size,
      glowAmt: 16 + beatE * 22,
      glowColor: CMix((cur.index % 7) / 7),
    }, w);
  } else if (style === "ORBIT") {
    const ang = cur.index * 2.4 + vt * 0.0015;
    const rad = Math.min(w, h) * (0.22 + ((cur.index * 37) % 10) / 10 * 0.1);
    const ox = w / 2 + Math.cos(ang) * rad * 1.25;
    const oy = h * 0.45 + Math.sin(ang) * rad * 0.75;
    drawBlock(c, cur.text, {
      x: ox,
      y: oy + (1 - appear) * 18,
      alpha,
      scale: 0.9 + appear * 0.1 + beatE * 0.03,
      rot: Math.sin(ang) * 0.05,
      maxW: w * 0.46,
      size: size * 0.92,
      glowAmt: 16 + beatE * 20,
      glowColor: C1(),
    }, w);
  } else if (style === "TYPE") {
    const chars = [...cur.text];
    const shown = Math.min(chars.length, Math.floor(cur.age * Math.max(12, chars.length * 1.6)));
    const text = chars.slice(0, shown).join("");
    const cursorOn = (Math.floor(vt / 14) % 2 === 0 && shown < chars.length) || shown === 0;
    drawBlock(c, text + (cursorOn ? "▌" : shown < chars.length ? " " : ""), {
      x: w / 2,
      y: h * 0.45,
      alpha: 1 - leave,
      scale: 1 + beatE * 0.02,
      maxW: w * 0.7,
      size,
      glowAmt: 14 + beatE * 16,
      glowColor: C1(),
    }, w);
  }
  c.restore();
}
