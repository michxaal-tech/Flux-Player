import type { ThemeDraw } from "../themeTypes";

// Blossoming mandala. Layered petal rings counter-rotate and swell with their
// frequency bands; every beat blooms a fresh ring of petals that expands
// outward and dissolves, while loose petals drift down around it.
export const BLOOM: ThemeDraw = ({ c, fs, cx, cy, R, freq, liveAudio, vt, beat, beatE, cfg, bassV, midV, trebV, TK, C1, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.bloom ??= {
    rings: [] as { s: number; hue: number }[],
    petals: Array.from({ length: 14 }, () => ({
      x: Math.random(), y: Math.random(), rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.02, sp: 0.0006 + Math.random() * 0.001, hue: Math.random(),
    })),
  });

  const petal = (r0: number, r1: number, ang: number, width: number) => {
    const midR = (r0 + r1) / 2;
    const px = (rr: number, a2: number) => [cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr] as const;
    const [x0, y0] = px(r0, ang);
    const [x1, y1] = px(r1, ang);
    const [lx, ly2] = px(midR, ang - width);
    const [rx2, ry2] = px(midR, ang + width);
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(lx, ly2, x1, y1);
    c.quadraticCurveTo(rx2, ry2, x0, y0);
    c.closePath();
  };

  // three fixed petal layers, counter-rotating, band-reactive
  const layers = [
    { n: 6, r: 0.14, band: 8, dir: 1, level: bassV },
    { n: 9, r: 0.24, band: 60, dir: -1, level: midV },
    { n: 13, r: 0.34, band: 130, dir: 1, level: trebV },
  ];
  layers.forEach((ly, li) => {
    const fv = liveAudio ? freq[ly.band] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + li);
    const rot = vt * 0.0025 * ly.dir + li;
    const r1 = R * ly.r * (1 + fv * 0.28 + beatE * 0.1);
    for (let i = 0; i < ly.n; i++) {
      const ang = (i / ly.n) * Math.PI * 2 + rot;
      const hueF = (li * 0.33 + i / ly.n) % 1;
      petal(R * 0.02, r1, ang, 0.42 / (1 + li * 0.4));
      c.fillStyle = CMix(hueF, 0.16 + fv * 0.35 + beatE * 0.18, 58 + beatE * 10);
      c.strokeStyle = CMix(hueF, 0.5 + fv * 0.4 + beatE * 0.3, 70);
      c.lineWidth = (1 + beatE * 1.4) * TK;
      glow(10 * (1 + beatE * 1.6), CMix(hueF));
      c.fill();
      c.stroke();
    }
  });
  noGlow();

  // beat-bloom rings expanding outward
  if (beat) S.rings.push({ s: 0.1, hue: Math.random() });
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const ring = S.rings[i];
    ring.s += 0.03 * cfg.speed * fs;
    const fade = Math.max(0, 1 - ring.s);
    if (fade <= 0) { S.rings.splice(i, 1); continue; }
    const n = 11;
    const r1 = R * 0.5 * ring.s;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + ring.s * 2;
      petal(r1 * 0.55, r1, ang, 0.3);
      c.strokeStyle = CMix(ring.hue, fade * 0.8, 74);
      c.lineWidth = (1.2 + fade * 1.5) * TK;
      glow(16, CMix(ring.hue));
      c.stroke();
    }
  }
  noGlow();

  // glowing pistil
  const pr = R * (0.035 + bassV * 0.03 + beatE * 0.03);
  const pg = c.createRadialGradient(cx, cy, 0, cx, cy, pr * 2.4);
  pg.addColorStop(0, C1(0.65 + beatE * 0.35, 90));
  pg.addColorStop(0.4, C1(0.5, 74));
  pg.addColorStop(1, "transparent");
  c.fillStyle = pg;
  c.beginPath();
  c.arc(cx, cy, pr * 2.4, 0, Math.PI * 2);
  c.fill();

  // loose petals drifting down
  for (const p of S.petals) {
    p.y += p.sp * (1 + bassV) * cfg.speed * fs;
    p.x += Math.sin(vt * 0.01 + p.rot) * 0.0008 * fs;
    p.rot += p.vr * fs;
    if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
    const px = p.x * (cx * 2), py = p.y * (cy * 2);
    c.save();
    c.translate(px, py);
    c.rotate(p.rot + Math.sin(vt * 0.02 + p.hue * 6) * 0.5);
    c.fillStyle = CMix(p.hue, 0.3 + beatE * 0.25, 68);
    c.beginPath();
    c.ellipse(0, 0, 5 * TK, 2.4 * TK, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
};
