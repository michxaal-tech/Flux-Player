/**
 * Mobile-native visualizers: the waveform family.
 *
 * Every one of these is a handful of stroked polylines. A polyline is the
 * cheapest interesting thing a 2D canvas draws, which is exactly why the
 * waveform themes are where a phone can afford to be generous with detail.
 */
import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { band, blob, c01, count, scratch, wav } from "./kit";

/** One smooth ribbon of waveform, thickened by the low end. */
export const M_SILKLINE: ThemeDraw = (x) => {
  const { c, w, h, cy, bassV, beatE, I, TK, C1, C2 } = x;
  const N = count(x, 110);
  const amp = h * 0.2 * (1 + bassV * 0.7 + beatE * 0.5) * I;

  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, C1(0.9, 62));
  g.addColorStop(0.5, C2(0.95, 72));
  g.addColorStop(1, C1(0.9, 62));

  // three passes at falling width and rising brightness: a cheap way to get a
  // cored, luminous line without a single blurred draw call
  for (let pass = 0; pass < 3; pass++) {
    c.strokeStyle = pass === 2 ? C2(0.9, 92) : g;
    c.lineWidth = (7 - pass * 2.6) * TK;
    c.lineJoin = "round";
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const y = cy + wav(x, f) * amp;
      i === 0 ? c.moveTo(0, y) : c.lineTo(f * w, y);
    }
    c.stroke();
  }
};

/** Two waves mirrored about the centre, filled between. */
export const M_TWINWAVE: ThemeDraw = (x) => {
  const { c, w, h, cy, bassV, beatE, I, TK, C1, C2 } = x;
  const N = count(x, 90);
  const amp = h * 0.17 * (1 + bassV * 0.8 + beatE * 0.4) * I;

  c.fillStyle = C1(0.22, 54);
  c.beginPath();
  for (let i = 0; i <= N; i++) c.lineTo((i / N) * w, cy - Math.abs(wav(x, i / N)) * amp);
  for (let i = N; i >= 0; i--) c.lineTo((i / N) * w, cy + Math.abs(wav(x, i / N)) * amp);
  c.closePath();
  c.fill();

  c.lineWidth = 2.2 * TK;
  c.strokeStyle = C2(0.95, 80);
  c.beginPath();
  for (let i = 0; i <= N; i++) c.lineTo((i / N) * w, cy - Math.abs(wav(x, i / N)) * amp);
  c.stroke();
  c.beginPath();
  for (let i = 0; i <= N; i++) c.lineTo((i / N) * w, cy + Math.abs(wav(x, i / N)) * amp);
  c.stroke();
};

/** Classic oscilloscope, with the last few traces kept as fading ghosts. */
export const M_OSCILLO: ThemeDraw = (x) => {
  const { c, w, h, cy, beatE, I, TK, C1, C2, fs, every } = x;
  const N = count(x, 100);
  const S = scratch(x, "m_oscillo", () => ({ ghosts: [] as number[][] }));
  const amp = h * 0.22 * I * (1 + beatE * 0.4);

  const pts: number[] = [];
  for (let i = 0; i <= N; i++) pts.push(cy + wav(x, i / N) * amp);

  // a ghost every few frames rather than every frame: the trail should be a
  // second or so of history whatever the refresh rate
  if (every(4)) {
    S.ghosts.unshift(pts.slice());
    if (S.ghosts.length > 5) S.ghosts.pop();
  }

  c.lineWidth = 1.4 * TK;
  for (let gi = S.ghosts.length - 1; gi >= 0; gi--) {
    const gp = S.ghosts[gi];
    c.strokeStyle = C1(0.1 + (1 - gi / 5) * 0.22, 60);
    c.beginPath();
    for (let i = 0; i < gp.length; i++) c.lineTo((i / N) * w, gp[i]);
    c.stroke();
  }

  c.lineWidth = 2.6 * TK;
  c.strokeStyle = C2(0.95, 86);
  c.beginPath();
  for (let i = 0; i < pts.length; i++) c.lineTo((i / N) * w, pts[i]);
  c.stroke();
  void dk;
  void fs;
};

/** The wave, echoed downward in fading copies. */
export const M_RIPPLELINE: ThemeDraw = (x) => {
  const { c, w, h, cy, bassV, beatE, I, TK, CMix } = x;
  const N = count(x, 80);
  const LAYERS = 7;
  const amp = h * 0.13 * (1 + bassV * 0.6 + beatE * 0.4) * I;

  c.lineWidth = 2 * TK;
  for (let L = 0; L < LAYERS; L++) {
    const f = L / LAYERS;
    const off = (L - (LAYERS - 1) / 2) * h * 0.055;
    c.strokeStyle = CMix(f, 0.75 - f * 0.35, 58 + (1 - f) * 22);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      c.lineTo(u * w, cy + off + wav(x, u) * amp * (1 - f * 0.5));
    }
    c.stroke();
  }
};

/** Several thin strands, each reading the wave at a slight offset. */
export const M_THREAD: ThemeDraw = (x) => {
  const { c, w, h, cy, vt, beatE, I, TK, CMix } = x;
  const N = count(x, 70);
  const STRANDS = 9;
  const amp = h * 0.16 * I * (1 + beatE * 0.4);

  c.lineWidth = 1.3 * TK;
  for (let s = 0; s < STRANDS; s++) {
    const f = s / STRANDS;
    const ph = f * 0.5;
    c.strokeStyle = CMix(f, 0.65, 62);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const sway = Math.sin(u * 6 + vt * 0.02 + f * 6) * h * 0.03;
      c.lineTo(u * w, cy + sway + wav(x, (u + ph) % 1) * amp);
    }
    c.stroke();
  }
};

/** The waveform as a run of lights, brightest where the signal is loudest. */
export const M_WAVEDOTS: ThemeDraw = (x) => {
  const { c, cy, w, h, beatE, I } = x;
  const N = count(x, 56);
  const amp = h * 0.2 * I * (1 + beatE * 0.4);

  c.globalCompositeOperation = "lighter";
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const v = wav(x, u);
    const a = c01(Math.abs(v) * 1.4 + 0.12);
    blob(x, u * w, cy + v * amp, (w / N) * (0.7 + a), a * 0.65, u, 68);
  }
  c.globalCompositeOperation = "source-over";
};

/** A vertical waveform running up the screen, mirrored left and right. */
export const M_SPINE: ThemeDraw = (x) => {
  const { c, w, h, cx, bassV, beatE, I, TK, C1, C2 } = x;
  const N = count(x, 90);
  const amp = w * 0.3 * (1 + bassV * 0.6 + beatE * 0.5) * I;

  c.lineWidth = 2.4 * TK;
  c.lineJoin = "round";
  for (const dir of [1, -1]) {
    c.strokeStyle = dir > 0 ? C1(0.9, 72) : C2(0.9, 72);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      c.lineTo(cx + dir * Math.abs(wav(x, u)) * amp, u * h);
    }
    c.stroke();
  }
  c.strokeStyle = C1(0.35, 60);
  c.lineWidth = 1.2 * TK;
  c.beginPath();
  c.moveTo(cx, 0);
  c.lineTo(cx, h);
  c.stroke();
  void band;
};
