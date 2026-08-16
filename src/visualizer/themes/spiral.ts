import type { ThemeDraw } from "../themeTypes";

// Galaxy spiral, rebuilt for drama: the whole spiral breathes with the bass,
// spins harder on every beat, and each beat fires a white-hot shockwave that
// races outward along the spiral arm.
export const SPIRAL: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, beat, beatE, bassV, I, TK, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.spiral ??= { rot: 0, pulses: [] as { p: number }[] });
  S.rot += 0.012 + beatE * 0.05;
  if (beat) S.pulses.push({ p: 0 });

  const breathe = 1 + bassV * 0.25 + beatE * 0.12;
  const pos = (p: number): [number, number] => {
    const ang = p * Math.PI * 10 + S.rot;
    const rr = p * R * 0.55 * breathe;
    return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.85];
  };

  const dots = 220;
  for (let i = 0; i < dots; i++) {
    const p = i / dots;
    const fv = liveAudio ? freq[Math.floor(p * 200)] / 255 : 0.18;
    const [x, y] = pos(p);
    c.fillStyle = CMix(p, 0.3 + fv * 0.65 + beatE * 0.25, 70 + beatE * 10);
    glow(10 + beatE * 16, CMix(p));
    c.beginPath();
    c.arc(x, y, (1 + fv * 7 * I + bassV * 2.5) * (1 + beatE * 0.9) * TK, 0, Math.PI * 2);
    c.fill();
  }

  // shockwaves racing outward along the arm
  for (let k = S.pulses.length - 1; k >= 0; k--) {
    const pulse = S.pulses[k];
    pulse.p += 0.022 + bassV * 0.012;
    if (pulse.p >= 1.08) { S.pulses.splice(k, 1); continue; }
    const fade = Math.max(0, 1 - pulse.p * 0.85);
    for (let j = -4; j <= 4; j++) {
      const p = Math.min(1, Math.max(0.02, pulse.p + j * 0.012));
      const [x, y] = pos(p);
      c.fillStyle = CMix(p, fade * (1 - Math.abs(j) / 5), 88);
      glow(26, CMix(p, 1, 80));
      c.beginPath();
      c.arc(x, y, (5 - Math.abs(j)) * (1.4 + beatE * 0.8) * TK, 0, Math.PI * 2);
      c.fill();
    }
  }

  // bright galactic core that detonates with the beat
  const coreR = R * (0.03 + bassV * 0.04 + beatE * 0.06);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
  g.addColorStop(0, `rgba(255,255,255,${0.2 + beatE * 0.4})`);
  g.addColorStop(0.4, CMix(0.5, 0.25 + beatE * 0.35, 70));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
  c.fill();
  noGlow();
};
