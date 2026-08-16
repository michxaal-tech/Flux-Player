import type { ThemeDraw } from "../themeTypes";

export const WAVES: ThemeDraw = ({ c, w, h, cx, cy, t, freq, liveAudio, vt, bassV, I, TK, CMix, glow, noGlow, L }) => {
  if (t % 3 === 0) {
    const row: number[] = [];
    for (let i = 0; i < 48; i++)
      row.push(liveAudio ? freq[i * 4] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.4));
    L.specHist.unshift(row);
    if (L.specHist.length > 22) L.specHist.pop();
  }
  const horizon = cy - h * 0.12;
  for (let r = L.specHist.length - 1; r >= 0; r--) {
    const row = L.specHist[r];
    const depth = r / 22;
    const y0 = horizon + Math.pow(1 - depth, 2.2) * (h * 0.78);
    const spread = 0.25 + (1 - depth) * 0.75;
    c.beginPath();
    for (let i = 0; i < row.length; i++) {
      const x = cx + (i / (row.length - 1) - 0.5) * w * spread * 1.9;
      const y = y0 - row[i] * h * 0.24 * (1 - depth) * (0.6 + bassV * 1.2) * I;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(1 - depth, 0.15 + (1 - depth) * 0.8);
    c.lineWidth = (1 + (1 - depth) * 2.2) * TK;
    glow(10, CMix(1 - depth));
    c.stroke();
  }
  noGlow();
};
