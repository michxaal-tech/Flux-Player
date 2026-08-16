import type { ThemeDraw } from "../themeTypes";

export const KALEIDO: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, bassV, I, TK, CMix, glow, noGlow }) => {
  const SEG = 10, armLen = R * 0.52;
  for (let s = 0; s < SEG; s++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((s / SEG) * Math.PI * 2 + vt * 0.003);
    if (s % 2) c.scale(1, -1);
    c.beginPath();
    const N = 42;
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + i);
      const x = p * armLen;
      const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(s / SEG, 0.75);
    c.lineWidth = (1.6 + bassV * 3.5) * TK;
    glow(14, CMix(s / SEG));
    c.stroke();
    for (let i = 4; i <= 40; i += 9) {
      const p = i / 42;
      const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.2;
      const x = p * armLen;
      const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV);
      c.fillStyle = CMix(p, 0.85, 74);
      c.beginPath();
      c.arc(x, y, (1.5 + fv * 5 + bassV * 3) * TK, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  noGlow();
};
