import type { ThemeDraw } from "../themeTypes";

export const CITY: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, bassV, I, TK, C1, C2, CMix, L }) => {
  const N = 26;
  if (!L.cityH.length) L.cityH = new Array(N).fill(0.1);
  const baseY = h * 0.8;
  const bw2 = w / N;
  for (let i = 0; i < N; i++) {
    const fv = liveAudio ? freq[i * 7] / 255 : 0.12 + 0.08 * Math.sin(vt * 0.02 + i);
    L.cityH[i] = Math.max(L.cityH[i] * 0.93, fv * I);
    const bh = L.cityH[i] * h * 0.55;
    c.fillStyle = CMix(i / N, 0.55, 45);
    c.fillRect(i * bw2 + 2, baseY - bh, bw2 - 4, bh);
    // windows
    c.fillStyle = C1(0.8, 78);
    for (let wy = baseY - bh + 6; wy < baseY - 4; wy += 10) {
      for (let wx = i * bw2 + 5; wx < (i + 1) * bw2 - 5; wx += 8) {
        if ((wx * wy) % 3 < 1.4) c.fillRect(wx, wy, 2.4, 3.2);
      }
    }
    // reflection
    c.fillStyle = CMix(i / N, 0.14, 45);
    c.fillRect(i * bw2 + 2, baseY + 2, bw2 - 4, bh * 0.35);
  }
  c.fillStyle = C2(0.8);
  c.fillRect(0, baseY, w, 2 * TK);
};
