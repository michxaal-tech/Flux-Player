import type { ThemeDraw } from "../themeTypes";

interface Prominence { ang: number; life: number; sz: number; }

// Total eclipse. A black sun with a live corona: rays breathe with the
// spectrum, solar prominences erupt off the rim on every beat, and a lens
// flare cuts across the frame when the music hits.
export const ECLIPSE: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, beat, beatE, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.eclipse ??= { proms: [] as Prominence[], rot: 0 });
  S.rot += 0.0012 + beatE * 0.004;
  const discR = R * 0.17;

  // corona rays, band-reactive
  const RAYS = 36;
  for (let i = 0; i < RAYS; i++) {
    const fv = liveAudio ? freq[Math.floor((i / RAYS) * 190)] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + i);
    const ang = (i / RAYS) * Math.PI * 2 + S.rot;
    const len = discR * (0.35 + fv * 1.6 * I + bassV * 0.55 + beatE * 0.7);
    const g = c.createLinearGradient(
      cx + Math.cos(ang) * discR, cy + Math.sin(ang) * discR,
      cx + Math.cos(ang) * (discR + len), cy + Math.sin(ang) * (discR + len)
    );
    g.addColorStop(0, CMix(i / RAYS, 0.5 + fv * 0.4 + beatE * 0.2, 70));
    g.addColorStop(1, "transparent");
    c.strokeStyle = "transparent";
    c.fillStyle = g;
    const half = (Math.PI / RAYS) * (0.55 + fv * 0.5);
    c.beginPath();
    c.moveTo(cx + Math.cos(ang - half) * discR, cy + Math.sin(ang - half) * discR);
    c.lineTo(cx + Math.cos(ang) * (discR + len), cy + Math.sin(ang) * (discR + len));
    c.lineTo(cx + Math.cos(ang + half) * discR, cy + Math.sin(ang + half) * discR);
    c.closePath();
    c.fill();
  }

  // inner corona glow ring
  const cg = c.createRadialGradient(cx, cy, discR * 0.8, cx, cy, discR * (1.9 + bassV * 0.6 + beatE * 0.5));
  cg.addColorStop(0, `rgba(255,255,255,${0.5 + beatE * 0.4})`);
  cg.addColorStop(0.35, C1(0.35 + midV * 0.3, 70));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, discR * 2.6, 0, Math.PI * 2);
  c.fill();

  // prominences erupting off the rim
  if (beat) {
    for (let k = 0; k < 2; k++)
      S.proms.push({ ang: Math.random() * Math.PI * 2, life: 1, sz: 0.5 + Math.random() * 0.8 });
  }
  for (let i = S.proms.length - 1; i >= 0; i--) {
    const p = S.proms[i];
    p.life *= 0.955;
    if (p.life < 0.06) { S.proms.splice(i, 1); continue; }
    const reach = discR * (0.4 + (1 - p.life) * 1.1) * p.sz;
    const bx = cx + Math.cos(p.ang) * discR, by = cy + Math.sin(p.ang) * discR;
    const tx = cx + Math.cos(p.ang) * (discR + reach), ty = cy + Math.sin(p.ang) * (discR + reach);
    const side = Math.cos(p.ang + Math.PI / 2), side2 = Math.sin(p.ang + Math.PI / 2);
    c.strokeStyle = C2(p.life * 0.9, 68);
    c.lineWidth = (1.4 + p.life * 3) * TK;
    glow(22, C2());
    c.beginPath();
    c.moveTo(bx - side * discR * 0.22, by - side2 * discR * 0.22);
    c.quadraticCurveTo(tx + side * reach * 0.4, ty + side2 * reach * 0.4, bx + side * discR * 0.22, by + side2 * discR * 0.22);
    c.stroke();
    noGlow();
  }

  // the black disc itself, with a razor rim
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#020308";
  c.beginPath();
  c.arc(cx, cy, discR, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "lighter";
  c.strokeStyle = `rgba(255,255,255,${0.75 + beatE * 0.25})`;
  c.lineWidth = (1.4 + beatE * 1.6) * TK;
  glow(26 + beatE * 30, C1());
  c.beginPath();
  c.arc(cx, cy, discR, 0, Math.PI * 2);
  c.stroke();
  noGlow();

  // lens flare along the diagonal, breathing with the beat
  const fl = 0.12 + beatE * 0.55;
  for (let i = 0; i < 5; i++) {
    const p = (i - 2) * 0.28;
    const fx = cx + p * R * 0.9, fy = cy + p * R * 0.62;
    const fr = R * (0.012 + Math.abs(p) * 0.03) * (1 + beatE * 0.5);
    const fg = c.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.5);
    fg.addColorStop(0, CMix((i * 0.23) % 1, fl * (1 - Math.abs(p) * 0.5), 75));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(fx, fy, fr * 2.5, 0, Math.PI * 2);
    c.fill();
  }
};
