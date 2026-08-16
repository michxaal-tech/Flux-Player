// Draws the current synced lyric line over any visualizer theme, in one of
// several animation styles. Runs inside the render loop after the theme.
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

export const LYRIC_STYLES = ["FADE", "KARAOKE", "BOUNCE", "WAVE", "GLITCH"];

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
    next: lines[i + 1]?.text ??"",
    frac: Math.min(1, (time - lines[i].t) / span),
    age: time - lines[i].t,
    index: i,
  };
}

export function drawLyricOverlay(x: LyricCtx): void {
  const { c, w, h, time, beatE, vt, TK, C1, C2, CMix, L } = x;
  const lines = L.lyricLines;
  if (!lines) return;
  const cur = currentLyric(lines, time);
  if (!cur || !cur.text) return;
  const style = L.lyricStyle;
  const size = Math.min(w * 0.055, h * 0.06);
  const y = h * 0.72;
  c.save();
  c.globalCompositeOperation = "source-over";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
  const fitScale = Math.min(1, (w * 0.88) / Math.max(1, c.measureText(cur.text).width));

  if (style === "FADE") {
    const inA = Math.min(1, cur.age * 3);
    const a = inA * (cur.frac > 0.92 ? (1 - cur.frac) / 0.08 : 1);
    c.translate(w / 2, y + (1 - inA) * 14);
    c.scale(fitScale * (1 + beatE * 0.02), fitScale * (1 + beatE * 0.02));
    c.shadowBlur = 22 + beatE * 20;
    c.shadowColor = C1();
    c.fillStyle = `rgba(255,255,255,${0.92 * a})`;
    c.fillText(cur.text, 0, 0);
  } else if (style === "KARAOKE") {
    c.translate(w / 2, y);
    c.scale(fitScale, fitScale);
    const tw = c.measureText(cur.text).width;
    c.shadowBlur = 12;
    c.shadowColor = "rgba(0,0,0,0.8)";
    c.fillStyle = "rgba(255,255,255,0.35)";
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
    // sung-edge spark
    c.fillStyle = C2(0.9, 80);
    c.beginPath();
    c.arc(-tw / 2 + tw * cur.frac, -size * 0.62, (2.5 + beatE * 3) * TK, 0, Math.PI * 2);
    c.fill();
  } else if (style === "BOUNCE") {
    const words = cur.text.split(" ");
    const widths = words.map((wd) => c.measureText(wd + " ").width);
    const total = widths.reduce((a, b) => a + b, 0);
    c.translate(w / 2, y);
    c.scale(fitScale, fitScale);
    let px = -total / 2;
    words.forEach((wd, i2) => {
      const appear = Math.min(1, Math.max(0, cur.age * (words.length + 2) * 0.9 - i2));
      const pop = 1 + (1 - appear) * 0.8 + (i2 === Math.floor(cur.frac * words.length) ? beatE * 0.25 : 0);
      c.save();
      c.translate(px + widths[i2] / 2, (1 - appear) * -18);
      c.scale(pop, pop);
      c.shadowBlur = 16 + beatE * 14;
      c.shadowColor = CMix(i2 / Math.max(1, words.length - 1));
      c.fillStyle = `rgba(255,255,255,${0.95 * appear})`;
      c.textAlign = "center";
      c.fillText(wd, 0, 0);
      c.restore();
      px += widths[i2];
    });
  } else if (style === "WAVE") {
    const chars = [...cur.text];
    c.translate(w / 2, y);
    c.scale(fitScale, fitScale);
    const widths = chars.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let px = -total / 2;
    chars.forEach((ch, i2) => {
      const wob = Math.sin(vt * 0.12 + i2 * 0.55) * (5 + beatE * 9);
      c.shadowBlur = 14 + beatE * 12;
      c.shadowColor = CMix((i2 / Math.max(1, chars.length - 1) + vt * 0.004) % 1);
      c.fillStyle = CMix((i2 / Math.max(1, chars.length - 1) + vt * 0.004) % 1, 0.95, 78);
      c.textAlign = "left";
      c.fillText(ch, px, wob);
      px += widths[i2];
    });
  } else if (style === "GLITCH") {
    c.translate(w / 2, y);
    c.scale(fitScale, fitScale);
    const jx = beatE > 0.3 ? (Math.random() - 0.5) * 14 * beatE : 0;
    const jy = beatE > 0.3 ? (Math.random() - 0.5) * 8 * beatE : 0;
    c.globalCompositeOperation = "lighter";
    c.fillStyle = C1(0.75, 62);
    c.fillText(cur.text, jx - 3 - beatE * 5, jy);
    c.fillStyle = C2(0.75, 62);
    c.fillText(cur.text, jx + 3 + beatE * 5, jy);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(255,255,255,0.92)`;
    c.fillText(cur.text, jx, jy);
    if (beatE > 0.45) {
      // slice displacement — work fully in device pixels
      const cv = c.canvas;
      const scale2 = cv.height / h;
      const sh2 = size * 0.3 * scale2;
      const sy = (y - size / 2 + Math.random() * size) * scale2;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(cv, 0, sy, cv.width, sh2, (Math.random() - 0.5) * 30 * scale2, sy, cv.width, sh2);
    }
  }
  c.restore();

  // faint upcoming line
  if (cur.next) {
    c.save();
    c.globalCompositeOperation = "source-over";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `500 ${Math.floor(size * 0.45)}px 'Space Grotesk', sans-serif`;
    const nfit = Math.min(1, (w * 0.8) / Math.max(1, c.measureText(cur.next).width));
    c.translate(w / 2, h * 0.72 + size * 1.1);
    c.scale(nfit, nfit);
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.fillText(cur.next, 0, 0);
    c.restore();
  }
}
