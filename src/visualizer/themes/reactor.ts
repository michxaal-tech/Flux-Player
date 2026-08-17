import type { ThemeDraw } from "../themeTypes";

interface Ring {
  /** tilt phase — drives the ellipse squash */
  tilt: number;
  /** current rotation */
  rot: number;
  /** rotation direction */
  dir: number;
  /** radius multiplier */
  rad: number;
  /** containment strain, 0 = stable, 1 = about to let go */
  strain: number;
}
interface Arc {
  /** launch angle off the core */
  ang: number;
  len: number;
  a: number;
  seed: number;
}
interface Flare {
  r: number;
  a: number;
}

const RINGS = 4;
const CONDUITS = 8;
const CORE_SEGS = 48;     // fixed: the plasma outline costs the same at any canvas size
const MAX_ARCS = 10;
const MAX_FLARES = 5;
const ARC_SEGS = 7;

// A containment reactor. A churning plasma sphere is held inside counter-
// rotating magnetic rings while conduits pump charge into it from the frame
// edge. Idling (calm passage) the core breathes slowly, the rings glide, and
// the glow is a steady hum. Under load it overloads: the core swells and
// boils, the rings wobble and fight their orbits, warning flares hammer out of
// the vessel and arcs tear free of the field on every beat.
export const REACTOR: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.reactor ??= {
    rings: [] as Ring[],
    arcs: [] as Arc[],
    flares: [] as Flare[],
    coreR: 0,
    overload: 0,
    pulse: 0,
    spin: 0,
  });

  const rings: Ring[] = S.rings;
  const arcs: Arc[] = S.arcs;
  const flares: Flare[] = S.flares;
  if (rings.length === 0) {
    for (let i = 0; i < RINGS; i++) {
      rings.push({
        tilt: (i / RINGS) * Math.PI,
        rot: (i / RINGS) * Math.PI * 1.3,
        dir: i % 2 === 0 ? 1 : -1,
        rad: 0.3 + i * 0.115,
        strain: 0,
      });
    }
  }

  const E = energy;
  // overload creeps up with sustained energy and spikes on hits
  S.overload += ((E * 0.85 + bassV * 0.15) - S.overload) * 0.06;
  const OV = S.overload;
  S.spin += (0.004 + E * 0.03) * cfg.speed;
  S.pulse += (0.02 + E * 0.06) * cfg.speed;

  // ── plasma core ───────────────────────────────────────────────────────────
  const target = R * (0.15 + OV * 0.1 + bassV * 0.05) * (1 + beatE * (0.12 + OV * 0.3));
  S.coreR += (target - S.coreR) * 0.18;
  const cr = S.coreR || target;

  const halo = cr * (2.6 + OV * 1.4 + beatE * 0.8);
  const hg = c.createRadialGradient(cx, cy, cr * 0.2, cx, cy, halo);
  hg.addColorStop(0, C1(0.3 + OV * 0.16 + beatE * 0.14, 66 + OV * 8));
  hg.addColorStop(0.35, C2(0.16 + OV * 0.1, 50));
  hg.addColorStop(1, "transparent");
  c.fillStyle = hg;
  c.beginPath();
  c.arc(cx, cy, halo, 0, Math.PI * 2);
  c.fill();

  // churning boundary: sum of a few sines, frequency and amplitude both climb
  // hard with energy so a calm core barely ripples and a hot one boils
  const churnA = cr * (0.04 + OV * 0.19 + beatE * 0.12);
  const churnF = 3 + OV * 7;
  c.beginPath();
  for (let i = 0; i <= CORE_SEGS; i++) {
    const a = (i / CORE_SEGS) * Math.PI * 2;
    const r =
      cr +
      Math.sin(a * churnF + S.pulse * 2.1) * churnA +
      Math.sin(a * (churnF * 0.53 + 2) - S.pulse * 1.6) * churnA * 0.6 +
      Math.cos(a * 2 + S.pulse * 0.7) * cr * 0.03;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  const pg = c.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.25);
  pg.addColorStop(0, C1(0.5 + beatE * 0.16, 72));
  pg.addColorStop(0.5, CMix(0.5, 0.38 + OV * 0.12, 56));
  pg.addColorStop(1, C2(0.22, 36));
  c.fillStyle = pg;
  c.fill();
  glow(Math.min(26, 12 + OV * 10 + beatE * 8), C1());
  c.strokeStyle = C1(0.34 + beatE * 0.24, 70);
  c.lineWidth = (1 + OV * 1.6 + beatE * 2) * TK;
  c.stroke();
  noGlow();

  // ── energy conduits feeding the vessel ────────────────────────────────────
  const conduitR = R * 0.62;
  c.lineCap = "round";
  c.beginPath();
  for (let i = 0; i < CONDUITS; i++) {
    const a = (i / CONDUITS) * Math.PI * 2 + S.spin * 0.25;
    const co = Math.cos(a), si = Math.sin(a);
    c.moveTo(cx + co * conduitR, cy + si * conduitR);
    c.lineTo(cx + co * cr * 1.05, cy + si * cr * 1.05);
  }
  c.strokeStyle = C2(0.16 + midV * 0.1, 42);
  c.lineWidth = (1.4 + E * 1.2) * TK;
  c.stroke();

  // charge packets running down the conduits — three per conduit, phase-offset
  glow(Math.min(20, 9 + beatE * 8), C2());
  c.beginPath();
  const flow = (S.pulse * (0.12 + E * 0.5)) % 1;
  for (let i = 0; i < CONDUITS; i++) {
    const a = (i / CONDUITS) * Math.PI * 2 + S.spin * 0.25;
    const co = Math.cos(a), si = Math.sin(a);
    for (let k = 0; k < 3; k++) {
      const t = 1 - ((flow + k / 3 + i * 0.11) % 1);      // 1 at rim → 0 at core
      const rr = cr * 1.05 + t * (conduitR - cr * 1.05);
      const seg = R * (0.014 + E * 0.03);
      c.moveTo(cx + co * rr, cy + si * rr);
      c.lineTo(cx + co * (rr - seg), cy + si * (rr - seg));
    }
  }
  c.strokeStyle = C2(0.3 + E * 0.22 + beatE * 0.2, 68);
  c.lineWidth = (1.6 + E * 1.8 + beatE * 1.4) * TK;
  c.stroke();
  noGlow();
  c.lineCap = "butt";

  // ── containment rings ─────────────────────────────────────────────────────
  glow(Math.min(24, 8 + OV * 10 + beatE * 8), C1());
  for (let i = 0; i < RINGS; i++) {
    const rg = rings[i];
    rg.rot += rg.dir * (0.006 + OV * 0.05 + beatE * 0.03 * OV) * cfg.speed;
    rg.tilt += rg.dir * (0.004 + OV * 0.024) * cfg.speed;
    // strain: rings shudder and lose their circle as the core pushes out
    const want = OV * (0.4 + (i / RINGS) * 0.6) + beatE * OV * 0.7;
    rg.strain += (want - rg.strain) * 0.12;

    const rr = R * rg.rad * (1 + beatE * 0.05 + OV * 0.06);
    const squash = 0.16 + Math.abs(Math.cos(rg.tilt)) * 0.84;
    const wob = rg.strain * rr * 0.13;
    c.beginPath();
    const SEG = 40;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const dr =
        rr +
        Math.sin(a * 3 + vt * 0.06 + i) * wob +
        Math.sin(a * 5 - vt * 0.09) * wob * 0.5;
      const x = Math.cos(a) * dr;
      const y = Math.sin(a) * dr * squash;
      const ca = Math.cos(rg.rot), sa = Math.sin(rg.rot);
      const px = cx + x * ca - y * sa;
      const py = cy + x * sa + y * ca;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    const f = i / (RINGS - 1);
    c.strokeStyle = CMix(f, 0.2 + rg.strain * 0.22 + beatE * 0.16, 48 + f * 16 + OV * 8);
    c.lineWidth = (1 + (1 - f) * 1.4 + beatE * 1.2) * TK;
    c.stroke();
  }
  noGlow();

  // ── warning flares ────────────────────────────────────────────────────────
  if (beat && flares.length < MAX_FLARES) {
    flares.push({ r: cr * 1.1, a: (0.4 + OV * 0.6) * I });
  }
  if (flares.length) {
    glow(Math.min(22, 10 + beatE * 10), C2());
    c.lineWidth = (1.4 + OV * 2.4) * TK;
    for (let i = flares.length - 1; i >= 0; i--) {
      const fl = flares[i];
      fl.r += R * (0.012 + OV * 0.045) * cfg.speed;
      fl.a *= 0.9 - OV * 0.03;
      if (fl.a < 0.04 || fl.r > R * 1.2) { flares.splice(i, 1); continue; }
      c.strokeStyle = C2(fl.a * 0.42, 64);
      c.beginPath();
      c.arc(cx, cy, fl.r, 0, Math.PI * 2);
      c.stroke();
    }
    noGlow();
  }

  // ── arcs escaping containment (only once the vessel is really loaded) ─────
  if (beat && OV > 0.32) {
    const n = Math.min(1 + Math.round(OV * 4), MAX_ARCS - arcs.length);
    for (let k = 0; k < n; k++) {
      arcs.push({
        ang: Math.random() * Math.PI * 2,
        len: R * (0.18 + Math.random() * 0.4) * (0.5 + OV),
        a: 0.75 + Math.random() * 0.25,
        seed: Math.random() * 100,
      });
    }
  }
  if (arcs.length) {
    glow(Math.min(24, 12 + beatE * 10), C1());
    c.lineCap = "round";
    c.beginPath();
    for (let i = arcs.length - 1; i >= 0; i--) {
      const ar = arcs[i];
      ar.a *= 0.86;
      if (ar.a < 0.06) { arcs.splice(i, 1); continue; }
      const co = Math.cos(ar.ang), si = Math.sin(ar.ang);
      let px = cx + co * cr, py = cy + si * cr;
      c.moveTo(px, py);
      for (let k = 1; k <= ARC_SEGS; k++) {
        const t = k / ARC_SEGS;
        const rr = cr + ar.len * t;
        const j = Math.sin(ar.seed + k * 2.7 + vt * 0.4) * R * 0.05 * (1 - t) * (0.5 + OV);
        px = cx + co * rr - si * j;
        py = cy + si * rr + co * j;
        c.lineTo(px, py);
      }
    }
    c.strokeStyle = C1(0.3 + OV * 0.2 + trebV * 0.12, 70);
    c.lineWidth = (0.9 + OV * 1.5) * TK;
    c.stroke();
    c.lineCap = "butt";
    noGlow();
  }
};
