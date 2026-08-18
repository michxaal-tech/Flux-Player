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

/**
 * Cached soft-light sprite.
 *
 * A luminous mote is a radial gradient, and building one per particle per frame
 * is what turned an earlier theme into a 170ms slideshow. These are rasterised
 * once per colour and blitted, which is what makes it affordable to draw a few
 * hundred glowing points instead of a few hundred flat dots — and flat dots are
 * most of the difference between "ornament" and "light".
 */
const spriteCache = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string): HTMLCanvasElement {
  const hit = spriteCache.get(color);
  if (hit) return hit;
  const R = 32;
  const cv = document.createElement("canvas");
  cv.width = cv.height = R * 2;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(0, 0, R * 2, R * 2);
  // bounded, so a drifting palette cannot grow this without limit
  if (spriteCache.size > 24) spriteCache.clear();
  spriteCache.set(color, cv);
  return cv;
}

/** blit a soft light at (x, y) with radius r */
function light(c: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, a: number): void {
  if (a <= 0.004 || r <= 0.2) return;
  const sp = glowSprite(color);
  c.globalAlpha = a > 1 ? 1 : a;
  c.drawImage(sp, x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

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
};

export const LAYER_NAMES = Object.keys(LAYERS);

// ── which layers suit which theme ────────────────────────────────────────
// Curated rather than generated: the point is that a layer looks like it
// belongs to the theme underneath. Themes not listed fall back to a set chosen
// from their family, so every one of the 80 gets something fitting.

const FALLBACK = ["PULSE", "DUST", "ORBITS", "SHAFTS", "WEB", "HALO", "SHARDS"];

export const THEME_LAYERS: Record<string, string[]> = {
  // radial / geometric
  RING: ["PULSE", "ORBITS", "SHAFTS", "ECHOES", "HALO", "SHARDS", "FRAME"],
  KALEIDO: ["ORBITS", "SHARDS", "WEB", "SHAFTS", "ECHOES", "HALO", "LATTICE"],
  HELIX: ["ORBITS", "DUST", "BEAM", "ECHOES", "SHAFTS", "WEB", "HALO"],
  SPIRAL: ["ORBITS", "PULSE", "SHARDS", "SHAFTS", "HALO", "DUST", "ECHOES"],
  ORB: ["HALO", "PULSE", "ORBITS", "EMBERS", "SHAFTS", "SHARDS", "TIDEWASH"],
  RIPPLES: ["PULSE", "TIDEWASH", "DUST", "HORIZON", "ECHOES", "WEB", "HALO"],
  VORTEX: ["ORBITS", "SHARDS", "SHAFTS", "DUST", "ECHOES", "HALO", "PULSE"],
  TUNNEL: ["SCANS", "FRAME", "LATTICE", "BEAM", "SHAFTS", "PULSE", "ECHOES"],
  HALO: ["HALO", "SHAFTS", "PULSE", "ORBITS", "DUST", "TIDEWASH", "ECHOES"],
  NOVA: ["SHAFTS", "PULSE", "EMBERS", "HALO", "SHARDS", "ORBITS", "TIDEWASH"],
  ECLIPSE: ["HALO", "SHAFTS", "ORBITS", "TIDEWASH", "DUST", "PULSE", "ECHOES"],

  // atmospheric / organic
  AURORA: ["TIDEWASH", "DUST", "HORIZON", "WEB", "EMBERS", "HALO", "SCANS"],
  NEBULA: ["DUST", "TIDEWASH", "WEB", "HALO", "EMBERS", "ORBITS", "SHAFTS"],
  GALAXY: ["ORBITS", "DUST", "WEB", "HALO", "SHAFTS", "TIDEWASH", "SHARDS"],
  TIDE: ["HORIZON", "TIDEWASH", "DUST", "PULSE", "WEB", "HALO", "EMBERS"],
  SILK: ["TIDEWASH", "DUST", "HORIZON", "HALO", "WEB", "ORBITS", "ECHOES"],
  LIQUID: ["TIDEWASH", "PULSE", "DUST", "HORIZON", "HALO", "ECHOES", "WEB"],
  BLOOM: ["HALO", "EMBERS", "PULSE", "TIDEWASH", "DUST", "ORBITS", "SHAFTS"],
  FIREFLIES: ["EMBERS", "WEB", "DUST", "HALO", "TIDEWASH", "PULSE", "ORBITS"],
  LANTERNS: ["EMBERS", "DUST", "HALO", "HORIZON", "WEB", "TIDEWASH", "PULSE"],
  JELLY: ["TIDEWASH", "DUST", "HALO", "PULSE", "EMBERS", "WEB", "ECHOES"],
  BIOLUME: ["EMBERS", "WEB", "DUST", "TIDEWASH", "HALO", "PULSE", "ORBITS"],
  INKFLOW: ["TIDEWASH", "DUST", "ECHOES", "HORIZON", "WEB", "HALO", "PULSE"],
  AURORAFALL: ["RAINFALL", "TIDEWASH", "HORIZON", "DUST", "WEB", "HALO", "EMBERS"],
  LAVALAMP: ["TIDEWASH", "HALO", "DUST", "PULSE", "EMBERS", "ECHOES", "ORBITS"],

  // tech / graphic
  GRID: ["LATTICE", "SCANS", "FRAME", "BEAM", "WEB", "PULSE", "SHAFTS"],
  DOTGRID: ["LATTICE", "WEB", "SCANS", "PULSE", "FRAME", "DUST", "SHAFTS"],
  TERMINAL: ["SCANS", "LATTICE", "FRAME", "WEB", "BEAM", "PULSE", "DUST"],
  GLITCH: ["SCANS", "FRAME", "LATTICE", "SHARDS", "BEAM", "WEB", "ECHOES"],
  PIXEL: ["LATTICE", "SCANS", "FRAME", "WEB", "SHARDS", "PULSE", "BEAM"],
  CIRCUITRY: ["WEB", "LATTICE", "SCANS", "BEAM", "FRAME", "PULSE", "SHARDS"],
  VHS: ["SCANS", "FRAME", "LATTICE", "BEAM", "ECHOES", "DUST", "WEB"],
  MECHANISM: ["ORBITS", "LATTICE", "FRAME", "SHARDS", "WEB", "SCANS", "BEAM"],
  QUANTUM: ["WEB", "ORBITS", "DUST", "PULSE", "SHAFTS", "HALO", "SHARDS"],
  TOPOGRAPH: ["LATTICE", "HORIZON", "SCANS", "WEB", "DUST", "TIDEWASH", "FRAME"],

  // scenic
  CITY: ["HORIZON", "BEAM", "SCANS", "RAINFALL", "LATTICE", "DUST", "FRAME"],
  STARFIELD: ["DUST", "WEB", "SHAFTS", "HALO", "ORBITS", "EMBERS", "TIDEWASH"],
  CONSTELLATION: ["WEB", "DUST", "ORBITS", "HALO", "SHAFTS", "PULSE", "EMBERS"],
  COMETS: ["DUST", "SHAFTS", "ORBITS", "EMBERS", "HALO", "WEB", "PULSE"],
  CATHEDRAL: ["SHAFTS", "BEAM", "HALO", "DUST", "FRAME", "HORIZON", "EMBERS"],
  WORMHOLE: ["SCANS", "ORBITS", "SHAFTS", "BEAM", "PULSE", "ECHOES", "HALO"],
  THUNDER: ["RAINFALL", "BEAM", "SHAFTS", "HORIZON", "SCANS", "PULSE", "DUST"],

  // staged + 3D — these already stage themselves, so their layers stay subtle
  ASCENSION: ["DUST", "SHAFTS", "HALO", "ORBITS", "WEB", "EMBERS", "TIDEWASH"],
  LEVIATHAN: ["TIDEWASH", "HORIZON", "DUST", "RAINFALL", "HALO", "WEB", "PULSE"],
  CATHODE: ["SCANS", "LATTICE", "FRAME", "BEAM", "WEB", "SHARDS", "DUST"],
  CITADEL: ["HORIZON", "BEAM", "LATTICE", "SHAFTS", "DUST", "FRAME", "SCANS"],
  SYNAPSE: ["WEB", "DUST", "PULSE", "EMBERS", "ORBITS", "HALO", "SHAFTS"],
  MONOLITH: ["HORIZON", "BEAM", "SHAFTS", "DUST", "LATTICE", "HALO", "ORBITS"],
  ORRERY: ["ORBITS", "WEB", "DUST", "HALO", "SHAFTS", "PULSE", "SHARDS"],
  CANYON: ["HORIZON", "SCANS", "LATTICE", "DUST", "BEAM", "RAINFALL", "SHAFTS"],
  GYROSCOPE: ["ORBITS", "WEB", "SHARDS", "HALO", "PULSE", "SHAFTS", "LATTICE"],
  SINGULARITY: ["ORBITS", "SHAFTS", "HALO", "DUST", "PULSE", "TIDEWASH", "WEB"],
  VOXEL: ["LATTICE", "HORIZON", "SCANS", "BEAM", "WEB", "DUST", "FRAME"],
  TESSERACT: ["WEB", "ORBITS", "LATTICE", "SHARDS", "HALO", "SHAFTS", "PULSE"],

  // escalation themes — their own structure already grows a tier per drop, so
  // these sets are chosen to sit around that rather than compete with it
  STRATA: ["HORIZON", "DUST", "SCANS", "RAINFALL", "LATTICE", "BEAM", "HALO"],
  CROWN: ["ORBITS", "SHAFTS", "HALO", "PULSE", "EMBERS", "SHARDS", "FRAME"],
  CASCADE: ["RAINFALL", "TIDEWASH", "HORIZON", "DUST", "EMBERS", "HALO", "WEB"],
  FISSION: ["ORBITS", "WEB", "SHARDS", "HALO", "PULSE", "SHAFTS", "DUST"],
  PARALLAX: ["DUST", "HORIZON", "SCANS", "BEAM", "WEB", "HALO", "EMBERS"],
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
