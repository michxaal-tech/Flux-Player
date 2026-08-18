import type { ThemeDraw } from "../themeTypes";

// Mirror spectrum bars with falling peak caps. Beat: bars stretch and burn brighter.
export const BARS: ThemeDraw = ({ c, w, h, cy, freq, liveAudio, vt, beatE, I, TK, C1, C2, glow, noGlow, L }) => {
  const N = 64, bw2 = w / N;
  const S = (L.scratch.bars ??= { caps: new Array(N).fill(0) as number[] });
  // heights first, so the drawing below can be split into passes
  const hs: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = (liveAudio ? freq[Math.floor((i / N) * 200)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.5)) * I;
    const bh = Math.min(0.48, v * 0.42 * (1 + beatE * 0.45)) * h;
    hs.push(bh);
    S.caps[i] = Math.max(S.caps[i] - h * 0.004, bh);
  }

  // Pass 1 — the glow, as a single shadowed fill over one path holding every
  // bar. shadowBlur is priced per draw call, and this used to be set inside the
  // loop with three fills per bar: 192 blurred fills a frame, and 163ms with it.
  glow(12 * (1 + beatE * 1.5), C1());
  c.fillStyle = C1(0.9, 62 + beatE * 16);
  c.beginPath();
  for (let i = 0; i < N; i++) c.rect(i * bw2 + 1.5, cy - hs[i], bw2 - 3, hs[i] * 2);
  c.fill();
  noGlow();

  // Pass 2 — the bars themselves, crisp and each with its own vertical ramp.
  for (let i = 0; i < N; i++) {
    const bh = hs[i];
    const grad = c.createLinearGradient(0, cy - bh, 0, cy + bh);
    grad.addColorStop(0, C2(0.9, 62 + beatE * 14));
    grad.addColorStop(0.5, C1(0.95, 62 + beatE * 16));
    grad.addColorStop(1, C2(0.9, 62 + beatE * 14));
    c.fillStyle = grad;
    c.fillRect(i * bw2 + 1.5, cy - bh, bw2 - 3, bh * 2);
  }

  // Pass 3 — peak caps, one path, no glow of their own
  c.fillStyle = C1(0.9, 80);
  c.beginPath();
  for (let i = 0; i < N; i++) {
    c.rect(i * bw2 + 1.5, cy - S.caps[i] - 3 * TK, bw2 - 3, 2.2 * TK);
    c.rect(i * bw2 + 1.5, cy + S.caps[i] + 0.8 * TK, bw2 - 3, 2.2 * TK);
  }
  c.fill();
};
