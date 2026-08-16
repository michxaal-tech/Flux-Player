import type { ThemeDraw } from "../themeTypes";

export const AURORA: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, bassV, I, CMix }) => {
  for (let k = 0; k < 4; k++) {
    const band = liveAudio ? freq[20 + k * 40] / 255 : 0.15;
    for (let x = 0; x <= w; x += 12) {
      const yTop =
        h * 0.18 +
        Math.sin(x * 0.008 + vt * 0.016 + k * 1.7) * h * 0.09 +
        Math.sin(x * 0.003 - vt * 0.01 + k) * h * 0.05;
      const len = h * (0.16 + band * 0.4 * I + bassV * 0.1);
      const g = c.createLinearGradient(0, yTop, 0, yTop + len);
      g.addColorStop(0, CMix(k / 4, 0.02));
      g.addColorStop(0.4, CMix(k / 4, 0.16 + band * 0.3, 65));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(x, yTop, 9, len);
    }
  }
};
