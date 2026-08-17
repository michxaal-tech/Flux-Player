import type { ThemeDraw } from "../themeTypes";

/** A rune, described in unit space (-0.5..0.5) and drawn procedurally. */
interface Glyph {
  /** flat line list: x1,y1,x2,y2,… */
  seg: number[];
  /** flat arc list: cx,cy,r,a0,a1,… */
  arc: number[];
  ph: number;
}
interface RuneRing {
  rad: number;
  dir: number;
  rot: number;
  g: Glyph[];
}
interface Bolt {
  /** preallocated point buffer, never regrown */
  pts: number[];
  a: number;
}
interface OracleState {
  rings: RuneRing[];
  bolts: Bolt[];
  mist: number;
}

const TAU = Math.PI * 2;
const RING_N = [10, 14, 8];       // 32 glyphs total, fixed
const RING_R = [0.3, 0.4, 0.49];
const BOLTS = 12;                 // hard cap on live arcs
const BSEG = 9;                   // segments per arc
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const rnd = (s: number) => {
  const v = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const snap = (v: number) => Math.round(v * 2) / 2 * 0.8;   // coarse grid → rune-like

/** Build one rune once, at init — never per frame. */
function makeGlyph(seed: number): Glyph {
  const seg: number[] = [];
  const arc: number[] = [];
  let s = seed * 7.13 + 3;
  // every rune has a stem
  const stemH = 0.3 + rnd(s++) * 0.2;
  seg.push(0, -stemH, 0, stemH);
  const n = 2 + ((rnd(s++) * 3) | 0);
  for (let i = 0; i < n; i++) {
    if (rnd(s++) < 0.62) {
      const y1 = snap(rnd(s++) - 0.5);
      const x2 = snap(rnd(s++) - 0.5);
      const y2 = snap(rnd(s++) - 0.5);
      seg.push(0, y1, x2, y2);
      if (rnd(s++) < 0.4) seg.push(0, y1, -x2, y2);        // mirrored limb
    } else {
      const a0 = rnd(s++) * TAU;
      arc.push(0, snap(rnd(s++) - 0.5) * 0.6, 0.16 + rnd(s++) * 0.2, a0, a0 + 1.2 + rnd(s++) * 2.6);
    }
  }
  return { seg, arc, ph: rnd(s) * TAU };
}

// A scrying orb inside a rune circle. Glyphs — drawn as procedural strokes and
// arcs, never text — orbit on counter-rotating rings while mist turns inside
// the sphere. Quiet passages barely move: a slow drift and a soft inner glow.
// Driving passages spin the rings hard, flare the runes on every beat and rake
// the orb's surface with crackling energy arcs.
export const ORACLE: ThemeDraw = ({
  c, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: OracleState = (L.scratch.oracle ??= {
    rings: RING_N.map((n, ri) => ({
      rad: RING_R[ri],
      dir: ri % 2 ? -1 : 1,
      rot: ri * 0.7,
      g: Array.from({ length: n }, (_, i) => makeGlyph(ri * 31 + i * 3 + 1)),
    })) as RuneRing[],
    bolts: Array.from({ length: BOLTS }, () => ({
      pts: new Array<number>((BSEG + 1) * 2).fill(0),
      a: 0,
    })) as Bolt[],
    mist: 0,
  });

  const eS = energy * energy;
  const hot = clamp01((energy - 0.32) / 0.5);               // 0 calm → 1 violent
  const orbR = R * (0.2 + bassV * 0.025 + beatE * 0.035 * I);
  S.mist += (0.004 + eS * 0.03) * cfg.speed;

  // ── the orb ──
  const og = c.createRadialGradient(cx, cy, 0, cx, cy, orbR);
  og.addColorStop(0, C1(0.3 + beatE * 0.35 + hot * 0.15, 92));
  og.addColorStop(0.45, CMix(0.5, 0.16 + beatE * 0.18, 58));
  og.addColorStop(0.86, C2(0.1 + hot * 0.1, 40));
  og.addColorStop(1, "transparent");
  c.fillStyle = og;
  c.beginPath();
  c.arc(cx, cy, orbR, 0, TAU);
  c.fill();

  // mist inside the glass — clipped once, four ellipses
  c.save();
  c.beginPath();
  c.arc(cx, cy, orbR * 0.98, 0, TAU);
  c.clip();
  for (let i = 0; i < 4; i++) {
    const a = S.mist * (0.6 + i * 0.35) + i * 1.7;
    const rx = orbR * (0.4 + (i % 3) * 0.2);
    const ry = orbR * (0.7 - (i % 2) * 0.28);
    c.fillStyle = CMix(i / 3, 0.05 + midV * 0.06 + beatE * 0.05, 62);
    c.beginPath();
    c.ellipse(cx + Math.cos(a) * orbR * 0.18, cy + Math.sin(a * 0.8) * orbR * 0.16, rx, ry, a, 0, TAU);
    c.fill();
  }
  c.restore();

  // rim
  c.strokeStyle = C1(0.3 + beatE * 0.35 + hot * 0.2, 78);
  c.lineWidth = (1 + beatE * 1.8 + hot) * TK;
  glow(Math.min(26, 10 + beatE * 14 + hot * 8), C1());
  c.beginPath();
  c.arc(cx, cy, orbR, 0, TAU);
  c.stroke();
  noGlow();

  // ── energy arcs across the surface ──
  const spawn = (jag: number) => {
    let idx = 0, lo = 2;
    for (let i = 0; i < S.bolts.length; i++) if (S.bolts[i].a < lo) { lo = S.bolts[i].a; idx = i; }
    const b = S.bolts[idx];
    const a0 = Math.random() * TAU;
    const a1 = a0 + (Math.PI * (0.3 + Math.random())) * (Math.random() < 0.5 ? -1 : 1);
    for (let i = 0; i <= BSEG; i++) {
      const t = i / BSEG;
      const ang = a0 + (a1 - a0) * t;
      const edge = i === 0 || i === BSEG ? 0 : 1;
      const rr = orbR * (0.99 - Math.sin(Math.PI * t) * 0.3) + (Math.random() - 0.5) * orbR * jag * edge;
      b.pts[i * 2] = cx + Math.cos(ang) * rr;
      b.pts[i * 2 + 1] = cy + Math.sin(ang) * rr;
    }
    b.a = 1;
  };
  if (beat) {
    const n = 1 + ((hot * 4) | 0);
    for (let i = 0; i < n; i++) spawn(0.1 + hot * 0.3);
  } else if (hot > 0.4 && Math.random() < hot * 0.35) {
    spawn(0.1 + hot * 0.3);                                 // continuous crackle at speed
  }
  const decay = 0.86 - hot * 0.1;
  let anyBolt = false;
  for (let i = 0; i < S.bolts.length; i++) if (S.bolts[i].a > 0.04) { anyBolt = true; break; }
  if (anyBolt) {
    c.lineCap = "round";
    glow(Math.min(24, 10 + hot * 12), C1());
    for (let i = 0; i < S.bolts.length; i++) {
      const b = S.bolts[i];
      if (b.a <= 0.04) { b.a = 0; continue; }
      c.strokeStyle = C1(b.a * (0.5 + hot * 0.5), 88);
      c.lineWidth = (0.8 + b.a * (0.8 + hot * 1.6)) * TK;
      c.beginPath();
      c.moveTo(b.pts[0], b.pts[1]);
      for (let k = 1; k <= BSEG; k++) c.lineTo(b.pts[k * 2], b.pts[k * 2 + 1]);
      c.stroke();
      b.a *= decay;
    }
    noGlow();
    c.lineCap = "butt";
  }

  // ── rune rings ──
  const spin = (0.0011 + eS * 0.028) * cfg.speed * (1 + beatE * hot * 2.2);
  for (let ri = 0; ri < S.rings.length; ri++) {
    const rg = S.rings[ri];
    rg.rot += rg.dir * spin * (1 + ri * 0.25);
    // the outer ward ring only materialises when the music drives
    const ringA = ri === 2 ? hot : 1;
    if (ringA < 0.03) continue;
    const rad = R * rg.rad * (1 + bassV * 0.03 + beatE * 0.02);

    // guide circles + ticks, one batched stroke
    const guide = new Path2D();
    for (const m of [0.945, 1.055]) {
      guide.moveTo(cx + rad * m, cy);
      guide.arc(cx, cy, rad * m, 0, TAU);
    }
    const ticks = rg.g.length * 2;
    for (let k = 0; k < ticks; k++) {
      const a = rg.rot * 0.5 + (k / ticks) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      guide.moveTo(cx + ca * rad * 0.945, cy + sa * rad * 0.945);
      guide.lineTo(cx + ca * rad * 1.055, cy + sa * rad * 1.055);
    }
    c.strokeStyle = C2(ringA * (0.12 + trebV * 0.12 + beatE * 0.16), 58);
    c.lineWidth = 0.7 * TK;
    c.stroke(guide);

    // glyphs: two batched paths (calm + flaring) so one glow set covers a ring
    const dim = new Path2D();
    const lit = new Path2D();
    const gs = R * (0.035 + rg.rad * 0.02);
    const step = TAU / rg.g.length;
    for (let i = 0; i < rg.g.length; i++) {
      const gl = rg.g[i];
      const ang = rg.rot + i * step;
      const pulse = 0.5 + 0.5 * Math.sin(vt * 0.04 * (1 + energy * 4) + gl.ph);
      const isLit = pulse > 0.74 - hot * 0.3 || (beatE > 0.4 && hot > 0.5);
      const sc = gs * (0.85 + pulse * 0.2 + beatE * hot * 0.45);
      const gx = cx + Math.cos(ang) * rad;
      const gy = cy + Math.sin(ang) * rad;
      const rot = ang + Math.PI * 0.5;                       // runes stand upright on the ring
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const P = isLit ? lit : dim;
      for (let k = 0; k < gl.seg.length; k += 4) {
        const x1 = gl.seg[k], y1 = gl.seg[k + 1], x2 = gl.seg[k + 2], y2 = gl.seg[k + 3];
        P.moveTo(gx + (x1 * cr - y1 * sr) * sc, gy + (x1 * sr + y1 * cr) * sc);
        P.lineTo(gx + (x2 * cr - y2 * sr) * sc, gy + (x2 * sr + y2 * cr) * sc);
      }
      for (let k = 0; k < gl.arc.length; k += 5) {
        const ax = gl.arc[k], ay = gl.arc[k + 1];
        const px = gx + (ax * cr - ay * sr) * sc;
        const py = gy + (ax * sr + ay * cr) * sc;
        const arr = gl.arc[k + 2] * sc;
        P.moveTo(px + Math.cos(gl.arc[k + 3] + rot) * arr, py + Math.sin(gl.arc[k + 3] + rot) * arr);
        P.arc(px, py, arr, gl.arc[k + 3] + rot, gl.arc[k + 4] + rot);
      }
    }
    glow(Math.min(22, 7 + hot * 10 + beatE * 8), CMix(ri / 2));
    c.strokeStyle = CMix(ri / 2, ringA * (0.28 + midV * 0.15), 62);
    c.lineWidth = (0.9 + hot * 0.3) * TK;
    c.stroke(dim);
    c.strokeStyle = CMix(ri / 2, ringA * (0.6 + beatE * 0.4), 82);
    c.lineWidth = (1.2 + hot * 0.9 + beatE * 1.2) * TK;
    c.stroke(lit);
    noGlow();
  }

  // pupil of the orb, breathing calmly / hammering on beats
  const pr = orbR * (0.13 + beatE * 0.16 + Math.sin(S.mist * 2) * 0.02);
  const pg = c.createRadialGradient(cx, cy, 0, cx, cy, pr * 3);
  pg.addColorStop(0, C1(0.5 + beatE * 0.4, 96));
  pg.addColorStop(0.3, C2(0.25 + beatE * 0.3, 74));
  pg.addColorStop(1, "transparent");
  c.fillStyle = pg;
  c.beginPath();
  c.arc(cx, cy, pr * 3, 0, TAU);
  c.fill();
};
