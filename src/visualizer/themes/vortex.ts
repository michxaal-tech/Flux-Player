import type { ThemeDraw } from "../themeTypes";

// Particle whirlpool. Beat: the vortex sucks everything in fast, the core
// detonates white, and a fresh ring of matter spawns at the rim.
export const VORTEX: ThemeDraw = ({ c, cx, cy, R, beat, beatE, cfg, bassV, TK, C2, CMix, L }) => {
  if (!L.vort.length)
    L.vort = Array.from({ length: 160 }, () => ({
      a: Math.random() * Math.PI * 2, r: Math.random(), sp: 0.5 + Math.random(),
    }));
  if (beat) {
    for (let k = 0; k < 14; k++)
      L.vort.push({ a: Math.random() * Math.PI * 2, r: 1, sp: 0.8 + Math.random() });
    if (L.vort.length > 260) L.vort.splice(0, L.vort.length - 260);
  }
  for (const p of L.vort) {
    p.r -= (0.0012 + bassV * 0.004) * (1 + beatE * 2.5) * p.sp * cfg.speed;
    p.a += (0.012 + (1 - p.r) * 0.05) * (1 + beatE * 1.5) * cfg.speed;
    if (p.r <= 0.03) { p.r = 1; p.a = Math.random() * Math.PI * 2; }
    const x = cx + Math.cos(p.a) * p.r * R * 0.62;
    const y = cy + Math.sin(p.a) * p.r * R * 0.45;
    const sz = ((1 - p.r) * 3.4 + bassV * 3) * (1 + beatE * 0.6) * TK;
    c.fillStyle = CMix(1 - p.r, 0.25 + (1 - p.r) * 0.65 + beatE * 0.2, 70 + beatE * 10);
    c.beginPath();
    c.arc(x, y, sz, 0, Math.PI * 2);
    c.fill();
  }
  const coreR = R * (0.06 + bassV * 0.05 + beatE * 0.08);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  g.addColorStop(0, `rgba(255,255,255,${0.6 + bassV * 0.4})`);
  g.addColorStop(0.5, C2(0.5 + beatE * 0.4));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, R * 0.15 * (1 + beatE), 0, Math.PI * 2);
  c.fill();
};
