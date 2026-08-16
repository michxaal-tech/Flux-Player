import type { ThemeDraw } from "../themeTypes";

export const HELIX: ThemeDraw = ({ c, w, h, cy, freq, liveAudio, vt, bassV, I, TK, C1, C2, CMix, glow, noGlow }) => {
  const amp = h * (0.12 + bassV * 0.12);
  const N = 60;
  for (let strand = 0; strand < 2; strand++) {
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * (w + 40) - 20;
      const ph = (i / N) * Math.PI * 4 + vt * 0.03 + strand * Math.PI;
      const y = cy + Math.sin(ph) * amp;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = strand ? C2(0.8) : C1(0.8);
    c.lineWidth = (2 + bassV * 3) * TK;
    glow(16, strand ? C2() : C1());
    c.stroke();
  }
  for (let i = 0; i <= N; i += 3) {
    const x = (i / N) * (w + 40) - 20;
    const ph = (i / N) * Math.PI * 4 + vt * 0.03;
    const y1 = cy + Math.sin(ph) * amp;
    const y2 = cy + Math.sin(ph + Math.PI) * amp;
    const fv = liveAudio ? freq[Math.floor((i / N) * 180)] / 255 : 0.2;
    c.strokeStyle = CMix(i / N, 0.22 + fv * 0.5);
    c.lineWidth = 1 * TK;
    c.beginPath();
    c.moveTo(x, y1);
    c.lineTo(x, y2);
    c.stroke();
    c.fillStyle = C1(0.9, 72);
    c.beginPath();
    c.arc(x, y1, (2 + fv * 6 * I) * TK, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C2(0.9, 72);
    c.beginPath();
    c.arc(x, y2, (2 + fv * 6 * I) * TK, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
