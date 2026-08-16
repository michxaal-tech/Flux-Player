import type { ThemeDraw } from "../themeTypes";

interface Comet {
  x: number; y: number; vx: number; vy: number; a: number; hue: number; sz: number;
}

// Comet shower. Every beat launches blazing comets across the sky with long
// glowing trails; quiet passages keep a few faint drifters alive.
export const COMETS: ThemeDraw = ({ c, w, h, t, beat, beatE, cfg, bassV, trebV, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.comets ??= { list: [] as Comet[] });

  const spawn = (bright: number) => {
    const fromLeft = Math.random() < 0.5;
    const sp = (w * 0.006 + Math.random() * w * 0.008) * (0.7 + bright * 0.6);
    const ang = (Math.random() * 0.35 + 0.12) * (Math.random() < 0.5 ? 1 : -1);
    S.list.push({
      x: fromLeft ? -w * 0.05 : w * 1.05,
      y: h * (0.08 + Math.random() * 0.55),
      vx: (fromLeft ? 1 : -1) * sp * Math.cos(ang),
      vy: sp * Math.sin(ang) * 0.6 + sp * 0.1,
      a: 0.5 + bright * 0.5,
      hue: Math.random(),
      sz: (1.5 + Math.random() * 2.5) * (0.7 + bright),
    });
  };

  if (beat) for (let k = 0; k < 3; k++) spawn(1);
  if (S.list.length < 3 && t % 40 === 0) spawn(0.3);
  if (S.list.length > 40) S.list.splice(0, S.list.length - 40);

  for (let i = S.list.length - 1; i >= 0; i--) {
    const m = S.list[i];
    m.x += m.vx * cfg.speed * (1 + bassV * 0.5);
    m.y += m.vy * cfg.speed;
    m.vy += h * 0.00002; // gentle arc
    if (m.x < -w * 0.2 || m.x > w * 1.2 || m.y > h * 1.1) { S.list.splice(i, 1); continue; }
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const tx = m.vx / sp, ty = m.vy / sp;
    // trail: fading segments stretching back along the path
    const trailLen = sp * (8 + beatE * 8);
    const SEG = 9;
    for (let s2 = 0; s2 < SEG; s2++) {
      const p0 = s2 / SEG, p1 = (s2 + 1) / SEG;
      c.strokeStyle = CMix(m.hue, m.a * (1 - p0) * 0.8, 66 + beatE * 10);
      c.lineWidth = m.sz * (1 - p0 * 0.8) * (1 + beatE * 0.6) * TK;
      c.beginPath();
      c.moveTo(m.x - tx * trailLen * p0, m.y - ty * trailLen * p0);
      c.lineTo(m.x - tx * trailLen * p1, m.y - ty * trailLen * p1);
      c.stroke();
    }
    // head
    c.fillStyle = `hsla(0, 0%, 100%, ${m.a})`;
    glow(18 * (1 + beatE), CMix(m.hue));
    c.beginPath();
    c.arc(m.x, m.y, m.sz * (1 + beatE * 0.7) * TK, 0, Math.PI * 2);
    c.fill();
    noGlow();
  }

  // treble glitter across the sky
  if (trebV > 0.12) {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = C1(trebV * 0.5 * Math.random(), 80);
      c.fillRect(Math.random() * w, Math.random() * h * 0.7, 1.6, 1.6);
    }
  }
};
