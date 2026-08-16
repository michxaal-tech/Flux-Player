import type { ThemeDraw } from "../themeTypes";

export const LASERS: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, bassV, I, TK, C1, CMix, glow, noGlow }) => {
  const beams = 14;
  for (let i = 0; i < beams; i++) {
    const fv = liveAudio ? freq[Math.floor((i / beams) * 200)] / 255 : 0.2;
    const ang = vt * 0.004 * (i % 2 ? 1 : -1) + (i / beams) * Math.PI * 2;
    const len = R * (0.5 + fv * 0.6 * I + bassV * 0.3);
    c.strokeStyle = CMix(i / beams, 0.25 + fv * 0.65);
    c.lineWidth = (1.5 + fv * 4 + bassV * 2) * TK;
    glow(20, CMix(i / beams));
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    c.stroke();
  }
  noGlow();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.08 + bassV * 0.08));
  g.addColorStop(0, `rgba(255,255,255,${0.5 + bassV * 0.5})`);
  g.addColorStop(0.4, C1(0.4));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, R * 0.2, 0, Math.PI * 2);
  c.fill();
};
