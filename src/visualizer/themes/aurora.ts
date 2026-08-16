import type { ThemeDraw } from "../themeTypes";

// Northern lights. Beat: the curtains surge downward and brighten in a wave.
export const AURORA: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beatE, bassV, I, CMix }) => {
  for (let k = 0; k < 4; k++) {
    const band = liveAudio ? freq[20 + k * 40] / 255 : 0.15;
    for (let x = 0; x <= w; x += 12) {
      const yTop =
        h * 0.18 +
        Math.sin(x * 0.008 + vt * 0.016 + k * 1.7) * h * 0.09 +
        Math.sin(x * 0.003 - vt * 0.01 + k) * h * 0.05;
      const len = h * (0.16 + band * 0.4 * I + bassV * 0.1 + beatE * 0.28);
      const g = c.createLinearGradient(0, yTop, 0, yTop + len);
      g.addColorStop(0, CMix(k / 4, 0.02));
      g.addColorStop(0.4, CMix(k / 4, 0.16 + band * 0.3 + beatE * 0.3, 65 + beatE * 12));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(x, yTop, 9, len);
    }
  }
  // shimmering star band that twinkles hard on the beat
  if (beatE > 0.1) {
    for (let i = 0; i < 20; i++) {
      const sx = ((i * 977) % w) + Math.sin(vt * 0.02 + i) * 4;
      const sy = ((i * 613) % Math.floor(h * 0.35)) + 10;
      c.fillStyle = `rgba(255,255,255,${beatE * (0.3 + ((i * 7) % 10) / 14)})`;
      c.fillRect(sx, sy, 2, 2);
    }
  }
};
