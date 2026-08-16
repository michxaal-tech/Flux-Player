import type { ThemeDraw } from "../themeTypes";

export const STARFIELD: ThemeDraw = ({ c, cx, cy, cfg, bassV, TK, C1, C2, L }) => {
  if (!L.stars.length)
    L.stars = Array.from({ length: 240 }, () => ({
      x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(),
    }));
  const speed = (0.002 + bassV * 0.03) * cfg.speed;
  for (const s of L.stars) {
    s.z -= speed;
    if (s.z <= 0.02) {
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = 1;
    }
    const sx = cx + (s.x / s.z) * cx * 0.9;
    const sy = cy + (s.y / s.z) * cy * 0.9;
    const size = (1 - s.z) * (2.2 + bassV * 4) * TK;
    c.fillStyle = (s.x + s.y) % 0.2 > 0.1 ? C2((1 - s.z) * 0.9, 72) : C1((1 - s.z) * 0.9, 72);
    c.beginPath();
    c.arc(sx, sy, size, 0, Math.PI * 2);
    c.fill();
  }
};
