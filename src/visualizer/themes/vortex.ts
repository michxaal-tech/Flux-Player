import type { ThemeDraw } from "../themeTypes";

export const VORTEX: ThemeDraw = ({ c, cx, cy, R, cfg, bassV, TK, C2, CMix, L }) => {
  if (!L.vort.length)
    L.vort = Array.from({ length: 160 }, () => ({
      a: Math.random() * Math.PI * 2, r: Math.random(), sp: 0.5 + Math.random(),
    }));
  for (const p of L.vort) {
    p.r -= (0.0012 + bassV * 0.004) * p.sp * cfg.speed;
    p.a += (0.012 + (1 - p.r) * 0.05) * cfg.speed;
    if (p.r <= 0.03) { p.r = 1; p.a = Math.random() * Math.PI * 2; }
    const x = cx + Math.cos(p.a) * p.r * R * 0.62;
    const y = cy + Math.sin(p.a) * p.r * R * 0.45;
    const sz = ((1 - p.r) * 3.4 + bassV * 3) * TK;
    c.fillStyle = CMix(1 - p.r, 0.25 + (1 - p.r) * 0.65, 70);
    c.beginPath();
    c.arc(x, y, sz, 0, Math.PI * 2);
    c.fill();
  }
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.06 + bassV * 0.05));
  g.addColorStop(0, `rgba(255,255,255,${0.6 + bassV * 0.4})`);
  g.addColorStop(0.5, C2(0.5));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, R * 0.15, 0, Math.PI * 2);
  c.fill();
};
