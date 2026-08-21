import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

// SINGULARITY — a spinning accretion disc seen edge-on-ish, with a dark core
// that light bends around. The disc is a real 3D annulus: every particle has an
// orbital radius and angle in the disc plane, gets pitched toward the camera and
// divided by depth, and is drawn back-to-front so the far arc passes *behind*
// the core while the near arc passes in front.
//
// Layers: the bare disc, then jets firing from the poles, then infalling debris
// spiralling in, then a photon ring around the core. A drop collapses the disc
// inward and detonates the core.

interface P { a: number; r: number; sp: number; sz: number; ph: number }

const DISC = 260;          // hard cap, size-independent
const DEBRIS = 70;
const JET_SEGS = 22;

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface State {
  disc: P[];
  debris: P[];
  spin: number;
  w2: number;
  w3: number;
  collapse: number;
}

export const SINGULARITY: ThemeDraw = (x) => {
  const { c, cx, cy, R, fs, vt, freq, beat, beatE, energy, dropE, hit, hitE, cfg, bassV, midV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.singularity ??= {
    disc: [] as P[],
    debris: [] as P[],
    spin: 0,
    w2: 0,
    w3: 0,
    collapse: 0,
  }) as State;

  if (S.disc.length === 0) {
    for (let i = 0; i < DISC; i++) {
      const r = 0.32 + Math.pow(Math.random(), 0.6) * 1.35;
      S.disc.push({
        a: Math.random() * Math.PI * 2,
        r,
        // inner orbits are faster, like a real accretion disc
        sp: 0.02 / Math.pow(r, 1.35),
        sz: 0.5 + Math.random() * 1.1,
        ph: Math.random() * 6.28,
      });
    }
  }

  const t2 = cl01((energy - 0.3) / 0.28);
  const t3 = cl01((energy - 0.55) / 0.28);
  const ease = ak(0.03, fs);
  S.w2 += (t2 - S.w2) * ease;
  S.w3 += (t3 - S.w3) * ease;
  S.collapse = Math.max(S.collapse * dk(0.94, fs), dropE);

  S.spin += (0.004 + energy * 0.006) * cfg.speed * fs;

  // disc tilt: nearly edge-on when calm, opening up as the track drives
  const pitch = 1.16 - energy * 0.42 - S.collapse * 0.3;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const camZ = 3.2;
  const f = R * 0.86;

  /** disc-plane polar (a, r) plus height y → screen + depth */
  const proj = (a: number, r: number, yy: number): [number, number, number] => {
    const wx = Math.cos(a) * r;
    const wz = Math.sin(a) * r;
    const py = yy * cp - wz * sp;
    const pz = yy * sp + wz * cp + camZ;
    if (pz < 0.05) return [0, 0, -1];
    return [cx + (f * wx) / pz, cy - (f * py) / pz, pz];
  };

  const coreR = R * (0.085 + bassV * 0.03 + S.collapse * 0.05);

  // ── build the draw list, back to front ─────────────────────────────────
  const pts: { px: number; py: number; d: number; p: P }[] = [];
  const bins = freq.length;
  for (const p of S.disc) {
    p.a += p.sp * cfg.speed * (1 + energy * 0.7 + S.collapse * 2.5) * fs;
    // the drop drags everything inward
    const rr = p.r * (1 - S.collapse * 0.42);
    const q = proj(p.a, rr, 0);
    if (q[2] < 0) continue;
    pts.push({ px: q[0], py: q[1], d: q[2], p });
  }
  pts.sort((a, b) => b.d - a.d);

  // the far half first
  const drawArc = (near: boolean) => {
    for (const { px, py, d, p } of pts) {
      if ((d < camZ) !== near) continue;
      const bin = Math.min(bins - 1, 3 + Math.floor((p.r / 1.7) * 50));
      const lvl = (freq[bin] ?? 0) / 255;
      const rr = Math.max(0.5, (R * 0.006 * p.sz * (1 + lvl * 1.4 + beatE * 0.5)) / d);
      // inner orbits run hotter
      const heat = cl01(1 - (p.r - 0.32) / 1.35);
      c.fillStyle = CMix(heat, (0.25 + lvl * 0.55) * (near ? 1 : 0.55), 40 + heat * 32 + lvl * 8);
      c.beginPath();
      c.arc(px, py, rr, 0, Math.PI * 2);
      c.fill();
    }
  };

  drawArc(false);

  // ── layer 2: polar jets ────────────────────────────────────────────────
  if (S.w2 > 0.04) {
    glow(Math.min(24, 10 + beatE * 12 + S.collapse * 14), C1());
    for (const dir of [1, -1]) {
      c.beginPath();
      let started = false;
      for (let k = 0; k <= JET_SEGS; k++) {
        const t = k / JET_SEGS;
        const yy = dir * t * (1.6 + S.w2 * 1.2 + S.collapse * 2.2);
        // the jet corkscrews as it climbs
        const a = S.spin * 3 + t * 6;
        const wob = Math.sin(vt * 0.05 + t * 8) * 0.05 * t;
        const q = proj(a, wob + t * 0.08, yy);
        if (q[2] < 0) { started = false; continue; }
        if (!started) { c.moveTo(q[0], q[1]); started = true; } else c.lineTo(q[0], q[1]);
      }
      c.strokeStyle = C1(S.w2 * (0.35 + midV * 0.35) + S.collapse * 0.3, 72);
      c.lineWidth = (1.4 + beatE * 2.4 + S.collapse * 4) * TK;
      c.stroke();
    }
    noGlow();
  }

  // ── the core: a dark disc with a bright rim, so light bends around it ───
  c.fillStyle = "#05060A";
  c.beginPath();
  c.arc(cx, cy, coreR, 0, Math.PI * 2);
  c.fill();

  // ── layer 4: photon ring ───────────────────────────────────────────────
  if (S.w3 > 0.03 || S.collapse > 0.1) {
    glow(Math.min(26, 12 + beatE * 14 + S.collapse * 16), C1());
    c.strokeStyle = C1(Math.max(S.w3 * 0.6, S.collapse * 0.8) + trebV * 0.2, 78);
    c.lineWidth = (1.4 + beatE * 2 + S.collapse * 3) * TK;
    c.beginPath();
    c.arc(cx, cy, coreR * (1.08 + beatE * 0.05), 0, Math.PI * 2);
    c.stroke();
    noGlow();
  }

  drawArc(true);

  // ── layer 3: infalling debris ──────────────────────────────────────────
  if (S.w3 > 0.03) {
    const want = Math.round(DEBRIS * S.w3);
    while (S.debris.length < want) {
      S.debris.push({
        a: Math.random() * Math.PI * 2,
        r: 1.6 + Math.random() * 1.4,
        sp: 0.03 + Math.random() * 0.03,
        sz: 0.6 + Math.random() * 1.2,
        ph: Math.random() * 6.28,
      });
    }
    if (S.debris.length > want) S.debris.length = want;

    c.lineWidth = 1 * TK;
    for (const p of S.debris) {
      p.a += p.sp * cfg.speed * (1 + S.collapse * 3) * fs;
      // spirals inward, then respawns at the rim
      p.r -= (0.0035 + S.collapse * 0.02) * cfg.speed * fs;
      if (p.r < 0.3) { p.r = 1.6 + Math.random() * 1.4; p.a = Math.random() * Math.PI * 2; }
      const q0 = proj(p.a, p.r, 0);
      const q1 = proj(p.a - 0.18, p.r + 0.05, 0);
      if (q0[2] < 0 || q1[2] < 0) continue;
      const heat = cl01(1 - (p.r - 0.3) / 1.4);
      c.strokeStyle = CMix(heat, (0.3 + heat * 0.5) * S.w3, 52 + heat * 26);
      c.beginPath();
      c.moveTo(q1[0], q1[1]);
      c.lineTo(q0[0], q0[1]);
      c.stroke();
    }
  }

  // ── drop: the core detonates ───────────────────────────────────────────
  if (S.collapse > 0.12) {
    const br = coreR * (1.5 + S.collapse * 7);
    const bg = c.createRadialGradient(cx, cy, coreR * 0.8, cx, cy, br);
    bg.addColorStop(0, C1(S.collapse * 0.5, 78));
    bg.addColorStop(0.4, C2(S.collapse * 0.22, 60));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.beginPath();
    c.arc(cx, cy, br, 0, Math.PI * 2);
    c.fill();
  }

  if (hit) S.spin += 0.003 * hitE;
  if (beat) S.collapse = Math.max(S.collapse, bassV * 0.1);
};
