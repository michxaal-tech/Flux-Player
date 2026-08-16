import type { ThemeDraw } from "../themeTypes";

interface Rocket { x: number; y: number; vy: number; targetY: number; hue: number; }
interface Spark {
  x: number; y: number; vx: number; vy: number; a: number; hue: number;
  tw: number; sz: number; white: boolean;
}

// Fireworks show. Every beat launches rockets that climb with sparkling
// trails and burst into peony shells at the top; quiet passages get small
// ambient launches so the sky never goes dead.
export const FIREWORKS: ThemeDraw = ({ c, w, h, t, vt, beat, beatE, bassV, trebV, TK, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.fireworks ??= { rockets: [] as Rocket[], sparks: [] as Spark[] });

  const launch = (big: boolean) => {
    S.rockets.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: h * 1.02,
      vy: -h * (0.011 + Math.random() * 0.005) * (big ? 1.1 : 0.85),
      targetY: h * (0.16 + Math.random() * 0.3),
      hue: Math.random(),
    });
  };
  if (beat) {
    launch(true);
    if (bassV > 0.45) launch(true);
  }
  if (!S.rockets.length && S.sparks.length < 12 && t % 100 === 0) launch(false);

  // rockets climb, dropping a sparkle trail
  for (let i = S.rockets.length - 1; i >= 0; i--) {
    const r = S.rockets[i];
    r.y += r.vy;
    if (t % 2 === 0)
      S.sparks.push({
        x: r.x + (Math.random() - 0.5) * 3, y: r.y, vx: (Math.random() - 0.5) * 0.4,
        vy: h * 0.001, a: 0.5, hue: r.hue, tw: Math.random() * 9, sz: 0.9, white: true,
      });
    c.fillStyle = CMix(r.hue, 0.95, 88);
    glow(12, CMix(r.hue));
    c.beginPath();
    c.arc(r.x, r.y, 2.2 * TK, 0, Math.PI * 2);
    c.fill();
    if (r.y <= r.targetY) {
      // burst: peony shell + white core flash
      const count = Math.floor(46 + bassV * 40);
      const base = h * (0.0035 + Math.random() * 0.002) * (0.85 + bassV * 0.5);
      for (let k = 0; k < count; k++) {
        const a2 = (k / count) * Math.PI * 2 + Math.random() * 0.1;
        const sp = base * (0.85 + Math.random() * 0.3);
        S.sparks.push({
          x: r.x, y: r.y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
          a: 1, hue: r.hue, tw: Math.random() * 9, sz: 1.2 + Math.random() * 1.6, white: false,
        });
      }
      S.sparks.push({ x: r.x, y: r.y, vx: 0, vy: 0, a: 1, hue: r.hue, tw: 0, sz: 14, white: true });
      S.rockets.splice(i, 1);
    }
  }

  // sparks: drag + gravity + twinkle
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const s2 = S.sparks[i];
    s2.x += s2.vx;
    s2.y += s2.vy;
    s2.vx *= 0.965;
    s2.vy = s2.vy * 0.965 + h * 0.00022;
    s2.a *= s2.sz > 6 ? 0.82 : 0.972; // core flashes die fast
    if (s2.a < 0.03 || s2.y > h * 1.05) { S.sparks.splice(i, 1); continue; }
    const twinkle = 0.55 + 0.45 * Math.sin(vt * 0.3 + s2.tw);
    c.fillStyle = s2.white
      ? CMix(s2.hue, s2.a * twinkle, 90)
      : CMix(s2.hue, s2.a * twinkle, 68 + beatE * 8);
    glow(s2.sz > 6 ? 40 : 10, CMix(s2.hue));
    c.beginPath();
    c.arc(s2.x, s2.y, s2.sz * (s2.sz > 6 ? s2.a : 1) * TK, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();

  // faint ground haze that catches the light of the show
  const glowAmt = Math.min(0.5, S.sparks.length / 200) + beatE * 0.1;
  const gg = c.createLinearGradient(0, h * 0.86, 0, h);
  gg.addColorStop(0, "transparent");
  gg.addColorStop(1, CMix(0.5, glowAmt * 0.4, 50));
  c.fillStyle = gg;
  c.fillRect(0, h * 0.86, w, h * 0.14);

  // treble glitter high in the sky
  if (trebV > 0.12) {
    for (let i = 0; i < 6; i++) {
      c.fillStyle = CMix(Math.random(), trebV * 0.4 * Math.random(), 88);
      c.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5);
    }
  }
};
