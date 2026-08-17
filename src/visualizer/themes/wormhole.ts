import type { ThemeDraw } from "../themeTypes";

interface Matter {
  /** angle around the funnel */
  a: number;
  /** radius in the funnel's own (undistorted) plane, 1 = mouth, 0 = singularity */
  r: number;
  /** trailing radius, for the streak */
  pr: number;
  pa: number;
  hue: number;
  sz: number;
}

interface Lens {
  /** 0 → 1 as the ring expands out of the throat */
  p: number;
  a: number;
}

const RINGS = 17;
const SPOKES = 24;
const MAX_MATTER = 240;
const MAX_LENS = 8;
const TAU = Math.PI * 2;

// A spacetime funnel seen down its throat. A polar grid recedes into the
// singularity: each ring sits at a depth z, its screen radius set by a
// perspective divide, and the whole sheet is twisted by an amount that grows
// with depth — so the tunnel visibly winds. A lensing term bends radii near the
// throat, and matter streams spiral in on conserved angular momentum (dθ ∝ 1/r²),
// which makes them whip round faster and faster as they fall.
// Calm music: a wide, shallow, barely-twisted funnel drifting gently past.
// Driving music: the mouth clamps down, the twist multiplies, the whole grid
// accelerates inward, lensing rings strobe out of the throat on every beat and
// matter is torn in as long stretched streaks.
export const WORMHOLE: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.wormhole ??= {
    matter: [] as Matter[],
    lens: [] as Lens[],
    /** grid travel, in ring-slots */
    z: 0,
    /** accumulated twist so the funnel never snaps back */
    tw: 0,
    flash: 0,
  });
  const matter: Matter[] = S.matter;
  const lens: Lens[] = S.lens;

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  // --- funnel shape: wide and calm → narrow and violent ---
  const mouth = R * (0.62 - E * 0.16);            // screen radius of the near ring
  const throat = R * (0.05 - E * 0.028) + 2;      // singularity radius
  const twistK = (0.28 + E2 * 2.6) * (0.4 + I * 0.8);
  S.z += (0.006 + E2 * 0.062) * sp * (1 + bassV * 0.6 + beatE * (0.4 + E * 1.6));
  S.tw += (0.002 + E2 * 0.03) * sp;
  S.flash *= 0.88;
  if (beat) {
    S.flash = Math.min(1, S.flash + 0.4 + E * 0.5);
    if (lens.length < MAX_LENS) lens.push({ p: 0, a: 0.5 + E * 0.45 });
  }

  // depth 0..1 → screen radius. Non-linear so the throat crowds up near the
  // centre the way a real perspective tunnel does.
  const dz = S.z % 1;
  const rad = (f: number) => {
    const g = f * f * f; // f = 0 at throat, 1 at mouth
    return throat + (mouth - throat) * g;
  };
  // gravitational lensing: radii just outside the throat get pushed outward
  const lensStr = R * (0.012 + E * 0.05) * (1 + beatE * 1.2 + S.flash * 0.8);
  const bend = (r: number) => r + lensStr / (1 + (r / Math.max(1, throat)) * 0.9);
  const twistOf = (f: number) => S.tw + (1 - f) * (1 - f) * twistK * 6;

  // --- painted background: dark rim, hot throat. opaque, never additive ---
  c.globalCompositeOperation = "source-over";
  const bgr = Math.max(R * 0.6, Math.sqrt(w * w + h * h) * 0.5);
  const bg = c.createRadialGradient(cx, cy, 0, cx, cy, bgr);
  bg.addColorStop(0, C1(1, Math.min(70, 24 + E * 18 + S.flash * 16)));
  bg.addColorStop(0.09, CMix(0.5, 1, 14 + E * 10 + S.flash * 8));
  bg.addColorStop(0.42, CMix(0.85, 1, 7 + E * 4));
  bg.addColorStop(1, CMix(1, 1, 2 + E * 2));
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  c.globalCompositeOperation = "lighter";

  // --- the warped grid: every ring in ONE path, every spoke in ONE path ---
  const gridA = (0.13 + E * 0.14 + beatE * 0.1) * (0.4 + I * 0.7);
  c.beginPath();
  for (let i = 0; i < RINGS; i++) {
    const f = (i + dz) / RINGS;
    if (f <= 0.001) continue;
    const r0 = bend(rad(f));
    const tw = twistOf(f);
    // rings are drawn as polygons so the twist actually shows on them
    for (let s = 0; s <= SPOKES; s++) {
      const a = (s / SPOKES) * TAU + tw;
      // the sheet is not perfectly round when the music drives — it buckles
      const buck = 1 + Math.sin(a * 3 + vt * 0.03 * sp + f * 5) * E2 * 0.16;
      const px = cx + Math.cos(a) * r0 * buck;
      const py = cy + Math.sin(a) * r0 * buck * 0.94;
      if (s === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
  }
  c.strokeStyle = CMix(0.3, gridA, 56 + E * 10);
  c.lineWidth = Math.max(0.4, (0.8 + E * 0.5) * TK);
  c.stroke();

  c.beginPath();
  for (let s = 0; s < SPOKES; s++) {
    for (let i = 0; i < RINGS; i++) {
      const f = (i + dz) / RINGS;
      if (f <= 0.001) continue;
      const tw = twistOf(f);
      const a = (s / SPOKES) * TAU + tw;
      const r0 = bend(rad(f));
      const buck = 1 + Math.sin(a * 3 + vt * 0.03 * sp + f * 5) * E2 * 0.16;
      const px = cx + Math.cos(a) * r0 * buck;
      const py = cy + Math.sin(a) * r0 * buck * 0.94;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
  }
  c.strokeStyle = CMix(0.75, gridA * 0.8, 52 + E * 10);
  c.lineWidth = Math.max(0.4, (0.7 + E * 0.5) * TK);
  c.stroke();

  // --- matter streams ---
  const target = Math.min(MAX_MATTER, Math.round(40 + E * 195));
  if (matter.length < target) {
    for (let k = 0; k < 4 && matter.length < target; k++) {
      const a = Math.random() * TAU;
      matter.push({ a, r: 0.92 + Math.random() * 0.16, pr: 1, pa: a, hue: Math.random(), sz: 0.6 + Math.random() * 1.8 });
    }
  } else if (matter.length > target) {
    matter.pop();
  }

  const fall = (0.0018 + E2 * 0.019) * sp * (1 + beatE * (0.5 + E * 2));
  const swirl = (0.0009 + E * 0.006) * sp;
  c.beginPath();
  for (let i = 0; i < matter.length; i++) {
    const m = matter[i];
    m.pr = m.r;
    m.pa = m.a;
    m.r -= fall * (0.5 + m.r * 0.8);
    // conserved angular momentum: the deeper it falls the faster it whips round
    const rr = m.r > 0.06 ? m.r : 0.06;
    let dth = swirl / (rr * rr);
    if (dth > 0.42) dth = 0.42;
    m.a += dth;
    if (m.r <= 0.04) {
      m.r = 1 + Math.random() * 0.2;
      m.pr = m.r;
      m.a = Math.random() * TAU;
      m.pa = m.a;
      m.hue = Math.random();
      S.flash = Math.min(1, S.flash + 0.02);
      continue;
    }
    const f1 = m.r, f0 = m.pr;
    const r1 = bend(rad(f1)), r0 = bend(rad(f0));
    const a1 = m.a + twistOf(f1), a0 = m.pa + twistOf(f0);
    // stretch the streak when the fall is violent
    const st = 1 + E * 2.6 + beatE * 1.5;
    const sx = cx + Math.cos(a0) * r0, sy = cy + Math.sin(a0) * r0 * 0.94;
    const ex = cx + Math.cos(a1) * r1, ey = cy + Math.sin(a1) * r1 * 0.94;
    c.moveTo(ex + (sx - ex) * st, ey + (sy - ey) * st);
    c.lineTo(ex, ey);
  }
  c.strokeStyle = C2((0.22 + E * 0.26 + beatE * 0.18) * (0.4 + I * 0.7), 62 + E * 8);
  c.lineWidth = Math.max(0.5, (0.9 + E * 1.1 + beatE * 0.8) * TK);
  c.lineCap = "round";
  glow(Math.min(18, (6 + E * 8) * (1 + beatE * 0.6)), C2());
  c.stroke();
  noGlow();
  c.lineCap = "butt";

  // hot heads on the innermost matter only — a fixed, small slice of the array
  c.beginPath();
  let heads = 0;
  for (let i = 0; i < matter.length && heads < 60; i++) {
    const m = matter[i];
    if (m.r > 0.34) continue;
    heads++;
    const r1 = bend(rad(m.r));
    const a1 = m.a + twistOf(m.r);
    const px = cx + Math.cos(a1) * r1, py = cy + Math.sin(a1) * r1 * 0.94;
    const rr = Math.max(0.6, m.sz * TK * (0.9 + E * 0.9));
    c.moveTo(px + rr, py);
    c.arc(px, py, rr, 0, TAU);
  }
  if (heads) {
    c.fillStyle = C1(Math.min(0.7, (0.3 + E * 0.3 + beatE * 0.25) * (0.4 + I * 0.7)), 74);
    c.fill();
  }

  // --- lensing rings strobing out of the throat ---
  if (lens.length) {
    glow(Math.min(26, (10 + E * 12) * (1 + beatE)), C1());
    for (let i = lens.length - 1; i >= 0; i--) {
      const ln = lens[i];
      ln.p += (0.012 + E * 0.05) * sp;
      ln.a *= 0.9 - E * 0.03;
      if (ln.a < 0.04 || ln.p > 1) { lens.splice(i, 1); continue; }
      const r1 = bend(rad(Math.min(1, ln.p)));
      c.strokeStyle = C1(ln.a * 0.5, 76);
      c.lineWidth = Math.max(0.7, (1 + ln.a * 3 + E * 1.5) * TK);
      c.beginPath();
      c.ellipse(cx, cy, r1, r1 * 0.94, 0, 0, TAU);
      c.stroke();
    }
    noGlow();
  }

  // --- the singularity itself: bright but small, so the frame never washes out ---
  const core = throat * (1.5 + bassV * 0.6 + beatE * (0.5 + E));
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, core * 3.4);
  cg.addColorStop(0, C1(0.85, 78));
  cg.addColorStop(0.22, C1(0.5 + S.flash * 0.25, 66));
  cg.addColorStop(0.6, CMix(0.5, 0.18 + S.flash * 0.16, 50));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, core * 3.4, 0, TAU);
  c.fill();

  // photon ring: the tell-tale sharp circle just outside the horizon
  c.strokeStyle = C2(Math.min(0.75, 0.3 + beatE * 0.35 + E * 0.15), 80);
  c.lineWidth = Math.max(0.6, (0.9 + beatE * 2 + E) * TK);
  glow(Math.min(24, 14 * (1 + beatE + E * 0.5)), C1());
  c.beginPath();
  c.ellipse(
    cx, cy,
    core * (1.9 + trebV * 0.25),
    core * (1.9 + trebV * 0.25) * (0.94 - E2 * 0.25),
    S.tw * (0.5 + E * 2), 0, TAU,
  );
  c.stroke();
  noGlow();

  // driving-only shear streaks tearing across the mouth
  if (E > 0.55) {
    const k = (E - 0.55) * 2.2;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + S.tw * 1.6 + vt * 0.004 * sp;
      const r0 = mouth * (0.9 + Math.sin(vt * 0.05 + i) * 0.12);
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.94);
      c.lineTo(cx + Math.cos(a + 0.45) * throat * 4, cy + Math.sin(a + 0.45) * throat * 4 * 0.94);
    }
    c.strokeStyle = CMix(0.2, Math.min(0.3, k * (0.1 + midV * 0.12)), 62);
    c.lineWidth = Math.max(0.4, (0.7 + k) * TK);
    c.stroke();
  }
};
