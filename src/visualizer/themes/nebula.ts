import type { ThemeDraw } from "../themeTypes";

export const NEBULA: ThemeDraw = ({ c, cx, cy, R, vt, bassV, midV, C1, C2 }) => {
  for (let i = 0; i < 5; i++) {
    const ang = vt * 0.004 + (i / 5) * Math.PI * 2;
    const RR = R * (0.18 + midV * 0.3);
    const bx = cx + Math.cos(ang) * RR * (1 + Math.sin(vt * 0.006 + i) * 0.4);
    const by = cy + Math.sin(ang * 1.3) * RR;
    const rad = R * (0.15 + bassV * 0.22 + i * 0.02);
    const g = c.createRadialGradient(bx, by, 0, bx, by, rad);
    g.addColorStop(0, i % 2 ? C2(0.14 + bassV * 0.2) : C1(0.14 + bassV * 0.2));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, rad, 0, Math.PI * 2);
    c.fill();
  }
};
