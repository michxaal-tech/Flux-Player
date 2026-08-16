import type { ThemeDraw } from "../themeTypes";

// Mirror spectrum bars with falling peak caps. Beat: bars stretch and burn brighter.
export const BARS: ThemeDraw = ({ c, w, h, cy, freq, liveAudio, vt, beatE, I, TK, C1, C2, glow, noGlow, L }) => {
  const N = 64, bw2 = w / N;
  const S = (L.scratch.bars ??= { caps: new Array(N).fill(0) as number[] });
  for (let i = 0; i < N; i++) {
    const v = (liveAudio ? freq[Math.floor((i / N) * 200)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.5)) * I;
    const bh = Math.min(0.48, v * 0.42 * (1 + beatE * 0.45)) * h;
    S.caps[i] = Math.max(S.caps[i] - h * 0.004, bh);
    const grad = c.createLinearGradient(0, cy - bh, 0, cy + bh);
    grad.addColorStop(0, C2(0.9, 62 + beatE * 14));
    grad.addColorStop(0.5, C1(0.95, 62 + beatE * 16));
    grad.addColorStop(1, C2(0.9, 62 + beatE * 14));
    c.fillStyle = grad;
    glow(12 * (1 + beatE * 1.5), C1());
    c.fillRect(i * bw2 + 1.5, cy - bh, bw2 - 3, bh * 2);
    // peak caps
    c.fillStyle = C1(0.9, 80);
    c.fillRect(i * bw2 + 1.5, cy - S.caps[i] - 3 * TK, bw2 - 3, 2.2 * TK);
    c.fillRect(i * bw2 + 1.5, cy + S.caps[i] + 0.8 * TK, bw2 - 3, 2.2 * TK);
  }
  noGlow();
};
