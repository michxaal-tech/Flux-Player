import type { ThemeDraw } from "../themeTypes";

interface Blob {
  x: number; y: number;
  vx: number; vy: number;
  /** radius in px */ r: number;
  /** 0 cold (sinks) → 1 hot (rises) */ heat: number;
  /** wobble phase */ ph: number;
  /** 0 = free slot */ live: number;
}

const MAXB = 12;               // hard cap on the wax pool
const SIDE = 16;               // vessel outline samples per side — fixed
const HALF_PI = Math.PI / 2;
const TANG = HALF_PI * 0.78;   // where the goo bridge leaves each blob

// A retro lava lamp. The wax is a pool of blobs that genuinely merge: any two
// close enough get a curved "goo" bridge welded between them, and the whole
// mass — blobs plus bridges — is filled as one path, so lumps flow together and
// pull apart with smooth organic boundaries instead of overlapping circles.
// Heat at the base makes wax rise, the cool cap makes it sink, and blobs
// coalesce on contact and split when they get too fat.
// A calm passage is hypnotic: three or four huge lumps creeping up and down over
// many seconds. A driving passage boils the lamp — a dozen small blobs erupting
// off the base, splitting mid-climb and churning.
export const LAVALAMP: ThemeDraw = ({
  c, w, h, R, vt, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.lavalamp ??= {
    blobs: [] as Blob[],
    boil: 0,
    seeded: 0,
  });
  const blobs: Blob[] = S.blobs;
  if (blobs.length === 0) {
    for (let i = 0; i < MAXB; i++) {
      blobs.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, heat: 0.5, ph: 0, live: 0 });
    }
  }

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const sp = cfg.speed;

  // --- vessel geometry ------------------------------------------------------
  const topY = h * 0.1;
  const botY = h * 0.9;
  const span = botY - topY || 1;
  const lampHalf = Math.min(w * 0.21, h * 0.185);
  const cxL = w * 0.5;
  /** half-width of the glass at normalised depth yn (0 top → 1 bottom) */
  const halfAt = (yn: number) =>
    lampHalf * (0.44 + 0.56 * Math.pow(yn < 0 ? 0 : yn > 1 ? 1 : yn, 0.75));

  const rMin = R * 0.028;
  const rMax = R * (0.115 - E * 0.045);

  // seed the wax once
  if (!S.seeded) {
    S.seeded = 1;
    for (let i = 0; i < 4; i++) {
      const b = blobs[i];
      b.live = 1;
      b.r = rMax * (0.6 + Math.random() * 0.4);
      const yn = 0.25 + Math.random() * 0.6;
      b.y = topY + yn * span;
      b.x = cxL + (Math.random() - 0.5) * halfAt(yn) * 0.8;
      b.vx = 0;
      b.vy = 0;
      b.heat = Math.random();
      b.ph = Math.random() * 6.283;
    }
  }

  // --- energy: everything about the wax's temperament -----------------------
  S.boil = S.boil * 0.9 + (beat ? 0.6 + E * 0.4 : 0) ;
  const boil = S.boil > 1.4 ? 1.4 : S.boil;
  const target = 3 + Math.round(E * 9);              // 3 fat lumps → 12 small ones
  const buoy = R * (0.000045 + E * 0.00055) * sp * I; // creep → erupt
  const visc = 0.972 - E * 0.055;                    // treacle → thin boiling wax
  const heatRate = 0.0022 + E * 0.019;               // slow soak → instant flash
  const wobble = 0.006 + E * 0.03;

  let live = 0;
  for (let i = 0; i < MAXB; i++) if (blobs[i].live) live++;

  // --- coalesce: any two touching lumps become one --------------------------
  for (let i = 0; i < MAXB; i++) {
    const a = blobs[i];
    if (!a.live) continue;
    for (let j = i + 1; j < MAXB; j++) {
      const b = blobs[j];
      if (!b.live) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      // over-target lumps merge eagerly; at target they need real contact
      const grab = live > target ? 0.72 : 0.34;
      if (d < (a.r + b.r) * grab) {
        const ar = a.r * a.r + b.r * b.r;
        const wA = (a.r * a.r) / (ar || 1);
        a.x = a.x * wA + b.x * (1 - wA);
        a.y = a.y * wA + b.y * (1 - wA);
        a.vx = a.vx * wA + b.vx * (1 - wA);
        a.vy = a.vy * wA + b.vy * (1 - wA);
        a.heat = a.heat * wA + b.heat * (1 - wA);
        a.r = Math.min(rMax * 1.5, Math.sqrt(ar));
        b.live = 0;
        live--;
      }
    }
  }

  // --- split: fat lumps tear in two, violently when the music drives --------
  const wantSplit = live < target && (beat ? Math.random() < 0.35 + E * 0.6 : Math.random() < E * 0.06);
  if (wantSplit) {
    let big = -1, bigR = rMin * 1.6;
    for (let i = 0; i < MAXB; i++) if (blobs[i].live && blobs[i].r > bigR) { bigR = blobs[i].r; big = i; }
    let slot = -1;
    for (let i = 0; i < MAXB; i++) if (!blobs[i].live) { slot = i; break; }
    if (big >= 0 && slot >= 0) {
      const a = blobs[big];
      const b = blobs[slot];
      const nr = a.r * 0.707;
      const ang = Math.random() * 6.283;
      const kick = R * (0.0012 + E * 0.006) * (1 + beatE);
      b.live = 1;
      b.r = nr;
      b.x = a.x + Math.cos(ang) * nr * 0.7;
      b.y = a.y + Math.sin(ang) * nr * 0.7;
      b.vx = a.vx + Math.cos(ang) * kick;
      b.vy = a.vy + Math.sin(ang) * kick;
      b.heat = a.heat;
      b.ph = Math.random() * 6.283;
      a.r = nr;
      a.x -= Math.cos(ang) * nr * 0.7;
      a.y -= Math.sin(ang) * nr * 0.7;
      a.vx -= Math.cos(ang) * kick;
      a.vy -= Math.sin(ang) * kick;
      live++;
    }
  }

  // --- simulate -------------------------------------------------------------
  for (let i = 0; i < MAXB; i++) {
    const b = blobs[i];
    if (!b.live) continue;
    const yn = (b.y - topY) / span;
    // the base is the heater, the metal cap is the condenser
    const src = yn > 0.78 ? 1 : yn < 0.2 ? 0 : 0.5;
    b.heat += (src - b.heat) * heatRate * sp * (1 + bassV * 0.8);
    b.vy -= (b.heat - 0.5) * buoy * 2 * (1 + boil * 0.5);
    b.vx += Math.sin(vt * wobble * sp + b.ph) * R * 0.00008 * (1 + E * 4);
    b.vx *= visc;
    b.vy *= visc;
    b.x += b.vx * sp;
    b.y += b.vy * sp;
    b.ph += 0.01 + E * 0.03;

    // glass walls
    const yn2 = (b.y - topY) / span;
    const lim = halfAt(yn2) - b.r * 0.55;
    if (lim > 0) {
      if (b.x < cxL - lim) { b.x = cxL - lim; b.vx = Math.abs(b.vx) * 0.45; }
      if (b.x > cxL + lim) { b.x = cxL + lim; b.vx = -Math.abs(b.vx) * 0.45; }
    } else b.x = cxL;
    const floorY = botY - b.r * 0.7;
    const ceilY = topY + b.r * 0.7;
    if (b.y > floorY) { b.y = floorY; b.vy = -Math.abs(b.vy) * 0.3; }
    if (b.y < ceilY) { b.y = ceilY; b.vy = Math.abs(b.vy) * 0.3; }
    if (b.r > rMax * 1.5) b.r = rMax * 1.5;
    if (b.r < rMin) b.r = rMin;
  }

  // --- the glass ------------------------------------------------------------
  c.globalCompositeOperation = "source-over";
  c.save();
  c.beginPath();
  for (let i = 0; i <= SIDE; i++) {
    const yn = i / SIDE;
    const x = cxL - halfAt(yn);
    const y = topY + yn * span;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  for (let i = SIDE; i >= 0; i--) {
    const yn = i / SIDE;
    c.lineTo(cxL + halfAt(yn), topY + yn * span);
  }
  c.closePath();
  const glassPathTop = topY;
  c.save();
  c.clip();

  // fluid inside the glass, hot at the heater
  const inner = c.createLinearGradient(0, glassPathTop, 0, botY);
  inner.addColorStop(0, CMix(0.8, 1, 7));
  inner.addColorStop(0.6, CMix(0.55, 1, 11 + midV * 4));
  inner.addColorStop(1, CMix(0.15, 1, 20 + bassV * 8 + beatE * 6));
  c.fillStyle = inner;
  c.fillRect(cxL - lampHalf * 1.1, topY - 2, lampHalf * 2.2, span + 4);

  // bulb glow rising off the heater
  const bulbR = lampHalf * (1.5 + beatE * 0.4);
  const bg = c.createRadialGradient(cxL, botY, 0, cxL, botY, bulbR);
  bg.addColorStop(0, C2(Math.min(0.6, 0.28 + E * 0.16 + beatE * 0.24), 62));
  bg.addColorStop(0.45, C2(0.14 + E * 0.08, 44));
  bg.addColorStop(1, "transparent");
  c.fillStyle = bg;
  c.fillRect(cxL - lampHalf * 1.2, botY - bulbR, lampHalf * 2.4, bulbR + 4);

  // --- the wax mass: blobs + goo bridges, one path -------------------------
  c.beginPath();
  for (let i = 0; i < MAXB; i++) {
    const b = blobs[i];
    if (!b.live) continue;
    const rr = b.r * (1 + Math.sin(b.ph) * (0.04 + E * 0.09));
    c.moveTo(b.x + rr, b.y);
    c.arc(b.x, b.y, rr, 0, Math.PI * 2);
  }
  for (let i = 0; i < MAXB; i++) {
    const a = blobs[i];
    if (!a.live) continue;
    for (let j = i + 1; j < MAXB; j++) {
      const b = blobs[j];
      if (!b.live) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = (a.r + b.r) * 1.75;
      if (d < 1e-3 || d > reach) continue;
      const ang = Math.atan2(dy, dx);
      const a1 = ang + TANG, a2 = ang - TANG;
      const a3 = ang + Math.PI - TANG, a4 = ang - Math.PI + TANG;
      const p1x = a.x + Math.cos(a1) * a.r, p1y = a.y + Math.sin(a1) * a.r;
      const p2x = a.x + Math.cos(a2) * a.r, p2y = a.y + Math.sin(a2) * a.r;
      const p3x = b.x + Math.cos(a3) * b.r, p3y = b.y + Math.sin(a3) * b.r;
      const p4x = b.x + Math.cos(a4) * b.r, p4y = b.y + Math.sin(a4) * b.r;
      // waist: fat when the lumps overlap, pinched to a thread as they part
      const t = d / reach;
      const neck = Math.min(a.r, b.r) * (1 - t) * 0.92;
      const nx = a.x + (dx / d) * (d * (a.r / (a.r + b.r)));
      const ny = a.y + (dy / d) * (d * (a.r / (a.r + b.r)));
      const px = -dy / d, py = dx / d;
      // wound the same way round as the arcs above, so the nonzero fill unions
      // blobs and bridges instead of punching holes where they overlap
      c.moveTo(p1x, p1y);
      c.lineTo(p2x, p2y);
      c.quadraticCurveTo(nx - px * neck, ny - py * neck, p4x, p4y);
      c.lineTo(p3x, p3y);
      c.quadraticCurveTo(nx + px * neck, ny + py * neck, p1x, p1y);
      c.closePath();
    }
  }
  const wax = c.createLinearGradient(0, topY, 0, botY);
  wax.addColorStop(0, CMix(0.1, 0.95, 40 + beatE * 6));
  wax.addColorStop(0.5, CMix(0.45, 0.95, 48 + midV * 8));
  wax.addColorStop(1, CMix(0.85, 0.95, 56 + bassV * 8 + beatE * 8));
  c.fillStyle = wax;
  // one blurred fill for the whole mass — the union path can't be stroked
  // (the internal bridge chords would show), so the halo does the rim light
  glow(Math.min(24, (9 + E * 8) * (1 + beatE * 0.8)), C1());
  c.fill();
  noGlow();

  // per-lump sheen so the wax reads as volume, not a flat silhouette
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < MAXB; i++) {
    const b = blobs[i];
    if (!b.live) continue;
    const rr = b.r;
    const hx = b.x - rr * 0.3, hy = b.y - rr * 0.35;
    const g = c.createRadialGradient(hx, hy, 0, hx, hy, rr * 1.05);
    g.addColorStop(0, C1(Math.min(0.4, 0.16 + beatE * 0.14), 70));
    g.addColorStop(0.55, C2(0.08, 52));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(b.x - rr * 1.1, b.y - rr * 1.1, rr * 2.2, rr * 2.2);
  }
  c.globalCompositeOperation = "source-over";
  c.restore(); // drop clip, keep the vessel path

  // glass edge + reflections
  c.strokeStyle = C1(0.28, 58);
  c.lineWidth = 1.4 * TK;
  c.stroke();
  c.globalCompositeOperation = "lighter";
  for (let k = 0; k < 2; k++) {
    const fx = k === 0 ? -0.62 : 0.5;
    c.beginPath();
    for (let i = 0; i <= SIDE; i++) {
      const yn = i / SIDE;
      const x = cxL + halfAt(yn) * fx;
      const y = topY + yn * span;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = C1(k === 0 ? 0.16 : 0.08, 72);
    c.lineWidth = (k === 0 ? 3.5 : 1.8) * TK;
    c.stroke();
  }
  c.globalCompositeOperation = "source-over";
  c.restore();

  // cap and base
  const capW = halfAt(0) * 1.5;
  const baseW = halfAt(1) * 1.5;
  c.fillStyle = CMix(0.3, 0.95, 16);
  c.beginPath();
  c.moveTo(cxL - capW, topY - h * 0.06);
  c.lineTo(cxL + capW, topY - h * 0.06);
  c.lineTo(cxL + halfAt(0) * 1.05, topY);
  c.lineTo(cxL - halfAt(0) * 1.05, topY);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(cxL - halfAt(1) * 1.05, botY);
  c.lineTo(cxL + halfAt(1) * 1.05, botY);
  c.lineTo(cxL + baseW, botY + h * 0.075);
  c.lineTo(cxL - baseW, botY + h * 0.075);
  c.closePath();
  c.fill();
  // heater filament in the base
  c.fillStyle = C2(Math.min(0.7, 0.3 + E * 0.2 + beatE * 0.3), 58);
  c.fillRect(cxL - baseW * 0.55, botY + h * 0.022, baseW * 1.1, 2.4 * TK);
};
