import type { ThemeDraw } from "../themeTypes";

// LED matrix. Beat: a bright circular wave sweeps across the grid from the center.
export const DOTGRID: ThemeDraw = ({ c, w, h, cx, cy, freq, liveAudio, vt, beat, beatE, bassV, I, CMix, L }) => {
  const S = (L.scratch.dotgrid ??= { waves: [] as number[] });
  if (beat) S.waves.push(0);
  const maxD = Math.hypot(cx, cy);
  for (let i = S.waves.length - 1; i >= 0; i--) {
    S.waves[i] += maxD * 0.035;
    if (S.waves[i] > maxD * 1.3) S.waves.splice(i, 1);
  }
  const cols = 18, rows = 11;
  const gw = w / cols, gh = h / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = gx * gw + gw / 2, py = gy * gh + gh / 2;
      const bin = Math.floor(((gx + gy * cols) / (cols * rows)) * 200);
      const fv = liveAudio ? freq[bin] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + gx + gy);
      let pulse = fv * I + bassV * 0.25;
      // wavefront boost
      let hot = 0;
      const d = Math.hypot(px - cx, py - cy);
      for (const wr of S.waves) {
        const k = Math.max(0, 1 - Math.abs(d - wr) / (gw * 1.6));
        hot = Math.max(hot, k);
      }
      pulse += hot * 0.9;
      const rr = Math.min(gw, gh) * 0.42 * Math.min(1.35, pulse * 1.4);
      if (rr < 0.6) continue;
      c.fillStyle = CMix(gx / cols, Math.min(1, 0.25 + pulse * 0.7), 65 + hot * 22);
      c.beginPath();
      c.arc(px, py, rr, 0, Math.PI * 2);
      c.fill();
    }
  }
};
