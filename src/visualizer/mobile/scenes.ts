/**
 * Mobile-native visualizers: the scene family.
 *
 * These are the ones with a subject — a horizon, a skyline, a record — rather
 * than a pattern. They cost slightly more than the grids because they layer a
 * background, but each layer is one gradient fill or one path, so the total is
 * still a handful of draw calls.
 */
import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { band, bandLog, blob, c01, count, scratch, wav } from "./kit";

const TAU = Math.PI * 2;

/** A sun over a receding grid horizon. */
export const M_HORIZONLITE: ThemeDraw = (x) => {
  const { c, w, h, cx, vt, bassV, beatE, energy, I, TK, C1, C2, CMix, cfg, fs } = x;
  const hz = h * 0.52;
  const S = scratch(x, "m_horizonlite", () => ({ scroll: 0 }));
  S.scroll = (S.scroll + (0.004 + energy * 0.012) * cfg.speed * fs) % 1;

  // sky
  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, CMix(0.15, 0.5, 12));
  sky.addColorStop(1, CMix(0.7, 0.7, 26));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hz);

  // sun, banded by the spectrum
  const sr = h * 0.13 * (1 + bassV * 0.14 + beatE * 0.12);
  const sy = hz - sr * 0.35;
  c.save();
  c.beginPath();
  c.arc(cx, sy, sr, 0, TAU);
  c.clip();
  const sg = c.createLinearGradient(0, sy - sr, 0, sy + sr);
  sg.addColorStop(0, C1(0.95, 74));
  sg.addColorStop(1, C2(0.95, 56));
  c.fillStyle = sg;
  c.fillRect(cx - sr, sy - sr, sr * 2, sr * 2);
  // the slits across the sun are the whole retro look, and they are just rects
  c.fillStyle = "rgba(6,7,12,0.85)";
  for (let i = 0; i < 7; i++) {
    const f = i / 7;
    const v = c01(band(x, f) * I);
    const yy = sy - sr * 0.1 + f * sr * 1.1;
    c.fillRect(cx - sr, yy, sr * 2, sr * 0.055 * (1.6 - v));
  }
  c.restore();

  // ground
  c.fillStyle = CMix(0.4, 0.5, 8);
  c.fillRect(0, hz, w, h - hz);

  c.lineWidth = 1.2 * TK;
  c.strokeStyle = C1(0.5, 62);
  // receding horizontal lines: 1/(1-p) spacing is what reads as perspective
  for (let i = 0; i < 14; i++) {
    const p = ((i / 14) + S.scroll) % 1;
    const y = hz + (h - hz) * p * p;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  for (let i = -8; i <= 8; i++) {
    c.beginPath();
    c.moveTo(cx, hz);
    c.lineTo(cx + i * w * 0.22, h);
    c.stroke();
  }
};

/** A city skyline whose towers are the spectrum. */
export const M_CITYLITE: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, CMix, fs } = x;
  const N = count(x, 26);
  const bw = w / N;
  const base = h * 0.9;
  const S = scratch(x, "m_citylite", () => ({ hs: [] as number[] }));
  if (S.hs.length !== N) S.hs = new Array(N).fill(0);

  for (let i = 0; i < N; i++) {
    const v = c01(bandLog(x, i / N) * I * (1 + beatE * 0.3));
    S.hs[i] = Math.max(S.hs[i] * dk(0.9, fs), v);
    const bh = S.hs[i] * h * 0.55;
    const f = i / N;
    c.fillStyle = CMix(f, 0.8, 22 + S.hs[i] * 16);
    c.fillRect(i * bw, base - bh, bw * 0.9, bh);
    // lit windows, drawn as a coarse grid of small rects
    c.fillStyle = CMix(f, 0.9, 68);
    const rows = Math.floor(bh / (bw * 0.42));
    for (let r = 0; r < rows; r++) {
      if (((i * 7 + r * 13) % 5) > 2) continue;
      c.fillRect(i * bw + bw * 0.18, base - bh + r * bw * 0.42 + bw * 0.1, bw * 0.18, bw * 0.14);
      c.fillRect(i * bw + bw * 0.52, base - bh + r * bw * 0.42 + bw * 0.1, bw * 0.18, bw * 0.14);
    }
  }
  c.fillStyle = CMix(0.5, 0.5, 6);
  c.fillRect(0, base, w, h - base);
};

/** A spinning record with the waveform cut into its grooves. */
export const M_VINYLITE: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, bassV, beatE, I, TK, C1, C2, CMix, cfg } = x;
  const rr = R * 0.38;
  const spin = vt * 0.006 * cfg.speed;

  c.fillStyle = "rgba(10,10,14,0.95)";
  c.beginPath();
  c.arc(cx, cy, rr * (1 + beatE * 0.03), 0, TAU);
  c.fill();

  // grooves: concentric arcs displaced by the waveform
  c.lineWidth = 1 * TK;
  const GR = count(x, 20);
  for (let g = 0; g < GR; g++) {
    const f = g / GR;
    const gr = rr * (0.32 + f * 0.64);
    const v = wav(x, f) * I;
    c.strokeStyle = CMix(f, 0.22 + Math.abs(v) * 0.6, 46 + Math.abs(v) * 34);
    c.beginPath();
    c.arc(cx, cy, gr + v * R * 0.012, 0, TAU);
    c.stroke();
  }

  // label and spindle
  c.fillStyle = C1(0.9, 54 + bassV * 12);
  c.beginPath();
  c.arc(cx, cy, rr * 0.3, 0, TAU);
  c.fill();
  c.fillStyle = C2(0.9, 70);
  c.beginPath();
  c.arc(cx, cy, rr * 0.3, spin, spin + 0.9);
  c.lineTo(cx, cy);
  c.fill();
  c.fillStyle = "rgba(6,7,12,1)";
  c.beginPath();
  c.arc(cx, cy, Math.max(2, rr * 0.035), 0, TAU);
  c.fill();
};

/** Soft vertical curtains of light, drifting. */
export const M_AURORALITE: ThemeDraw = (x) => {
  const { c, w, h, vt, midV, beatE, energy, I, CMix, cfg } = x;
  const N = count(x, 7);

  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = c01(band(x, f) * I);
    const cxp = w * (0.1 + 0.8 * ((f + Math.sin(vt * 0.003 * cfg.speed + f * 6) * 0.12 + 1) % 1));
    const bw = w * (0.06 + v * 0.1 + energy * 0.04);
    const top = h * (0.05 + Math.sin(vt * 0.004 + f * 4) * 0.05);
    const bot = h * (0.55 + v * 0.3 + midV * 0.1);
    // a single vertical gradient per curtain: three stops, one fill
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.35, CMix(f, (0.16 + v * 0.4) * (1 + beatE * 0.4), 58));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cxp - bw, top, bw * 2, bot - top);
  }
  c.globalCompositeOperation = "source-over";
};

/** A neon path that snakes across the screen, redrawn on section changes. */
export const M_NEONPATH: ThemeDraw = (x) => {
  const { c, w, h, vt, section, beatE, energy, I, TK, C1, C2, cfg } = x;
  const S = scratch(x, "m_neonpath", () => ({ sec: -1, pts: [] as { x: number; y: number }[] }));

  if (S.sec !== section || !S.pts.length) {
    S.sec = section;
    S.pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      S.pts.push({ x: (i / n) * w, y: h * (0.2 + Math.random() * 0.6) });
    }
  }

  const sway = (i: number) => Math.sin(vt * 0.01 * cfg.speed + i * 1.3) * h * 0.05 * (0.4 + energy);

  // three passes: wide and dim, then narrow and bright — a cored neon line
  // without a blur
  for (let pass = 0; pass < 3; pass++) {
    c.strokeStyle = pass === 2 ? "rgba(255,255,255,0.9)" : pass === 1 ? C2(0.75, 66) : C1(0.35, 58);
    c.lineWidth = (10 - pass * 3.6) * TK * (1 + beatE * 0.3);
    c.lineJoin = "round";
    c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < S.pts.length; i++) {
      const p = S.pts[i];
      const v = c01(band(x, i / S.pts.length) * I);
      const y = p.y + sway(i) - v * h * 0.06;
      i === 0 ? c.moveTo(p.x, y) : c.lineTo(p.x, y);
    }
    c.stroke();
  }

  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < S.pts.length; i++) {
    const p = S.pts[i];
    const v = c01(band(x, i / S.pts.length) * I);
    blob(x, p.x, p.y + sway(i) - v * h * 0.06, h * 0.02 * (1 + v), 0.3 + v * 0.4, i / S.pts.length, 80);
  }
  c.globalCompositeOperation = "source-over";
};
