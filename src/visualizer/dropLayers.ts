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

// ── the layer library ────────────────────────────────────────────────────
// Each is a self-contained ornament that composes with any theme underneath.
// They never clear or wash the frame — that is what made the old set feel like
// a filter rather than an addition.

export const LAYERS: Record<string, LayerDraw> = {
  /** slow orbital rings around the composition */
  ORBITS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, TK, CMix } = x;
    const n = 2 + slot;
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n - 1);
      const rr = R * (0.3 + f * 0.32) * (1 + beatE * 0.03);
      const a = vt * 0.004 * (i % 2 ? 1 : -1) + i;
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.scale(1, 0.42);
      c.strokeStyle = CMix(f, amt * 0.4, 62);
      c.lineWidth = (0.8 + amt * 1.4) * TK;
      c.beginPath();
      c.arc(0, 0, rr, 0, TAU);
      c.stroke();
      c.restore();
    }
  },

  /** motes rising through the frame */
  EMBERS: (x) => {
    const { c, w, h, vt, amt, slot, trebV, C1, L } = x;
    const S = (L.scratch.lyEmber ??= [] as { x: number; y: number; sp: number; ph: number }[]) as { x: number; y: number; sp: number; ph: number }[];
    const want = Math.round((28 + slot * 22) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.0008 + Math.random() * 0.002, ph: Math.random() * TAU });
    if (S.length > want) S.length = want;
    c.fillStyle = C1(0.35 * amt + trebV * 0.2, 70);
    for (const p of S) {
      p.y -= p.sp * (1 + amt);
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      const px = (p.x + Math.sin(vt * 0.01 + p.ph) * 0.01) * w;
      c.beginPath();
      c.arc(px, p.y * h, 1 + amt * 1.6, 0, TAU);
      c.fill();
    }
  },

  /** a lattice that breathes behind the theme */
  LATTICE: (x) => {
    const { c, w, h, vt, amt, slot, bassV, C2, TK } = x;
    const step = Math.max(28, Math.min(w, h) / (7 + slot * 2));
    const wob = Math.sin(vt * 0.01) * 5 * amt;
    c.strokeStyle = C2(amt * 0.14 + bassV * 0.08, 52);
    c.lineWidth = 0.7 * TK;
    c.beginPath();
    for (let gx = 0; gx <= w + step; gx += step) {
      c.moveTo(gx + wob, 0);
      c.lineTo(gx - wob, h);
    }
    for (let gy = 0; gy <= h + step; gy += step) {
      c.moveTo(0, gy - wob);
      c.lineTo(w, gy + wob);
    }
    c.stroke();
  },

  /** light shafts fanning from the centre */
  SHAFTS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, C1, C2 } = x;
    const n = 5 + slot * 3;
    const rad = R * 1.3;
    c.save();
    c.translate(cx, cy);
    c.rotate(vt * 0.0016);
    // The wedges all meet at the origin, so a gradient that is brightest there
    // sums n times over on one spot and clips. Peak it out at a third of the
    // radius instead, where the wedges have separated.
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.3, C1(amt * 0.16 * (1 + beatE * 0.4), 68));
    g.addColorStop(0.6, C2(amt * 0.07, 56));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const wd = 0.03 + 0.05 * hash01(i);
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - wd) * rad, Math.sin(a - wd) * rad);
      c.lineTo(Math.cos(a + wd) * rad, Math.sin(a + wd) * rad);
      c.closePath();
    }
    c.fill();
    c.restore();
  },

  /** slow expanding rings, one per beat, never a hard flash */
  PULSE: (x) => {
    const { c, cx, cy, R, amt, slot, beat, TK, CMix, L } = x;
    const S = (L.scratch.lyPulse ??= [] as number[]) as number[];
    if (beat && S.length < 4 + slot) S.push(0);
    for (let i = S.length - 1; i >= 0; i--) {
      S[i] += 0.012 * (1 + amt);
      if (S[i] > 1) { S.splice(i, 1); continue; }
      const a = (1 - S[i]) ** 2 * amt;
      c.strokeStyle = CMix(S[i], a * 0.5, 68);
      c.lineWidth = (1 + a * 3) * TK;
      c.beginPath();
      c.arc(cx, cy, S[i] * R * 0.9, 0, TAU);
      c.stroke();
    }
  },

  /** drifting dust that thickens with each unlock */
  DUST: (x) => {
    const { c, w, h, vt, amt, slot, C2, L } = x;
    const S = (L.scratch.lyDust ??= [] as { x: number; y: number; ph: number; sz: number }[]) as { x: number; y: number; ph: number; sz: number }[];
    const want = Math.round((40 + slot * 30) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU, sz: 0.5 + Math.random() * 1.6 });
    if (S.length > want) S.length = want;
    c.fillStyle = C2(0.26 * amt, 66);
    for (const p of S) {
      const px = (p.x + Math.sin(vt * 0.006 + p.ph) * 0.03) * w;
      const py = (p.y + Math.cos(vt * 0.005 + p.ph * 1.7) * 0.03) * h;
      c.beginPath();
      c.arc(px, py, p.sz * (0.6 + amt), 0, TAU);
      c.fill();
    }
  },

  /** a horizon band the composition sits on */
  HORIZON: (x) => {
    const { c, w, h, cy, amt, bassV, dropE, C1 } = x;
    const band = h * (0.02 + bassV * 0.03 + dropE * 0.03) * (0.4 + amt);
    const g = c.createLinearGradient(0, cy - band, 0, cy + band);
    g.addColorStop(0, "transparent");
    // a full-width band lands on whatever the theme put across the middle, so
    // it has to stay well under the others' alpha or it clips the horizon out
    g.addColorStop(0.5, C1(amt * 0.2, 60));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, cy - band, w, band * 2);
  },

  /** mirrored ghost of the composition, offset outward */
  ECHOES: (x) => {
    const { c, cx, cy, amt, slot, R, beatE, CMix, TK } = x;
    const n = 1 + slot;
    for (let i = 1; i <= n; i++) {
      const rr = R * (0.2 + i * 0.14) * (1 + beatE * 0.05);
      c.strokeStyle = CMix(i / n, amt * 0.22, 60);
      c.lineWidth = (0.7 + amt) * TK;
      c.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * TAU;
        const wob = 1 + Math.sin(a * (3 + i) + x.vt * 0.02) * 0.06 * amt;
        const px = cx + Math.cos(a) * rr * wob;
        const py = cy + Math.sin(a) * rr * wob;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
    }
  },

  /** falling streaks, like rain lit from behind */
  RAINFALL: (x) => {
    const { c, w, h, amt, slot, C1, TK, L } = x;
    const S = (L.scratch.lyRain ??= [] as { x: number; y: number; sp: number; len: number }[]) as { x: number; y: number; sp: number; len: number }[];
    const want = Math.round((24 + slot * 20) * amt);
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), sp: 0.006 + Math.random() * 0.012, len: 0.03 + Math.random() * 0.06 });
    if (S.length > want) S.length = want;
    c.strokeStyle = C1(0.3 * amt, 70);
    c.lineWidth = 1 * TK;
    c.beginPath();
    for (const p of S) {
      p.y += p.sp * (1 + amt);
      if (p.y > 1.1) { p.y = -0.1; p.x = Math.random(); }
      c.moveTo(p.x * w, p.y * h);
      c.lineTo(p.x * w, (p.y - p.len) * h);
    }
    c.stroke();
  },

  /** a slow-turning halo that frames the whole piece */
  HALO: (x) => {
    const { c, cx, cy, R, amt, slot, beatE, C1, C2 } = x;
    const rr = R * (0.62 + slot * 0.06);
    const g = c.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr * (1.25 + beatE * 0.05));
    g.addColorStop(0, "transparent");
    g.addColorStop(0.6, C1(amt * 0.16, 62));
    g.addColorStop(1, C2(amt * 0.05, 50));
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, rr * 1.3, 0, TAU);
    c.fill();
  },

  /** constellation of points wired together */
  WEB: (x) => {
    const { c, w, h, vt, amt, slot, C2, TK, L } = x;
    const S = (L.scratch.lyWeb ??= [] as { x: number; y: number; ph: number }[]) as { x: number; y: number; ph: number }[];
    const want = Math.round((7 + slot * 5) * Math.max(0.3, amt));
    while (S.length < want) S.push({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU });
    if (S.length > want) S.length = want;
    const pts = S.map((p) => [
      (p.x + Math.sin(vt * 0.005 + p.ph) * 0.05) * w,
      (p.y + Math.cos(vt * 0.004 + p.ph * 1.3) * 0.05) * h,
    ]);
    c.strokeStyle = C2(amt * 0.2, 60);
    c.lineWidth = 0.7 * TK;
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
        if (dx * dx + dy * dy > (w * 0.22) ** 2) continue;
        c.moveTo(pts[i][0], pts[i][1]);
        c.lineTo(pts[j][0], pts[j][1]);
      }
    }
    c.stroke();
    c.fillStyle = C2(amt * 0.5, 72);
    for (const p of pts) {
      c.beginPath();
      c.arc(p[0], p[1], 1.6 + amt, 0, TAU);
      c.fill();
    }
  },

  /** scan bars sweeping slowly, a signal rather than a strobe */
  SCANS: (x) => {
    const { c, w, h, vt, amt, slot, C1 } = x;
    const n = 1 + slot;
    for (let i = 0; i < n; i++) {
      const y = (((vt * 0.0016 + i / n) % 1) + 1) % 1 * h;
      const band = h * 0.03;
      const g = c.createLinearGradient(0, y - band, 0, y + band);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.5, C1(amt * 0.2, 72));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(0, y - band, w, band * 2);
    }
  },

  /** corner brackets that frame the piece like a viewfinder */
  FRAME: (x) => {
    const { c, w, h, amt, slot, beatE, C1, TK } = x;
    const m = Math.min(w, h) * (0.06 - slot * 0.006);
    const len = Math.min(w, h) * (0.08 + slot * 0.02) * (1 + beatE * 0.1);
    c.strokeStyle = C1(amt * 0.5, 70);
    c.lineWidth = (1.2 + amt * 1.6) * TK;
    c.beginPath();
    for (const [px, py, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as [number, number, number, number][]) {
      c.moveTo(px + sx * len, py);
      c.lineTo(px, py);
      c.lineTo(px, py + sy * len);
    }
    c.stroke();
  },

  /** a column of light behind the composition */
  BEAM: (x) => {
    const { c, w, h, cx, amt, slot, bassV, C1 } = x;
    const wd = w * (0.05 + slot * 0.03) * (0.5 + bassV);
    const g = c.createLinearGradient(cx - wd, 0, cx + wd, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.5, C1(amt * 0.18, 68));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cx - wd, 0, wd * 2, h);
  },

  /** slowly tumbling shards orbiting the centre */
  SHARDS: (x) => {
    const { c, cx, cy, R, vt, amt, slot, CMix, L } = x;
    const S = (L.scratch.lyShard ??= [] as { a: number; r: number; sp: number; sz: number; rot: number }[]) as { a: number; r: number; sp: number; sz: number; rot: number }[];
    const want = Math.round((6 + slot * 6) * amt);
    while (S.length < want) S.push({ a: Math.random() * TAU, r: 0.35 + Math.random() * 0.45, sp: 0.001 + Math.random() * 0.003, sz: 0.4 + Math.random() * 0.9, rot: Math.random() * TAU });
    if (S.length > want) S.length = want;
    for (const p of S) {
      p.a += p.sp * (1 + amt);
      p.rot += 0.01;
      const px = cx + Math.cos(p.a) * R * p.r;
      const py = cy + Math.sin(p.a) * R * p.r * 0.6;
      const sz = R * 0.02 * p.sz * (0.5 + amt);
      c.save();
      c.translate(px, py);
      c.rotate(p.rot + vt * 0.002);
      c.fillStyle = CMix(p.r, amt * 0.4, 66);
      c.beginPath();
      c.moveTo(0, -sz);
      c.lineTo(sz * 0.6, sz * 0.4);
      c.lineTo(-sz * 0.5, sz * 0.5);
      c.closePath();
      c.fill();
      c.restore();
    }
  },

  /** a tide of colour washing from the edges inward */
  TIDEWASH: (x) => {
    const { c, w, h, cx, cy, R, amt, vt, C2 } = x;
    const g = c.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * (1.1 + Math.sin(vt * 0.006) * 0.06));
    g.addColorStop(0, "transparent");
    g.addColorStop(1, C2(amt * 0.18, 46));
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
    const need = (i / (n + 1)) * 0.55;
    const want = Math.min(1, Math.max(0, (lift - need) / Math.max(0.2, 1 - need)));
    // a floor, so an earned layer stays faintly present even in the quietest
    // bar — it should read as receding, not as being switched off
    const target = 0.16 + want * 0.84;
    L.dropAmts[i] += (target - L.dropAmts[i]) * k;
  }
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
  const share = 0.55 + 0.45 / Math.sqrt(n);

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
