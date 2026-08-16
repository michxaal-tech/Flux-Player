import type { ThemeDraw } from "../themeTypes";

interface Blob2 { orbit: number; ph: number; sz: number; hue: number; kick: number; }

// Liquid light: soft metaball blobs orbit and merge into one glowing fluid
// mass, colors sweeping through the palette. On the beat the fluid bursts
// apart, blobs flare white-hot, and specular highlights snap across them.
export const LIQUID: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, beat, beatE, bassV, midV, I, TK, C1, CMix, L }) => {
  const S = (L.scratch.liquid ??= {
    blobs: Array.from({ length: 7 }, (_, i) => ({
      orbit: 0.1 + (i / 7) * 0.24,
      ph: (i / 7) * Math.PI * 2,
      sz: 0.5 + ((i * 5) % 4) / 4,
      hue: i / 7,
      kick: 0,
    })) as Blob2[],
  });

  for (const b of S.blobs) {
    if (beat) b.kick = 1;
    b.kick *= 0.9;
    const fv = liveAudio ? freq[Math.floor(b.hue * 180)] / 255 : 0.18;
    const ang = vt * 0.006 * (b.hue > 0.5 ? 1 : -1.3) + b.ph;
    const orbit = R * b.orbit * (1 + b.kick * 0.55 + bassV * 0.12);
    const bx = cx + Math.cos(ang) * orbit;
    const by = cy + Math.sin(ang * 1.35 + b.ph) * orbit * 0.8;
    const rad = R * (0.075 + fv * 0.075 * I + bassV * 0.03) * b.sz * (1 + b.kick * 0.35);

    // body — big soft gradient; overlapping "lighter" blends merge into fluid
    const hueNow = (b.hue + vt * 0.0011) % 1;
    // low alphas on purpose: overlapping blobs accumulate additively across
    // trail frames, so anything higher blows out to white
    const g = c.createRadialGradient(bx, by, 0, bx, by, rad * 1.9);
    g.addColorStop(0, CMix(hueNow, 0.2 + fv * 0.12 + b.kick * 0.2, 58 + b.kick * 12));
    g.addColorStop(0.55, CMix(hueNow, 0.09 + fv * 0.08, 50));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, rad * 1.9, 0, Math.PI * 2);
    c.fill();

    // specular highlight snapping toward the beat
    const hx = bx - rad * 0.45, hy = by - rad * 0.5;
    const hg = c.createRadialGradient(hx, hy, 0, hx, hy, rad * (0.32 + b.kick * 0.2));
    hg.addColorStop(0, C1(0.14 + b.kick * 0.35 + midV * 0.1, 90));
    hg.addColorStop(1, "transparent");
    c.fillStyle = hg;
    c.beginPath();
    c.arc(hx, hy, rad * 0.6, 0, Math.PI * 2);
    c.fill();
  }

  // shared central glow that binds the fluid together
  const gg = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.3 + bassV * 0.1 + beatE * 0.1));
  gg.addColorStop(0, C1(0.16 + beatE * 0.22, 65));
  gg.addColorStop(1, "transparent");
  c.fillStyle = gg;
  c.beginPath();
  c.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
  c.fill();

  // droplets flung off on the beat
  const D = (L.scratch.liquidDrops ??= [] as { x: number; y: number; vx: number; vy: number; a: number }[]);
  if (beat) {
    for (let k = 0; k < 10; k++) {
      const a2 = Math.random() * Math.PI * 2;
      const sp = R * (0.004 + Math.random() * 0.008);
      D.push({ x: cx, y: cy, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp, a: 1 });
    }
  }
  for (let i = D.length - 1; i >= 0; i--) {
    const d = D[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vx *= 0.97;
    d.vy *= 0.97;
    d.a *= 0.95;
    if (d.a < 0.05) { D.splice(i, 1); continue; }
    c.fillStyle = CMix((vt * 0.001 + d.a) % 1, d.a * 0.8, 70);
    c.beginPath();
    c.arc(d.x, d.y, (1.2 + d.a * 2.6) * TK, 0, Math.PI * 2);
    c.fill();
  }
};
