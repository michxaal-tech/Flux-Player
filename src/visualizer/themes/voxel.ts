// ─────────────────────────────────────────────────────────────────────────────
// VOXEL — a real 3D lattice of cubes standing on a ground grid.
//
// This is not a fake-3D isometric grid: every corner of every cube goes through
// an honest camera. World space is (x, y up, z); the camera orbits the lattice
// on a circle, is pitched down onto the deck, and each point is yawed, pitched
// and then divided by its camera-space depth (see `proj`). Columns are painted
// back-to-front by their camera-space depth (painter's algorithm) and each cube
// is back-face culled in screen space, so a near column genuinely hides the one
// behind it and the box reads as a solid, lit volume rather than an outline.
//
// A column's height comes from a frequency bin chosen by its RADIAL distance
// from the centre — so the spectrum radiates outward in concentric rings and the
// whole lattice is 4-fold symmetric, which keeps it composed however it spins.
// Bass raises the whole field; every beat/hit fires a ripple that travels out
// from the centre cell; on a drop the lattice is launched off the deck, the
// grid lights up and the camera dives toward the deck for a low, fast pass.
// ─────────────────────────────────────────────────────────────────────────────
import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

/** an outward-travelling height wave; `r` is in normalized grid radius (0 centre → 1 corner) */
interface Ripple { r: number; a: number }

interface VoxelState {
  /** smoothed column heights, WORLD units (never pixels) so a resize can't jolt the lattice */
  hs: Float64Array;
  /** camera-space depth per column, refilled every frame */
  dep: Float64Array;
  /** painter's order: column indices sorted far → near */
  ord: number[];
  /** accumulated orbit angle — accumulated, never derived from vt, so tempo changes never snap it */
  orb: number;
  rip: Ripple[];
  /** smoothed dropE (the charge), the launch envelope it detonates into, and the deck flash */
  chg: number;
  launch: number;
  flash: number;
  /** drop latch + observed peak of dropE, so the detonation fires once per drop */
  arm: number;
  peak: number;
}

const GRID = 13;                 // odd, so there is a true centre cell for ripples to leave from
const CELLS = GRID * GRID;       // 169 columns — a hard cap, identical cost on a phone and a 5K display
const RIP_MAX = 5;
const SPAN = 0.62;               // world half-extent of the deck
const CELL = (SPAN * 2) / GRID;
const HALF = CELL * 0.36;        // cube half-width (the rest is the gap between cubes)
const FOCAL = 1.6;               // lens: screen = world * FOCAL / depth * R
const NEAR = 0.45;               // never divide by a depth smaller than this
const LIFT = 0.06;               // world-space camera target height — frames the deck on screen
const TAU = Math.PI * 2;

// ── per-cell constants, built once at module load (pure geometry, no canvas) ──
const CX_ = new Float64Array(CELLS);   // world x of the column centre
const CZ_ = new Float64Array(CELLS);   // world z
const RF_ = new Float64Array(CELLS);   // 0 at the centre cell → 1 at the corners
const BIN_ = new Int32Array(CELLS);    // spectrum bin this column listens to
/**
 * Lambert shading for the four vertical faces. Face k has outward normal
 * k=0 → -z, 1 → +x, 2 → +z, 3 → -x. A fixed WORLD-space light means the
 * shading sweeps across the lattice as the camera orbits, which is most of
 * what sells the boxes as solid.
 */
const FLIT = new Float64Array(4);
const TOPLIT = (() => {
  const lx = -0.55, ly = 0.72, lz = -0.42;
  const ln = Math.hypot(lx, ly, lz);
  const nx = lx / ln, ny = ly / ln, nz = lz / ln;
  // half-Lambert wrap (0.5 + 0.5*dot) over a 0.4 ambient floor — no face ever goes pitch black
  const wrap = (d: number) => 0.4 + 0.6 * (0.5 + 0.5 * d);
  FLIT[0] = wrap(-nz);
  FLIT[1] = wrap(nx);
  FLIT[2] = wrap(nz);
  FLIT[3] = wrap(-nx);
  return wrap(ny) * 1.18;              // the top face is the one the light actually faces
})();

(function buildLattice() {
  const mid = (GRID - 1) / 2;
  const maxR = Math.hypot(mid, mid);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i;
      CX_[k] = (i - mid) * CELL;
      CZ_[k] = (j - mid) * CELL;
      const rf = Math.hypot(i - mid, j - mid) / maxR;
      RF_[k] = rf;
      // low bins crowd the centre; the exponent spreads the audible range over the deck
      BIN_[k] = 3 + ((Math.pow(rf, 1.45) * 108) | 0);
    }
  }
})();

/** 8 projected cube corners as (x, y) pairs — reused every column, never reallocated */
const PB = new Float64Array(16);
/** small projection scratch for the deck quad and the grid lines */
const B4 = new Float64Array(8);
const G2 = new Float64Array(4);
const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);   // also maps NaN → 0

export const VOXEL: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, freq, liveAudio, vt, beat, beatE, hit, hitE, energy, dropE,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: VoxelState = (L.scratch.voxel ??= {
    hs: new Float64Array(CELLS),
    dep: new Float64Array(CELLS),
    ord: Array.from({ length: CELLS }, (_, i) => i),
    orb: 0.7,
    rip: [] as Ripple[],
    chg: 0, launch: 0, flash: 0, arm: 0, peak: 0,
  });

  const spd = cfg.speed;
  const E = cl01(energy);
  const BE = cl01(beatE);
  const HE = cl01(hitE);
  const D = cl01(dropE);
  const bs = cl01(bassV);

  // ── ripples: a beat punches one out of the centre cell, hits push weaker ones ──
  if ((beat || hit) && S.rip.length < RIP_MAX) S.rip.push({ r: 0, a: beat ? 1 : 0.5 + HE * 0.3 });
  for (let i = S.rip.length - 1; i >= 0; i--) {
    const rp = S.rip[i];
    rp.r += (0.011 + E * 0.019) * spd * fs;
    rp.a *= dk(0.962, fs);
    if (rp.r > 1.5 || rp.a < 0.05) S.rip.splice(i, 1);
  }

  // ── drop: charge while dropE climbs, detonate on the way down (once per drop) ──
  S.chg += (D - S.chg) * ak(0.12, fs);
  if (D > 0.55) { S.arm = 1; if (D > S.peak) S.peak = D; }
  if (S.arm && (D < S.peak * 0.8 || D < 0.28)) {
    S.arm = 0; S.peak = 0;
    S.launch = 1;
    S.flash = 1;
    if (S.rip.length < RIP_MAX) S.rip.push({ r: 0, a: 1 });
  }
  S.launch *= dk(0.952, fs);
  S.flash *= dk(0.9, fs);
  const hsEase = ak(0.26, fs);   // column rise, hoisted out of the per-cell loop
  const CH = cl01(S.chg);
  const LA = cl01(S.launch);
  const FL = cl01(S.flash);

  // ── camera: a slow orbit that speeds up with energy, diving on the drop ──────
  S.orb += (0.0016 + E * 0.0058) * spd * (1 + BE * 0.4 + LA * 1.6) * fs;
  const orb = S.orb + Math.sin(S.orb * 0.41) * 0.22;      // uneven sweep, so it never feels like a turntable
  const dist = 2.95 - E * 0.3 - CH * 0.45 - LA * 0.85;    // the dive: the camera rushes the deck
  const pitch = Math.max(0.17, 0.64 - CH * 0.2 - LA * 0.34);
  const ca = Math.cos(orb), sa = Math.sin(orb);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  /**
   * World (x, y, z) → screen, written as an (x, y) pair into `out` at `o`.
   *   1. yaw about the Y axis by the orbit angle          (the camera circles)
   *   2. pitch about the X axis                           (the camera looks down)
   *   3. push the scene `dist` down the view axis, then divide by that depth
   * Everything is in world units and only multiplied by R at the very end, so
   * the picture is identical at every canvas size.
   */
  const proj = (wx: number, wy: number, wz: number, out: Float64Array, o: number) => {
    const x1 = wx * ca - wz * sa;
    const z1 = wx * sa + wz * ca;
    const yy = wy - LIFT;
    const y2 = yy * cp + z1 * sp;
    let z2 = z1 * cp - yy * sp + dist;
    if (z2 < NEAR) z2 = NEAR;
    const k = (FOCAL / z2) * R;
    out[o] = cx + x1 * k;
    out[o + 1] = cy - y2 * k;
  };
  /** camera-space depth only — used for the painter's sort and for culling */
  const depthOf = (wx: number, wy: number, wz: number) =>
    (wx * sa + wz * ca) * cp - (wy - LIFT) * sp + dist;

  c.save();

  // ── the room: an opaque paint, so the boxes can actually occlude each other ──
  c.globalCompositeOperation = "source-over";
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, CMix(0.15, 1, 3 + CH * 3));
  sky.addColorStop(0.46, CMix(0.55, 1, 6 + E * 4 + FL * 8));
  sky.addColorStop(1, CMix(0.9, 1, 2 + FL * 6));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // ── heights: bin by radius ⇒ concentric spectrum rings, 4-fold symmetric ────
  const gain = (0.45 + bs * 0.5 + BE * 0.14) * (0.45 + I * 0.6);
  const rn = S.rip.length;
  for (let i = 0; i < CELLS; i++) {
    const b = BIN_[i];
    const v = liveAudio
      ? (freq[b] + freq[b + 1]) * 0.5 / 255
      : 0.2 + 0.16 * Math.sin(vt * 0.028 - RF_[i] * 6.5);
    // half linear / half squared: keeps the peaks punchy without flattening the
    // mid-level columns into a pancake
    let tgt = 0.035 + (v * v * 0.55 + v * 0.45) * gain;
    // ripple: a smooth finite-support bump, so nothing outside its front is touched
    for (let k = 0; k < rn; k++) {
      const rp = S.rip[k];
      const q = (RF_[i] - rp.r) * 5.2;
      if (q > -1 && q < 1) {
        const e = 1 - q * q;
        tgt += e * e * rp.a * (0.16 + bs * 0.2);
      }
    }
    if (tgt > 1.05) tgt = 1.05;                 // no column can ever spike off the frame
    S.hs[i] += (tgt - S.hs[i]) * hsEase;
  }

  // ── the deck, then its grid lines ───────────────────────────────────────────
  proj(-SPAN, 0, -SPAN, B4, 0); proj(SPAN, 0, -SPAN, B4, 2);
  proj(SPAN, 0, SPAN, B4, 4); proj(-SPAN, 0, SPAN, B4, 6);
  c.beginPath();
  c.moveTo(B4[0], B4[1]); c.lineTo(B4[2], B4[3]); c.lineTo(B4[4], B4[5]); c.lineTo(B4[6], B4[7]);
  c.closePath();
  c.fillStyle = CMix(0.5, 1, 4 + FL * 7 + CH * 3);
  c.fill();

  // 28 straight lines in ONE path: a straight world line stays straight through a
  // perspective divide, so only the two endpoints need projecting.
  c.globalCompositeOperation = "lighter";
  c.beginPath();
  for (let i = 0; i <= GRID; i++) {
    const u = -SPAN + i * CELL;
    proj(u, 0, -SPAN, G2, 0); proj(u, 0, SPAN, G2, 2);
    c.moveTo(G2[0], G2[1]); c.lineTo(G2[2], G2[3]);
    proj(-SPAN, 0, u, G2, 0); proj(SPAN, 0, u, G2, 2);
    c.moveTo(G2[0], G2[1]); c.lineTo(G2[2], G2[3]);
  }
  c.strokeStyle = C2(Math.min(0.5, (0.08 + E * 0.07 + FL * 0.3 + CH * 0.1) * (0.4 + I * 0.7)), 58 + FL * 16);
  c.lineWidth = Math.max(0.4, (0.6 + FL * 1.4) * TK);
  glow(Math.min(16, 5 + FL * 10), C2());
  c.stroke();
  noGlow();

  // launch: on a drop the whole lattice is thrown off the deck, staggered by
  // radius so it peels outward instead of moving as one slab
  const lift = LA > 0.01
    ? (i: number) => LA * LA * 0.55 * (0.35 + RF_[i] * 0.95)
    : () => 0;

  // ── painter's algorithm: sort the columns far → near by camera-space depth ──
  const ord = S.ord;
  for (let i = 0; i < CELLS; i++) {
    // sample the depth at half height, so a tall near column sorts ahead of a flat one
    S.dep[i] = depthOf(CX_[i], lift(i) + S.hs[i] * 0.5, CZ_[i]);
  }
  const dep = S.dep;
  ord.sort((a, b) => dep[b] - dep[a]);

  // ── the cubes ───────────────────────────────────────────────────────────────
  c.globalCompositeOperation = "source-over";
  // one stroke style for every rim: set once, then it is just c.stroke() per cube
  c.strokeStyle = C1(Math.min(0.6, (0.16 + E * 0.14 + FL * 0.3 + BE * 0.1) * (0.4 + I * 0.7)), 78);
  c.lineWidth = Math.max(0.35, 0.65 * TK);
  const margin = R * 1.1;
  const hiL = 26 + trebV * 10;             // extra lightness the treble puts on the tops

  for (let n = 0; n < CELLS; n++) {
    const i = ord[n];
    if (dep[i] <= NEAR + 0.02) continue;   // behind the camera

    const wx = CX_[i], wz = CZ_[i];
    const y0 = lift(i);
    const hgt = S.hs[i];
    const y1 = y0 + hgt;

    // 8 corners: base 0..3 then top 4..7, wound the same way round (−z, +x, +z, −x)
    // so that side face k is always (base k, base k+1, top k+1, top k).
    proj(wx - HALF, y0, wz - HALF, PB, 0);
    proj(wx + HALF, y0, wz - HALF, PB, 2);
    proj(wx + HALF, y0, wz + HALF, PB, 4);
    proj(wx - HALF, y0, wz + HALF, PB, 6);
    proj(wx - HALF, y1, wz - HALF, PB, 8);
    proj(wx + HALF, y1, wz - HALF, PB, 10);
    proj(wx + HALF, y1, wz + HALF, PB, 12);
    proj(wx - HALF, y1, wz + HALF, PB, 14);

    // cheap viewport cull on the top face's centre — off-screen columns cost nothing
    const mx = (PB[8] + PB[12]) * 0.5, my = (PB[9] + PB[13]) * 0.5;
    if (mx < -margin || mx > w + margin || my < -margin || my > h + margin) continue;

    const hue = 0.08 + RF_[i] * 0.84;
    const lvl = cl01(hgt * 1.5);
    const li = 18 + lvl * 30 + FL * 14 + BE * 4 + midV * 4;

    // four vertical faces, back-face culled in SCREEN space: the signed area of the
    // projected quad is negative exactly when its outward normal faces the camera.
    for (let k = 0; k < 4; k++) {
      const o0 = k * 2, o1 = ((k + 1) & 3) * 2;
      const ax = PB[o0], ay = PB[o0 + 1];
      const bx = PB[o1], by = PB[o1 + 1];
      const dx2 = PB[8 + o1], dy2 = PB[9 + o1];
      const ex = PB[8 + o0], ey = PB[9 + o0];
      const area = (ax * by - bx * ay) + (bx * dy2 - dx2 * by) + (dx2 * ey - ex * dy2) + (ex * ay - ax * ey);
      if (area >= 0) continue;
      c.beginPath();
      c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(dx2, dy2); c.lineTo(ex, ey);
      c.closePath();
      c.fillStyle = CMix(hue, 1, Math.min(78, li * FLIT[k]));
      c.fill();
    }

    // the top cap, brightest, plus its rim in the same path
    c.beginPath();
    c.moveTo(PB[8], PB[9]); c.lineTo(PB[10], PB[11]);
    c.lineTo(PB[12], PB[13]); c.lineTo(PB[14], PB[15]);
    c.closePath();
    c.fillStyle = CMix(hue, 1, Math.min(78, li * TOPLIT + hiL * lvl * 0.35));
    c.fill();
    c.stroke();
  }

  // ── additive finish: a bloom sitting in the middle of the lattice ───────────
  c.globalCompositeOperation = "lighter";
  proj(0, 0.05, 0, G2, 0);
  const br = R * (0.2 + bs * 0.12 + FL * 0.55 + LA * 0.3);
  const bg = c.createRadialGradient(G2[0], G2[1], 0, G2[0], G2[1], br);
  bg.addColorStop(0, C1(Math.min(0.5, (0.1 + BE * 0.14 + FL * 0.4) * (0.4 + I * 0.6)), 76));
  bg.addColorStop(0.4, CMix(0.5, Math.min(0.24, 0.05 + FL * 0.2), 56));
  bg.addColorStop(1, "transparent");
  c.fillStyle = bg;
  c.beginPath();
  c.arc(G2[0], G2[1], br, 0, TAU);
  c.fill();

  c.restore();   // hands back the "lighter" composite, alpha, lineWidth and transform we arrived with
};
