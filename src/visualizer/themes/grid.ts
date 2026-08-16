import type { ThemeDraw } from "../themeTypes";

export const GRID: ThemeDraw = ({ c, w, h, cx, cy, R, freq, liveAudio, vt, bassV, midV, I, TK, C1, C2, CMix }) => {
  const horizon = cy * 1.0;
  const sr = R * (0.14 + bassV * 0.08);
  const sg = c.createRadialGradient(cx, horizon - sr * 0.5, 0, cx, horizon - sr * 0.5, sr * 2);
  sg.addColorStop(0, C1(0.5 + bassV * 0.4, 68));
  sg.addColorStop(1, "transparent");
  c.fillStyle = sg;
  c.beginPath();
  c.arc(cx, horizon - sr * 0.5, sr * 2, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 1.2 * TK;
  for (let i = -12; i <= 12; i++) {
    c.beginPath();
    c.moveTo(cx + i * 24, horizon);
    c.lineTo(cx + i * w * 0.12, h);
    c.strokeStyle = C2(0.3 + midV * 0.4);
    c.stroke();
  }
  const scroll = (vt * (1.5 + bassV * 12)) % 60;
  for (let i = 0; i < 14; i++) {
    const p = (i * 60 + scroll) / (14 * 60);
    const y = horizon + Math.pow(p, 2.1) * (h - horizon);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.strokeStyle = C2(0.2 + p * 0.6);
    c.lineWidth = (1 + p * 2.2 + bassV * 2) * TK;
    c.stroke();
  }
  const bars = 40;
  for (let i = 0; i < bars; i++) {
    const fv = liveAudio ? freq[i * 5] / 255 : 0.1 + 0.08 * Math.sin(vt * 0.03 + i * 0.5);
    const bh = fv * h * 0.26 * I;
    const bw2 = w / bars;
    c.fillStyle = CMix(i / bars, 0.75);
    c.fillRect(i * bw2 + 1, horizon - bh, bw2 - 2, bh);
  }
};
