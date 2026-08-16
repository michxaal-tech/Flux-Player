import type { ThemeDraw } from "../themeTypes";

export const BARS: ThemeDraw = ({ c, w, h, cy, freq, liveAudio, vt, I, TK, C1, C2, glow, noGlow }) => {
  const N = 64, bw2 = w / N;
  for (let i = 0; i < N; i++) {
    const v = (liveAudio ? freq[Math.floor((i / N) * 200)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.5)) * I;
    const bh = Math.min(0.48, v * 0.42) * h;
    const grad = c.createLinearGradient(0, cy - bh, 0, cy + bh);
    grad.addColorStop(0, C2(0.9));
    grad.addColorStop(0.5, C1(0.95));
    grad.addColorStop(1, C2(0.9));
    c.fillStyle = grad;
    glow(12, C1());
    c.fillRect(i * bw2 + 1.5, cy - bh, bw2 - 3, bh * 2);
  }
  noGlow();
};
