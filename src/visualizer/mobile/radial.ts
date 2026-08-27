/**
 * Mobile-native visualizers: the radial family.
 *
 * Polar layouts are the ones that most want a glow, and the ones where a phone
 * can least afford it — so these get their light from `blob()` (a blitted
 * sprite) and their structure from plain strokes.
 */
import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { band, bandLog, blob, c01, count, polyPath, scratch } from "./kit";

const TAU = Math.PI * 2;

/** A ring whose radius is modulated by the spectrum. */
export const M_HALORING: ThemeDraw = (x) => {
  const { c, cx, cy, R, bassV, beatE, I, TK, C1, C2, CMix, vt } = x;
  const N = count(x, 96);
  const base = R * (0.26 + bassV * 0.05 + beatE * 0.04);

  c.lineWidth = 2.6 * TK;
  c.lineJoin = "round";
  for (let ring = 0; ring < 3; ring++) {
    const rf = 1 + ring * 0.16;
    c.strokeStyle = CMix(ring / 3, 0.85 - ring * 0.2, 66 + ring * 6);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const f = (i % N) / N;
      const v = band(x, f) * I;
      const r = base * rf + v * R * 0.14 * (1 + beatE * 0.4);
      const a = f * TAU + vt * 0.002 * (ring % 2 ? -1 : 1);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  }

  c.globalCompositeOperation = "lighter";
  blob(x, cx, cy, base * 0.7 * (1 + beatE * 0.5), 0.4 + bassV * 0.3, 0.5, 76);
  c.globalCompositeOperation = "source-over";
  void C1;
  void C2;
};

/** A polar rose: petals whose reach follows the spectrum. */
export const M_PETALS: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, I, TK, CMix } = x;
  const PET = 7;
  const N = count(x, 120);

  c.lineWidth = 2 * TK;
  for (let layer = 0; layer < 3; layer++) {
    const lf = 1 - layer * 0.22;
    c.strokeStyle = CMix(layer / 3, 0.8 - layer * 0.18, 64);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const a = f * TAU + vt * 0.0015 + layer * 0.3;
      const v = bandLog(x, Math.abs(Math.sin(a * PET * 0.5))) * I;
      const r = R * (0.1 + 0.24 * lf) * (1 + Math.abs(Math.sin(a * PET / 2)) * (0.7 + v));
      const px = cx + Math.cos(a) * r * (1 + beatE * 0.15);
      const py = cy + Math.sin(a) * r * (1 + beatE * 0.15);
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.stroke();
  }
};

/** Spokes radiating out, each one a band of the spectrum. */
export const M_SUNBURST: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, I, TK, CMix } = x;
  const N = count(x, 64);
  const inner = R * 0.12;

  c.lineCap = "round";
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = c01(bandLog(x, f) * I);
    const a = f * TAU + vt * 0.001;
    const len = inner + v * R * 0.36 * (1 + beatE * 0.4);
    c.strokeStyle = CMix(f, 0.5 + v * 0.5, 56 + v * 26);
    c.lineWidth = (1.4 + v * 3) * TK;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    c.stroke();
  }
};

/** Dots orbiting on concentric rings at different rates. */
export const M_ORBITDOTS: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, I, cfg } = x;
  const RINGS = 5;

  c.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < RINGS; ring++) {
    const rf = (ring + 1) / RINGS;
    const n = count(x, 8 + ring * 5);
    const rr = R * (0.1 + rf * 0.3);
    // inner rings turn faster, which is what stops the whole thing reading as
    // one spinning picture
    const spin = vt * 0.004 * (1.8 - rf) * cfg.speed * (ring % 2 ? 1 : -1);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const v = c01(band(x, (f + rf) % 1) * I);
      const a = f * TAU + spin;
      blob(
        x,
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr,
        R * 0.018 * (1 + v * 1.6 + beatE * 0.6),
        0.35 + v * 0.5,
        rf,
        70,
      );
    }
  }
  c.globalCompositeOperation = "source-over";
};

/** Concentric arc segments, like an iris opening on the beat. */
export const M_IRIS: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, bassV, I, TK, CMix } = x;
  const RINGS = 7;

  c.lineCap = "butt";
  for (let ring = 0; ring < RINGS; ring++) {
    const f = ring / RINGS;
    const v = c01(band(x, f) * I);
    const rr = R * (0.09 + f * 0.3) * (1 + beatE * 0.12 + bassV * 0.06);
    const segs = 6 + ring;
    const gap = 0.22 - v * 0.12;
    const spin = vt * 0.0025 * (ring % 2 ? 1 : -1);
    c.strokeStyle = CMix(f, 0.45 + v * 0.5, 58 + v * 24);
    c.lineWidth = (2 + v * 5) * TK;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU + spin;
      c.beginPath();
      c.arc(cx, cy, rr, a0 + gap, a0 + TAU / segs - gap);
      c.stroke();
    }
  }
};

/** Rings that expand outward on every beat and fade as they go. */
export const M_ECHORINGS: ThemeDraw = (x) => {
  const { c, cx, cy, R, beat, beatE, TK, fs, C1, C2 } = x;
  const S = scratch(x, "m_echorings", () => ({ rings: [] as { r: number; a: number }[] }));

  if (beat && S.rings.length < 10) S.rings.push({ r: 0.05, a: 1 });

  c.lineJoin = "round";
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const rg = S.rings[i];
    rg.r += 0.012 * fs;
    rg.a *= dk(0.965, fs);
    if (rg.a < 0.04 || rg.r > 1.4) { S.rings.splice(i, 1); continue; }
    c.strokeStyle = i % 2 ? C1(rg.a * 0.8, 74) : C2(rg.a * 0.8, 74);
    c.lineWidth = (1 + rg.a * 5) * TK;
    polyPath(c, cx, cy, rg.r * R, 24, rg.r * 2);
    c.stroke();
  }

  c.globalCompositeOperation = "lighter";
  blob(x, cx, cy, R * 0.1 * (1 + beatE), 0.35 + beatE * 0.4, 0.5, 80);
  c.globalCompositeOperation = "source-over";
};

/** Layered polygons that bloom open with the music. */
export const M_LOTUS: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, bassV, I, TK, CMix } = x;
  const LAYERS = 6;

  c.lineJoin = "round";
  for (let L = 0; L < LAYERS; L++) {
    const f = L / LAYERS;
    const v = c01(band(x, f) * I);
    const sides = 5 + L;
    const rr = R * (0.08 + f * 0.28) * (1 + v * 0.25 + bassV * 0.1 + beatE * 0.1);
    c.strokeStyle = CMix(f, 0.7 - f * 0.25 + v * 0.3, 60 + v * 22);
    c.lineWidth = (1.4 + v * 3) * TK;
    polyPath(c, cx, cy, rr, sides, vt * 0.0018 * (L % 2 ? 1 : -1) + f * 0.6);
    c.stroke();
  }
};

/** A perspective tunnel of rings rushing toward the viewer. */
export const M_TUNNELITE: ThemeDraw = (x) => {
  const { c, cx, cy, R, energy, beatE, bassV, I, TK, CMix, fs, cfg } = x;
  const RINGS = 16;
  const S = scratch(x, "m_tunnelite", () => ({ z: 0 }));
  S.z += (0.004 + energy * 0.02) * cfg.speed * fs * (1 + beatE * 0.6);

  c.lineJoin = "round";
  for (let i = 0; i < RINGS; i++) {
    // each ring's depth cycles through 0..1; the modulo is what makes it a
    // continuous rush rather than a fixed stack
    const d = ((i / RINGS + S.z) % 1 + 1) % 1;
    const p = 1 - d;
    const rr = R * 0.04 / Math.max(0.06, p * 0.9);
    if (rr > R * 1.6) continue;
    const v = c01(band(x, i / RINGS) * I);
    c.strokeStyle = CMix(i / RINGS, (0.2 + v * 0.7) * p, 56 + v * 26);
    c.lineWidth = (1 + p * 4 + v * 2) * TK;
    polyPath(c, cx, cy, rr * (1 + bassV * 0.1), 12, d * 1.2);
    c.stroke();
  }
};
