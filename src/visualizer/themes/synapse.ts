import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface Neuron {
  id: number;
  /** stable randoms — every layout is a pure function of these */
  r1: number;
  r2: number;
  /** unit-space position (-1.6..1.6 wide, -1..1 tall) and its anchor */
  ux: number;
  uy: number;
  ax: number;
  ay: number;
  /** screen-space cache, rewritten in place each frame */
  x: number;
  y: number;
  ph: number;
  /** firing envelope 0..1 */
  fire: number;
  /** activation fade-in 0..1 — this is how the network "grows" */
  act: number;
  hue: number;
  bin: number;
  /** refractory frames, stops chain reactions running away */
  refr: number;
}
interface Pulse {
  e: number;
  /** 0..1 along the edge */
  p: number;
  /** 1 = a→b, -1 = b→a */
  dir: number;
  sp: number;
  hue: number;
}
interface SynState {
  n: Neuron[];
  ea: Int32Array;
  eb: Int32Array;
  /** 0 = core connection, 1 = late-growth branch */
  et: Uint8Array;
  /** per-edge traffic heat */
  eh: Float32Array;
  ec: number;
  /** CSR adjacency: adjS[i]..adjS[i+1] index into adjE (edge ids) */
  adjS: Int32Array;
  adjE: Int32Array;
  pl: Pulse[];
  w2: number;
  w3: number;
  sec: number;
  arm: number;
  peak: number;
  /** cascade wavefront progress, 0 = idle */
  casc: number;
  ox: number;
  oy: number;
  flash: number;
  amb: number;
}

const TAU = Math.PI * 2;
const NODE_N = 140;      // hard caps — fixed regardless of canvas size
const EDGE_MAX = 340;
const PULSE_MAX = 240;
const cl01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── cached sprites: 0 = neuron halo, 1 = pulse (hue A), 2 = pulse (hue B) ──
// drawImage of a pre-rendered glow beats a shadowBlur'd arc by orders of
// magnitude, and there can be 240 pulses in flight during a cascade.
const SPR: { cv: HTMLCanvasElement | null; key: string }[] = [
  { cv: null, key: "" }, { cv: null, key: "" }, { cv: null, key: "" },
];
function sprite(slot: number, core: string, mid: string): HTMLCanvasElement {
  const s = SPR[slot];
  const key = core + "|" + mid;
  if (s.cv && s.key === key) return s.cv;
  const cv = s.cv ?? document.createElement("canvas");
  cv.width = cv.height = 44;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 44, 44);
  const rg = g.createRadialGradient(22, 22, 0, 22, 22, 22);
  rg.addColorStop(0, core);
  rg.addColorStop(0.32, mid);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 44, 44);
  s.cv = cv;
  s.key = key;
  return cv;
}

/** Anchors for one arrangement section — scatter, rings, lattice, spiral. */
function applyLayout(n: Neuron, m: number) {
  const k = ((m % 4) + 4) % 4;
  if (k === 1) {
    const a = n.r1 * TAU;
    const rad = n.r2 < 0.45 ? 0.46 : 0.92;
    n.ax = Math.cos(a) * rad * 1.3;
    n.ay = Math.sin(a) * rad * 0.82;
  } else if (k === 2) {
    const col = n.id % 12;
    const row = (n.id / 12) | 0;
    n.ax = (col / 11 - 0.5) * 2.9 + (n.r1 - 0.5) * 0.1;
    n.ay = (row / 11 - 0.5) * 1.7 + (n.r2 - 0.5) * 0.1;
  } else if (k === 3) {
    const t = n.id / NODE_N;
    const a = t * TAU * 2.6;
    const rad = 0.12 + t * 0.9;
    n.ax = Math.cos(a) * rad * 1.35;
    n.ay = Math.sin(a) * rad * 0.85;
  } else {
    n.ax = (n.r1 - 0.5) * 3.0;
    n.ay = (n.r2 - 0.5) * 1.8;
  }
}

// A neural network waking up, stage by stage.
//   • quiet   — a handful of dim neurons drifting, joined by the faintest threads
//   • rising  — signals start running the threads as travelling pulses
//   • driving — the net densifies: dormant neurons light up and branches grow out
//   • drop    — one cell fires, a wavefront sweeps the whole net and every
//               connection lights at once, then the tissue settles back to dark
export const SYNAPSE: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, freq, liveAudio, vt, beat, beatE, hit, hitE, energy, dropE, section,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: SynState = (L.scratch.synapse ??= {
    n: [] as Neuron[],
    ea: new Int32Array(EDGE_MAX),
    eb: new Int32Array(EDGE_MAX),
    et: new Uint8Array(EDGE_MAX),
    eh: new Float32Array(EDGE_MAX),
    ec: 0,
    adjS: new Int32Array(NODE_N + 1),
    adjE: new Int32Array(EDGE_MAX * 2),
    pl: [] as Pulse[],
    w2: 0, w3: 0, sec: -1, arm: 0, peak: 0,
    casc: 0, ox: 0, oy: 0, flash: 0, amb: 0,
  });

  // ── one-time build: neurons, then a 4-nearest-neighbour wiring ───────────
  if (S.n.length === 0) {
    for (let i = 0; i < NODE_N; i++) {
      const nn: Neuron = {
        id: i, r1: Math.random(), r2: Math.random(),
        ux: 0, uy: 0, ax: 0, ay: 0, x: 0, y: 0,
        ph: Math.random() * TAU, fire: 0, act: 0,
        hue: Math.random(), bin: 3 + ((Math.random() * 92) | 0), refr: 0,
      };
      applyLayout(nn, 0);
      nn.ux = nn.ax;
      nn.uy = nn.ay;
      S.n.push(nn);
    }
    // activation order = distance from the middle, so the first cells to wake
    // are a connected core and the net then grows outward rather than in specks
    S.n.sort((a, b) => (a.ux * a.ux + a.uy * a.uy * 1.6) - (b.ux * b.ux + b.uy * b.uy * 1.6));
    for (let i = 0; i < NODE_N; i++) S.n[i].id = i;
    const seen = new Set<number>();
    const bi = [0, 0, 0, 0];
    const bd = [0, 0, 0, 0];
    for (let i = 0; i < NODE_N && S.ec < EDGE_MAX; i++) {
      for (let k = 0; k < 4; k++) { bi[k] = -1; bd[k] = 1e9; }
      const a = S.n[i];
      for (let j = 0; j < NODE_N; j++) {
        if (j === i) continue;
        const b = S.n[j];
        const dx = a.ux - b.ux, dy = a.uy - b.uy;
        const d2 = dx * dx + dy * dy;
        for (let k = 0; k < 4; k++) {
          if (d2 < bd[k]) {
            for (let m = 3; m > k; m--) { bd[m] = bd[m - 1]; bi[m] = bi[m - 1]; }
            bd[k] = d2; bi[k] = j;
            break;
          }
        }
      }
      for (let k = 0; k < 4 && S.ec < EDGE_MAX; k++) {
        const j = bi[k];
        if (j < 0) continue;
        const key = i < j ? i * NODE_N + j : j * NODE_N + i;
        if (seen.has(key)) continue;
        seen.add(key);
        S.ea[S.ec] = i;
        S.eb[S.ec] = j;
        S.et[S.ec] = k < 2 ? 0 : 1;
        S.ec++;
      }
    }
    // CSR adjacency (counting sort over degrees)
    const deg = new Int32Array(NODE_N);
    for (let e = 0; e < S.ec; e++) { deg[S.ea[e]]++; deg[S.eb[e]]++; }
    let run = 0;
    for (let i = 0; i < NODE_N; i++) { S.adjS[i] = run; run += deg[i]; }
    S.adjS[NODE_N] = run;
    const cur = new Int32Array(NODE_N);
    for (let i = 0; i < NODE_N; i++) cur[i] = S.adjS[i];
    for (let e = 0; e < S.ec; e++) {
      S.adjE[cur[S.ea[e]]++] = e;
      S.adjE[cur[S.eb[e]]++] = e;
    }
  }

  // ── arrangement change: relayout + repaint the cells ─────────────────────
  if (section !== S.sec) {
    S.sec = section;
    for (let i = 0; i < NODE_N; i++) {
      applyLayout(S.n[i], section);
      S.n[i].hue = Math.random();
    }
  }

  // ── smoothed layer weights ───────────────────────────────────────────────
  S.w2 += (cl01((energy - 0.22) / 0.26) - S.w2) * ak(0.035, fs);
  S.w3 += (cl01((energy - 0.5) / 0.3) - S.w3) * ak(0.025, fs);
  const w2 = S.w2, w3 = S.w3;

  const K = R * 0.45;
  const fl = freq.length || 1;
  const liveN = 8 + w2 * 46 + w3 * 86;   // how many cells are awake

  // ── firing + propagation ─────────────────────────────────────────────────
  const fireNode = (n: Neuron, force: number, fromEdge: number) => {
    // refractory keeps the chain sub-critical; during a forced cascade a cell
    // may only re-fire once its own flash has faded, so the pool never thrashes
    if (force ? n.fire > 0.5 : n.refr > 0) return;
    n.fire = 1;
    n.refr = force ? 24 : 9;
    const prob = force ? 0.92 : 0.04 + w3 * 0.2;
    const s0 = S.adjS[n.id], s1 = S.adjS[n.id + 1];
    for (let k = s0; k < s1; k++) {
      if (S.pl.length >= PULSE_MAX) return;
      const e = S.adjE[k];
      if (e === fromEdge) continue;
      if (S.et[e] === 1 && w3 < 0.1) continue;
      if (Math.random() > prob) continue;
      const other = S.ea[e] === n.id ? S.eb[e] : S.ea[e];
      if (S.n[other].act < 0.12) continue;
      S.pl.push({
        e, p: 0, dir: S.ea[e] === n.id ? 1 : -1,
        sp: 0.018 + Math.random() * 0.018, hue: n.hue,
      });
    }
  };

  // drop: arm on the rise, detonate just past the peak
  if (dropE > 0.55) { S.arm = 1; if (dropE > S.peak) S.peak = dropE; }
  if (S.arm && (dropE < S.peak * 0.8 || dropE < 0.28)) {
    S.arm = 0;
    S.peak = 0;
    const seed = S.n[(Math.random() * Math.max(1, Math.min(NODE_N, liveN))) | 0];
    S.casc = 0.001;
    S.ox = seed.ux;
    S.oy = seed.uy;
    S.flash = 0.9;
    fireNode(seed, 1, -1);
  }

  // ── neuron update ────────────────────────────────────────────────────────
  const drift = (0.0016 + energy * 0.0022) * cfg.speed * fs;
  const settle = ak(0.02, fs);
  const actEase = ak(0.03, fs);
  const fireFade = dk(0.87, fs);
  for (let i = 0; i < NODE_N; i++) {
    const n = S.n[i];
    const tgt = cl01((liveN - i) * 0.4);
    n.act += (tgt - n.act) * actEase;
    n.ux += (n.ax - n.ux) * settle + Math.sin(vt * 0.011 + n.ph) * drift;
    n.uy += (n.ay - n.uy) * settle + Math.cos(vt * 0.009 + n.ph * 1.7) * drift;
    n.x = cx + n.ux * K;
    n.y = cy + n.uy * K;
    n.fire *= fireFade;
    if (n.refr > 0) n.refr -= fs;
  }

  // percussive onsets fire scattered cells; the tempo grid fires a small burst
  if (w2 > 0.04) {
    if (hit) {
      const k = 1 + ((w2 * 3) | 0);
      for (let i = 0; i < k; i++) fireNode(S.n[(Math.random() * liveN) | 0], 0, -1);
    }
    if (beat) {
      const k = 2 + ((w3 * 4) | 0);
      for (let i = 0; i < k; i++) fireNode(S.n[(Math.random() * liveN) | 0], 0, -1);
    }
    S.amb -= fs;
    if (S.amb <= 0) {
      S.amb = 26 - w2 * 14;
      fireNode(S.n[(Math.random() * liveN) | 0], 0, -1);
    }
  }

  // ── cascade wavefront ────────────────────────────────────────────────────
  let waveR = 0;
  if (S.casc > 0) {
    S.casc += 0.017 * cfg.speed * fs;
    waveR = S.casc * 2.6;
    for (let i = 0; i < NODE_N; i++) {
      const n = S.n[i];
      if (n.act < 0.15) continue;
      const dx = n.ux - S.ox, dy = n.uy - S.oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < waveR && d > waveR - 0.2) fireNode(n, 1, -1);
    }
    if (S.casc > 1.35) { S.casc = 0; waveR = 0; }
  }

  // ── pulse travel ─────────────────────────────────────────────────────────
  const psp = (0.55 + energy * 0.85) * cfg.speed * fs;
  for (let i = S.pl.length - 1; i >= 0; i--) {
    const p = S.pl[i];
    p.p += p.sp * psp;
    S.eh[p.e] = 1;
    if (p.p >= 1) {
      const dst = p.dir === 1 ? S.eb[p.e] : S.ea[p.e];
      const e0 = p.e;
      S.pl.splice(i, 1);
      fireNode(S.n[dst], 0, e0);
    }
  }

  // ═════ paint — source-over base so the trail buffer never saturates ══════
  c.globalCompositeOperation = "source-over";
  // alpha here is the ceiling on how much additive light can pile up: the
  // scene is re-based every frame, so nothing can creep toward white
  const bg = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
  bg.addColorStop(0, CMix(0.5, 0.26 + S.flash * 0.06, 16 + w3 * 5));
  bg.addColorStop(0.6, C2(0.23, 10));
  bg.addColorStop(1, C1(0.25, 5));
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  // ── LAYER 1/3 — connections, four batched paths, four strokes total ──────
  const dimA = new Path2D();
  const dimB = new Path2D();
  const grow = new Path2D();
  const ehFade = dk(0.9, fs);
  const hotP = new Path2D();
  for (let e = 0; e < S.ec; e++) {
    const a = S.n[S.ea[e]], b = S.n[S.eb[e]];
    const av = a.act < b.act ? a.act : b.act;
    S.eh[e] *= ehFade;
    if (av < 0.06) continue;
    const branch = S.et[e] === 1;
    if (branch && w3 < 0.04) continue;
    const P = S.eh[e] > 0.15 ? hotP : branch ? grow : av > 0.55 ? dimB : dimA;
    P.moveTo(a.x, a.y);
    P.lineTo(b.x, b.y);
  }
  // dendrite stubs sprouting off awake cells as the net densifies
  if (w3 > 0.04) {
    const stub = K * 0.09 * w3;
    for (let i = 0; i < NODE_N; i++) {
      const n = S.n[i];
      if (n.act < 0.3) continue;
      const a0 = n.ph + vt * 0.004;
      const ln = stub * (0.6 + n.r1 * 0.8);
      grow.moveTo(n.x, n.y);
      grow.lineTo(n.x + Math.cos(a0) * ln, n.y + Math.sin(a0) * ln);
      grow.moveTo(n.x, n.y);
      grow.lineTo(n.x + Math.cos(a0 + 2.4) * ln, n.y + Math.sin(a0 + 2.4) * ln);
    }
  }
  c.lineWidth = 0.7 * TK;
  c.strokeStyle = C2(0.1 + midV * 0.05, 44);
  c.stroke(dimA);
  c.strokeStyle = CMix(0.4, 0.17 + midV * 0.08 + beatE * 0.05, 54);
  c.lineWidth = 0.85 * TK;
  c.stroke(dimB);
  c.strokeStyle = C1(Math.min(0.34, w3 * (0.16 + trebV * 0.14)), 50);
  c.lineWidth = 0.6 * TK;
  c.stroke(grow);

  c.globalCompositeOperation = "lighter";
  glow(Math.min(26, 9 + beatE * 8 + S.flash * 8), C1());
  c.strokeStyle = C1(Math.min(0.32, 0.16 + trebV * 0.12 + hitE * 0.12), 68);
  c.lineWidth = (1 + beatE * 1.1) * TK;
  c.stroke(hotP);
  noGlow();

  // ── neurons: one sprite blit each, no per-particle shadowBlur ────────────
  const halo = sprite(0, CMix(0.4, 0.6, 72), CMix(0.55, 0.24, 52));
  for (let i = 0; i < NODE_N; i++) {
    const n = S.n[i];
    if (n.act < 0.05) continue;
    const fv = liveAudio ? freq[n.bin % fl] / 255 : 0.3;
    const r = R * (0.008 + n.r2 * 0.006) * (0.7 + n.act * 0.5 + n.fire * 1.5 + fv * 0.5 * I) * 3;
    c.globalAlpha = Math.min(0.5, n.act * (0.2 + n.fire * 0.42 + bassV * 0.07));
    c.drawImage(halo, n.x - r, n.y - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;

  // firing cores + their rings — two batched passes
  const core = new Path2D();
  const ring = new Path2D();
  for (let i = 0; i < NODE_N; i++) {
    const n = S.n[i];
    if (n.act < 0.05) continue;
    const cr = R * 0.0045 * (0.6 + n.act * 0.6 + n.fire * 1.4);
    core.moveTo(n.x + cr, n.y);
    core.arc(n.x, n.y, cr, 0, TAU);
    if (n.fire > 0.15) {
      const rr = R * 0.02 * (1.4 - n.fire) * (1 + w3 * 0.6);
      ring.moveTo(n.x + rr, n.y);
      ring.arc(n.x, n.y, rr, 0, TAU);
    }
  }
  c.fillStyle = CMix(0.3, 0.2 + beatE * 0.08, 68);
  c.fill(core);
  glow(Math.min(24, 8 + beatE * 8), C2());
  c.strokeStyle = C2(Math.min(0.36, 0.18 + w3 * 0.14 + hitE * 0.1), 70);
  c.lineWidth = (0.9 + beatE * 0.8) * TK;
  c.stroke(ring);
  noGlow();

  // ── LAYER 2 — travelling pulses (sprites) + one batched streak stroke ────
  if (S.pl.length) {
    const streak = new Path2D();
    const sA = sprite(1, C1(0.85, 76), C1(0.3, 58));
    const sB = sprite(2, C2(0.85, 76), C2(0.3, 58));
    for (let i = 0; i < S.pl.length; i++) {
      const p = S.pl[i];
      const a = S.n[S.ea[p.e]], b = S.n[S.eb[p.e]];
      const t0 = p.dir === 1 ? p.p : 1 - p.p;
      const px = a.x + (b.x - a.x) * t0;
      const py = a.y + (b.y - a.y) * t0;
      const tb = p.dir === 1 ? Math.max(0, t0 - 0.22) : Math.min(1, t0 + 0.22);
      streak.moveTo(a.x + (b.x - a.x) * tb, a.y + (b.y - a.y) * tb);
      streak.lineTo(px, py);
      const fade = p.p > 0.9 ? (1 - p.p) * 10 : 1;
      const r = R * 0.011 * (0.7 + w2 * 0.5) * (0.6 + fade * 0.6);
      c.globalAlpha = Math.min(0.6, 0.32 + beatE * 0.12) * fade;
      c.drawImage(p.hue < 0.5 ? sA : sB, px - r, py - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.strokeStyle = CMix(0.5, Math.min(0.3, 0.16 + w2 * 0.12), 66);
    c.lineWidth = (0.8 + beatE * 0.7) * TK;
    c.stroke(streak);
  }

  // ── cascade wavefront + settle ───────────────────────────────────────────
  if (waveR > 0.02) {
    const wr = waveR * K;
    const wa = cl01(1.35 - S.casc) * 0.4;
    glow(Math.min(26, 12 + wa * 20), C1());
    c.strokeStyle = C1(wa, 72);
    c.lineWidth = (1.5 + wa * 4) * TK;
    c.beginPath();
    c.arc(cx + S.ox * K, cy + S.oy * K, wr, 0, TAU);
    c.stroke();
    noGlow();
  }
  S.flash *= dk(0.9, fs);
  if (S.flash > 0.03) {
    c.fillStyle = C1(S.flash * 0.07, 70);
    c.fillRect(0, 0, w, h);
  }
};
