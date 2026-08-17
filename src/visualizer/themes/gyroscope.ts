import type { ThemeDraw } from "../themeTypes";

// GYROSCOPE — nested rotating gimbal rings around a suspended core, each ring
// spinning on its own axis. Fully 3D: ring points are built in their own plane,
// rotated by a per-ring axis pair, then projected, and the rings are painted in
// depth order so the near half of a ring covers the far half of the one inside.
//
// Layering: two rings and the core to start, more rings as the arrangement
// fills, then energy arcs jumping between rings, then a caged lattice. A drop
// spins every gimbal up hard and blows a discharge out through all of them.

const MAX_RINGS = 6;
const SEGS = 64;
const ARCS = 12;

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface Ring { ax: number; ay: number; sx: number; sy: number; r: number }
interface State {
  rings: Ring[];
  w2: number;
  w3: number;
  surge: number;
  arcSeed: number;
}

export const GYROSCOPE: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, freq, beat, beatE, energy, dropE, hit, hitE, cfg, bassV, midV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.gyroscope ??= {
    rings: [] as Ring[],
    w2: 0,
    w3: 0,
    surge: 0,
    arcSeed: 0,
  }) as State;

  if (S.rings.length === 0) {
    for (let i = 0; i < MAX_RINGS; i++) {
      S.rings.push({
        ax: Math.random() * Math.PI,
        ay: Math.random() * Math.PI,
        // alternating directions so neighbouring gimbals counter-rotate
        sx: (0.004 + i * 0.0016) * (i % 2 ? 1 : -1),
        sy: (0.003 + i * 0.0012) * (i % 3 ? -1 : 1),
        r: 0.32 + i * 0.17,
      });
    }
  }

  const t2 = cl01((energy - 0.28) / 0.28);
  const t3 = cl01((energy - 0.54) / 0.28);
  S.w2 += (t2 - S.w2) * 0.03;
  S.w3 += (t3 - S.w3) * 0.03;
  S.surge = Math.max(S.surge * 0.93, dropE);

  const camZ = 2.6 - energy * 0.15 - dropE * 0.5;
  const f = R * 0.95;

  /** point on ring `ri` at angle `a`, in its own tilted plane → screen + depth */
  const ringPoint = (ring: Ring, a: number, rMul: number): [number, number, number] => {
    // start in the ring's local XY plane
    let px = Math.cos(a) * ring.r * rMul;
    let py = Math.sin(a) * ring.r * rMul;
    let pz = 0;
    // rotate about X
    const cxr = Math.cos(ring.ax), sxr = Math.sin(ring.ax);
    let y2 = py * cxr - pz * sxr;
    let z2 = py * sxr + pz * cxr;
    py = y2; pz = z2;
    // then about Y
    const cyr = Math.cos(ring.ay), syr = Math.sin(ring.ay);
    const x2 = px * cyr + pz * syr;
    z2 = -px * syr + pz * cyr;
    px = x2; pz = z2 + camZ;
    if (pz < 0.05) return [0, 0, -1];
    return [cx + (f * px) / pz, cy - (f * py) / pz, pz];
  };

  // how many rings are showing right now
  const active = 2 + Math.round(S.w2 * 2) + Math.round(S.w3 * 2);
  const bins = freq.length;

  for (let i = 0; i < MAX_RINGS; i++) {
    const ring = S.rings[i];
    const spinK = 1 + energy * 1.6 + S.surge * 6;
    ring.ax += ring.sx * cfg.speed * spinK;
    ring.ay += ring.sy * cfg.speed * spinK;
  }

  // ── core ───────────────────────────────────────────────────────────────
  const coreR = R * (0.05 + bassV * 0.05 + beatE * 0.025 + S.surge * 0.1);
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
  cg.addColorStop(0, C1(0.55 + S.surge * 0.3, 74));
  cg.addColorStop(0.4, C2(0.22, 56));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
  c.fill();

  // ── the rings ──────────────────────────────────────────────────────────
  // Each ring is split into a far half and a near half so the core sits
  // *inside* the cage rather than always on top of it.
  for (let i = 0; i < active && i < MAX_RINGS; i++) {
    const ring = S.rings[i];
    const bin = Math.min(bins - 1, 4 + i * 9);
    const lvl = (freq[bin] ?? 0) / 255;
    const rMul = 1 + lvl * 0.1 + beatE * 0.03 + S.surge * 0.25;
    const shade = i / Math.max(1, MAX_RINGS - 1);

    for (const pass of [0, 1]) {
      c.beginPath();
      let started = false;
      for (let k = 0; k <= SEGS; k++) {
        const a = (k / SEGS) * Math.PI * 2;
        const p = ringPoint(ring, a, rMul);
        if (p[2] < 0) { started = false; continue; }
        // pass 0 = behind the core, pass 1 = in front
        const behind = p[2] > camZ;
        if ((pass === 0) !== behind) { started = false; continue; }
        if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
      }
      c.strokeStyle = CMix(shade, (pass === 0 ? 0.16 : 0.5) + lvl * 0.35 + beatE * 0.1, 44 + lvl * 26);
      c.lineWidth = (0.8 + lvl * 2.4) * (pass === 0 ? 0.7 : 1) * TK;
      c.stroke();
    }

    // node markers riding each ring, so rotation is legible
    const na = vt * 0.02 * (i % 2 ? 1 : -1);
    const np = ringPoint(ring, na, rMul);
    if (np[2] > 0) {
      c.fillStyle = C1(0.5 + trebV * 0.4, 72);
      const nr = Math.max(1, (R * 0.011 * (1 + beatE * 0.6)) / np[2]);
      c.beginPath();
      c.arc(np[0], np[1], nr, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ── layer 3: energy arcs jumping between neighbouring rings ────────────
  if (S.w3 > 0.05) {
    if (hit) S.arcSeed = (S.arcSeed + 1) % 997;
    glow(Math.min(22, 10 + hitE * 14), C1());
    c.strokeStyle = C1(S.w3 * (0.3 + hitE * 0.6), 74);
    c.lineWidth = (0.9 + hitE * 2) * TK;
    c.beginPath();
    for (let i = 0; i < ARCS; i++) {
      const ri = i % Math.max(1, active - 1);
      const a = ((i * 2.399 + S.arcSeed * 0.7 + vt * 0.01) % (Math.PI * 2));
      const p0 = ringPoint(S.rings[ri], a, 1);
      const p1 = ringPoint(S.rings[ri + 1], a + 0.6, 1);
      if (p0[2] < 0 || p1[2] < 0) continue;
      c.moveTo(p0[0], p0[1]);
      // a slight bow, so arcs read as discharges rather than as struts
      const mx = (p0[0] + p1[0]) / 2 + Math.sin(a * 3) * R * 0.03;
      const my = (p0[1] + p1[1]) / 2 + Math.cos(a * 3) * R * 0.03;
      c.quadraticCurveTo(mx, my, p1[0], p1[1]);
    }
    c.stroke();
    noGlow();
  }

  // ── drop: discharge through every ring ─────────────────────────────────
  if (S.surge > 0.1) {
    const spokes = 20;
    glow(Math.min(26, 12 + S.surge * 16), C2());
    c.strokeStyle = C2(S.surge * 0.55, 76);
    c.lineWidth = (1 + S.surge * 3.5) * TK;
    c.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + vt * 0.01;
      const r1 = R * (0.1 + S.surge * 0.9);
      c.moveTo(cx + Math.cos(a) * coreR, cy + Math.sin(a) * coreR);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    c.stroke();
    noGlow();
  }

  if (beat) S.surge = Math.max(S.surge, midV * 0.12);
};
