// Draws synced lyrics over any visualizer theme as fluid, floating text:
// each line materializes somewhere new on screen (golden-ratio scatter, so
// placements feel varied but balanced), lives with the music, and drifts
// away as the next line appears. Runs inside the render loop after the theme.
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

export const LYRIC_STYLES = ["DRIFT", "POP", "ORBIT", "CASCADE", "KARAOKE"];

export interface CurrentLyric {
  prev: string;
  text: string;
  next: string;
  /** progress 0..1 through the current line's time window */
  frac: number;
  /** seconds since the line started */
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

/** golden-ratio scatter: varied but evenly balanced positions, per line index */
const posFor = (i: number, w: number, h: number): [number, number] => {
  const fx = (i * 0.618033988 + 0.31) % 1;
  const fy = (i * 0.381966011 + 0.12) % 1;
  return [w * (0.24 + fx * 0.52), h * (0.2 + fy * 0.46)];
};

interface LineOpts {
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

function drawLine(c: CanvasRenderingContext2D, text: string, o: LineOpts, w: number): void {
  if (o.alpha <= 0.01 || !text) return;
  c.font = `700 ${Math.floor(o.size)}px 'Space Grotesk', sans-serif`;
  const tw = c.measureText(text).width;
  const fit = Math.min(1, o.maxW / Math.max(1, tw));
  const half = (tw * fit * o.scale) / 2;
  const x = Math.min(Math.max(o.x, half + 14), w - half - 14);
  c.save();
  c.translate(x, o.y);
  if (o.rot) c.rotate(o.rot);
  c.scale(fit * o.scale, fit * o.scale);
  c.shadowBlur = o.glowAmt;
  c.shadowColor = o.glowColor;
  c.fillStyle = o.color ?? `rgba(255,255,255,${o.alpha})`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 0, 0);
  c.restore();
}

export function drawLyricOverlay(x: LyricCtx): void {
  const { c, w, h, time, beatE, vt, TK, C1, C2, CMix, L } = x;
  const lines = L.lyricLines;
  if (!lines) return;
  const cur = currentLyric(lines, time);
  if (!cur) return;
  const style = LYRIC_STYLES.includes(L.lyricStyle) ? L.lyricStyle : "DRIFT";
  const size = Math.min(w * 0.05, h * 0.062);
  c.save();
  c.globalCompositeOperation = "source-over";

  if (style === "KARAOKE") {
    // classic bottom line with progressive word-fill
    if (cur.text) {
      const y = h * 0.72;
      c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
      const fit = Math.min(1, (w * 0.88) / Math.max(1, c.measureText(cur.text).width));
      c.save();
      c.translate(w / 2, y);
      c.scale(fit, fit);
      const tw = c.measureText(cur.text).width;
      c.shadowBlur = 12;
      c.shadowColor = "rgba(0,0,0,0.8)";
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(cur.text, 0, 0);
      c.shadowBlur = 18 + beatE * 18;
      c.shadowColor = C1();
      c.save();
      c.beginPath();
      c.rect(-tw / 2, -size, tw * cur.frac, size * 2);
      c.clip();
      c.fillStyle = C1(1, 70);
      c.fillText(cur.text, 0, 0);
      c.restore();
      c.fillStyle = C2(0.9, 80);
      c.beginPath();
      c.arc(-tw / 2 + tw * cur.frac, -size * 0.62, (2.5 + beatE * 3) * TK, 0, Math.PI * 2);
      c.fill();
      c.restore();
      if (cur.next) {
        c.font = `500 ${Math.floor(size * 0.45)}px 'Space Grotesk', sans-serif`;
        const nfit = Math.min(1, (w * 0.8) / Math.max(1, c.measureText(cur.next).width));
        c.save();
        c.translate(w / 2, y + size * 1.1);
        c.scale(nfit, nfit);
        c.fillStyle = "rgba(255,255,255,0.3)";
        c.textAlign = "center";
        c.fillText(cur.next, 0, 0);
        c.restore();
      }
    }
    c.restore();
    return;
  }

  // ── fluid, position-scattered styles ──
  // ghost of the previous line, still drifting away from its own spot
  if (cur.prev && cur.index >= 1) {
    const [px, py] = posFor(cur.index - 1, w, h);
    const gone = smooth(cur.age * 0.7);
    drawLine(c, cur.prev, {
      x: px,
      y: py - 26 - cur.age * 12,
      alpha: 0.45 * (1 - gone),
      scale: 1 - gone * 0.12,
      maxW: w * 0.55,
      size: size * 0.8,
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
    drawLine(c, cur.text, {
      x: lx + Math.sin(vt * 0.008 + cur.index) * 8,
      y: ly + (1 - appear) * 24 - cur.age * 9 - leave * 14,
      alpha,
      scale: 0.92 + appear * 0.08 + beatE * 0.025,
      maxW: w * 0.6,
      size,
      glowAmt: 18 + beatE * 22,
      glowColor: C1(),
    }, w);
  } else if (style === "POP") {
    // springy overshoot in, quick zoom-fade out
    const spring = appear + Math.sin(Math.min(1, cur.age * 2.2) * Math.PI) * 0.14 * (1 - appear);
    drawLine(c, cur.text, {
      x: lx,
      y: ly,
      alpha,
      scale: (0.6 + spring * 0.4) * (1 + leave * 0.35) + beatE * 0.04,
      rot: (1 - appear) * 0.06 * (cur.index % 2 ? 1 : -1),
      maxW: w * 0.6,
      size,
      glowAmt: 16 + beatE * 26,
      glowColor: CMix((cur.index % 8) / 8),
    }, w);
  } else if (style === "ORBIT") {
    // lines take positions along a slow orbit around the screen center
    const ang = cur.index * 2.4 + vt * 0.0015;
    const rad = Math.min(w, h) * (0.22 + ((cur.index * 37) % 10) / 10 * 0.1);
    const ox = w / 2 + Math.cos(ang) * rad * 1.25;
    const oy = h * 0.45 + Math.sin(ang) * rad * 0.75;
    drawLine(c, cur.text, {
      x: ox,
      y: oy + (1 - appear) * 18,
      alpha,
      scale: 0.9 + appear * 0.1 + beatE * 0.03,
      rot: Math.sin(ang) * 0.05,
      maxW: w * 0.5,
      size: size * 0.92,
      glowAmt: 16 + beatE * 20,
      glowColor: C1(),
    }, w);
  } else if (style === "CASCADE") {
    // words scatter in one after another across a loose diagonal band
    const words = cur.text.split(" ");
    const reveal = cur.age * Math.max(3, words.length + 1) * 0.85;
    words.forEach((wd, k) => {
      const wAppear = smooth(reveal - k);
      if (wAppear <= 0.01) return;
      const [bx, by] = posFor(cur.index, w, h);
      const t2 = words.length > 1 ? k / (words.length - 1) : 0.5;
      const wx = bx + (t2 - 0.5) * w * 0.42 + Math.sin(cur.index * 3 + k * 2.4) * w * 0.05;
      const wy = by + (t2 - 0.5) * h * 0.16 + Math.cos(cur.index * 5 + k * 1.7) * h * 0.06;
      drawLine(c, wd, {
        x: wx,
        y: wy + (1 - wAppear) * 16 - leave * 12,
        alpha: wAppear * (1 - leave * 0.9),
        scale: 0.85 + wAppear * 0.15 + (k === Math.floor(cur.frac * words.length) ? beatE * 0.08 : 0),
        rot: Math.sin(cur.index + k) * 0.05,
        maxW: w * 0.4,
        size: size * 0.85,
        glowAmt: 14 + beatE * 16,
        glowColor: CMix(((cur.index + k) % 9) / 9),
      }, w);
    });
  }
  c.restore();
}
