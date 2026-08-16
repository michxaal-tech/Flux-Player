import type { ThemeDraw } from "../themeTypes";

// Circular spectrum analyzer — the most literal "see the music" theme.
// Mirrored frequency bars around a ring, live BPM in the center, and an
// echo ring fired on every beat.
export const HALO: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, beat, beatE, bassV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.halo ??= { echoes: [] as { r: number; a: number }[] });
  const r0 = R * (0.2 + bassV * 0.04 + beatE * 0.03);

  if (beat) S.echoes.push({ r: r0, a: 0.8 });
  for (let i = S.echoes.length - 1; i >= 0; i--) {
    const e = S.echoes[i];
    e.r += R * 0.018;
    e.a *= 0.9;
    if (e.a < 0.03) { S.echoes.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, cy, e.r, 0, Math.PI * 2);
    c.strokeStyle = C2(e.a, 75);
    c.lineWidth = (1.5 + e.a * 5) * TK;
    glow(18, C2());
    c.stroke();
  }

  const N = 96;
  const rot = vt * 0.0012;
  c.lineCap = "round";
  for (let i = 0; i < N; i++) {
    const m = i < N / 2 ? i / (N / 2) : (N - i) / (N / 2); // mirrored, bass at top
    const fv = liveAudio ? freq[Math.floor(m * 170)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i * 0.4);
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2 + rot;
    const len = r0 * 0.12 + fv * R * 0.26 * I * (1 + beatE * 0.55);
    c.strokeStyle = CMix(fv, 0.35 + fv * 0.6 + beatE * 0.2, 62 + beatE * 12);
    c.lineWidth = ((Math.PI * 2 * r0) / N) * 0.5 * TK;
    glow(10 + fv * 14 + beatE * 12, CMix(fv));
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    c.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
    c.stroke();
  }
  c.lineCap = "butt";
  noGlow();

  // live BPM readout in the center, pulsing with the beat
  c.globalCompositeOperation = "source-over";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `700 ${Math.floor(R * 0.11 * (1 + beatE * 0.1))}px 'JetBrains Mono', monospace`;
  c.fillStyle = `rgba(255,255,255,${0.85 + beatE * 0.15})`;
  glow(16 + beatE * 26, C1());
  c.fillText(L.bpm ? `${L.bpm}` : "––", cx, cy - R * 0.015);
  noGlow();
  c.font = `700 ${Math.floor(R * 0.026)}px 'Space Grotesk', sans-serif`;
  c.fillStyle = "rgba(255,255,255,0.45)";
  c.fillText("BPM", cx, cy + R * 0.07);
  c.globalCompositeOperation = "lighter";
};
