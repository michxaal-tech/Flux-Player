import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// Rotating beam fan. Beat: the whole rig jolts around its axis, beams double
// in reach and a white core detonates.
export const LASERS: ThemeDraw = ({ c, cx, cy, R, fs, freq, liveAudio, vt, beat, beatE, bassV, I, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.lasers ??= { jolt: 0 });
  if (beat) S.jolt += 0.35;
  S.jolt *= dk(0.94, fs);
  const beams = 14;
  for (let i = 0; i < beams; i++) {
    const fv = liveAudio ? freq[Math.floor((i / beams) * 200)] / 255 : 0.2;
    const ang = vt * 0.004 * (i % 2 ? 1 : -1) + (i / beams) * Math.PI * 2 + S.jolt * (i % 2 ? 1 : -1);
    const len = R * (0.5 + fv * 0.6 * I + bassV * 0.3 + beatE * 0.5);
    c.strokeStyle = CMix(i / beams, 0.25 + fv * 0.65 + beatE * 0.3, 62 + beatE * 15);
    c.lineWidth = (1.5 + fv * 4 + bassV * 2 + beatE * 4) * TK;
    glow(20 * (1 + beatE), CMix(i / beams));
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    c.stroke();
    // hot tip
    if (beatE > 0.2) {
      c.fillStyle = CMix(i / beams, beatE, 85);
      c.beginPath();
      c.arc(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, beatE * 6 * TK, 0, Math.PI * 2);
      c.fill();
    }
  }
  noGlow();
  const coreR = R * (0.08 + bassV * 0.08 + beatE * 0.1);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  g.addColorStop(0, C1(0.5 + bassV * 0.5, 90));
  g.addColorStop(0.4, C1(0.4 + beatE * 0.5));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, R * 0.2 * (1 + beatE * 0.6), 0, Math.PI * 2);
  c.fill();
};
