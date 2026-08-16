import type { ThemeDraw } from "../themeTypes";

// Lissajous oscilloscope. Beat: the figure blows up in scale and burns
// hotter/thicker, like the scope got overdriven.
export const SCOPE: ThemeDraw = ({ c, cx, cy, R, wave, beatE, I, TK, C1, C2, glow, noGlow }) => {
  c.beginPath();
  const SC = R * 0.4 * I * (1 + beatE * 0.3);
  for (let i = 0; i < 1024; i += 4) {
    const px = cx + ((wave[i] - 128) / 128) * SC;
    const py = cy + ((wave[(i + 300) % 1024] - 128) / 128) * SC;
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.strokeStyle = C1(0.8 + beatE * 0.2, 62 + beatE * 18);
  c.lineWidth = (1.6 + beatE * 3) * TK;
  glow(18 * (1 + beatE * 1.5), C1());
  c.stroke();
  c.beginPath();
  for (let i = 0; i < 1024; i += 4) {
    const px = cx + ((wave[(i + 150) % 1024] - 128) / 128) * SC * 0.7;
    const py = cy + ((wave[(i + 500) % 1024] - 128) / 128) * SC * 0.7;
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.strokeStyle = C2(0.55 + beatE * 0.35, 62 + beatE * 14);
  c.lineWidth = (1.2 + beatE * 2) * TK;
  glow(14 * (1 + beatE), C2());
  c.stroke();
  noGlow();
};
