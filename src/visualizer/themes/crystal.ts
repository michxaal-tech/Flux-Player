import type { ThemeDraw } from "../themeTypes";

interface Shard {
  ang: number; dist: number; sz: number; spin: number; rot: number; band: number;
}
interface Glint { x: number; y: number; a: number; sz: number; }

// Crystal cluster. Translucent shards orbit a radiant heart, each tuned to a
// frequency band; light beams refract through them, and on the beat the whole
// formation flashes from within and throws off glints.
export const CRYSTAL: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, beat, beatE, bassV, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.crystal ??= {
    shards: Array.from({ length: 10 }, (_, i) => ({
      ang: (i / 10) * Math.PI * 2,
      dist: 0.14 + (i % 3) * 0.075,
      sz: 0.5 + ((i * 7) % 5) / 5,
      spin: (i % 2 ? 1 : -1) * (0.5 + (i % 3) * 0.3),
      rot: i * 1.1,
      band: Math.floor((i / 10) * 190),
    })) as Shard[],
    glints: [] as Glint[],
  });

  // radiant heart
  const heartR = R * (0.05 + bassV * 0.035 + beatE * 0.04);
  const hg = c.createRadialGradient(cx, cy, 0, cx, cy, heartR * 2.6);
  hg.addColorStop(0, C1(0.7 + beatE * 0.3, 90));
  hg.addColorStop(0.35, C1(0.5 + beatE * 0.3, 72));
  hg.addColorStop(1, "transparent");
  c.fillStyle = hg;
  c.beginPath();
  c.arc(cx, cy, heartR * 2.6, 0, Math.PI * 2);
  c.fill();

  for (const sh of S.shards) {
    const fv = liveAudio ? freq[sh.band] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + sh.rot);
    sh.ang += 0.0018 * sh.spin * (1 + beatE * 1.5);
    sh.rot += 0.006 * sh.spin;
    const d = R * sh.dist * (1 + fv * 0.18 + beatE * 0.08);
    const x = cx + Math.cos(sh.ang) * d;
    const y = cy + Math.sin(sh.ang) * d * 0.85;
    const s2 = R * 0.05 * sh.sz * (1 + fv * 0.5);

    // refraction beam from the heart, through the shard, off to the edge
    c.strokeStyle = CMix(sh.band / 190, 0.1 + fv * 0.35 + beatE * 0.3, 70);
    c.lineWidth = (0.8 + fv * 2.2) * TK;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(sh.ang) * R * 0.75, cy + Math.sin(sh.ang) * R * 0.64);
    c.stroke();

    // the shard: elongated diamond, lit from within
    c.save();
    c.translate(x, y);
    c.rotate(sh.rot);
    const inner = 0.25 + fv * 0.5 + beatE * 0.6;
    const grad = c.createLinearGradient(0, -s2, 0, s2);
    grad.addColorStop(0, CMix(sh.band / 190, inner * 0.7, 78));
    grad.addColorStop(0.5, CMix(sh.band / 190, inner * 0.5, 88));
    grad.addColorStop(1, CMix(sh.band / 190, inner * 0.4, 60));
    c.fillStyle = grad;
    c.strokeStyle = CMix(sh.band / 190, 0.5 + fv * 0.4 + beatE * 0.3, 72);
    c.lineWidth = 1.2 * TK;
    glow(14 * (1 + beatE * 1.5), CMix(sh.band / 190));
    c.beginPath();
    c.moveTo(0, -s2);
    c.lineTo(s2 * 0.42, 0);
    c.lineTo(0, s2);
    c.lineTo(-s2 * 0.42, 0);
    c.closePath();
    c.fill();
    c.stroke();
    // internal facet line
    c.strokeStyle = CMix(sh.band / 190, inner * 0.6, 88);
    c.lineWidth = 0.8 * TK;
    c.beginPath();
    c.moveTo(0, -s2);
    c.lineTo(0, s2);
    c.stroke();
    c.restore();
    noGlow();

    if (beat && Math.random() < 0.7)
      S.glints.push({ x: x + (Math.random() - 0.5) * s2, y: y - s2 * 0.6, a: 1, sz: 3 + Math.random() * 4 });
  }

  // four-point star glints
  for (let i = S.glints.length - 1; i >= 0; i--) {
    const g = S.glints[i];
    g.a *= 0.88;
    if (g.a < 0.05) { S.glints.splice(i, 1); continue; }
    const gs = g.sz * g.a * TK;
    c.strokeStyle = C1(g.a, 90);
    c.lineWidth = 1.1 * TK;
    glow(16, C1());
    c.beginPath();
    c.moveTo(g.x - gs * 2, g.y); c.lineTo(g.x + gs * 2, g.y);
    c.moveTo(g.x, g.y - gs * 2); c.lineTo(g.x, g.y + gs * 2);
    c.stroke();
  }
  noGlow();
};
