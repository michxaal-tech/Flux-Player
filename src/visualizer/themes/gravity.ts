import type { ThemeDraw } from "../themeTypes";

interface Orbiter {
  /** rest semi-major axis / eccentricity (fraction of R) */
  a0: number;
  e0: number;
  /** live, perturbed values */
  a: number;
  e: number;
  /** argument of periapsis */
  om: number;
  /** true anomaly */
  th: number;
  dir: number;
  sz: number;
  hue: number;
  /** fade-in so new bodies don't pop */
  fi: number;
}

interface Ring {
  r: number; a: number; sp: number;
}

const TAU = Math.PI * 2;
const MAX_ORBS = 220;
const PATHS = 20;   // how many orbits draw their own ellipse
const CORE_A = 0.055;
const KEP = 0.0019; // angular-rate constant

// Pre-rendered body glow — one drawImage per orbiter instead of one
// shadowBlur'd arc per orbiter (there can be 200 of them).
let bodyCv: HTMLCanvasElement | null = null;
let bodyKey = "";
function bodySprite(color: string): HTMLCanvasElement {
  if (bodyCv && bodyKey === color) return bodyCv;
  bodyKey = color;
  const cv = bodyCv ?? document.createElement("canvas");
  cv.width = cv.height = 40;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 40, 40);
  const rg = g.createRadialGradient(20, 20, 0, 20, 20, 20);
  rg.addColorStop(0, "rgba(255,255,255,0.95)");
  rg.addColorStop(0.28, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 40, 40);
  bodyCv = cv;
  return cv;
}

// A massive central body with a swarm on true Kepler ellipses: each orbiter
// carries its own semi-major axis and eccentricity, sweeps faster at periapsis,
// and the nearest orbits draw the ellipse they are actually riding. Every beat
// fires a gravitational pulse that kicks eccentricity up, so you watch the drawn
// paths stretch. In calm passages the swarm is sparse, wide, near-circular and
// relaxes straight back to its elegant rest orbits. When the music drives, the
// core throbs, orbits decay every frame, bodies spiral all the way in and get
// slingshot back out on wild eccentric arcs.
export const GRAVITY: ThemeDraw = ({
  c, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.gravity ??= {
    orbs: [] as Orbiter[],
    rings: [] as Ring[],
    flash: 0,
  });
  const orbs: Orbiter[] = S.orbs;
  const rings: Ring[] = S.rings;

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  const mk = (): Orbiter => {
    const a0 = 0.15 + Math.random() * 0.32;
    return {
      a0,
      e0: 0.04 + Math.random() * 0.22,
      a: a0,
      e: 0.04 + Math.random() * 0.22,
      om: Math.random() * TAU,
      th: Math.random() * TAU,
      dir: Math.random() < 0.78 ? 1 : -1,
      sz: 1 + Math.random() * 2.2,
      hue: Math.random(),
      fi: 0,
    };
  };

  // sparse and elegant when calm, crowded when driving
  const target = Math.min(MAX_ORBS, Math.round(55 + E * 155));
  if (orbs.length < target) for (let k = 0; k < 3 && orbs.length < target; k++) orbs.push(mk());
  else if (orbs.length > target) orbs.pop();

  // --- central mass ---
  const throb = E2 * Math.sin(vt * 0.13 * sp) * 0.35;
  const coreR = R * (0.05 + bassV * 0.035) * (1 + beatE * (0.4 + E) + throb);
  S.flash *= 0.88;
  if (beat) {
    S.flash = Math.min(1, S.flash + 0.5 + E * 0.5);
    if (rings.length < 7) rings.push({ r: coreR, a: 0.55 + E * 0.45, sp: R * (0.012 + E * 0.03) });
  }

  // --- orbit paths (only the first PATHS orbiters, so cost is fixed) ---
  const npath = Math.min(PATHS, orbs.length);
  c.lineWidth = Math.max(0.4, 0.8 * TK);
  for (let i = 0; i < npath; i++) {
    const o = orbs[i];
    const e = o.e > 0.9 ? 0.9 : o.e;
    const ra = o.a * R;
    const rb = ra * Math.sqrt(Math.max(0.02, 1 - e * e));
    const ex = cx - ra * e * Math.cos(o.om);
    const ey = cy - ra * e * Math.sin(o.om);
    c.strokeStyle = CMix(o.hue, (0.1 + o.e * 0.3 + beatE * 0.25) * (0.4 + I * 0.6), 60);
    c.beginPath();
    c.ellipse(ex, ey, ra, rb, o.om, 0, TAU);
    c.stroke();
  }

  // --- bodies + comet tails ---
  const spr = bodySprite(C1(0.9, 76));
  const decay = (0.00015 + E2 * 0.0055) * sp;
  const relax = 0.05 * (1 - E * 0.9);
  const rate = KEP * sp * (0.55 + E * 1.7);
  const TSEG = 4;
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    if (o.fi < 1) o.fi = Math.min(1, o.fi + 0.03);

    if (beat) {
      const kick = (0.05 + E * 0.32) * I * (0.5 + Math.random() * 0.9);
      o.e += kick;
      o.a *= 1 + kick * 0.55;
    }
    // calm: springs back to its rest orbit. driving: perturbation sticks and
    // the orbit decays inward until the core slingshots it out again.
    o.e += (o.e0 - o.e) * relax;
    o.a += (o.a0 - o.a) * relax;
    o.a *= 1 - decay;
    if (o.e > 0.88) o.e = 0.88;
    if (o.e < 0.01) o.e = 0.01;
    if (o.a > 0.7) o.a = 0.7; // repeated kicks must not balloon an orbit forever

    if (o.a < CORE_A) {
      // flung out
      o.a = o.a0 * (1 + Math.random() * 1.1);
      o.e = 0.4 + Math.random() * 0.45;
      o.om = Math.random() * TAU;
      o.th = Math.random() * TAU;
      o.hue = Math.random();
      S.flash = Math.min(1, S.flash + 0.25);
    }

    const semi = o.a * (1 - o.e * o.e);
    const denom = 1 + o.e * Math.cos(o.th);
    const rn = semi / (denom > 0.06 ? denom : 0.06);
    let dth = (rate * Math.sqrt(Math.max(1e-4, semi))) / Math.max(1e-4, rn * rn);
    if (dth > 0.3) dth = 0.3;
    o.th += dth * o.dir;
    if (o.th > TAU) o.th -= TAU;
    if (o.th < 0) o.th += TAU;

    const ang = o.th + o.om;
    const rr = rn * R;
    const px = cx + Math.cos(ang) * rr;
    const py = cy + Math.sin(ang) * rr;
    const a = o.fi * (0.5 + midV * 0.4 + beatE * 0.3) * (0.4 + I * 0.7);

    // tail: sample the same ellipse backwards in anomaly — zero allocation,
    // and it naturally lengthens where the body is moving fastest
    const back = dth * (5 + E * 6) * o.dir;
    c.strokeStyle = CMix(o.hue, a * 0.5, 62 + beatE * 12);
    c.lineWidth = Math.max(0.5, o.sz * 0.7 * TK);
    c.beginPath();
    c.moveTo(px, py);
    for (let s2 = 1; s2 <= TSEG; s2++) {
      const th2 = o.th - back * s2;
      const d2 = 1 + o.e * Math.cos(th2);
      const r2 = (semi / (d2 > 0.06 ? d2 : 0.06)) * R;
      c.lineTo(cx + Math.cos(th2 + o.om) * r2, cy + Math.sin(th2 + o.om) * r2);
    }
    c.stroke();

    const rad = o.sz * TK * (2.4 + beatE * 1.2);
    c.globalAlpha = Math.min(1, a * 1.5);
    c.drawImage(spr, px - rad, py - rad, rad * 2, rad * 2);
  }
  c.globalAlpha = 1;

  // --- gravitational pulse rings ---
  if (rings.length) {
    glow(Math.min(26, 14 * (1 + beatE)), C2());
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg2 = rings[i];
      rg2.r += rg2.sp * sp * (1 + E);
      rg2.a *= 0.9;
      if (rg2.a < 0.04 || rg2.r > R * 1.1) { rings.splice(i, 1); continue; }
      c.strokeStyle = C2(rg2.a * 0.6, 78);
      c.lineWidth = (1 + rg2.a * 3) * TK;
      c.beginPath();
      c.arc(cx, cy, rg2.r, 0, TAU);
      c.stroke();
    }
    noGlow();
  }

  // --- the massive body itself, drawn last so it sits on top ---
  const halo = coreR * (3.2 + S.flash * 1.4);
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, halo);
  cg.addColorStop(0, C1(0.95, 92));
  cg.addColorStop(0.18, C1(0.7 + S.flash * 0.3, 74 + S.flash * 14));
  cg.addColorStop(0.45, CMix(0.6, 0.25 + S.flash * 0.25, 58));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, halo, 0, TAU);
  c.fill();
  // accretion glint ring, wobbling harder the busier the music gets
  c.strokeStyle = C2(0.35 + beatE * 0.5 + E * 0.2, 84);
  c.lineWidth = (1 + beatE * 2.5) * TK;
  glow(Math.min(30, 18 * (1 + beatE + E)), C1());
  c.beginPath();
  c.ellipse(
    cx, cy,
    coreR * (1.5 + trebV * 0.3),
    coreR * (0.5 + Math.abs(Math.sin(vt * 0.01 * sp)) * (0.5 + E * 0.6)),
    vt * 0.006 * sp * (1 + E * 2), 0, TAU,
  );
  c.stroke();
  noGlow();
};
