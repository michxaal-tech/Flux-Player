import type { ThemeDraw } from "../themeTypes";

interface Lantern {
  x: number; y: number; sway: number; sz: number; sp: number; hue: number;
}

// Festival night: glowing paper lanterns drift up over still water that
// carries their wobbling reflections. On the beat every lantern flares and
// sheds rising embers.
export const LANTERNS: ThemeDraw = ({ c, w, h, vt, beat, beatE, cfg, bassV, midV, trebV, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.lanterns ??= {
    l: Array.from({ length: 14 }, (_, i) => ({
      x: (i * 0.37 + 0.05) % 1,
      y: Math.random(),
      sway: Math.random() * Math.PI * 2,
      sz: 0.55 + Math.random() * 0.6,
      sp: 0.7 + Math.random() * 0.6,
      hue: Math.random(),
    })) as Lantern[],
    embers: [] as { x: number; y: number; vx: number; vy: number; a: number }[],
  });

  c.globalCompositeOperation = "source-over";
  const waterY = h * 0.78;

  // sky stars
  for (let i = 0; i < 30; i++) {
    const sx = (i * 487) % w;
    const sy = (i * 331) % Math.floor(waterY * 0.85);
    const tw = 0.2 + Math.abs(Math.sin(vt * 0.015 + i * 2.1)) * 0.45 + trebV * 0.3;
    c.fillStyle = `rgba(255,255,255,${Math.min(1, tw) * 0.55})`;
    c.fillRect(sx, sy, 1.5, 1.5);
  }

  // water
  const wg = c.createLinearGradient(0, waterY, 0, h);
  wg.addColorStop(0, CMix(0.5, 0.5, 14));
  wg.addColorStop(1, CMix(0.5, 0.85, 6));
  c.fillStyle = wg;
  c.fillRect(0, waterY, w, h - waterY);

  c.globalCompositeOperation = "lighter";
  for (const ln of S.l) {
    ln.y -= ln.sp * (0.0006 + bassV * 0.0007) * cfg.speed;
    ln.x += Math.sin(vt * 0.008 + ln.sway) * 0.0005;
    if (ln.y < -0.08) { ln.y = 1.05; ln.x = Math.random(); }
    const lx = ln.x * w;
    const ly = ln.y * (waterY - h * 0.05);
    const lw = ln.sz * Math.min(w, h) * 0.028 * (1 + beatE * 0.18);
    const lh = lw * 1.45;
    const bright = 0.55 + midV * 0.3 + beatE * 0.45;

    // halo
    const hg = c.createRadialGradient(lx, ly, 0, lx, ly, lw * 4);
    hg.addColorStop(0, CMix(ln.hue, bright * 0.45, 70));
    hg.addColorStop(1, "transparent");
    c.fillStyle = hg;
    c.beginPath();
    c.arc(lx, ly, lw * 4, 0, Math.PI * 2);
    c.fill();

    // paper body (teardrop)
    const bg2 = c.createRadialGradient(lx, ly + lh * 0.1, 0, lx, ly, lh);
    bg2.addColorStop(0, `hsla(0, 0%, 100%, ${bright})`);
    bg2.addColorStop(0.45, CMix(ln.hue, bright, 72));
    bg2.addColorStop(1, CMix(ln.hue, bright * 0.55, 55));
    c.fillStyle = bg2;
    glow(14 * (1 + beatE), CMix(ln.hue));
    c.beginPath();
    c.ellipse(lx, ly, lw, lh, 0, 0, Math.PI * 2);
    c.fill();
    noGlow();
    // rim + mouth
    c.fillStyle = CMix(ln.hue, bright * 0.8, 40);
    c.fillRect(lx - lw * 0.5, ly + lh * 0.88, lw, lh * 0.14);

    // reflection: wobbling vertical streak
    const ry0 = waterY + (waterY - ly) * 0.06;
    c.strokeStyle = CMix(ln.hue, 0.16 + beatE * 0.14, 62);
    c.lineWidth = lw * 0.5 * TK;
    c.beginPath();
    for (let yy = ry0; yy < h; yy += 7) {
      const ox = Math.sin(yy * 0.06 + vt * 0.04 + ln.sway) * 4;
      yy === ry0 ? c.moveTo(lx + ox, yy) : c.lineTo(lx + ox, yy);
    }
    c.stroke();

    if (beat && Math.random() < 0.6)
      S.embers.push({ x: lx, y: ly + lh * 0.9, vx: (Math.random() - 0.5) * 0.5, vy: -0.6 - Math.random(), a: 1 });
  }

  for (let i = S.embers.length - 1; i >= 0; i--) {
    const e = S.embers[i];
    e.x += e.vx;
    e.y += e.vy;
    e.a *= 0.97;
    if (e.a < 0.05) { S.embers.splice(i, 1); continue; }
    c.fillStyle = C1(e.a, 75);
    c.beginPath();
    c.arc(e.x, e.y, 1.4 * TK, 0, Math.PI * 2);
    c.fill();
  }
};
