import type { ThemeDraw } from "../themeTypes";

interface Koi {
  x: number; y: number; ang: number; speed: number; sz: number; hue: number;
  wag: number; turn: number;
}

// Zen koi pond seen from above: fish glide in lazy arcs trailing wakes, lily
// pads drift, and every beat makes the koi flick their tails and dart while a
// ripple ring spreads across the water. Calm, painterly, unique.
export const KOI: ThemeDraw = ({ c, w, h, vt, beat, beatE, cfg, bassV, midV, trebV, TK, C1, CMix, L }) => {
  const S = (L.scratch.koi ??= {
    fish: Array.from({ length: 7 }, (_, i) => ({
      x: Math.random(), y: Math.random(), ang: Math.random() * Math.PI * 2,
      speed: 0.0012 + Math.random() * 0.0012, sz: 0.6 + Math.random() * 0.7,
      hue: i / 7, wag: Math.random() * Math.PI * 2, turn: 0,
    })) as Koi[],
    rings: [] as { x: number; y: number; r: number; a: number }[],
  });

  // deep water, painted opaque
  c.globalCompositeOperation = "source-over";
  const wg = c.createLinearGradient(0, 0, w, h);
  wg.addColorStop(0, CMix(0.4, 1, 9));
  wg.addColorStop(1, CMix(0.7, 1, 13));
  c.fillStyle = wg;
  c.fillRect(0, 0, w, h);
  // caustic shimmer
  for (let i = 0; i < 14; i++) {
    const cx2 = ((i * 397) % w) + Math.sin(vt * 0.008 + i) * 30;
    const cy2 = ((i * 251) % h) + Math.cos(vt * 0.006 + i * 2) * 20;
    const g = c.createRadialGradient(cx2, cy2, 0, cx2, cy2, 60 + midV * 60);
    g.addColorStop(0, CMix(0.3, 0.03 + midV * 0.05 + beatE * 0.03, 60));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cx2 - 120, cy2 - 120, 240, 240);
  }

  // beat ripple rings
  if (beat) {
    const f = S.fish[Math.floor(Math.random() * S.fish.length)];
    S.rings.push({ x: f.x * w, y: f.y * h, r: 10, a: 0.8 });
  }
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const r = S.rings[i];
    r.r += Math.min(w, h) * 0.012 * cfg.speed;
    r.a *= 0.95;
    if (r.a < 0.03) { S.rings.splice(i, 1); continue; }
    c.strokeStyle = C1(r.a * 0.7, 70);
    c.lineWidth = (1.5 + r.a * 2) * TK;
    c.beginPath();
    c.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = C1(r.a * 0.3, 70);
    c.beginPath();
    c.arc(r.x, r.y, r.r * 0.7, 0, Math.PI * 2);
    c.stroke();
  }

  // koi
  for (const f of S.fish) {
    if (beat) f.turn = (Math.random() - 0.5) * 0.25;
    f.turn *= 0.94;
    f.ang += Math.sin(vt * 0.01 + f.wag) * 0.012 + f.turn;
    const dart = 1 + beatE * 2.2;
    f.x += Math.cos(f.ang) * f.speed * dart * cfg.speed;
    f.y += Math.sin(f.ang) * f.speed * dart * cfg.speed;
    if (f.x < -0.06) f.x = 1.06;
    if (f.x > 1.06) f.x = -0.06;
    if (f.y < -0.06) f.y = 1.06;
    if (f.y > 1.06) f.y = -0.06;

    const fx2 = f.x * w, fy2 = f.y * h;
    const len = Math.min(w, h) * 0.075 * f.sz;
    const wagAmt = Math.sin(vt * (0.18 + beatE * 0.12) + f.wag) * (0.35 + beatE * 0.5);
    c.save();
    c.translate(fx2, fy2);
    c.rotate(f.ang);
    // wake
    c.strokeStyle = C1(0.08 + beatE * 0.1, 70);
    c.lineWidth = len * 0.5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-len * 0.6, 0);
    c.lineTo(-len * 2.4, wagAmt * len * 0.5);
    c.stroke();
    c.lineCap = "butt";
    // body — teardrop with two-tone koi patches
    const grad = c.createLinearGradient(len * 0.6, 0, -len, 0);
    grad.addColorStop(0, CMix(f.hue, 0.95, 80));
    grad.addColorStop(0.55, CMix(f.hue, 0.9, 62));
    grad.addColorStop(1, CMix((f.hue + 0.3) % 1, 0.85, 55));
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(len * 0.62, 0);
    c.quadraticCurveTo(len * 0.25, -len * 0.3, -len * 0.35, -len * 0.14);
    c.quadraticCurveTo(-len * 0.55, 0, -len * 0.35, len * 0.14);
    c.quadraticCurveTo(len * 0.25, len * 0.3, len * 0.62, 0);
    c.fill();
    // patch
    c.fillStyle = CMix((f.hue + 0.5) % 1, 0.7, 68);
    c.beginPath();
    c.ellipse(len * 0.1, -len * 0.06, len * 0.18, len * 0.1, 0.4, 0, Math.PI * 2);
    c.fill();
    // tail fin, wagging (hard on the beat)
    c.fillStyle = CMix(f.hue, 0.75, 70);
    c.beginPath();
    c.moveTo(-len * 0.32, 0);
    c.quadraticCurveTo(-len * 0.8, wagAmt * len * 0.9 - len * 0.25, -len * 1.05, wagAmt * len * 1.1 - len * 0.32);
    c.quadraticCurveTo(-len * 0.75, wagAmt * len * 0.6, -len * 1.05, wagAmt * len * 1.1 + len * 0.32);
    c.quadraticCurveTo(-len * 0.8, wagAmt * len * 0.9 + len * 0.25, -len * 0.32, 0);
    c.fill();
    // side fins
    c.fillStyle = CMix(f.hue, 0.5, 66);
    for (const s2 of [-1, 1]) {
      c.beginPath();
      c.ellipse(len * 0.15, s2 * len * 0.24, len * 0.16, len * 0.07, s2 * 0.7 + wagAmt * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // drifting lily pads
  for (let i = 0; i < 4; i++) {
    const px2 = ((i * 431 + vt * 0.6) % (w + 160)) - 80;
    const py2 = ((i * 293) % h) + Math.sin(vt * 0.005 + i) * 6;
    const pr = Math.min(w, h) * (0.045 + (i % 3) * 0.014);
    c.fillStyle = CMix(0.45, 0.8, 22 + trebV * 8);
    c.beginPath();
    c.arc(px2, py2, pr, 0.3, Math.PI * 2 - 0.15);
    c.lineTo(px2, py2);
    c.fill();
    c.strokeStyle = CMix(0.45, 0.5, 34);
    c.lineWidth = 1.2 * TK;
    c.beginPath();
    c.arc(px2, py2, pr * 0.65, 0.4, Math.PI * 1.8);
    c.stroke();
  }
  c.globalCompositeOperation = "lighter";
};
