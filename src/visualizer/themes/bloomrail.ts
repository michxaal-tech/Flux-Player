import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface Ring {
  /** ZFAR (horizon) → ZNEAR (engulfing the camera) */
  z: number;
  rot: number;
  spin: number;
  /** palette mix position */
  f: number;
  /** petal count */
  n: number;
  /** 0 bud → 1 fully bloomed */
  open: number;
  /** snap-open flare, decays */
  flash: number;
}
interface BloomrailState {
  rings: Ring[];
  roll: number;
}

// Fixed entity budget — never scales with canvas size.
const RINGS = 14;              // ≤ 14 * 8 = 112 petals
const ZNEAR = 0.1;
const ZFAR = 1.15;
const ZSPAN = ZFAR - ZNEAR;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A neon monorail ride down an endless flower tunnel. Rings of geometric
// petals rush the camera in perspective, blooming open as they arrive.
// Calm passages are a slow glide with petals unfurling languidly; driving
// passages turn it into a warp-speed rush where petals snap open in a flare
// and every tip drags a motion streak.
export const BLOOMRAIL: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: BloomrailState = (L.scratch.bloomrail ??= {
    rings: Array.from({ length: RINGS }, (_, i) => ({
      z: ZNEAR + ((i + 0.5) / RINGS) * ZSPAN,
      rot: (i * 1.37) % (Math.PI * 2),
      spin: i % 2 ? 1 : -1,
      f: (i % 5) / 4,
      n: 6 + (i % 3),
      open: 0,
      flash: 0,
    })) as Ring[],
    roll: 0,
  });

  const eS = energy * energy;                       // sharpens the slow/fast split
  const warp = clamp01((energy - 0.34) / 0.5);      // 0 in calm music, 1 in driving music
  // 0.0018/frame (≈10s per ring) at rest → 0.022+ under a beat: a true warp jump
  const spd = (0.0018 + eS * 0.02) * cfg.speed * (1 + beatE * (0.35 + energy * 2.2)) * fs;
  S.roll += (0.004 + eS * 0.026) * cfg.speed * fs;

  // vanishing point sways with the ride, hard at speed
  const vpx = cx + Math.sin(S.roll * 0.7) * R * 0.06 * (0.25 + energy * 1.3);
  const vpy = cy + Math.cos(S.roll * 0.53) * R * 0.045 * (0.25 + energy * 1.3);

  // tunnel mouth
  const coreR = R * (0.13 + bassV * 0.05 + beatE * 0.07 * I);
  const cg = c.createRadialGradient(vpx, vpy, 0, vpx, vpy, coreR);
  cg.addColorStop(0, C1(0.5 + beatE * 0.35, 92));
  cg.addColorStop(0.35, C2(0.24 + beatE * 0.2 + warp * 0.12, 68));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(vpx, vpy, coreR, 0, Math.PI * 2);
  c.fill();

  // the rails, converging on the vanishing point
  c.lineCap = "round";
  c.strokeStyle = C2(0.2 + warp * 0.28 + beatE * 0.22, 64 + warp * 12);
  c.lineWidth = (1 + warp * 1.6 + beatE * 1.4) * TK;
  glow(Math.min(22, 8 + warp * 12), C2());
  c.beginPath();
  for (const s of [-1, 1]) {
    c.moveTo(vpx, vpy);
    c.quadraticCurveTo(vpx + s * w * 0.12, vpy + h * 0.28, vpx + s * w * 0.5, h * 1.06);
  }
  c.stroke();
  noGlow();

  // ── rings ──
  const tiePath = new Path2D();
  const streakPath = new Path2D();
  let ties = 0;
  let streaks = 0;

  for (const r of S.rings) {
    r.z -= spd;
    if (r.z <= ZNEAR) {
      r.z += ZSPAN;
      r.rot = Math.random() * Math.PI * 2;
      r.f = Math.random();
      r.n = 6 + ((Math.random() * 3) | 0);
      r.open = 0;
      r.flash = 0;
    }
    r.rot += r.spin * (0.0018 + eS * 0.014) * cfg.speed * fs;
    r.flash *= dk(0.86, fs);

    // how far along the tunnel this ring is, 0 at the horizon → 1 at the camera
    const p = (ZFAR - r.z) / ZSPAN;
    // calm: opens gently across the whole run. driving: stays a tight bud, then
    // crosses a threshold and detonates open.
    const target = clamp01((p - 0.12 - warp * 0.34) * (1.2 + warp * 7));
    const prev = r.open;
    r.open += (target - r.open) * ak(0.035 + eS * 0.5 + beatE * warp * 0.3, fs);
    if (prev < 0.5 && r.open >= 0.5) r.flash = 0.5 + warp * 0.5;

    const proj = 0.34 / r.z;
    const rad = R * proj * (1 + bassV * 0.12);
    if (rad > R * 3.2) continue;
    // fade in at the horizon, fade out as it swallows the camera
    const a = clamp01((ZFAR - r.z) * 5) * clamp01((r.z - ZNEAR) * 7);
    if (a < 0.02) continue;

    const bend = Math.min(2.2, proj);
    const px = vpx + Math.sin(r.z * 3.1 - S.roll) * R * 0.09 * (0.25 + energy) * bend;
    const py = vpy + Math.cos(r.z * 2.3 - S.roll * 0.8) * R * 0.06 * (0.25 + energy) * bend;

    const nP = r.n;
    const step = (Math.PI * 2) / nP;
    const hw = step * (0.15 + r.open * 0.4);
    const r0 = rad * (0.24 + r.open * 0.06);
    const r1 = rad * (0.42 + r.open * 0.62) * (1 + r.flash * 0.12);
    const rc = (r0 + r1) * 0.5;

    c.beginPath();
    for (let k = 0; k < nP; k++) {
      const ang = r.rot + k * step;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const cL = Math.cos(ang - hw), sL = Math.sin(ang - hw);
      const cR = Math.cos(ang + hw), sR = Math.sin(ang + hw);
      const bx = px + ca * r0, by = py + sa * r0;
      const tx = px + ca * r1, ty = py + sa * r1;
      c.moveTo(bx, by);
      c.quadraticCurveTo(px + cL * rc, py + sL * rc, tx, ty);
      c.quadraticCurveTo(px + cR * rc, py + sR * rc, bx, by);
      // motion streaks: only once the ride is fast, dragged back down the tunnel
      if (warp > 0.05 && streaks < 160) {
        const back = 1 - (0.12 + warp * 0.42 + beatE * 0.2);
        streakPath.moveTo(tx, ty);
        streakPath.lineTo(vpx + (tx - vpx) * back, vpy + (ty - vpy) * back);
        streaks++;
      }
    }
    const lit = a * (0.35 + r.open * 0.35 + r.flash * 0.5 + beatE * 0.2 * I);
    c.fillStyle = CMix(r.f, lit * 0.4, 34 + r.open * 16 + r.flash * 26);
    c.fill();
    c.strokeStyle = CMix(r.f, Math.min(1, lit), 58 + r.open * 14 + r.flash * 24);
    c.lineWidth = (0.7 + r.open * 1.1 + beatE * 0.9) * TK;
    // blur only on the small, distant rings — blurring a screen-filling shape
    // is the one thing that would sink the frame rate here
    if (rad < R * 0.85) glow(Math.min(26, (7 + r.flash * 16) * (1 + beatE * 0.6)), CMix(r.f));
    else noGlow();
    c.stroke();
    noGlow();

    // hoop the petals sit on + a sleeper tie on the rail below
    if (rad < R * 1.3) {
      c.beginPath();
      c.arc(px, py, r0 * 0.94, 0, Math.PI * 2);
      c.strokeStyle = C2(a * (0.16 + midV * 0.2 + beatE * 0.2), 60);
      c.lineWidth = (0.6 + beatE * 0.5) * TK;
      c.stroke();
      if (ties < RINGS) {
        const ty2 = py + rad * 0.62;
        tiePath.moveTo(px - rad * 0.34, ty2);
        tiePath.lineTo(px + rad * 0.34, ty2);
        ties++;
      }
    }
  }

  if (ties > 0) {
    c.strokeStyle = C1(0.18 + warp * 0.2 + beatE * 0.25, 66);
    c.lineWidth = (0.8 + beatE) * TK;
    c.stroke(tiePath);
  }
  if (streaks > 0) {
    c.strokeStyle = C1(0.06 + warp * 0.3 + beatE * 0.22, 76);
    c.lineWidth = (0.5 + warp * 1.2) * TK;
    glow(Math.min(18, 6 + warp * 12), C1());
    c.stroke(streakPath);
    noGlow();
  }

  // warp flash straight down the barrel on a hard beat at speed
  if (beat && warp > 0.3) S.roll += 0.05 * warp;
  if (beatE > 0.05 && warp > 0.1) {
    const fr = R * (0.5 + beatE * 0.6);
    const fg = c.createRadialGradient(vpx, vpy, 0, vpx, vpy, fr);
    fg.addColorStop(0, C1(beatE * warp * 0.3, 90));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(vpx, vpy, fr, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = "butt";
};
