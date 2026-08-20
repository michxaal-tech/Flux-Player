import type { ThemeDraw } from "../themeTypes";

// Receding spectrum terrain. Beat: that row is stamped white-hot and stays
// bright as it recedes into the distance — you can watch the beats march away.
export const WAVES: ThemeDraw = ({ c, w, h, cx, cy, every, freq, liveAudio, vt, beat, beatE, bassV, I, TK, CMix, glow, noGlow, L }) => {
  if (every(3)) {
    const v: number[] = [];
    for (let i = 0; i < 48; i++)
      v.push(liveAudio ? freq[i * 4] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.4));
    L.specHist.unshift({ v, hot: false });
    if (L.specHist.length > 22) L.specHist.pop();
  }
  if (beat && L.specHist.length) L.specHist[0].hot = true;
  const horizon = cy - h * 0.12;
  for (let r = L.specHist.length - 1; r >= 0; r--) {
    const row = L.specHist[r];
    const depth = r / 22;
    const y0 = horizon + Math.pow(1 - depth, 2.2) * (h * 0.78);
    const spread = 0.25 + (1 - depth) * 0.75;
    c.beginPath();
    for (let i = 0; i < row.v.length; i++) {
      const x = cx + (i / (row.v.length - 1) - 0.5) * w * spread * 1.9;
      const y = y0 - row.v[i] * h * 0.24 * (1 - depth) * (0.6 + bassV * 1.2 + (r === 0 ? beatE * 0.8 : 0)) * I;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    const boost = row.hot ? 0.9 : 0;
    c.strokeStyle = CMix(1 - depth, Math.min(1, 0.15 + (1 - depth) * 0.8 + boost * 0.5), 62 + boost * 22);
    c.lineWidth = (1 + (1 - depth) * 2.2 + boost * 2.2) * TK;
    glow(10 + boost * 22, CMix(1 - depth, 1, row.hot ? 78 : 62));
    c.stroke();
  }
  noGlow();
};
