import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface GStar { t: number; arm: number; off: number; sz: number; tw: number; }

// A full spiral galaxy seen from above: three star-dense arms with nebula
// patches, a blazing core, and a slow majestic rotation. Beats punch the
// camera in, flare the core, and loose a shooting star across the disc.
const STARS: GStar[] = Array.from({ length: 420 }, () => ({
  t: Math.pow(Math.random(), 0.75),
  arm: Math.floor(Math.random() * 3),
  off: (Math.random() - 0.5) * 0.5,
  sz: 0.5 + Math.random(),
  tw: Math.random() * 9,
}));

export const GALAXY: ThemeDraw = ({ c, fs, cx, cy, R, freq, liveAudio, vt, beat, beatE, bassV, midV, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.galaxy ??= { rot: 0, shots: [] as { x: number; y: number; vx: number; vy: number; a: number }[] });
  S.rot += 0.0016 * (1 + beatE * 1.2) * fs;
  const punch = 1 + beatE * 0.055;

  const starPos = (s2: GStar) => {
    const ang = s2.t * 4.4 + (s2.arm / 3) * Math.PI * 2 + S.rot + s2.off * (1.4 - s2.t);
    const r = (R * 0.055 + s2.t * R * 0.42) * punch;
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.72] as const;
  };

  // nebula patches along the arms
  for (let i = 0; i < 6; i++) {
    const fake: GStar = { t: 0.25 + (i / 6) * 0.7, arm: i % 3, off: 0, sz: 1, tw: 0 };
    const [nx, ny] = starPos(fake);
    const nr = R * (0.09 + bassV * 0.05) * (1 + (i % 2) * 0.4);
    const g = c.createRadialGradient(nx, ny, 0, nx, ny, nr);
    g.addColorStop(0, CMix((i / 6 + 0.2) % 1, 0.1 + bassV * 0.12 + beatE * 0.08, 55));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(nx, ny, nr, 0, Math.PI * 2);
    c.fill();
  }

  // stars
  for (const s2 of STARS) {
    const [sx, sy] = starPos(s2);
    const fv = liveAudio ? freq[Math.floor(s2.t * 180)] / 255 : 0.2;
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(vt * 0.03 + s2.tw));
    const a = (0.2 + fv * 0.65) * twinkle * (1 - s2.t * 0.25) + beatE * 0.15;
    c.fillStyle = CMix((s2.t + s2.arm * 0.28) % 1, Math.min(1, a), 68 + beatE * 10);
    const size = s2.sz * (0.8 + fv * 1.8 + beatE * 0.9) * TK;
    c.beginPath();
    c.arc(sx, sy, size, 0, Math.PI * 2);
    c.fill();
  }

  // galactic core — modest alphas so additive trails don't wash out the arms
  const coreR = R * (0.03 + bassV * 0.02 + beatE * 0.035) * punch;
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
  cg.addColorStop(0, C1(0.4 + beatE * 0.25, 90));
  cg.addColorStop(0.25, C1(0.22 + midV * 0.15, 70));
  cg.addColorStop(0.6, CMix(0.5, 0.08, 58));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
  c.fill();

  // beat shooting star across the disc
  if (beat && Math.random() < 0.6) {
    const a2 = Math.random() * Math.PI * 2;
    S.shots.push({
      x: cx + Math.cos(a2) * R * 0.5, y: cy + Math.sin(a2) * R * 0.4,
      vx: -Math.cos(a2) * R * 0.02, vy: -Math.sin(a2) * R * 0.016, a: 1,
    });
  }
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const sh = S.shots[i];
    sh.x += sh.vx * fs;
    sh.y += sh.vy * fs;
    sh.a *= dk(0.93, fs);
    if (sh.a < 0.05) { S.shots.splice(i, 1); continue; }
    c.strokeStyle = C1(sh.a, 88);
    c.lineWidth = 1.6 * TK;
    glow(14, C1());
    c.beginPath();
    c.moveTo(sh.x - sh.vx * 4, sh.y - sh.vy * 4);
    c.lineTo(sh.x, sh.y);
    c.stroke();
    noGlow();
  }
};
