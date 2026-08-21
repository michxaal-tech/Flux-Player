import type { ThemeDraw } from "../themeTypes";
import {  } from "../rate";

// CASCADE — terraces of falling light, added one per drop.
//
// The base is a single ledge with a curtain of light pouring off it. Every drop
// stacks another ledge above the previous one, so the fall gets taller through
// the track and the water from the top tier passes every tier below it on the
// way down. Droplets are per-tier and persistent, which is what makes a later
// section feel busier without anything being switched on and off.

const MAXT = 8;
const DROPS_PER = 26;   // droplets per tier, before energy scaling

interface Drop { x: number; y: number; sp: number; len: number }
interface State { d: Drop[][]; ph: number[] }

export const CASCADE: ThemeDraw = (x) => {
  const { c, fs, w, h, cx, cy, R, freq, beatE, energy, dropE, bassV, midV, cfg, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.cascade ??= { d: [] as Drop[][], ph: [] as number[] }) as State;
  const tiers = Math.min(MAXT, 1 + L.dropSlots);
  while (S.d.length < tiers) { S.d.push([]); S.ph.push(Math.random() * Math.PI * 2); }

  const bins = freq.length;
  // tiers stack upward from just below centre; the whole stack is squeezed as
  // it grows so a tall cascade still fits the frame
  const gap = Math.min(h * 0.13, (h * 0.62) / tiers);
  const baseY = cy + h * 0.24;

  for (let k = 0; k < tiers; k++) {
    const amt = k === 0 ? 1 : (L.dropAmts[k - 1] ?? 0);
    if (amt < 0.03) { S.d[k].length = 0; continue; }

    const y = baseY - k * gap;
    // ledges narrow as they rise, so the shape reads as a stepped fall
    const halfW = w * (0.42 - k * 0.028) * (0.7 + amt * 0.3);
    const hue = k / MAXT;
    S.ph[k] += (0.01 + energy * 0.02) * cfg.speed * fs;

    // the ledge itself: a spectrum-displaced edge, not a flat line
    glow(Math.min(18, 6 + amt * 10), CMix(hue));
    c.strokeStyle = CMix(hue, amt * (0.4 + bassV * 0.3), 62);
    c.lineWidth = (1.1 + amt * 1.8 + beatE * 0.8) * TK;
    c.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const bin = Math.min(bins - 1, 3 + k * 5 + Math.floor(Math.abs(u - 0.5) * 2 * 26));
      const spec = ((freq[bin] ?? 0) / 255) ** 1.5;
      const px = cx - halfW + u * halfW * 2;
      const py = y - spec * R * 0.07 * amt - Math.sin(u * 9 + S.ph[k]) * 2.5 * amt;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
    noGlow();

    // the curtain: a soft sheet under the ledge, so the fall has body
    const cg = c.createLinearGradient(0, y, 0, y + gap);
    cg.addColorStop(0, CMix(hue, amt * 0.22 * (0.5 + midV * 0.6), 60));
    cg.addColorStop(1, "transparent");
    c.fillStyle = cg;
    c.fillRect(cx - halfW, y, halfW * 2, gap);

    // droplets, falling past every tier below this one
    const want = Math.round(DROPS_PER * amt * (0.4 + energy * 0.8));
    const D = S.d[k];
    while (D.length < want) D.push({ x: Math.random(), y: Math.random(), sp: 0.004 + Math.random() * 0.012, len: 0.02 + Math.random() * 0.05 });
    if (D.length > want) D.length = want;
    c.strokeStyle = C1(amt * (0.32 + beatE * 0.3), 74);
    c.lineWidth = (0.7 + amt * 0.8) * TK;
    c.beginPath();
    for (const p of D) {
      p.y += p.sp * (1 + energy + dropE * 1.5) * cfg.speed * fs;
      if (p.y > 1) { p.y = 0; p.x = Math.random(); }
      const px = cx - halfW + p.x * halfW * 2;
      // 0..1 maps to the whole remaining fall, so the top tier's water really
      // does travel the full height
      const fall = (baseY + h * 0.12) - y;
      const py = y + p.y * fall;
      c.moveTo(px, py);
      c.lineTo(px, py - p.len * fall * 0.4);
    }
    c.stroke();
  }

  // the pool the whole thing lands in
  const py0 = baseY + h * 0.1;
  const pg = c.createLinearGradient(0, py0 - h * 0.05, 0, py0 + h * 0.05);
  pg.addColorStop(0, "transparent");
  pg.addColorStop(0.5, C2(0.16 + bassV * 0.16 + dropE * 0.12, 58));
  pg.addColorStop(1, "transparent");
  c.fillStyle = pg;
  c.fillRect(0, py0 - h * 0.05, w, h * 0.1);
};
