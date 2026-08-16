import type { ThemeDraw } from "../themeTypes";

// Star flight. Beat: warp jump — stars streak into hyperspace lines, then settle.
export const STARFIELD: ThemeDraw = ({ c, cx, cy, cfg, beatE, bassV, TK, C1, C2, L }) => {
  if (!L.stars.length)
    L.stars = Array.from({ length: 240 }, () => ({
      x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(),
    }));
  const speed = (0.002 + bassV * 0.03) * (1 + beatE * 5) * cfg.speed;
  for (const s of L.stars) {
    const pz = s.z;
    s.z -= speed;
    if (s.z <= 0.02) {
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = 1;
      continue;
    }
    const sx = cx + (s.x / s.z) * cx * 0.9;
    const sy = cy + (s.y / s.z) * cy * 0.9;
    const col = (s.x + s.y) % 0.2 > 0.1 ? C2((1 - s.z) * 0.9, 72 + beatE * 14) : C1((1 - s.z) * 0.9, 72 + beatE * 14);
    if (beatE > 0.12) {
      // hyperspace streak from previous depth position
      const px = cx + (s.x / pz) * cx * 0.9;
      const py = cy + (s.y / pz) * cy * 0.9;
      c.strokeStyle = col;
      c.lineWidth = (1 - s.z) * (1.4 + beatE * 2.4) * TK;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(sx, sy);
      c.stroke();
    }
    const size = (1 - s.z) * (2.2 + bassV * 4 + beatE * 3) * TK;
    c.fillStyle = col;
    c.beginPath();
    c.arc(sx, sy, size, 0, Math.PI * 2);
    c.fill();
  }
};
