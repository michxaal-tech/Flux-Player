import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// Supernova. The star core charges up with the music, then every beat
// detonates it — debris blasts outward with a white shock ring, and the core
// collapses to start charging again.
export const NOVA: ThemeDraw = ({ c, fs, cx, cy, R, treb, beat, beatE, bass, bassV, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.nova ??= {
    charge: 0.25,
    flash: 0,
    debris: [] as { x: number; y: number; vx: number; vy: number; a: number; hue: number }[],
  });
  S.charge = Math.min(1, S.charge + bass * 0.006 + 0.0006);
  if (beat && S.charge > 0.3) {
    const count = Math.floor(25 + S.charge * 55);
    for (let k = 0; k < count; k++) {
      const a2 = Math.random() * Math.PI * 2;
      const sp = R * (0.004 + Math.random() * 0.014) * (0.5 + S.charge);
      S.debris.push({ x: cx, y: cy, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp, a: 1, hue: Math.random() });
    }
    S.flash = 1;
    S.charge = 0.15;
  }
  S.flash *= dk(0.87, fs);

  // shock ring
  if (S.flash > 0.03) {
    const ringR = R * 0.5 * (1 - S.flash) + R * 0.05;
    c.beginPath();
    c.arc(cx, cy, ringR, 0, Math.PI * 2);
    c.strokeStyle = C2(S.flash * 0.9, 86);
    c.lineWidth = (2 + S.flash * 8) * TK;
    glow(30, C1());
    c.stroke();
  }

  // debris with motion trails
  for (let i = S.debris.length - 1; i >= 0; i--) {
    const d = S.debris[i];
    const px = d.x, py = d.y;
    d.x += d.vx * fs;
    d.y += d.vy * fs;
    d.vx *= dk(0.985, fs);
    d.vy *= dk(0.985, fs);
    d.a *= dk(0.965, fs);
    if (d.a < 0.03) { S.debris.splice(i, 1); continue; }
    c.strokeStyle = CMix(d.hue, d.a * 0.9, 68);
    c.lineWidth = (0.8 + d.a * 2.4) * TK;
    c.beginPath();
    c.moveTo(px - d.vx * 2, py - d.vy * 2);
    c.lineTo(d.x, d.y);
    c.stroke();
  }

  // accretion sparks spiralling into the core while it charges
  for (let i = 0; i < 24; i++) {
    const ph = i * 2.4 + L.vt * 0.02 * (1 + i * 0.02);
    const rr = R * (0.09 + ((i * 37) % 100) / 100 * 0.28) * (1.2 - S.charge * 0.5);
    const x = cx + Math.cos(ph) * rr;
    const y = cy + Math.sin(ph) * rr * 0.9;
    c.fillStyle = CMix(i / 24, 0.2 + S.charge * 0.5, 70);
    c.beginPath();
    c.arc(x, y, (0.8 + S.charge * 1.8) * TK, 0, Math.PI * 2);
    c.fill();
  }

  // the star itself — swells as it charges, jitters with the treble
  const jx = (Math.random() - 0.5) * treb * 14;
  const jy = (Math.random() - 0.5) * treb * 14;
  const coreR = R * (0.03 + S.charge * 0.06 + bassV * 0.02) * (1 + S.flash * 0.5);
  const g = c.createRadialGradient(cx + jx, cy + jy, 0, cx + jx, cy + jy, coreR * 2.2);
  g.addColorStop(0, C1(0.85 + S.flash * 0.15, 92));
  g.addColorStop(0.18, C1(0.6 + S.charge * 0.3, 70));
  g.addColorStop(0.55, C2(0.22, 58));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  glow(18 + S.charge * 20, C1());
  c.beginPath();
  c.arc(cx + jx, cy + jy, coreR * 2.2, 0, Math.PI * 2);
  c.fill();
  noGlow();
};
