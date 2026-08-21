import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// Water rings. Beat: a double ripple slams outward and the inner rings surge.
export const RIPPLES: ThemeDraw = ({ c, fs, cx, cy, R, every, freq, liveAudio, beat, beatE, cfg, bassV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  if (beat) {
    L.ripples.push({ r: R * 0.05, a: 1 });
    L.ripples.push({ r: R * 0.02, a: 0.7 });
  }
  if (!liveAudio && every(50)) L.ripples.push({ r: R * 0.05, a: 0.7 });
  for (let i = L.ripples.length - 1; i >= 0; i--) {
    const rp = L.ripples[i];
    rp.r += R * (0.012 + bassV * 0.01) * cfg.speed * fs;
    rp.a *= dk(0.96, fs);
    if (rp.a < 0.02) { L.ripples.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, cy, rp.r, 0, Math.PI * 2);
    c.strokeStyle = C1(rp.a, 62 + rp.a * 20);
    c.lineWidth = (2 + rp.a * 3 + beatE * 3) * TK;
    glow(14 * (1 + beatE), C1());
    c.stroke();
  }
  for (let ring = 0; ring < 6; ring++) {
    const fv = liveAudio ? freq[ring * 30 + 5] / 255 : 0.15;
    const rr = R * (0.08 + ring * 0.06) * (1 + fv * 0.35 * I + beatE * 0.12);
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.strokeStyle = CMix(ring / 6, 0.25 + fv * 0.6 + beatE * 0.25, 62 + beatE * 12);
    c.lineWidth = (1.2 + fv * 4 + beatE * 2.5) * TK;
    c.stroke();
  }
  // splash core on the beat
  if (beatE > 0.2) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.1 * beatE + R * 0.03);
    g.addColorStop(0, C2(beatE * 0.8, 80));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, R * 0.15, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
