/**
 * Mobile-native visualizers: the spectrum family.
 *
 * Grouped rather than one file per theme, which is a departure from the desktop
 * set and a deliberate one: these are small, they share the same primitives,
 * and thirty-five separate files would bury the thing that actually matters
 * about them — that they are all built to the same budget. See kit.ts for the
 * rule they keep (never call `glow()`) and why.
 */
import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { band, bandLog, blob, BUCKETS, bucket, c01, count, scratch } from "./kit";

/** Mirrored bars from the centre line, with peak caps that fall under gravity. */
export const M_PULSEBARS: ThemeDraw = (x) => {
  const { c, w, h, cy, beatE, I, TK, C1, C2, CMix, fs } = x;
  const N = count(x, 48);
  const S = scratch(x, "m_pulsebars", () => ({ caps: [] as number[] }));
  if (S.caps.length !== N) S.caps = new Array(N).fill(0);
  const bw = w / N;

  // one gradient for the frame, not one per bar: a gradient object is an
  // allocation and a ramp build, and every bar wants the same vertical ramp
  const g = c.createLinearGradient(0, cy - h * 0.4, 0, cy + h * 0.4);
  g.addColorStop(0, C2(0.9, 60));
  g.addColorStop(0.5, C1(0.95, 66 + beatE * 12));
  g.addColorStop(1, C2(0.9, 60));

  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i < N; i++) {
    const v = bandLog(x, i / N) * I;
    const bh = Math.min(0.44, v * 0.42 * (1 + beatE * 0.5)) * h;
    S.caps[i] = Math.max(S.caps[i] - h * 0.006 * fs, bh);
    c.rect(i * bw + bw * 0.14, cy - bh, bw * 0.72, bh * 2);
  }
  c.fill();

  c.fillStyle = CMix(0.5, 0.85, 84);
  c.beginPath();
  for (let i = 0; i < N; i++) {
    const cp = S.caps[i];
    c.rect(i * bw + bw * 0.14, cy - cp - 3 * TK, bw * 0.72, 2 * TK);
    c.rect(i * bw + bw * 0.14, cy + cp + TK, bw * 0.72, 2 * TK);
  }
  c.fill();
};

/** Segmented LED ladder: each bar is a stack of lit cells. */
export const M_LADDER: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, C1, C2, CMix } = x;
  const N = count(x, 24);
  const ROWS = 18;
  const bw = w / N;
  const ch = (h * 0.8) / ROWS;
  const top = h * 0.1;

  for (let i = 0; i < N; i++) {
    const v = c01(bandLog(x, i / N) * I * (1 + beatE * 0.3));
    const lit = Math.round(v * ROWS);
    for (let r = 0; r < ROWS; r++) {
      const on = r < lit;
      const f = r / ROWS;
      // unlit cells stay visible as a dim frame, so the ladder reads as an
      // instrument rather than as bars that vanish in the quiet parts
      c.fillStyle = on ? CMix(f, 0.95, 52 + f * 26) : C2(0.07, 30);
      const y = top + (ROWS - 1 - r) * ch;
      c.fillRect(i * bw + bw * 0.16, y + ch * 0.16, bw * 0.68, ch * 0.66);
    }
  }
  void C1;
};

/** Bars growing inward from both side edges — a spectrum read sideways. */
export const M_RIBS: ThemeDraw = (x) => {
  const { c, w, h, cx, beatE, I, C1, C2, CMix } = x;
  const N = count(x, 34);
  const rh = h / N;

  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = c01(band(x, f) * I * (1 + beatE * 0.35));
    const len = v * cx * 0.92;
    c.fillStyle = CMix(f, 0.9, 58 + v * 22);
    c.fillRect(0, i * rh + rh * 0.18, len, rh * 0.64);
    c.fillRect(w - len, i * rh + rh * 0.18, len, rh * 0.64);
  }
  void C1;
  void C2;
};

/** A dense comb of thin lines — high resolution across the spectrum. */
export const M_COMB: ThemeDraw = (x) => {
  const { c, w, h, cy, beatE, I, TK, CMix } = x;
  const N = count(x, 90);
  const bw = w / N;

  // Values first, then one pass per colour bucket. Ninety `stroke()` calls
  // become seven, and no path object is allocated — see the note on `bucket`.
  const S = scratch(x, "m_comb", () => ({ v: [] as number[] }));
  if (S.v.length !== N) S.v = new Array(N).fill(0);
  for (let i = 0; i < N; i++) S.v[i] = c01(bandLog(x, i / N) * I);

  c.lineWidth = Math.max(1, bw * 0.42 * TK);
  c.lineCap = "round";
  for (let b = 0; b < BUCKETS; b++) {
    const t = (b + 0.5) / BUCKETS;
    c.strokeStyle = CMix(t, 0.55 + t * 0.45, 54 + t * 28);
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const v = S.v[i];
      if (bucket(v) !== b) continue;
      const bh = v * h * 0.38 * (1 + beatE * 0.4);
      const px = i * bw + bw / 2;
      c.moveTo(px, cy - bh);
      c.lineTo(px, cy + bh);
    }
    c.stroke();
  }
};

/** A staircase silhouette: the spectrum as a filled terrain. */
export const M_STEPWAVE: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, C1, C2 } = x;
  const N = count(x, 40);
  const bw = w / N;
  const base = h * 0.86;

  const g = c.createLinearGradient(0, base - h * 0.5, 0, base);
  g.addColorStop(0, C1(0.85, 66 + beatE * 10));
  g.addColorStop(1, C2(0.25, 40));
  c.fillStyle = g;

  c.beginPath();
  c.moveTo(0, base);
  for (let i = 0; i < N; i++) {
    const v = c01(bandLog(x, i / N) * I * (1 + beatE * 0.3));
    const y = base - v * h * 0.46;
    c.lineTo(i * bw, y);
    c.lineTo((i + 1) * bw, y);
  }
  c.lineTo(w, base);
  c.closePath();
  c.fill();

  // a bright rim along the top edge, which is what stops a filled shape
  // reading as a flat block
  c.strokeStyle = C1(0.9, 82);
  c.lineWidth = 2;
  c.stroke();
};

/** Spectrum drawn as a run of soft lights rather than hard bars. */
export const M_EMBERBARS: ThemeDraw = (x) => {
  const { c, w, h, cy, beatE, I } = x;
  const N = count(x, 30);
  const bw = w / N;

  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = c01(bandLog(x, f) * I);
    const n = 1 + Math.round(v * 6);
    for (let k = 0; k < n; k++) {
      const t = k / Math.max(1, n);
      const y = cy - t * v * h * 0.4;
      const r = bw * (0.9 - t * 0.4) * (1 + beatE * 0.3);
      blob(x, i * bw + bw / 2, y, r, (1 - t) * 0.5 * (0.4 + v), f, 64);
      blob(x, i * bw + bw / 2, cy + (cy - y), r, (1 - t) * 0.35 * (0.4 + v), f, 64);
    }
  }
  c.globalCompositeOperation = "source-over";
};

/** Two-tone split bars: lows lean one way in the palette, highs the other. */
export const M_PRISMBAR: ThemeDraw = (x) => {
  const { c, w, h, cy, beatE, I, C1, C2, CMix, fs } = x;
  const N = count(x, 36);
  const S = scratch(x, "m_prismbar", () => ({ sm: [] as number[] }));
  if (S.sm.length !== N) S.sm = new Array(N).fill(0);
  const bw = w / N;

  const k = dk(0.6, fs);
  for (let i = 0; i < N; i++) {
    const v = c01(bandLog(x, i / N) * I);
    // a little smoothing, so the bars breathe rather than flicker
    S.sm[i] = S.sm[i] * k + v * (1 - k);
  }

  // three offset passes over the whole spectrum rather than three fills per
  // bar: the chromatic split is a property of the *pass*, so it batches exactly
  const pass = (dx: number, style: string) => {
    c.fillStyle = style;
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const bh = S.sm[i] * h * 0.4 * (1 + beatE * 0.4);
      c.rect(i * bw + bw * 0.1 + dx, cy - bh, bw * 0.8, bh * 2);
    }
    c.fill();
  };
  pass(-2, C1(0.55, 58));
  pass(2, C2(0.55, 58));
  pass(0, CMix(0.5, 0.95, 78));
};
