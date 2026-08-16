import type { ThemeDraw } from "../themeTypes";

export const DOTGRID: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, bassV, I, CMix }) => {
  const cols = 18, rows = 11;
  const gw = w / cols, gh = h / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const bin = Math.floor(((gx + gy * cols) / (cols * rows)) * 200);
      const fv = liveAudio ? freq[bin] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + gx + gy);
      const pulse = fv * I + bassV * 0.25;
      const rr = Math.min(gw, gh) * 0.42 * Math.min(1, pulse * 1.4);
      if (rr < 0.6) continue;
      c.fillStyle = CMix(gx / cols, 0.25 + pulse * 0.7, 65);
      c.beginPath();
      c.arc(gx * gw + gw / 2, gy * gh + gh / 2, rr, 0, Math.PI * 2);
      c.fill();
    }
  }
};
