import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface Gear {
  /** centre, in units of R relative to screen centre (survives any resize) */
  x: number;
  y: number;
  /** pitch radius in units of R */
  r: number;
  /** tooth count — pitch radius / module, so every gear shares a tooth size */
  n: number;
  /** +1 / -1: meshed neighbours must turn opposite ways */
  dir: number;
  /** phase offset that makes this gear's teeth sit in its parent's gaps */
  off: number;
  /** index of the gear it meshes with (-1 for the driver) */
  parent: number;
  /** angle from parent centre to this centre — where the mesh point is */
  phi: number;
  hue: number;
  /** spokes cut into the web */
  spokes: number;
}

interface Spark {
  x: number; y: number; vx: number; vy: number; a: number;
}

const MAX_GEARS = 34;
const MAX_SPARKS = 90;
const TAU = Math.PI * 2;
/** pitch radius per tooth, in units of R — one shared module keeps meshes true */
const MODULE = 0.0095;

// Pre-rendered spark. Sparks fly in the dozens on loud passages; a sprite blit
// keeps shadowBlur out of that loop entirely.
let sparkCv: HTMLCanvasElement | null = null;
let sparkKey = "";
function sparkSprite(color: string): HTMLCanvasElement {
  if (sparkCv && sparkKey === color) return sparkCv;
  sparkKey = color;
  const cv = sparkCv ?? document.createElement("canvas");
  cv.width = cv.height = 24;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 24, 24);
  const rg = g.createRadialGradient(12, 12, 0, 12, 12, 12);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.3, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 24, 24);
  sparkCv = cv;
  return cv;
}

// A clockwork movement. The gear train is laid out once — every gear is placed
// tangent to the one it meshes with, shares a single tooth module, counter-
// rotates, and turns at exactly parent_teeth / own_teeth of its parent's rate,
// with a phase offset that drops its teeth into the parent's gaps. So the mesh
// is real: watch any two touching gears and their teeth interleave.
// Quiet passages: the train ticks over slowly and stately, the escapement
// letting one tooth past per beat. Loud passages: the whole movement races,
// big wheels smear into blurred ghosts, the escapement hammers back and forth,
// and sparks are thrown off the mesh points.
export const MECHANISM: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.mechanism ??= {
    key: "",
    gears: [] as Gear[],
    sparks: [] as Spark[],
    /** master drive angle — every gear derives from it, so meshes never slip */
    drive: 0,
    /** escapement lever angle and its target side */
    esc: 0,
    escTo: 1,
    tick: 0,
    /** mainspring wind */
    wind: 0,
  });

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  // --- layout: built ONCE per aspect ratio, then only animated ---
  const key = `${Math.round((w / Math.max(1, h)) * 3)}`;
  if (S.key !== key) {
    S.key = key;
    const gears: Gear[] = [];
    const halfW = w / Math.max(1, Math.min(w, h)) * 0.5;
    const halfH = h / Math.max(1, Math.min(w, h)) * 0.5;
    const mkR = () => {
      const teeth = 9 + Math.floor(Math.random() * 22);
      return { n: teeth, r: teeth * MODULE };
    };
    const first = { n: 26, r: 26 * MODULE };
    gears.push({
      x: 0, y: 0, r: first.r, n: first.n, dir: 1, off: 0, parent: -1, phi: 0,
      hue: Math.random(), spokes: 4 + Math.floor(Math.random() * 3),
    });
    let guard = 0;
    while (gears.length < MAX_GEARS && guard < 900) {
      guard++;
      const pi = Math.floor(Math.random() * gears.length);
      const p = gears[pi];
      const cand = mkR();
      const phi = Math.random() * TAU;
      const d = p.r + cand.r;
      const x = p.x + Math.cos(phi) * d;
      const y = p.y + Math.sin(phi) * d;
      // stay roughly on-screen
      if (Math.abs(x) > halfW + cand.r * 0.4 || Math.abs(y) > halfH + cand.r * 0.4) continue;
      // no overlap with anything except the parent it meshes with
      let ok = true;
      for (let i = 0; i < gears.length; i++) {
        if (i === pi) continue;
        const g2 = gears[i];
        const dx = x - g2.x, dy = y - g2.y;
        if (Math.sqrt(dx * dx + dy * dy) < cand.r + g2.r + MODULE * 2.2) { ok = false; break; }
      }
      if (!ok) continue;
      // meshing phase: teeth of the child fall into the gaps of the parent
      const ratio = p.n / cand.n;
      gears.push({
        x, y, r: cand.r, n: cand.n,
        dir: -p.dir,
        off: -ratio * p.off + (1 + ratio) * phi + Math.PI / cand.n,
        parent: pi,
        phi,
        hue: Math.random(),
        spokes: cand.n > 15 ? 4 + Math.floor(Math.random() * 3) : 0,
      });
    }
    S.gears = gears;
    S.sparks = [];
  }

  const gears: Gear[] = S.gears;
  const sparks: Spark[] = S.sparks;
  if (!gears.length) return;
  const N0 = gears[0].n;

  // --- drive rate: stately when calm, racing when driving ---
  const rate = (0.0055 + E2 * 0.075) * sp * (1 + bassV * 0.5 + beatE * (0.3 + E * 1.4)) * fs;
  S.drive += rate;
  if (S.drive > TAU * 1e5) S.drive -= TAU * 1e5;
  S.wind += rate * 0.5;

  // escapement: one hard flip per beat, hammering when loud
  S.tick = Math.max(0, S.tick - fs);
  if (beat) { S.escTo = -S.escTo; S.tick = 6; }
  else if (E > 0.55 && S.tick <= 0 && Math.random() < E2 * 0.35 * fs) { S.escTo = -S.escTo; S.tick = 3; }
  S.esc += (S.escTo - S.esc) * ak(0.16 + E * 0.5, fs);

  // --- brass plate, painted opaque ---
  c.globalCompositeOperation = "source-over";
  const plate = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
  plate.addColorStop(0, CMix(0.4, 1, 11 + E * 5 + beatE * 3));
  plate.addColorStop(1, CMix(0.85, 1, 4 + E * 2));
  c.fillStyle = plate;
  c.fillRect(0, 0, w, h);

  const toothA = (g: Gear) => g.dir * S.drive * (N0 / g.n) + g.off;

  // --- gear bodies ---
  const rimA = (0.34 + midV * 0.18 + beatE * 0.16) * (0.4 + I * 0.7);
  const blur = E > 0.5 ? (E - 0.5) * 2 : 0; // 0..1 smear factor
  for (let gi = 0; gi < gears.length; gi++) {
    const g = gears[gi];
    const gx = cx + g.x * R, gy = cy + g.y * R;
    const pr = g.r * R;
    if (pr < 1.5) continue;
    const ang = toothA(g);
    const rootR = pr - MODULE * R * 0.75;
    const tipR = pr + MODULE * R * 0.7;
    if (!(rootR > 0.5)) continue;

    // one ghost copy smears the big wheels — only when the movement is racing
    const ghosts = blur > 0.05 && g.n >= 20 ? 1 : 0;
    for (let gh = ghosts; gh >= 0; gh--) {
      const lag = gh === 0 ? 0 : -g.dir * (rate * (N0 / g.n)) * gh * 5.5;
      const a2 = ang + lag;
      const al = gh === 0 ? rimA : rimA * blur * 0.3;
      c.beginPath();
      // toothed outline: 4 vertices per tooth
      for (let k = 0; k < g.n; k++) {
        const b = a2 + (k / g.n) * TAU;
        const q = TAU / g.n * 0.25;
        const p0 = b - q * 1.35, p1 = b - q * 0.5, p2 = b + q * 0.5, p3 = b + q * 1.35;
        if (k === 0) c.moveTo(gx + Math.cos(p0) * rootR, gy + Math.sin(p0) * rootR);
        else c.lineTo(gx + Math.cos(p0) * rootR, gy + Math.sin(p0) * rootR);
        c.lineTo(gx + Math.cos(p1) * tipR, gy + Math.sin(p1) * tipR);
        c.lineTo(gx + Math.cos(p2) * tipR, gy + Math.sin(p2) * tipR);
        c.lineTo(gx + Math.cos(p3) * rootR, gy + Math.sin(p3) * rootR);
      }
      c.closePath();
      if (gh === 0) {
        // flat fill, not a gradient: 30+ gradient objects a frame is pure garbage
        c.fillStyle = CMix(g.hue, 0.5, 15 + E * 7 + beatE * 3);
        c.fill();
      }
      c.strokeStyle = CMix(g.hue, al, 58 + E * 8);
      c.lineWidth = Math.max(0.4, (0.8 + E * 0.6) * TK);
      c.stroke();
    }

    // hub + spokes, so the rotation is legible even on the big slow wheels
    c.beginPath();
    const hub = pr * 0.2 + 1;
    c.moveTo(gx + hub, gy);
    c.arc(gx, gy, hub, 0, TAU);
    c.fillStyle = CMix(g.hue, 0.55, 30 + beatE * 8);
    c.fill();
    if (g.spokes) {
      c.beginPath();
      for (let s2 = 0; s2 < g.spokes; s2++) {
        const b = ang + (s2 / g.spokes) * TAU;
        c.moveTo(gx + Math.cos(b) * hub, gy + Math.sin(b) * hub);
        c.lineTo(gx + Math.cos(b) * rootR * 0.92, gy + Math.sin(b) * rootR * 0.92);
      }
      c.strokeStyle = CMix(g.hue, rimA * 0.7, 46);
      c.lineWidth = Math.max(0.6, (1.4 + E * 1.2) * TK);
      c.stroke();
    }
  }

  // --- mainspring: an Archimedean coil that tightens as the music drives ---
  {
    const sx = cx + (gears[0].x) * R, sy = cy + (gears[0].y) * R;
    const turns = 4.5;
    const r1 = gears[0].r * R * 0.9;
    const tight = 0.55 + E * 0.4 + beatE * 0.08;
    c.beginPath();
    const SEG = 96;
    for (let i = 0; i <= SEG; i++) {
      const f = i / SEG;
      const th = f * turns * TAU + S.wind * 0.6;
      const rr = r1 * (0.16 + f * (1 - tight * 0.45));
      const px = sx + Math.cos(th) * rr;
      const py = sy + Math.sin(th) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.strokeStyle = C2((0.3 + E * 0.22 + beatE * 0.22) * (0.4 + I * 0.7), 62);
    c.lineWidth = Math.max(0.6, (1 + E * 1.2 + beatE) * TK);
    glow(Math.min(20, 9 * (1 + beatE * 0.8)), C2());
    c.stroke();
    noGlow();
  }

  // --- escapement: pallet fork rocking against the escape wheel ---
  {
    let ei = 0;
    for (let i = 1; i < gears.length; i++) if (gears[i].n < gears[ei].n) ei = i;
    const eg = gears[ei];
    const ex = cx + eg.x * R, ey = cy + eg.y * R;
    const armR = eg.r * R * 1.85 + 4;
    const swing = S.esc * (0.24 + E * 0.3);
    const base = eg.phi + Math.PI;
    const px = ex + Math.cos(base) * armR * 0.55;
    const py = ey + Math.sin(base) * armR * 0.55;
    const hit = Math.max(0, S.tick / 6);
    c.strokeStyle = C1((0.4 + hit * 0.4 + beatE * 0.25) * (0.4 + I * 0.7), 66 + hit * 8);
    c.lineWidth = Math.max(0.9, (1.8 + hit * 2.4 + E) * TK);
    c.lineCap = "round";
    glow(Math.min(24, (8 + E * 8) * (1 + hit)), C1());
    c.beginPath();
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      const a2 = base + Math.PI / 2 * s2 + swing;
      c.moveTo(px, py);
      c.lineTo(px + Math.cos(a2) * armR * 0.9, py + Math.sin(a2) * armR * 0.9);
    }
    c.stroke();
    // pivot
    c.beginPath();
    c.arc(px, py, Math.max(1.2, 2.6 * TK), 0, TAU);
    c.fillStyle = C1(0.6 + hit * 0.3, 70);
    c.fill();
    noGlow();
    c.lineCap = "butt";

    // sparks off the mesh points when the movement is really going
    if ((beat || Math.random() < E2 * 0.45 * fs) && sparks.length < MAX_SPARKS) {
      const src = gears[1 + Math.floor(Math.random() * Math.max(1, gears.length - 1))];
      const pg = gears[src.parent < 0 ? 0 : src.parent];
      const mx = cx + (pg.x + Math.cos(src.phi) * pg.r) * R;
      const my = cy + (pg.y + Math.sin(src.phi) * pg.r) * R;
      const n = Math.min(MAX_SPARKS - sparks.length, 2 + Math.floor(E * 9 + beatE * 6));
      for (let k = 0; k < n; k++) {
        const a2 = Math.random() * TAU;
        const v = R * (0.002 + Math.random() * 0.009) * (0.4 + E);
        sparks.push({ x: mx, y: my, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, a: 0.7 + E * 0.3 });
      }
    }
  }

  // --- sparks (additive, sprite blits) ---
  if (sparks.length) {
    c.globalCompositeOperation = "lighter";
    const spr = sparkSprite(C2(0.9, 74));
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s2 = sparks[i];
      s2.x += s2.vx * sp * fs;
      s2.y += s2.vy * sp * fs;
      s2.vy += R * 0.00035 * fs;
      s2.vx *= dk(0.965, fs);
      s2.a *= dk(0.9, fs);
      if (s2.a < 0.05) { sparks.splice(i, 1); continue; }
      const rr = Math.max(1, R * 0.008 * s2.a * TK * (1 + trebV));
      c.globalAlpha = Math.min(0.8, s2.a);
      c.drawImage(spr, s2.x - rr, s2.y - rr, rr * 2, rr * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }
};
