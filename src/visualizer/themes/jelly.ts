import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Jelly {
  x: number; y: number; vy: number; ph: number; sz: number; hue: number;
}

// Bioluminescent deep sea. Jellyfish drift in the dark and pulse-swim on
// every beat — bells contract, glow spikes, plankton lights up around them.
export const JELLY: ThemeDraw = ({ c, fs, w, h, vt, beat, beatE, cfg, bassV, midV, trebV, TK, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.jelly ??= {
    j: Array.from({ length: 6 }, (_, i) => ({
      x: (i * 0.31 + 0.08) % 1,
      y: 0.15 + ((i * 0.43) % 0.7),
      vy: 0,
      ph: Math.random() * Math.PI * 2,
      sz: 0.55 + Math.random() * 0.7,
      hue: Math.random(),
    })) as Jelly[],
  });

  // plankton field
  for (let i = 0; i < 40; i++) {
    const px = (i * 379) % w;
    const py = ((i * 197) % h) + Math.sin(vt * 0.01 + i) * 6;
    const a = 0.06 + Math.abs(Math.sin(vt * 0.02 + i * 1.3)) * 0.12 + trebV * 0.25 + beatE * 0.15;
    c.fillStyle = CMix((i % 10) / 10, a, 70);
    c.beginPath();
    c.arc(px, py, 1.2 * TK, 0, Math.PI * 2);
    c.fill();
  }

  for (const j of S.j) {
    // constant gentle rise plus a swim pulse on the beat; wrap top → bottom
    // so the school flows upward through the frame forever
    if (beat) j.vy -= 0.0016 * j.sz;
    j.vy = j.vy * dk(0.95, fs) - 0.000012 * fs;
    j.vy = Math.max(j.vy, -0.004);
    j.y += j.vy * cfg.speed * fs;
    j.x += Math.sin(vt * 0.006 + j.ph) * 0.0004 * fs;
    if (j.y < -0.14) { j.y = 1.14; j.x = Math.random(); j.vy = 0; }
    const jx = j.x * w, jy = j.y * h;
    // bell contracts (narrower, taller) at the pulse
    const pulse = beatE;
    const rx = j.sz * Math.min(w, h) * 0.055 * (1 - pulse * 0.22);
    const ry = rx * (0.72 + pulse * 0.3);
    const bright = 0.3 + midV * 0.25 + pulse * 0.45;

    // tentacles first, behind the bell
    const N = 6;
    for (let k = 0; k < N; k++) {
      const tx = jx + ((k / (N - 1)) - 0.5) * rx * 1.5;
      const len = ry * (3.2 + j.sz) * (1 + pulse * 0.2);
      c.strokeStyle = CMix(j.hue, bright * 0.55, 62);
      c.lineWidth = (0.9 + pulse * 0.8) * TK;
      c.beginPath();
      c.moveTo(tx, jy + ry * 0.6);
      for (let s2 = 1; s2 <= 6; s2++) {
        const p = s2 / 6;
        const wig = Math.sin(vt * 0.05 + j.ph + k * 1.2 + p * 5) * rx * 0.4 * p * (1 + midV);
        c.lineTo(tx + wig, jy + ry * 0.6 + len * p);
      }
      c.stroke();
      // luminous tentacle tip
      const tipWig = Math.sin(vt * 0.05 + j.ph + k * 1.2 + 5) * rx * 0.4 * (1 + midV);
      c.fillStyle = CMix(j.hue, bright * 0.8, 74);
      c.beginPath();
      c.arc(tx + tipWig, jy + ry * 0.6 + len, 1.5 * TK, 0, Math.PI * 2);
      c.fill();
    }

    // bell
    const bg2 = c.createRadialGradient(jx, jy - ry * 0.2, 0, jx, jy, ry * 1.6);
    bg2.addColorStop(0, CMix(j.hue, bright * 0.9, 88));
    bg2.addColorStop(0.4, CMix(j.hue, bright, 70));
    bg2.addColorStop(1, CMix(j.hue, bright * 0.15, 55));
    c.fillStyle = bg2;
    glow(20 * (1 + pulse * 1.6), CMix(j.hue));
    c.beginPath();
    c.ellipse(jx, jy, rx, ry, 0, Math.PI, 0);
    c.quadraticCurveTo(jx + rx * 0.7, jy + ry * 0.55, jx + rx * 0.3, jy + ry * 0.5);
    c.quadraticCurveTo(jx, jy + ry * 0.2 + Math.sin(vt * 0.08 + j.ph) * ry * 0.15, jx - rx * 0.3, jy + ry * 0.5);
    c.quadraticCurveTo(jx - rx * 0.7, jy + ry * 0.55, jx - rx, jy);
    c.fill();
    noGlow();
    // glowing rim spots
    for (let k = 0; k < 5; k++) {
      const a2 = Math.PI + (k / 4) * Math.PI;
      c.fillStyle = CMix(j.hue, bright * (0.5 + pulse * 0.5), 80);
      c.beginPath();
      c.arc(jx + Math.cos(a2) * rx * 0.85, jy + Math.sin(a2) * ry * 0.85, (1 + pulse * 1.6) * TK, 0, Math.PI * 2);
      c.fill();
    }
  }

  // deep water light shafts, swaying with the bass
  for (let i = 0; i < 4; i++) {
    const sx = w * (0.12 + i * 0.25) + Math.sin(vt * 0.005 + i * 2) * w * 0.03;
    const sg = c.createLinearGradient(sx, 0, sx + w * 0.06, h * 0.7);
    sg.addColorStop(0, CMix(0.3, 0.05 + bassV * 0.06 + beatE * 0.04, 65));
    sg.addColorStop(1, "transparent");
    c.fillStyle = sg;
    c.beginPath();
    c.moveTo(sx, 0);
    c.lineTo(sx + w * 0.05, 0);
    c.lineTo(sx + w * 0.12, h * 0.75);
    c.lineTo(sx + w * 0.02, h * 0.75);
    c.closePath();
    c.fill();
  }
};
