import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// Waveform ring. Beat: the ring kicks outward and fires an expanding echo ring.
export const RING: ThemeDraw = ({ c, fs, cx, cy, R, wave, beat, beatE, bassV, I, TK, C1, C2, glow, noGlow, L }) => {
  const S = (L.scratch.ring ??= { echoes: [] as { r: number; a: number }[] });
  const base = R * (0.2 + bassV * 0.07) * (1 + beatE * 0.12);

  if (beat) S.echoes.push({ r: base, a: 0.85 });
  for (let i = S.echoes.length - 1; i >= 0; i--) {
    const e = S.echoes[i];
    e.r += R * 0.02 * fs;
    e.a *= dk(0.9, fs);
    if (e.a < 0.03) { S.echoes.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, cy, e.r, 0, Math.PI * 2);
    c.strokeStyle = C2(e.a, 75);
    c.lineWidth = (2 + e.a * 6) * TK;
    glow(20, C2());
    c.stroke();
  }

  for (let pass = 0; pass < 2; pass++) {
    c.beginPath();
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const wvv = (wave[Math.floor((i / N) * 1023)] - 128) / 128;
      const rad = base + wvv * base * (0.4 + bassV * 0.5 + beatE * 0.6) * I;
      i === 0
        ? c.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad)
        : c.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    c.closePath();
    c.strokeStyle = pass === 0 ? C1(0.95) : C2(0.5);
    c.lineWidth = (pass === 0 ? 2.5 + beatE * 3 : 7 + bassV * 12 + beatE * 10) * TK;
    glow((pass === 0 ? 16 : 36) * (1 + beatE), C1());
    c.stroke();
  }
  noGlow();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, base);
  g.addColorStop(0, C1(0.2 + bassV * 0.5 + beatE * 0.3, 70 + beatE * 15));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, base, 0, Math.PI * 2);
  c.fill();
};
