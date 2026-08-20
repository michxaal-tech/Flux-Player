import type { ThemeDraw } from "../themeTypes";

// Mirrored arms. Beat: spin kick, arms flare wide and bright, tips ignite.
export const KALEIDO: ThemeDraw = ({ c, cx, cy, R, fs, freq, liveAudio, vt, beat, beatE, bassV, I, TK, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.kaleido ??= { rot: 0 });
  S.rot += (0.003 + beatE * 0.02) * fs;
  const SEG = 10, armLen = R * 0.52 * (1 + beatE * 0.1);
  for (let s = 0; s < SEG; s++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((s / SEG) * Math.PI * 2 + vt * 0.003 + S.rot);
    if (s % 2) c.scale(1, -1);
    c.beginPath();
    const N = 42;
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + i);
      const x = p * armLen;
      const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV + beatE * 0.6);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(s / SEG, 0.75, 62 + beatE * 14);
    c.lineWidth = (1.6 + bassV * 3.5 + beatE * 3) * TK;
    glow(14 * (1 + beatE * 1.5), CMix(s / SEG));
    c.stroke();
    for (let i = 4; i <= 40; i += 9) {
      const p = i / 42;
      const fv = liveAudio ? freq[Math.floor(p * 160)] / 255 : 0.2;
      const x = p * armLen;
      const y = Math.sin(p * 9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV + beatE * 0.6);
      c.fillStyle = CMix(p, 0.85, 74);
      c.beginPath();
      c.arc(x, y, (1.5 + fv * 5 + bassV * 3) * (1 + beatE * 0.8) * TK, 0, Math.PI * 2);
      c.fill();
    }
    // tip flare on the beat
    if (beatE > 0.25) {
      const fv = liveAudio ? freq[150] / 255 : 0.2;
      const y = Math.sin(9 + vt * 0.03) * armLen * 0.16 * (0.4 + fv * 1.6 * I) * (0.3 + bassV + beatE * 0.6);
      c.fillStyle = CMix(s / SEG, beatE * 0.9, 85);
      glow(30, CMix(s / SEG, 1, 80));
      c.beginPath();
      c.arc(armLen, y, beatE * 9 * TK, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  noGlow();
};
