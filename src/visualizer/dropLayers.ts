// Drop layers — what a track's drops actually build up.
//
// The first version fired one-shot effects: a flash, a shockwave, a shatter. It
// read as the picture being hit rather than as the piece growing, and the
// full-frame flash in particular was just loud.
//
// This replaces that. Each drop *unlocks a layer*, and the layer stays. It is
// then driven by musical energy, so it recedes when the track calms and comes
// back when it lifts — the same layers breathing with the song rather than
// appearing and vanishing. By the last chorus a theme is carrying everything it
// earned along the way.
//
// Layers are drawn in the theme's own world (centre, radius, palette) rather
// than as screen-space filters, which is what lets them read as part of the
// visual instead of pasted over it.
import type { ThemeCtx } from "./themeTypes";
import type { LiveState } from "./live";
import { light } from "./light";

export interface LayerCtx extends ThemeCtx {
  /** 0..1 — how present this layer is right now, from musical energy */
  amt: number;
  /** which unlock slot this is, so a layer can vary with depth */
  slot: number;
}

export type LayerDraw = (x: LayerCtx) => void;

const TAU = Math.PI * 2;
const hash01 = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// ── the layer library ────────────────────────────────────────────────────
// Each is a self-contained ornament that composes with any theme underneath.
// They never clear or wash the frame — that is what made the old set feel like
// a filter rather than an addition.

export const LAYERS: Record<string, LayerDraw> = {
  /** luminous orbit rings, each carrying a travelling light */
  ORBITS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, bassV, TK, CMix, C1 } = x;
    const n = 2 + slot;
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n - 1);
      const rr = R * (0.3 + f * 0.36) * (1 + beatE * 0.05 + bassV * 0.04);
      const a = vt * 0.005 * (i % 2 ? 1 : -1) + i;
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.scale(1, 0.4);
      // a gradient stroke, so the ring reads as lit from one side rather than
      // as a drawn outline
      const g = c.createLinearGradient(-rr, 0, rr, 0);
      g.addColorStop(0, CMix(f, amt * 0.12, 58));
      g.addColorStop(0.5, CMix(f, amt * 0.85, 72));
      g.addColorStop(1, CMix(f, amt * 0.12, 58));
      c.strokeStyle = g;
      c.lineWidth = (1.2 + amt * 2.6) * TK;
      c.beginPath();
      c.arc(0, 0, rr, 0, TAU);
      c.stroke();
      c.restore();
      // the travelling node
      const ta = vt * 0.012 * (i % 2 ? 1 : -1) + i * 2.1;
      const px = cx + Math.cos(ta + a) * rr;
      const py = cy + Math.sin(ta + a) * rr * 0.4;
      light(c, C1(1, 78), px, py, R * (0.03 + amt * 0.05) * (1 + beatE * 0.5), amt * 0.85);
    }
  },

  /** motes rising through the frame, lit rather than drawn */
  EMBERS: (x) => {
    const { c, w, h, R, vt, amt, slot, trebV, beatE, C1, CMix, L } = x;
    const S = (L.scratch.lyEmber ??= [] as { x: number; y: number; sp: number; ph: number; sz: number }[]) as { x: number; y: number; sp: number; ph: number; sz: number }[];
    const want = Math.round((30 + slot * 26) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.0009 + Math.random() * 0.0026, ph: Math.random() * TAU, sz: 0.35 + Math.random() * Math.random() * 2.4 });
    if (S.length > want) S.length = want;
    const hot = C1(1, 80), warm = CMix(0.6, 1, 66);
    for (const p of S) {
      p.y -= p.sp * (1 + amt * 1.4);
      if (p.y < -0.03) { p.y = 1.03; p.x = Math.random(); }
      const px = (p.x + Math.sin(vt * 0.011 + p.ph) * 0.018) * w;
      const py = p.y * h;
      const tw = 0.45 + 0.55 * Math.sin(vt * 0.06 + p.ph * 3);
      // bigger ones burn cooler and further back, which gives the drift depth
      light(c, p.sz > 1.4 ? warm : hot, px, py, R * 0.012 * p.sz * (1 + amt), amt * (0.3 + trebV * 0.3 + beatE * 0.2) * tw);
    }
  },

  /** a lattice in perspective with a light sweeping over it */
  LATTICE: (x) => {
    const { c, w, h, vt, amt, slot, bassV, C2, C1, TK } = x;
    const step = Math.max(30, Math.min(w, h) / (6 + slot * 2));
    const wob = Math.sin(vt * 0.01) * 6 * amt;
    c.strokeStyle = C2(amt * 0.2 + bassV * 0.12, 56);
    c.lineWidth = 0.8 * TK;
    c.beginPath();
    for (let gx = 0; gx <= w + step; gx += step) { c.moveTo(gx + wob, 0); c.lineTo(gx - wob, h); }
    for (let gy = 0; gy <= h + step; gy += step) { c.moveTo(0, gy - wob); c.lineTo(w, gy + wob); }
    c.stroke();
    // the sweep: a soft band of light travelling down the grid
    const sy = (((vt * 0.0022) % 1) + 1) % 1 * (h + step * 2) - step;
    const band = h * 0.09;
    const g = c.createLinearGradient(0, sy - band, 0, sy + band);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.5, C1(amt * 0.3, 74));
    g.addColorStop(1, "transparent");
    c.strokeStyle = g;
    c.lineWidth = 1.6 * TK;
    c.beginPath();
    for (let gy = Math.max(0, sy - band); gy <= Math.min(h, sy + band); gy += step) { c.moveTo(0, gy); c.lineTo(w, gy); }
    for (let gx = 0; gx <= w + step; gx += step) { c.moveTo(gx + wob, Math.max(0, sy - band)); c.lineTo(gx - wob, Math.min(h, sy + band)); }
    c.stroke();
  },

  /** volumetric god rays */
  SHAFTS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, bassV, C1, C2 } = x;
    const n = 5 + slot * 2;
    const rad = R * 1.45;
    c.save();
    c.translate(cx, cy);
    c.rotate(vt * 0.0014);
    // The wedges meet at the origin, so a gradient brightest there sums n times
    // over on one spot and clips. Peak it out where they have separated.
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.26, C1(amt * 0.2 * (1 + beatE * 0.5 + bassV * 0.3), 74));
    g.addColorStop(0.62, C2(amt * 0.12, 60));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      // each ray breathes on its own phase, so the fan never looks like a wheel
      const wd = (0.028 + 0.06 * hash01(i)) * (0.6 + 0.4 * Math.sin(vt * 0.02 + i * 1.7));
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - wd) * rad, Math.sin(a - wd) * rad);
      c.lineTo(Math.cos(a + wd) * rad, Math.sin(a + wd) * rad);
      c.closePath();
    }
    c.fill();
    c.restore();
  },

  /** expanding rings of light, one per beat */
  PULSE: (x) => {
    const { c, cx, cy, R, amt, slot, beat, TK, CMix, C1, L } = x;
    const S = (L.scratch.lyPulse ??= [] as number[]) as number[];
    if (beat && S.length < 5 + slot) S.push(0);
    for (let i = S.length - 1; i >= 0; i--) {
      S[i] += 0.011 * (1 + amt);
      if (S[i] > 1) { S.splice(i, 1); continue; }
      const p = S[i];
      const a = (1 - p) ** 2 * amt;
      const rr = p * R * 1.05;
      // a soft leading edge rather than a hairline circle
      const g = c.createRadialGradient(cx, cy, rr * 0.82, cx, cy, rr * 1.1);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.6, CMix(p, a * 0.4, 68));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, rr * 1.1, 0, TAU);
      c.fill();
      c.strokeStyle = C1(a * 0.6, 78);
      c.lineWidth = (0.8 + a * 2.4) * TK;
      c.beginPath();
      c.arc(cx, cy, rr, 0, TAU);
      c.stroke();
    }
  },

  /** drifting motes at several depths */
  DUST: (x) => {
    const { c, w, h, R, vt, amt, slot, C2, CMix, L } = x;
    const S = (L.scratch.lyDust ??= [] as { x: number; y: number; ph: number; sz: number; d: number }[]) as { x: number; y: number; ph: number; sz: number; d: number }[];
    const want = Math.round((44 + slot * 34) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU, sz: 0.4 + Math.random() * 1.8, d: Math.random() });
    if (S.length > want) S.length = want;
    const near = C2(1, 72), far = CMix(0.35, 1, 54);
    for (const p of S) {
      // nearer motes drift further and shine brighter — parallax for free
      const k = 0.4 + p.d;
      const px = (p.x + Math.sin(vt * 0.006 * k + p.ph) * 0.04 * k) * w;
      const py = (p.y + Math.cos(vt * 0.005 * k + p.ph * 1.7) * 0.04 * k) * h;
      light(c, p.d > 0.55 ? near : far, px, py, R * 0.008 * p.sz * (0.5 + p.d) * (1 + amt), amt * (0.18 + p.d * 0.32));
    }
  },

  /** a lit horizon the composition stands on */
  HORIZON: (x) => {
    const { c, w, h, cx, cy, R, amt, bassV, dropE, beatE, C1, C2 } = x;
    const band = h * (0.03 + bassV * 0.04 + dropE * 0.04) * (0.5 + amt);
    const g = c.createLinearGradient(0, cy - band, 0, cy + band);
    g.addColorStop(0, "transparent");
    // a full-width band lands on whatever the theme put across the middle, so it
    // stays well under the others' alpha or it clips the horizon out
    g.addColorStop(0.5, C1(amt * 0.18, 62));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, cy - band, w, band * 2);
    // the light source sitting on it
    light(c, C2(1, 70), cx, cy, R * (0.2 + bassV * 0.1 + beatE * 0.05), amt * 0.4);
  },

  /** concentric contours breathing outward */
  ECHOES: (x) => {
    const { c, cx, cy, amt, slot, R, beatE, vt, CMix, TK } = x;
    const n = 2 + slot;
    for (let i = 1; i <= n; i++) {
      const rr = R * (0.18 + i * 0.13) * (1 + beatE * 0.07);
      c.strokeStyle = CMix(i / n, amt * 0.4, 66);
      c.lineWidth = (0.8 + amt * 1.5) * TK;
      c.beginPath();
      for (let k = 0; k <= 64; k++) {
        const a = (k / 64) * TAU;
        const wob = 1 + Math.sin(a * (3 + i) + vt * 0.022) * 0.09 * amt
          + Math.sin(a * (7 + i * 2) - vt * 0.014) * 0.04 * amt;
        const px = cx + Math.cos(a) * rr * wob;
        const py = cy + Math.sin(a) * rr * wob;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
    }
  },

  /** falling light with gradient tails */
  RAINFALL: (x) => {
    const { c, w, h, amt, slot, C1, CMix, TK, L } = x;
    const S = (L.scratch.lyRain ??= [] as { x: number; y: number; sp: number; len: number; d: number }[]) as { x: number; y: number; sp: number; len: number; d: number }[];
    const want = Math.round((26 + slot * 22) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.006 + Math.random() * 0.014, len: 0.04 + Math.random() * 0.09, d: Math.random() });
    if (S.length > want) S.length = want;
    for (const p of S) {
      p.y += p.sp * (1 + amt);
      if (p.y > 1.12) { p.y = -0.12; p.x = Math.random(); }
      const px = p.x * w, py = p.y * h, ty = (p.y - p.len) * h;
      const g = c.createLinearGradient(px, py, px, ty);
      g.addColorStop(0, C1(amt * (0.4 + p.d * 0.5), 78));
      g.addColorStop(1, "transparent");
      c.strokeStyle = g;
      c.lineWidth = (0.6 + p.d * 1.4) * TK;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px, ty);
      c.stroke();
      if (p.d > 0.7) {
        c.fillStyle = CMix(0.5, amt * 0.5, 82);
        c.beginPath();
        c.arc(px, py, (0.7 + p.d) * TK, 0, TAU);
        c.fill();
      }
    }
  },

  /** a broad halo framing the whole piece */
  HALO: (x) => {
    const { c, cx, cy, R, amt, slot, beatE, bassV, C1, C2 } = x;
    const rr = R * (0.6 + slot * 0.05) * (1 + beatE * 0.04 + bassV * 0.03);
    const g = c.createRadialGradient(cx, cy, rr * 0.62, cx, cy, rr * 1.35);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.45, C1(amt * 0.18, 66));
    g.addColorStop(0.75, C2(amt * 0.14, 56));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, rr * 1.35, 0, TAU);
    c.fill();
  },

  /** constellation of lit nodes */
  WEB: (x) => {
    const { c, w, h, R, vt, amt, slot, C2, C1, TK, L } = x;
    const S = (L.scratch.lyWeb ??= [] as { x: number; y: number; ph: number }[]) as { x: number; y: number; ph: number }[];
    const want = Math.round((8 + slot * 5) * Math.max(0.35, amt));
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU });
    if (S.length > want) S.length = want;
    const pts = S.map((p) => [
      (p.x + Math.sin(vt * 0.005 + p.ph) * 0.06) * w,
      (p.y + Math.cos(vt * 0.004 + p.ph * 1.3) * 0.06) * h,
    ]);
    const reach = (w * 0.24) ** 2;
    c.lineWidth = 0.8 * TK;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
        const d2 = dx * dx + dy * dy;
        if (d2 > reach) continue;
        // links fade with distance, which is what makes it read as a web rather
        // than a mesh
        c.strokeStyle = C2(amt * 0.34 * (1 - d2 / reach), 64);
        c.beginPath();
        c.moveTo(pts[i][0], pts[i][1]);
        c.lineTo(pts[j][0], pts[j][1]);
        c.stroke();
      }
    }
    const node = C1(1, 80);
    for (const p of pts) light(c, node, p[0], p[1], R * 0.022 * (1 + amt), amt * 0.5);
  },

  /** wide bands of light sweeping the frame */
  SCANS: (x) => {
    const { c, w, h, vt, amt, slot, beatE, C1, C2 } = x;
    const n = 1 + slot;
    for (let i = 0; i < n; i++) {
      const y = (((vt * 0.0018 + i / n) % 1) + 1) % 1 * h;
      const band = h * (0.05 + beatE * 0.02);
      const g = c.createLinearGradient(0, y - band, 0, y + band);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.44, C2(amt * 0.1, 58));
      g.addColorStop(0.5, C1(amt * 0.22, 76));
      g.addColorStop(0.56, C2(amt * 0.07, 58));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(0, y - band, w, band * 2);
    }
  },

  /** viewfinder brackets */
  FRAME: (x) => {
    const { c, w, h, amt, slot, beatE, C1, C2, TK } = x;
    const m = Math.min(w, h) * (0.06 - slot * 0.005);
    const len = Math.min(w, h) * (0.09 + slot * 0.02) * (1 + beatE * 0.14);
    const corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as [number, number, number, number][];
    for (const [px, py, sx, sy] of corners) {
      const g = c.createLinearGradient(px, py, px + sx * len, py + sy * len);
      g.addColorStop(0, C1(amt * 0.75, 78));
      g.addColorStop(1, C2(amt * 0.1, 58));
      c.strokeStyle = g;
      c.lineWidth = (1.4 + amt * 2) * TK;
      c.beginPath();
      c.moveTo(px + sx * len, py);
      c.lineTo(px, py);
      c.lineTo(px, py + sy * len);
      c.stroke();
    }
  },

  /** a column of light behind the composition */
  BEAM: (x) => {
    const { c, w, h, cx, cy, R, amt, slot, bassV, beatE, C1, C2 } = x;
    const wd = w * (0.05 + slot * 0.025) * (0.6 + bassV + beatE * 0.3);
    const g = c.createLinearGradient(cx - wd, 0, cx + wd, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.42, C2(amt * 0.1, 58));
    g.addColorStop(0.5, C1(amt * 0.2, 72));
    g.addColorStop(0.58, C2(amt * 0.07, 58));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cx - wd, 0, wd * 2, h);
    light(c, C1(1, 82), cx, cy, R * (0.14 + bassV * 0.08), amt * 0.42);
  },

  /** lit shards orbiting in a shallow ellipse */
  SHARDS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, CMix, C1, L } = x;
    const S = (L.scratch.lyShard ??= [] as { a: number; r: number; sp: number; sz: number; rot: number }[]) as { a: number; r: number; sp: number; sz: number; rot: number }[];
    const want = Math.round((7 + slot * 6) * amt);
    while (S.length < want) S.push({ a: Math.random() * TAU, r: 0.32 + Math.random() * 0.5, sp: 0.0012 + Math.random() * 0.0036, sz: 0.5 + Math.random() * 1.1, rot: Math.random() * TAU });
    if (S.length > want) S.length = want;
    for (const p of S) {
      p.a += p.sp * (1 + amt);
      p.rot += 0.012;
      const px = cx + Math.cos(p.a) * R * p.r;
      const py = cy + Math.sin(p.a) * R * p.r * 0.55;
      const sz = R * 0.026 * p.sz * (0.6 + amt) * (1 + beatE * 0.18);
      // the ones on the near side of the orbit are bigger and brighter
      const near = 0.5 + 0.5 * Math.sin(p.a);
      light(c, C1(1, 76), px, py, sz * 1.8, amt * 0.3 * near);
      c.save();
      c.translate(px, py);
      c.rotate(p.rot + vt * 0.002);
      const g = c.createLinearGradient(0, -sz, 0, sz);
      g.addColorStop(0, CMix(p.r, amt * (0.5 + near * 0.5), 82));
      g.addColorStop(1, CMix(p.r, amt * 0.1, 52));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -sz);
      c.lineTo(sz * 0.55, sz * 0.42);
      c.lineTo(-sz * 0.48, sz * 0.5);
      c.closePath();
      c.fill();
      c.restore();
    }
  },

  /** a tide of colour washing in from the edges */
  TIDEWASH: (x) => {
    const { c, w, h, cx, cy, R, amt, vt, bassV, C2, CMix } = x;
    const g = c.createRadialGradient(cx, cy, R * 0.22, cx, cy, R * (1.15 + Math.sin(vt * 0.006) * 0.08 + bassV * 0.06));
    g.addColorStop(0, "transparent");
    g.addColorStop(0.55, CMix(0.5, amt * 0.1, 46));
    g.addColorStop(1, C2(amt * 0.2, 46));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  },

  /** billowing plumes rising and spreading */
  PLUMES: (x) => {
    const { c, w, h, R, vt, amt, slot, bassV, CMix, C2, L } = x;
    const S = (L.scratch.lyPlume ??= [] as { x: number; y: number; sp: number; ph: number; sz: number }[]) as { x: number; y: number; sp: number; ph: number; sz: number }[];
    const want = Math.round((7 + slot * 4) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.0006 + Math.random() * 0.0014, ph: Math.random() * TAU, sz: 0.6 + Math.random() * 1.2 });
    if (S.length > want) S.length = want;
    for (const p of S) {
      p.y -= p.sp * (1 + amt + bassV);
      if (p.y < -0.15) { p.y = 1.15; p.x = Math.random(); }
      // a plume spreads as it rises, so height drives size
      const rise = 1 - p.y;
      const px = (p.x + Math.sin(vt * 0.004 + p.ph) * 0.05) * w;
      light(c, CMix(rise, 1, 60), px, p.y * h, R * 0.07 * p.sz * (0.4 + rise) * (0.5 + amt), amt * 0.16 * (1 - rise * 0.5));
    }
    void C2;
  },

  /** a swarm that wheels as one body */
  FLOCK: (x) => {
    const { c, w, h, vt, amt, slot, beatE, C1, TK, L } = x;
    const S = (L.scratch.lyFlock ??= [] as { ph: number; r: number; sp: number }[]) as { ph: number; r: number; sp: number }[];
    const want = Math.round((22 + slot * 16) * amt);
    while (S.length < want) S.push({ ph: Math.random() * TAU, r: 0.1 + Math.random() * 0.28, sp: 0.6 + Math.random() * 0.8 });
    if (S.length > want) S.length = want;
    // the whole flock follows one slow wandering centre, which is what makes it
    // read as a single organism rather than as scattered dots
    const hx = 0.5 + Math.sin(vt * 0.0032) * 0.26, hy = 0.5 + Math.cos(vt * 0.0025) * 0.2;
    c.strokeStyle = C1(amt * 0.5, 74);
    c.lineWidth = (0.7 + amt) * TK;
    c.beginPath();
    for (const p of S) {
      const a = p.ph + vt * 0.01 * p.sp;
      const px = (hx + Math.cos(a) * p.r) * w;
      const py = (hy + Math.sin(a * 1.3) * p.r * 0.8) * h;
      const tail = 5 + beatE * 6;
      c.moveTo(px, py);
      c.lineTo(px - Math.cos(a) * tail, py - Math.sin(a * 1.3) * tail);
    }
    c.stroke();
  },

  /** rippling caustics, like light through water */
  CAUSTICS: (x) => {
    const { c, w, h, vt, amt, slot, midV, C1, TK } = x;
    const rows = 5 + slot;
    c.lineWidth = (0.8 + amt * 1.2) * TK;
    for (let r = 0; r < rows; r++) {
      const f = r / rows;
      c.strokeStyle = C1(amt * 0.22 * (1 - f * 0.4), 70);
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const u = i / 48;
        const px = u * w;
        const py = (f + 0.06) * h * 1.4
          + Math.sin(u * 9 + vt * 0.02 + r) * h * 0.03 * (1 + midV)
          + Math.sin(u * 21 - vt * 0.014 + r * 2.1) * h * 0.014;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
  },

  /** columns of light standing up from the base */
  PILLARS: (x) => {
    const { c, w, h, amt, slot, bassV, beatE, C1, C2 } = x;
    const n = 3 + slot;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const px = f * w;
      const wd = w * 0.02 * (1 + hash01(i) + bassV * 0.6);
      const hh = h * (0.4 + hash01(i + 9) * 0.45) * (1 + beatE * 0.08);
      const g = c.createLinearGradient(0, h, 0, h - hh);
      g.addColorStop(0, C1(amt * 0.3, 68));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(px - wd, h - hh, wd * 2, hh);
      c.fillStyle = C2(amt * 0.16, 60);
      c.fillRect(px - wd * 0.3, h - hh, wd * 0.6, hh);
    }
  },

  /** electric arcs cracking between points */
  SPARKS: (x) => {
    const { c, cx, cy, R, amt, slot, beat, hitE, C1, CMix, TK, L } = x;
    const S = (L.scratch.lySpark ??= [] as { a: number; life: number; seed: number }[]) as { a: number; life: number; seed: number }[];
    if ((beat || hitE > 0.6) && S.length < 3 + slot) S.push({ a: Math.random() * TAU, life: 1, seed: Math.random() * 999 });
    for (let i = S.length - 1; i >= 0; i--) {
      const p = S[i];
      p.life -= 0.06;
      if (p.life <= 0) { S.splice(i, 1); continue; }
      const len = R * (0.35 + slot * 0.05);
      c.strokeStyle = C1(amt * p.life * 0.9, 82);
      c.lineWidth = (0.8 + p.life * 1.8) * TK;
      c.beginPath();
      c.moveTo(cx, cy);
      // a jagged walk outward — each segment kicked sideways by a stable hash,
      // so an arc flickers in place instead of writhing randomly
      let px = cx, py = cy;
      for (let k = 1; k <= 7; k++) {
        const t = k / 7;
        const off = (hash01(p.seed + k) - 0.5) * R * 0.16 * (1 - t);
        px = cx + Math.cos(p.a) * len * t - Math.sin(p.a) * off;
        py = cy + Math.sin(p.a) * len * t + Math.cos(p.a) * off;
        c.lineTo(px, py);
      }
      c.stroke();
      light(c, CMix(0.4, 1, 80), px, py, R * 0.03 * p.life, amt * p.life * 0.6);
    }
  },

  /** petals turning as they fall */
  PETALS: (x) => {
    const { c, w, h, R, vt, amt, slot, CMix, L } = x;
    const S = (L.scratch.lyPetal ??= [] as { x: number; y: number; sp: number; ph: number; sz: number }[]) as { x: number; y: number; sp: number; ph: number; sz: number }[];
    const want = Math.round((16 + slot * 12) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.0016 + Math.random() * 0.003, ph: Math.random() * TAU, sz: 0.6 + Math.random() * 0.9 });
    if (S.length > want) S.length = want;
    for (const p of S) {
      p.y += p.sp * (1 + amt);
      if (p.y > 1.08) { p.y = -0.08; p.x = Math.random(); }
      const sway = Math.sin(vt * 0.014 + p.ph) ;
      const px = (p.x + sway * 0.05) * w;
      const py = p.y * h;
      const sz = R * 0.016 * p.sz * (0.6 + amt);
      c.save();
      c.translate(px, py);
      c.rotate(sway * 1.2 + p.ph);
      c.fillStyle = CMix((p.ph % TAU) / TAU, amt * 0.5, 72);
      c.beginPath();
      // squashed by the sway, so each petal reads as turning edge-on and back
      c.ellipse(0, 0, sz * (0.35 + Math.abs(sway) * 0.65), sz, 0, 0, TAU);
      c.fill();
      c.restore();
    }
  },

  /** slow curtains of light drifting across */
  VEIL: (x) => {
    const { c, w, h, vt, amt, slot, midV, C1, C2 } = x;
    const n = 2 + slot;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const cxx = (0.5 + Math.sin(vt * 0.0026 + i * 2.1) * 0.36) * w;
      const wd = w * (0.1 + f * 0.08) * (1 + midV * 0.4);
      const g = c.createLinearGradient(cxx - wd, 0, cxx + wd, 0);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.5, (i % 2 ? C2 : C1)(amt * 0.14, 66));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      // sheared, so the curtain hangs rather than standing as a bar
      c.save();
      c.transform(1, 0, Math.sin(vt * 0.004 + i) * 0.22, 1, 0, 0);
      c.fillRect(cxx - wd, -h * 0.2, wd * 2, h * 1.4);
      c.restore();
    }
  },

  /** spiral arms winding out from the centre */
  SPIRALARM: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, CMix, TK } = x;
    const arms = 2 + slot;
    c.lineWidth = (1 + amt * 2) * TK;
    for (let a = 0; a < arms; a++) {
      const base = (a / arms) * TAU + vt * 0.0022;
      c.strokeStyle = CMix(a / arms, amt * 0.35, 68);
      c.beginPath();
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const ang = base + t * 2.6;
        const rr = R * t * 0.85 * (1 + beatE * 0.03);
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr * 0.62;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
  },

  /** glyphs surfacing and fading */
  GLYPHS: (x) => {
    const { c, w, h, amt, slot, vt, CMix, L } = x;
    const S = (L.scratch.lyGlyph ??= [] as { x: number; y: number; ch: number; t: number }[]) as { x: number; y: number; ch: number; t: number }[];
    const want = Math.round((6 + slot * 4) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), ch: Math.floor(Math.random() * 26), t: Math.random() });
    if (S.length > want) S.length = want;
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const p of S) {
      p.t += 0.005;
      if (p.t > 1) { p.t = 0; p.x = Math.random(); p.y = Math.random(); p.ch = Math.floor(Math.random() * 26); }
      // fades in and out again over its life, so nothing pops
      const a = Math.sin(p.t * Math.PI) * amt * 0.55;
      const sz = Math.min(w, h) * 0.05 * (0.7 + p.t * 0.5);
      c.font = `700 ${sz.toFixed(0)}px 'JetBrains Mono', monospace`;
      c.fillStyle = CMix(p.t, a, 74);
      c.fillText(String.fromCharCode(65 + p.ch), p.x * w, p.y * h);
    }
    c.restore();
    void vt;
  },

  /** hard vertical bars of light */
  STROBEBAR: (x) => {
    const { c, w, h, amt, slot, beatE, freq, C1, CMix } = x;
    const n = 6 + slot * 3;
    const bins = freq.length;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const bin = Math.min(bins - 1, 3 + Math.floor(f * 40));
      const v = ((freq[bin] ?? 0) / 255) ** 1.5;
      if (v < 0.12) continue;
      const px = f * w;
      const wd = w * 0.006 * (1 + v * 2 + beatE);
      const g = c.createLinearGradient(px - wd, 0, px + wd, 0);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.5, C1(amt * v * 0.6, 78));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(px - wd, 0, wd * 2, h);
      c.fillStyle = CMix(f, amt * v * 0.2, 62);
      c.fillRect(px - wd * 3, h * (0.5 - v * 0.5), wd * 6, h * v);
    }
  },

  /** bursts of confetti thrown on the beat */
  CONFETTI: (x) => {
    const { c, w, h, R, amt, slot, beat, CMix, L } = x;
    const S = (L.scratch.lyConf ??= [] as { x: number; y: number; vx: number; vy: number; rot: number; a: number; hue: number }[]) as { x: number; y: number; vx: number; vy: number; rot: number; a: number; hue: number }[];
    if (beat && S.length < 40 + slot * 20) {
      const bx = 0.2 + Math.random() * 0.6, by = 0.25 + Math.random() * 0.4;
      for (let i = 0; i < 10 + slot * 3; i++) {
        const ang = Math.random() * TAU;
        const sp = 0.004 + Math.random() * 0.012;
        S.push({ x: bx, y: by, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: Math.random() * TAU, a: 1, hue: Math.random() });
      }
    }
    for (let i = S.length - 1; i >= 0; i--) {
      const p = S[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.0004;          // gravity, so it falls rather than floating away
      p.vx *= 0.985; p.vy *= 0.985;
      p.rot += 0.09;
      p.a -= 0.012;
      if (p.a <= 0) { S.splice(i, 1); continue; }
      const sz = R * 0.011 * (0.5 + amt);
      c.save();
      c.translate(p.x * w, p.y * h);
      c.rotate(p.rot);
      c.fillStyle = CMix(p.hue, p.a * amt * 0.85, 72);
      c.fillRect(-sz, -sz * 0.4, sz * 2, sz * 0.8);
      c.restore();
    }
  },

  /** a jagged rift of light torn across the frame */
  RIFT: (x) => {
    const { c, w, h, R, amt, slot, vt, beatE, C1, CMix, TK } = x;
    const n = 1 + Math.floor(slot / 2);
    for (let k = 0; k < n; k++) {
      const seed = k * 31.7;
      const ang = hash01(seed) * TAU + vt * 0.0008;
      const len = R * (1.1 + hash01(seed + 3) * 0.5);
      const mx = w * 0.5, my = h * 0.5;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      c.strokeStyle = C1(amt * (0.35 + beatE * 0.4), 82);
      c.lineWidth = (0.9 + amt * 1.8) * TK;
      c.beginPath();
      for (let i = 0; i <= 14; i++) {
        const t = i / 14 - 0.5;
        const jag = (hash01(seed + i * 7.3) - 0.5) * R * 0.09;
        const px = mx + dx * len * t - dy * jag;
        const py = my + dy * len * t + dx * jag;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
      // a soft bleed along the tear
      const g = c.createLinearGradient(mx - dy * R * 0.1, my + dx * R * 0.1, mx + dy * R * 0.1, my - dx * R * 0.1);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.5, CMix(0.5, amt * 0.12, 66));
      g.addColorStop(1, "transparent");
      c.strokeStyle = g;
      c.lineWidth = R * 0.06;
      c.stroke();
    }
  },
};

export const LAYER_NAMES = Object.keys(LAYERS);

// ── which layers suit which theme ────────────────────────────────────────
// Curated rather than generated: the point is that a layer looks like it
// belongs to the theme underneath. Themes not listed fall back to a set chosen
// from their family, so every one of the 80 gets something fitting.

const FALLBACK = ["PULSE", "DUST", "ORBITS", "SHAFTS", "WEB", "HALO", "SHARDS"];

export const THEME_LAYERS: Record<string, string[]> = {
  // radial / geometric
  RING: ["PULSE", "ECHOES", "ORBITS", "HALO", "SHAFTS", "SHARDS", "FRAME"],
  KALEIDO: ["SHARDS", "ECHOES", "ORBITS", "PETALS", "SPIRALARM", "HALO", "LATTICE"],
  HELIX: ["SPIRALARM", "ORBITS", "DUST", "BEAM", "WEB", "ECHOES", "HALO"],
  SPIRAL: ["SPIRALARM", "PULSE", "SHARDS", "ORBITS", "HALO", "DUST", "ECHOES"],
  ORB: ["HALO", "PULSE", "ORBITS", "EMBERS", "VEIL", "SHAFTS", "TIDEWASH"],
  RIPPLES: ["PULSE", "CAUSTICS", "TIDEWASH", "HORIZON", "ECHOES", "DUST", "WEB"],
  VORTEX: ["SPIRALARM", "SHARDS", "ORBITS", "DUST", "SHAFTS", "HALO", "RIFT"],
  TUNNEL: ["SCANS", "RIFT", "FRAME", "LATTICE", "BEAM", "PULSE", "ECHOES"],
  HALO: ["HALO", "SHAFTS", "ORBITS", "PULSE", "VEIL", "DUST", "TIDEWASH"],
  NOVA: ["SHAFTS", "PULSE", "EMBERS", "HALO", "SHARDS", "SPARKS", "ORBITS"],
  ECLIPSE: ["HALO", "SHAFTS", "ORBITS", "TIDEWASH", "DUST", "VEIL", "PULSE"],
  GRAVITY: ["ORBITS", "SPIRALARM", "DUST", "HALO", "WEB", "SHARDS", "PULSE"],

  // atmospheric / organic
  AURORA: ["VEIL", "TIDEWASH", "DUST", "HORIZON", "WEB", "EMBERS", "CAUSTICS"],
  NEBULA: ["DUST", "TIDEWASH", "PLUMES", "WEB", "HALO", "EMBERS", "VEIL"],
  GALAXY: ["SPIRALARM", "DUST", "ORBITS", "WEB", "HALO", "SHAFTS", "TIDEWASH"],
  TIDE: ["HORIZON", "CAUSTICS", "TIDEWASH", "DUST", "PULSE", "VEIL", "WEB"],
  SILK: ["VEIL", "TIDEWASH", "DUST", "CAUSTICS", "HALO", "PETALS", "ECHOES"],
  LIQUID: ["CAUSTICS", "TIDEWASH", "PULSE", "PLUMES", "HORIZON", "HALO", "DUST"],
  BLOOM: ["PETALS", "HALO", "EMBERS", "PULSE", "TIDEWASH", "DUST", "VEIL"],
  FIREFLIES: ["EMBERS", "WEB", "DUST", "FLOCK", "HALO", "PETALS", "TIDEWASH"],
  LANTERNS: ["EMBERS", "DUST", "HALO", "PETALS", "HORIZON", "VEIL", "WEB"],
  JELLY: ["TIDEWASH", "CAUSTICS", "HALO", "PULSE", "VEIL", "DUST", "EMBERS"],
  BIOLUME: ["EMBERS", "WEB", "CAUSTICS", "DUST", "TIDEWASH", "HALO", "PULSE"],
  INKFLOW: ["PLUMES", "TIDEWASH", "VEIL", "DUST", "ECHOES", "HORIZON", "CAUSTICS"],
  AURORAFALL: ["RAINFALL", "VEIL", "TIDEWASH", "HORIZON", "DUST", "WEB", "CAUSTICS"],
  LAVALAMP: ["PLUMES", "TIDEWASH", "HALO", "PULSE", "DUST", "VEIL", "EMBERS"],
  MURMUR: ["FLOCK", "DUST", "WEB", "VEIL", "HORIZON", "EMBERS", "TIDEWASH"],
  SERPENT: ["FLOCK", "SPIRALARM", "DUST", "VEIL", "ECHOES", "HALO", "CAUSTICS"],
  KOI: ["CAUSTICS", "FLOCK", "PETALS", "TIDEWASH", "DUST", "VEIL", "HALO"],
  SANDSTORM: ["PLUMES", "DUST", "VEIL", "HORIZON", "RAINFALL", "TIDEWASH", "EMBERS"],
  BLOOMRAIL: ["PETALS", "RAINFALL", "BEAM", "EMBERS", "HALO", "DUST", "VEIL"],
  WAVES: ["CAUSTICS", "HORIZON", "SCANS", "DUST", "VEIL", "RAINFALL", "BEAM"],

  // tech / graphic
  GRID: ["LATTICE", "SCANS", "FRAME", "BEAM", "WEB", "PULSE", "GLYPHS"],
  DOTGRID: ["LATTICE", "WEB", "PULSE", "SCANS", "DUST", "FRAME", "SPARKS"],
  TERMINAL: ["GLYPHS", "SCANS", "LATTICE", "FRAME", "WEB", "BEAM", "STROBEBAR"],
  GLITCH: ["RIFT", "SCANS", "GLYPHS", "SHARDS", "FRAME", "STROBEBAR", "LATTICE"],
  PIXEL: ["LATTICE", "SCANS", "CONFETTI", "FRAME", "WEB", "GLYPHS", "PULSE"],
  CIRCUITRY: ["WEB", "SPARKS", "LATTICE", "SCANS", "BEAM", "GLYPHS", "FRAME"],
  VHS: ["SCANS", "GLYPHS", "FRAME", "RIFT", "STROBEBAR", "ECHOES", "DUST"],
  MECHANISM: ["ORBITS", "LATTICE", "FRAME", "SHARDS", "SPARKS", "WEB", "SCANS"],
  QUANTUM: ["WEB", "SPARKS", "ORBITS", "DUST", "PULSE", "SHAFTS", "RIFT"],
  TOPOGRAPH: ["LATTICE", "HORIZON", "CAUSTICS", "SCANS", "WEB", "DUST", "FRAME"],
  SCOPE: ["SCANS", "LATTICE", "GLYPHS", "FRAME", "PULSE", "WEB", "STROBEBAR"],
  CASSETTE: ["SCANS", "ORBITS", "FRAME", "GLYPHS", "LATTICE", "DUST", "BEAM"],
  VINYL: ["ORBITS", "DUST", "HALO", "SCANS", "ECHOES", "PULSE", "VEIL"],
  BRUTAL: ["PILLARS", "FRAME", "STROBEBAR", "RIFT", "SCANS", "BEAM", "LATTICE"],
  BARS: ["STROBEBAR", "PILLARS", "SCANS", "FRAME", "LATTICE", "BEAM", "CONFETTI"],
  LASERS: ["STROBEBAR", "SPARKS", "BEAM", "SCANS", "FRAME", "RIFT", "SHAFTS"],
  MAGNETIC: ["SPARKS", "WEB", "ORBITS", "RIFT", "SHARDS", "PULSE", "LATTICE"],
  REACTOR: ["SPARKS", "PULSE", "ORBITS", "HALO", "RIFT", "BEAM", "SHARDS"],

  // scenic / narrative
  CITY: ["PILLARS", "HORIZON", "RAINFALL", "SCANS", "BEAM", "LATTICE", "GLYPHS"],
  STARFIELD: ["DUST", "WEB", "SHAFTS", "HALO", "ORBITS", "EMBERS", "SPIRALARM"],
  CONSTELLATION: ["WEB", "DUST", "ORBITS", "HALO", "SHAFTS", "PULSE", "GLYPHS"],
  COMETS: ["DUST", "SHAFTS", "ORBITS", "EMBERS", "WEB", "HALO", "RIFT"],
  CATHEDRAL: ["PILLARS", "SHAFTS", "HALO", "DUST", "GLYPHS", "FRAME", "EMBERS"],
  WORMHOLE: ["SCANS", "SPIRALARM", "RIFT", "BEAM", "ORBITS", "PULSE", "ECHOES"],
  THUNDER: ["SPARKS", "RAINFALL", "RIFT", "BEAM", "HORIZON", "SCANS", "PLUMES"],
  FIREWORKS: ["CONFETTI", "SPARKS", "EMBERS", "PULSE", "HALO", "DUST", "SHARDS"],
  CRYSTAL: ["SHARDS", "RIFT", "FRAME", "ECHOES", "HALO", "LATTICE", "SPARKS"],
  SHATTER: ["RIFT", "SHARDS", "FRAME", "ECHOES", "SPARKS", "LATTICE", "CONFETTI"],
  PRISM: ["RIFT", "SHAFTS", "SHARDS", "HALO", "SPARKS", "ECHOES", "DUST"],
  ORIGAMI: ["PETALS", "SHARDS", "FRAME", "LATTICE", "ECHOES", "DUST", "VEIL"],
  GRAFFITI: ["CONFETTI", "GLYPHS", "RIFT", "STROBEBAR", "FRAME", "SHARDS", "SCANS"],
  SAMURAI: ["RIFT", "PETALS", "GLYPHS", "VEIL", "SHARDS", "HORIZON", "DUST"],
  ORACLE: ["GLYPHS", "HALO", "VEIL", "ORBITS", "DUST", "SHAFTS", "ECHOES"],

  // type-led
  MARQUEE: ["GLYPHS", "STROBEBAR", "FRAME", "SCANS", "CONFETTI", "BEAM", "LATTICE"],
  NEONSIGN: ["STROBEBAR", "GLYPHS", "FRAME", "SPARKS", "SCANS", "BEAM", "HALO"],
  CLOCK: ["ORBITS", "GLYPHS", "PULSE", "FRAME", "ECHOES", "DUST", "HALO"],

  // staged + natively 3D — these already stage themselves, so their sets sit
  // around that structure rather than competing with it
  ASCENSION: ["SHAFTS", "DUST", "HALO", "PILLARS", "ORBITS", "EMBERS", "VEIL"],
  LEVIATHAN: ["CAUSTICS", "TIDEWASH", "PLUMES", "HORIZON", "RAINFALL", "DUST", "VEIL"],
  CATHODE: ["SCANS", "GLYPHS", "LATTICE", "FRAME", "STROBEBAR", "SPARKS", "RIFT"],
  CITADEL: ["PILLARS", "HORIZON", "BEAM", "LATTICE", "SHAFTS", "DUST", "FRAME"],
  SYNAPSE: ["WEB", "SPARKS", "EMBERS", "PULSE", "DUST", "ORBITS", "HALO"],
  VOXEL: ["LATTICE", "PILLARS", "HORIZON", "SCANS", "BEAM", "WEB", "FRAME"],
  TESSERACT: ["WEB", "ORBITS", "LATTICE", "SHARDS", "RIFT", "HALO", "SHAFTS"],
  MONOLITH: ["PILLARS", "HORIZON", "BEAM", "SHAFTS", "DUST", "LATTICE", "HALO"],
  ORRERY: ["ORBITS", "WEB", "DUST", "HALO", "SHAFTS", "PULSE", "SPIRALARM"],
  CANYON: ["HORIZON", "PILLARS", "SCANS", "DUST", "RAINFALL", "BEAM", "LATTICE"],
  GYROSCOPE: ["ORBITS", "SPIRALARM", "SHARDS", "WEB", "HALO", "PULSE", "LATTICE"],
  SINGULARITY: ["SPIRALARM", "ORBITS", "SHAFTS", "HALO", "RIFT", "DUST", "TIDEWASH"],

  // escalation themes — their own structure already grows a tier per drop
  STRATA: ["HORIZON", "DUST", "SCANS", "RAINFALL", "LATTICE", "BEAM", "HALO"],
  CROWN: ["ORBITS", "SHAFTS", "HALO", "PULSE", "EMBERS", "SHARDS", "FRAME"],
  CASCADE: ["RAINFALL", "CAUSTICS", "TIDEWASH", "PLUMES", "DUST", "EMBERS", "HALO"],
  FISSION: ["ORBITS", "SPARKS", "WEB", "SHARDS", "HALO", "PULSE", "RIFT"],
  PARALLAX: ["DUST", "HORIZON", "SCANS", "BEAM", "WEB", "HALO", "VEIL"],
};

/** The layer list for a theme, falling back to a sensible general set. */
export function layersFor(theme: string): string[] {
  return THEME_LAYERS[theme] ?? FALLBACK;
}

/** Every theme's list is this long, so it doubles as the escalation ceiling. */
export const MAX_SLOTS = FALLBACK.length;

/**
 * Advances the layer state. Call once per frame, before drawing.
 *
 * Two things happen here. A drop unlocks the next slot — permanently, that is
 * the whole point. And every unlocked slot follows the track's energy, with
 * later slots needing more lift than earlier ones, so a calm section peels the
 * newest layers off first and the next lift brings them back in the order they
 * were earned. Nothing is ever removed, only thinned.
 */
export function stepDropLayers(L: LiveState, beatStep: number, maxSlots: number): void {
  if (L.dropNew) L.dropSlots = Math.min(maxSlots, L.dropIdx);
  // lowering the ESCALATION slider should take effect straight away rather
  // than at the next drop
  L.dropSlots = Math.min(L.dropSlots, maxSlots);

  const n = L.dropSlots;
  while (L.dropAmts.length < n) L.dropAmts.push(0);
  if (L.dropAmts.length > n) L.dropAmts.length = n;

  const lift = Math.min(1, Math.max(0, (L.energy - 0.16) / 0.62));
  // follow over roughly a beat, so layers breathe with the arrangement instead
  // of flickering with the meter
  const k = 1 - Math.exp(-beatStep * 0.8);
  for (let i = 0; i < n; i++) {
    // How much lift a layer needs before it is fully present. This used to
    // scale to 0.55, which held the newest layers down so hard on an average
    // passage that unlocking one changed almost nothing visible — the whole
    // feature read as "nothing happened". They still thin out in a calm
    // section, just not to the point of invisibility.
    const need = (i / (n + 1)) * 0.3;
    const want = Math.min(1, Math.max(0, (lift - need) / Math.max(0.3, 1 - need)));
    const target = 0.4 + want * 0.6;
    L.dropAmts[i] += (target - L.dropAmts[i]) * k;
  }

  // Arrival. A layer that simply exists from one frame to the next is not felt,
  // and the whole point is that a drop *lands*. This swells the newest layer
  // over about two beats and settles — a bloom rather than the flash the old
  // ladder fired, so it reads as the piece gaining something rather than as the
  // picture being hit.
  L.dropBloom = L.dropNew && n > 0 ? 1 : L.dropBloom * Math.exp(-beatStep * 0.55);
  if (n > 0 && L.dropBloom > 0.004) L.dropAmts[n - 1] = Math.min(1.15, L.dropAmts[n - 1] + L.dropBloom * 0.55);
}

/**
 * Draws every unlocked layer over the theme, in the theme's own coordinate
 * space (so in 3D they are part of the scene and get projected with it).
 */
export function drawDropLayers(x: ThemeCtx, amt: number): void {
  const { L, c } = x;
  const names = layersFor(L.visTheme);
  const n = Math.min(L.dropSlots, L.dropAmts.length, names.length);
  if (n < 1) return;

  // These stack additively on an already-lit frame, so the deeper the stack the
  // smaller each share has to be or the picture clips to white. Falls off
  // slowly enough that more layers still reads as more.
  const share = 0.6 + 0.4 / Math.sqrt(n);

  c.save();
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const a = L.dropAmts[i] * amt * share;
    if (a < 0.02) continue;
    const draw = LAYERS[names[i]];
    if (!draw) continue;
    c.save();
    draw({ ...x, amt: a, slot: i });
    c.restore();
  }
  c.restore();
}
