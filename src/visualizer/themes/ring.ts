import type { ThemeDraw } from "../themeTypes";

export const RING: ThemeDraw = ({ c, cx, cy, R, wave, bassV, I, TK, C1, C2, glow, noGlow }) => {
  const base = R * (0.2 + bassV * 0.07);
  for (let pass = 0; pass < 2; pass++) {
    c.beginPath();
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const wvv = (wave[Math.floor((i / N) * 1023)] - 128) / 128;
      const rad = base + wvv * base * (0.4 + bassV * 0.5) * I;
      i === 0
        ? c.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad)
        : c.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    c.closePath();
    c.strokeStyle = pass === 0 ? C1(0.95) : C2(0.5);
    c.lineWidth = (pass === 0 ? 2.5 : 7 + bassV * 12) * TK;
    glow(pass === 0 ? 16 : 36, C1());
    c.stroke();
  }
  noGlow();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, base);
  g.addColorStop(0, C1(0.2 + bassV * 0.5, 70));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, base, 0, Math.PI * 2);
  c.fill();
};
