import type { ThemeDraw } from "../themeTypes";

/** suspended particle in the water column, 0..1 space */
interface Mote { x: number; y: number; z: number; ph: number }
/** breach spray droplet, pixel space (short-lived) */
interface Drop { x: number; y: number; vx: number; vy: number; a: number; sz: number }
/** displaced-water ring on the surface */
interface Wake { x: number; r: number; a: number }

const MOTES = 170;         // fixed regardless of canvas size
const SPRAY_MAX = 200;
const WAKE_MAX = 8;
const TIERS = 3;
const SURF_SEGS = 96;      // wave sample count, fixed
const BODY_SEGS = 60;      // silhouette profile sample count, fixed

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0); // NaN → 0
const sstep = (a: number, b: number, x: number) => {
  const d = b - a;
  let u = d > 1e-6 ? (x - a) / d : x >= b ? 1 : 0;
  u = u > 0 ? (u < 1 ? u : 1) : 0;
  return u * u * (3 - 2 * u);
};

// Pre-rendered droplet. 200 shadowBlur'd arcs would stall; 200 drawImages don't.
let sprayCv: HTMLCanvasElement | null = null;
let sprayKey = "";
function spraySprite(color: string): HTMLCanvasElement {
  if (sprayCv && sprayKey === color) return sprayCv;
  sprayKey = color;
  const cv = sprayCv ?? document.createElement("canvas");
  cv.width = cv.height = 44;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 44, 44);
  const rg = g.createRadialGradient(22, 22, 0, 22, 22, 22);
  rg.addColorStop(0, "rgba(255,255,255,0.8)");
  rg.addColorStop(0.3, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 44, 44);
  sprayCv = cv;
  return cv;
}

/**
 * LEVIATHAN — a staged deep-ocean scene.
 *
 * Stage 1 (quiet): a slow abyssal gradient with drifting motes, nothing more.
 * Stage 2 (mid energy): the surface arrives — rolling swells build up from the
 * bottom of the frame and start to heave with the bass.
 * Stage 3 (high energy): something enormous rises out of the dark, its
 * silhouette growing and its eyes lighting as the arrangement thickens.
 * Drop: `dropE` rising drags the motes down, drains the colour and swells an
 * underglow beneath the surface; at its peak the animal BREACHES — it clears
 * the waterline, throwing a wall of spray, expanding displacement rings and a
 * bloom of light. `section` moves the palette, the spine count and the drift.
 */
export const LEVIATHAN: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, hit, hitE, energy, dropE, section,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.leviathan ??= {
    motes: [] as Mote[],
    spray: [] as Drop[],
    wakes: [] as Wake[],
    w2: 0, w3: 0,
    charge: 0, breach: 0, bt: -1, bloom: 0,
    prevD: 0, cool: 0,
    sec: -1, pal: 0, spines: 3, drift: 1,
  });

  const motes: Mote[] = S.motes;
  const spray: Drop[] = S.spray;
  const wakes: Wake[] = S.wakes;

  if (motes.length === 0) {
    for (let i = 0; i < MOTES; i++) {
      motes.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.999, ph: Math.random() * 6.283 });
    }
  }

  const spd = cfg.speed;
  const E = cl01(energy);
  const D = cl01(dropE);
  const BE = cl01(beatE);
  const HE = cl01(hitE);
  const bv = cl01(bassV);
  const sec = section | 0;

  if (S.sec !== sec) {
    S.sec = sec;
    S.pal = (sec % 4) / 4;
    S.spines = 2 + (sec % 4);
    S.drift = sec % 2 === 0 ? 1 : -1;
  }
  const P = S.pal;

  // ── layer weights: smoothstep + inertia so layers never strobe at a edge ──
  const t2 = Math.max(sstep(0.2, 0.44, E), sstep(0.32, 0.66, bv) * 0.8);
  const t3 = Math.max(sstep(0.46, 0.72, E), sstep(0.4, 0.75, cl01(midV)) * 0.85);
  S.w2 += (t2 - S.w2) * 0.03;
  S.w3 += (t3 - S.w3) * 0.025;
  const W2 = cl01(S.w2);
  const W3 = cl01(S.w3);

  // ── drop charge + breach trigger ──────────────────────────────────────────
  S.charge += (D - S.charge) * 0.1;
  const CH = cl01(S.charge);
  S.cool--;
  let justBreached = false;
  if (D > 0.5 && D < S.prevD - 0.004 && S.cool <= 0) {
    S.cool = 90;
    S.bt = 0;
    S.bloom = 1;
    justBreached = true;
  }
  S.prevD = D;
  // breach arc: up fast, hang, fall back — ~110 frames
  if (S.bt >= 0) {
    S.bt += spd;
    const p = S.bt / 110;
    if (p >= 1) { S.bt = -1; S.breach = 0; }
    else S.breach = Math.sin(Math.PI * Math.pow(p, 0.72));
  } else {
    S.breach *= 0.9;
  }
  const BR = cl01(S.breach);
  S.bloom *= 0.93;
  const BL = cl01(S.bloom);

  // ── geometry: waterline, creature crest ───────────────────────────────────
  const seaY = h * (1.12 - W2 * 0.5);
  const bodyX = cx + Math.sin(vt * 0.004 * spd + sec) * R * 0.07 * S.drift;
  const restY = seaY + h * (0.46 - W3 * 0.4);     // crest hides deep when W3 is low
  const crestY = restY - BR * h * 0.5;
  const bw = R * (0.5 + W3 * 0.45 + BR * 0.2);
  const bhh = R * (0.22 + W3 * 0.2 + bv * 0.05 + BE * 0.03);
  const invSig = 1 / Math.max(1e-3, bw * 0.55);

  // ── the abyss (painted, never additive) ───────────────────────────────────
  c.globalCompositeOperation = "source-over";
  const dim = 1 - CH * 0.5;
  const og = c.createLinearGradient(0, 0, 0, h);
  og.addColorStop(0, CMix(P, (0.2 + CH * 0.14) * (0.5 + I * 0.5), (16 + E * 6) * dim));
  og.addColorStop(0.62, CMix(1 - P, (0.16 + CH * 0.12) * (0.5 + I * 0.5), (9 + E * 3) * dim));
  og.addColorStop(1, CMix(P, (0.22 + CH * 0.16) * (0.5 + I * 0.5), 4 * dim));
  c.fillStyle = og;
  c.fillRect(0, 0, w, h);

  // ── STAGE 1: drifting motes, batched into 3 fills ─────────────────────────
  const rise = (0.00035 + E * 0.0006) * spd;
  for (let i = 0; i < MOTES; i++) {
    const m = motes[i];
    m.y -= rise * (0.3 + m.z) * (1 - CH * 1.9);       // charge reverses the drift
    m.x += Math.sin(vt * 0.006 + m.ph) * 0.0004 * spd * S.drift;
    if (m.y < -0.03) { m.y = 1.03; m.x = Math.random(); }
    else if (m.y > 1.06) { m.y = -0.03; m.x = Math.random(); }
    if (m.x < -0.02) m.x = 1.02; else if (m.x > 1.02) m.x = -0.02;
  }
  for (let ti = 0; ti < TIERS; ti++) {
    const f = ti / (TIERS - 1);
    c.beginPath();
    for (let i = 0; i < MOTES; i++) {
      const m = motes[i];
      if (((m.z * TIERS) | 0) !== ti) continue;
      const r = (0.7 + f * 1.6) * TK * (0.7 + Math.sin(vt * 0.02 + m.ph) * 0.3);
      const mx = m.x * w, my = m.y * h;
      c.moveTo(mx + r, my);
      c.arc(mx, my, r, 0, Math.PI * 2);
    }
    c.fillStyle = CMix(P + f * 0.3, (0.14 + f * 0.18 + HE * 0.08) * (0.4 + I * 0.6), 48 + f * 18);
    c.fill();
  }

  // ── charge: underglow gathering beneath the surface ───────────────────────
  // painted, not additive: a sustained additive wash this large would burn the
  // trail buffer white while dropE holds near 1
  if (CH > 0.04 || BL > 0.04) {
    const gr = R * (0.35 + CH * 0.4 + BL * 0.7);
    const gy = BL > CH ? crestY : restY;
    const ug = c.createRadialGradient(bodyX, gy, 0, bodyX, gy, gr);
    ug.addColorStop(0, CMix(P + 0.4, Math.min(0.3, (CH * 0.16 + BL * 0.3) * (0.4 + I * 0.6)), 70));
    ug.addColorStop(0.4, C2(Math.min(0.16, CH * 0.1 + BL * 0.16), 56));
    ug.addColorStop(1, "transparent");
    c.fillStyle = ug;
    c.beginPath();
    c.arc(bodyX, gy, gr, 0, Math.PI * 2);
    c.fill();
  }

  // ── STAGE 3 (drawn before the water so the body is *in* the sea) ──────────
  // Profile of the back: crestY at the centre, sinking steeply out of frame at
  // the flanks so the mass reads as a localised body, not a full-width band.
  const SINK = h * 0.85;
  const bodyTop = (x: number) => {
    const d = (x - bodyX) * invSig;
    if (d > 3.2 || d < -3.2) return crestY + SINK;
    const hump = Math.exp(-d * d);
    const fin = Math.exp(-(d - 0.5) * (d - 0.5) * 9) * 0.3 * (0.6 + W3 * 0.6);
    const k = Math.min(1, hump + fin);
    return crestY + (1 - k) * SINK;
  };
  if (W3 > 0.015) {
    c.beginPath();
    c.moveTo(-w * 0.05, h * 1.05);
    for (let i = 0; i <= BODY_SEGS; i++) {
      const x = (i / BODY_SEGS) * w;
      c.lineTo(x, bodyTop(x));
    }
    c.lineTo(w * 1.05, h * 1.05);
    c.closePath();
    c.fillStyle = CMix(1 - P, Math.min(0.92, 0.35 + W3 * 0.55), 5 + W3 * 3);
    c.fill();

    // dorsal spines
    const spines = S.spines;
    c.beginPath();
    for (let s2 = 0; s2 < spines; s2++) {
      const off = (s2 - (spines - 1) * 0.5) * bw * 0.19;
      const sx = bodyX + off;
      const sy = bodyTop(sx);
      const sh = bhh * (0.3 + 0.25 * Math.cos(off * invSig)) * (0.5 + W3 * 0.8);
      c.moveTo(sx - bw * 0.06, sy + 2);
      c.lineTo(sx + bw * 0.02, sy - sh);
      c.lineTo(sx + bw * 0.08, sy + 2);
    }
    c.closePath();
    c.fillStyle = CMix(1 - P, Math.min(0.9, 0.4 + W3 * 0.5), 7);
    c.fill();

    // rim light along the back
    c.beginPath();
    for (let i = 0; i <= BODY_SEGS; i++) {
      const x = (i / BODY_SEGS) * w;
      const y = bodyTop(x);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = CMix(P + 0.5, Math.min(0.42, W3 * (0.18 + BE * 0.14 + BR * 0.2) * (0.4 + I * 0.7)), 66);
    c.lineWidth = (0.9 + W3 * 1.6 + BR * 2) * TK;
    glow(Math.min(22, (9 + W3 * 8) * (1 + BE * 0.6)), C2());
    c.stroke();
    noGlow();

    // eyes, lit once the head is high enough
    const eyeW = sstep(0.35, 0.7, W3);
    if (eyeW > 0.01) {
      const e1 = bodyX - bw * 0.15, e2 = bodyX + bw * 0.15;
      glow(Math.min(20, 12 * (1 + BE)), C2());
      c.fillStyle = C2(Math.min(0.55, eyeW * (0.28 + BE * 0.3 + BR * 0.25)), 74);
      const er = R * 0.012 * (1 + BE * 0.5 + BR * 0.6) * TK;
      c.beginPath();
      c.arc(e1, bodyTop(e1) + bhh * 0.3, er, 0, Math.PI * 2);
      c.moveTo(e2 + er, bodyTop(e2) + bhh * 0.3);
      c.arc(e2, bodyTop(e2) + bhh * 0.3, er, 0, Math.PI * 2);
      c.fill();
      noGlow();
    }
  }

  // ── STAGE 2: rolling swells, three painted layers ─────────────────────────
  if (W2 > 0.015) {
    const rows = 3;
    const step = w / SURF_SEGS;
    for (let ly = 0; ly < rows; ly++) {
      const f = ly / (rows - 1);
      const base = seaY + f * h * 0.13;
      const amp = h * (0.012 + f * 0.022) * (0.5 + bv * 1.3 + BE * 0.4) * W2;
      const ph = vt * 0.012 * spd * (1 + f * 0.5) + sec * 1.3;
      c.beginPath();
      c.moveTo(0, h * 1.05);
      for (let i = 0; i <= SURF_SEGS; i++) {
        const x = i * step;
        const y =
          base +
          Math.sin(x * 0.008 + ph) * amp +
          Math.sin(x * 0.019 - ph * 1.3 + f * 3) * amp * 0.55 -
          BR * Math.exp(-Math.pow((x - bodyX) * invSig, 2)) * h * 0.05;
        c.lineTo(x, y);
      }
      c.lineTo(w, h * 1.05);
      c.closePath();
      const wg = c.createLinearGradient(0, base - h * 0.1, 0, h);
      wg.addColorStop(0, CMix(P + f * 0.4, Math.min(0.8, (0.4 + f * 0.2 + BL * 0.15) * W2), (26 + f * 12 + BL * 8) * dim));
      wg.addColorStop(1, CMix(1 - P, Math.min(0.85, 0.6 * W2), 8));
      c.fillStyle = wg;
      c.fill();

      // crest highlight — capped blur, one stroke per row
      c.beginPath();
      for (let i = 0; i <= SURF_SEGS; i++) {
        const x = i * step;
        const y =
          base +
          Math.sin(x * 0.008 + ph) * amp +
          Math.sin(x * 0.019 - ph * 1.3 + f * 3) * amp * 0.55 -
          BR * Math.exp(-Math.pow((x - bodyX) * invSig, 2)) * h * 0.05;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = CMix(P + f * 0.4, Math.min(0.4, W2 * (0.14 + f * 0.1 + BE * 0.14 + BL * 0.2)), 62 + f * 8);
      c.lineWidth = (0.9 + f * 1.4 + BE * 1.2) * TK;
      glow(Math.min(22, (8 + f * 8) * (1 + BE * 0.7 + BL)), C1());
      c.stroke();
      noGlow();
    }
  }

  // ── the breach itself: spray, wakes, bloom ────────────────────────────────
  if (justBreached) {
    wakes.push({ x: bodyX, r: R * 0.05, a: 0.85 });
    const count = Math.min(SPRAY_MAX - spray.length, 150);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.5;
      const sp = h * (0.004 + Math.random() * 0.016) * (0.7 + E * 0.6);
      spray.push({
        x: bodyX + (Math.random() - 0.5) * bw * 1.4,
        y: seaY + (Math.random() - 0.3) * h * 0.03,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        a: 0.8 + Math.random() * 0.2,
        sz: 1 + Math.random() * 2.6,
      });
    }
  }
  // sheeting water while the body is above the line
  if (BR > 0.15 && spray.length < SPRAY_MAX && (hit || beat)) {
    for (let i = 0; i < 8 && spray.length < SPRAY_MAX; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = h * (0.002 + Math.random() * 0.008) * BR;
      spray.push({
        x: bodyX + (Math.random() - 0.5) * bw * 1.1,
        y: crestY + Math.random() * bhh,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        a: 0.6 + Math.random() * 0.3, sz: 0.8 + Math.random() * 1.8,
      });
    }
    if (wakes.length < WAKE_MAX && beat) wakes.push({ x: bodyX, r: R * 0.04, a: 0.4 + BR * 0.3 });
  }

  if (wakes.length || spray.length) {
    c.globalCompositeOperation = "lighter";

    if (wakes.length) {
      glow(Math.min(20, 12 * (1 + BE)), C1());
      c.lineWidth = (1 + BR * 2) * TK;
      for (let i = wakes.length - 1; i >= 0; i--) {
        const k = wakes[i];
        k.r += R * (0.016 + E * 0.02) * spd;
        k.a *= 0.93;
        if (k.a < 0.04 || k.r > R * 1.5) { wakes.splice(i, 1); continue; }
        c.strokeStyle = C1(Math.min(0.35, k.a * 0.3), 68);
        c.beginPath();
        c.ellipse(k.x, seaY, k.r, Math.max(1, k.r * 0.2), 0, 0, Math.PI * 2);
        c.stroke();
      }
      noGlow();
    }

    const spr = spraySprite(C1(0.8, 72));
    const grav = h * 0.0004;
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i];
      p.x += p.vx * spd;
      p.y += p.vy * spd;
      p.vy += grav * spd;
      p.a *= 0.962;
      if (p.a < 0.045 || p.y > h * 1.05) { spray.splice(i, 1); continue; }
      const r = p.sz * (1 + BE * 0.4) * TK * 3;
      c.globalAlpha = Math.min(0.75, p.a * (0.45 + I * 0.55));
      c.drawImage(spr, p.x - r, p.y - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  // breach bloom — painted, so its ceiling is the palette colour, not white
  if (BL > 0.03) {
    const bg = c.createRadialGradient(bodyX, crestY, 0, bodyX, crestY, R * (0.4 + BL * 0.6));
    bg.addColorStop(0, C2(Math.min(0.36, BL * 0.34 * (0.4 + I * 0.6)), 74));
    bg.addColorStop(0.42, C1(Math.min(0.2, BL * 0.18), 60));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
  }

  // ── surface shimmer on the tempo grid (cheap, always on above stage 2) ────
  if (W2 > 0.05 && (BE > 0.02 || trebV > 0.03)) {
    const sg = c.createLinearGradient(0, seaY - h * 0.03, 0, seaY + h * 0.05);
    sg.addColorStop(0, "transparent");
    sg.addColorStop(0.4, CMix(P + 0.6, Math.min(0.18, W2 * (0.05 + BE * 0.1 + cl01(trebV) * 0.07)), 64));
    sg.addColorStop(1, "transparent");
    c.fillStyle = sg;
    c.fillRect(0, seaY - h * 0.03, w, h * 0.08);
  }
};
