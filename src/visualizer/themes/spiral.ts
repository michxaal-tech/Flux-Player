import type { ThemeDraw } from "../themeTypes";

export const SPIRAL: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, bassV, I, TK, CMix, glow, noGlow }) => {
  const dots = 220;
  for (let i = 0; i < dots; i++) {
    const p = i / dots;
    const ang = p * Math.PI * 10 + vt * 0.012;
    const rr = p * R * 0.55 * (1 + bassV * 0.18);
    const fv = liveAudio ? freq[Math.floor(p * 200)] / 255 : 0.18;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.85;
    c.fillStyle = CMix(p, 0.3 + fv * 0.65, 70);
    glow(10, CMix(p));
    c.beginPath();
    c.arc(x, y, (1 + fv * 6 * I + bassV * 2) * TK, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
