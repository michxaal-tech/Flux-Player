import type { ThemeDraw } from "../themeTypes";

// Double helix. Beat: amplitude jolt, nodes swell, rungs light up in a travelling flash.
export const HELIX: ThemeDraw = ({ c, fs, w, h, cy, freq, liveAudio, vt, beat, beatE, bassV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.helix ??= { flash: -1 });
  if (beat) S.flash = 0;
  if (S.flash >= 0) {
    S.flash += 0.06 * fs;
    if (S.flash > 1.3) S.flash = -1;
  }
  const amp = h * (0.12 + bassV * 0.12) * (1 + beatE * 0.4);
  const N = 60;
  for (let strand = 0; strand < 2; strand++) {
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * (w + 40) - 20;
      const ph = (i / N) * Math.PI * 4 + vt * 0.03 + strand * Math.PI;
      const y = cy + Math.sin(ph) * amp;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = strand ? C2(0.8, 62 + beatE * 14) : C1(0.8, 62 + beatE * 14);
    c.lineWidth = (2 + bassV * 3 + beatE * 3) * TK;
    glow(16 * (1 + beatE), strand ? C2() : C1());
    c.stroke();
  }
  for (let i = 0; i <= N; i += 3) {
    const p = i / N;
    const x = p * (w + 40) - 20;
    const ph = p * Math.PI * 4 + vt * 0.03;
    const y1 = cy + Math.sin(ph) * amp;
    const y2 = cy + Math.sin(ph + Math.PI) * amp;
    const fv = liveAudio ? freq[Math.floor(p * 180)] / 255 : 0.2;
    // travelling rung flash after each beat
    const hot = S.flash >= 0 ? Math.max(0, 1 - Math.abs(p - S.flash) * 6) : 0;
    c.strokeStyle = CMix(p, 0.22 + fv * 0.5 + hot * 0.7, 62 + hot * 25);
    c.lineWidth = (1 + hot * 3) * TK;
    c.beginPath();
    c.moveTo(x, y1);
    c.lineTo(x, y2);
    c.stroke();
    const sz = (2 + fv * 6 * I) * (1 + beatE * 0.9 + hot) * TK;
    c.fillStyle = C1(0.9, 72 + hot * 20);
    c.beginPath(); c.arc(x, y1, sz, 0, Math.PI * 2); c.fill();
    c.fillStyle = C2(0.9, 72 + hot * 20);
    c.beginPath(); c.arc(x, y2, sz, 0, Math.PI * 2); c.fill();
  }
  noGlow();
};
