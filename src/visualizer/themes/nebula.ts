import type { ThemeDraw } from "../themeTypes";

// Gas clouds. Beat: the nebula blooms hard and throws off glittering stardust.
export const NEBULA: ThemeDraw = ({ c, cx, cy, R, vt, beat, beatE, bassV, midV, TK, C1, C2, CMix, L }) => {
  const S = (L.scratch.nebula ??= { sparks: [] as { x: number; y: number; vx: number; vy: number; a: number }[] });
  for (let i = 0; i < 5; i++) {
    const ang = vt * 0.004 + (i / 5) * Math.PI * 2;
    const RR = R * (0.18 + midV * 0.3);
    const bx = cx + Math.cos(ang) * RR * (1 + Math.sin(vt * 0.006 + i) * 0.4);
    const by = cy + Math.sin(ang * 1.3) * RR;
    const rad = R * (0.15 + bassV * 0.22 + i * 0.02) * (1 + beatE * 0.35);
    const g = c.createRadialGradient(bx, by, 0, bx, by, rad);
    g.addColorStop(0, i % 2 ? C2(0.14 + bassV * 0.2 + beatE * 0.25) : C1(0.14 + bassV * 0.2 + beatE * 0.25));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, rad, 0, Math.PI * 2);
    c.fill();
    if (beat) {
      for (let k = 0; k < 5; k++) {
        const a2 = Math.random() * Math.PI * 2;
        const sp = R * (0.002 + Math.random() * 0.006);
        S.sparks.push({ x: bx, y: by, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp, a: 1 });
      }
    }
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const sp = S.sparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.a *= 0.94;
    if (sp.a < 0.04) { S.sparks.splice(i, 1); continue; }
    c.fillStyle = CMix(Math.random(), sp.a, 82);
    c.beginPath();
    c.arc(sp.x, sp.y, (0.8 + sp.a * 2.4) * TK, 0, Math.PI * 2);
    c.fill();
  }
};
