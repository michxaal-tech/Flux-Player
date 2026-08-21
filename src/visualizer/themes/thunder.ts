import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Bolt { pts: [number, number][]; a: number; hue: number; }

// Storm cell. Rolling cloud banks pulse with the low end, rain falls with the
// treble, and every beat rips a branching lightning bolt from cloud to ground
// with a full-sky flash.
export const THUNDER: ThemeDraw = ({ c, fs, w, h, vt, beat, beatE, bassV, midV, trebV, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.thunder ??= {
    bolts: [] as Bolt[],
    rain: Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), sp: 0.5 + Math.random() })),
  });

  // cloud bank: layered dark blobs across the top, edges lit from within
  for (let i = 0; i < 9; i++) {
    const bx = ((i * 0.13 + 0.03) % 1) * w + Math.sin(vt * 0.004 + i * 2) * w * 0.02;
    const by = h * (0.08 + ((i * 37) % 10) / 10 * 0.1);
    const br = R2(w, h) * (0.13 + ((i * 7) % 5) / 5 * 0.08) * (1 + bassV * 0.12);
    const g = c.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, CMix((i % 5) / 5, 0.16 + bassV * 0.1 + beatE * 0.2, 30));
    g.addColorStop(0.7, CMix((i % 5) / 5, 0.08, 16));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, br, 0, Math.PI * 2);
    c.fill();
  }

  // spawn a bolt on the beat
  if (beat) {
    const x0 = w * (0.15 + Math.random() * 0.7);
    const pts: [number, number][] = [[x0, h * 0.14]];
    let x = x0;
    for (let y = h * 0.14; y < h * 0.92; y += h * 0.055) {
      x += (Math.random() - 0.5) * w * 0.07;
      pts.push([x, y + Math.random() * h * 0.02]);
    }
    S.bolts.push({ pts, a: 1, hue: Math.random() * 0.4 });
  }

  for (let i = S.bolts.length - 1; i >= 0; i--) {
    const b = S.bolts[i];
    b.a *= dk(0.82, fs);
    if (b.a < 0.05) { S.bolts.splice(i, 1); continue; }
    // main channel + faint wide halo
    for (const [lw, alpha, l2] of [[7, b.a * 0.25, 70], [2.4, b.a, 88]] as const) {
      c.strokeStyle = CMix(b.hue, alpha, l2);
      c.lineWidth = lw * TK;
      glow(24, C1());
      c.beginPath();
      b.pts.forEach((pt: [number, number], k: number) => (k === 0 ? c.moveTo(pt[0], pt[1]) : c.lineTo(pt[0], pt[1])));
      c.stroke();
    }
    // branches
    for (let k = 2; k < b.pts.length - 2; k += 3) {
      const [px2, py2] = b.pts[k];
      c.strokeStyle = CMix(b.hue, b.a * 0.5, 80);
      c.lineWidth = 1.2 * TK;
      c.beginPath();
      c.moveTo(px2, py2);
      c.lineTo(px2 + (Math.random() - 0.5) * w * 0.08, py2 + h * 0.05);
      c.stroke();
    }
    noGlow();
    // sky flash + ground glow while the bolt is hot
    if (b.a > 0.4) {
      c.fillStyle = CMix(b.hue, b.a * 0.08, 80);
      c.fillRect(0, 0, w, h);
      const gg = c.createRadialGradient(b.pts[b.pts.length - 1][0], h * 0.92, 0, b.pts[b.pts.length - 1][0], h * 0.92, w * 0.2);
      gg.addColorStop(0, CMix(b.hue, b.a * 0.4, 70));
      gg.addColorStop(1, "transparent");
      c.fillStyle = gg;
      c.fillRect(0, 0, w, h);
    }
  }

  // rain, driven by the treble
  const rainSpeed = 6 + trebV * 26 + midV * 8;
  c.strokeStyle = C1(0.16 + trebV * 0.25, 65);
  c.lineWidth = 1 * TK;
  c.beginPath();
  for (const r of S.rain) {
    r.y += ((rainSpeed * r.sp) / h) * fs;
    r.x += 0.0008 * fs;
    if (r.y > 1) { r.y = -0.02; r.x = Math.random(); }
    const rx = r.x * w, ry = r.y * h;
    c.moveTo(rx, ry);
    c.lineTo(rx - 3, ry + 10 + trebV * 14);
  }
  c.stroke();

  // ground line silhouette
  c.fillStyle = "rgba(4,5,8,0.9)";
  c.fillRect(0, h * 0.93, w, h * 0.07);
  c.fillStyle = C2(0.2 + beatE * 0.4, 45);
  c.fillRect(0, h * 0.93, w, 2 * TK);
};

const R2 = (w: number, h: number) => Math.min(w, h);
