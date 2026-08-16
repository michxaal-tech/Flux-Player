import type { ThemeDraw } from "../themeTypes";

export const FIREFLIES: ThemeDraw = ({ c, w, h, vt, cfg, bassV, midV, trebV, TK, C1, CMix, glow, noGlow, L }) => {
  if (!L.flies.length)
    L.flies = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(), vx: 0, vy: 0, ph: Math.random() * Math.PI * 2,
    }));
  for (const f of L.flies) {
    f.vx += (Math.random() - 0.5) * 0.0006 + (0.5 - f.x) * bassV * 0.0022;
    f.vy += (Math.random() - 0.5) * 0.0006 + (0.5 - f.y) * bassV * 0.0022;
    f.vx *= 0.97;
    f.vy *= 0.97;
    f.x += f.vx * cfg.speed;
    f.y += f.vy * cfg.speed;
    if (f.x < 0 || f.x > 1) f.vx *= -1;
    if (f.y < 0 || f.y > 1) f.vy *= -1;
    const blink = 0.35 + Math.abs(Math.sin(vt * 0.03 + f.ph)) * 0.65;
    const sz = (1.5 + trebV * 4 + bassV * 2.5) * blink * TK;
    c.fillStyle = CMix((f.ph % 6.28) / 6.28, blink * (0.5 + midV * 0.5), 72);
    glow(16, C1());
    c.beginPath();
    c.arc(f.x * w, f.y * h, sz, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
