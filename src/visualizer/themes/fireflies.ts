import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// Firefly swarm. Beat: every fly flashes at once and the swarm is blasted
// outward from the center, then drifts back together.
export const FIREFLIES: ThemeDraw = ({ c, fs, w, h, vt, beat, beatE, cfg, bassV, midV, trebV, TK, C1, CMix, glow, noGlow, L }) => {
  if (!L.flies.length)
    L.flies = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(), vx: 0, vy: 0, ph: Math.random() * Math.PI * 2,
    }));
  for (const f of L.flies) {
    f.vx += ((Math.random() - 0.5) * 0.0006 + (0.5 - f.x) * bassV * 0.0022) * fs;
    f.vy += ((Math.random() - 0.5) * 0.0006 + (0.5 - f.y) * bassV * 0.0022) * fs;
    if (beat) {
      // radial blast away from center
      const dx = f.x - 0.5, dy = f.y - 0.5;
      const d = Math.max(0.05, Math.hypot(dx, dy));
      f.vx += (dx / d) * 0.012 * fs;
      f.vy += (dy / d) * 0.012 * fs;
    }
    f.vx *= dk(0.97, fs);
    f.vy *= dk(0.97, fs);
    f.x += f.vx * cfg.speed * fs;
    f.y += f.vy * cfg.speed * fs;
    if (f.x < 0 || f.x > 1) f.vx *= -1;
    if (f.y < 0 || f.y > 1) f.vy *= -1;
    const blink = Math.max(0.35 + Math.abs(Math.sin(vt * 0.03 + f.ph)) * 0.65, beatE);
    const sz = (1.5 + trebV * 4 + bassV * 2.5) * blink * (1 + beatE * 0.7) * TK;
    c.fillStyle = CMix((f.ph % 6.28) / 6.28, blink * (0.5 + midV * 0.5), 72 + beatE * 14);
    glow(16 * (1 + beatE), C1());
    c.beginPath();
    c.arc(f.x * w, f.y * h, sz, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
