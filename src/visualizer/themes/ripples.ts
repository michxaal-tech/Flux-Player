import type { ThemeDraw } from "../themeTypes";

export const RIPPLES: ThemeDraw = ({ c, cx, cy, R, t, freq, liveAudio, beat, cfg, bassV, I, TK, C1, CMix, glow, noGlow, L }) => {
  if (beat) L.ripples.push({ r: R * 0.05, a: 0.9 });
  if (!liveAudio && t % 50 === 0) L.ripples.push({ r: R * 0.05, a: 0.7 });
  for (let i = L.ripples.length - 1; i >= 0; i--) {
    const rp = L.ripples[i];
    rp.r += R * 0.012 * cfg.speed;
    rp.a *= 0.96;
    if (rp.a < 0.02) { L.ripples.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, cy, rp.r, 0, Math.PI * 2);
    c.strokeStyle = C1(rp.a);
    c.lineWidth = (2 + rp.a * 3) * TK;
    glow(14, C1());
    c.stroke();
  }
  for (let ring = 0; ring < 6; ring++) {
    const fv = liveAudio ? freq[ring * 30 + 5] / 255 : 0.15;
    const rr = R * (0.08 + ring * 0.06) * (1 + fv * 0.35 * I);
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.strokeStyle = CMix(ring / 6, 0.25 + fv * 0.6);
    c.lineWidth = (1.2 + fv * 4) * TK;
    c.stroke();
  }
  noGlow();
};
