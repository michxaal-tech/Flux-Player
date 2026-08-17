import type { ThemeDraw } from "../themeTypes";

interface Jelly {
  /** position in fractions of w/h so a resize never teleports the swarm */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** bell contraction phase, 0..1 (0 = relaxed, 0.5 = squeezed) */
  ph: number;
  /** phase advance per frame at rest */
  rate: number;
  sz: number;
  hue: number;
  /** fade-in so new jellies don't pop into frame */
  fi: number;
  /** tendril sway seed */
  seed: number;
}

interface Plankton {
  x: number;
  y: number;
  /** drift */
  vx: number;
  vy: number;
  /** ignition level 0..1 */
  lit: number;
  /** refractory timer — a cell cannot re-ignite instantly */
  cool: number;
  sz: number;
  hue: number;
}

interface Wave {
  x: number;
  y: number;
  r: number;
  a: number;
  /** expansion speed in px/frame */
  sp: number;
  /** generation — chains die out after a few links */
  gen: number;
}

const MAX_JELLY = 16;
const MAX_PLANKTON = 300;
const MAX_WAVES = 22;
const TAU = Math.PI * 2;
const BELL_SEGS = 14;
const TENDRILS = 5;
const TSEG = 6;

// Pre-rendered plankton flare. A sprite drawImage costs a fraction of a
// shadowBlur'd arc, and up to 300 cells can be alight at once.
let sparkCv: HTMLCanvasElement | null = null;
let sparkKey = "";
function sparkSprite(color: string): HTMLCanvasElement {
  if (sparkCv && sparkKey === color) return sparkCv;
  sparkKey = color;
  const cv = sparkCv ?? document.createElement("canvas");
  cv.width = cv.height = 40;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 40, 40);
  const rg = g.createRadialGradient(20, 20, 0, 20, 20, 20);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.26, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 40, 40);
  sparkCv = cv;
  return cv;
}

// Midnight-zone bioluminescence. Jellyfish jet along by contracting their bells,
// dragging tendrils behind them, while a field of plankton drifts in the dark.
// Every beat releases a disturbance wave; plankton the wave touches ignite, and
// an ignited cell can set off its own little wave — so in loud passages the
// field goes off in cascading chain reactions. In quiet passages the swarm is
// small and hypnotically slow, the waves are rare and gentle, and chains die
// out after a single link.
export const BIOLUME: ThemeDraw = ({
  c, w, h, R, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.biolume ??= {
    jellies: [] as Jelly[],
    plankton: [] as Plankton[],
    waves: [] as Wave[],
    seeded: false,
    drift: 0,
  });
  const jellies: Jelly[] = S.jellies;
  const plankton: Plankton[] = S.plankton;
  const waves: Wave[] = S.waves;

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;
  S.drift += 0.0009 * sp * (0.4 + E * 2.2);

  // --- opaque water, painted (never additive) so the deep never washes out ---
  c.globalCompositeOperation = "source-over";
  const water = c.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, CMix(0.2, 1, 4 + E * 3));
  water.addColorStop(0.55, CMix(0.65, 1, 8 + E * 4 + beatE * 2));
  water.addColorStop(1, CMix(0.95, 1, 3 + E * 2));
  c.fillStyle = water;
  c.fillRect(0, 0, w, h);

  // faint thermocline shimmer — three fixed bands, cost independent of size
  for (let b = 0; b < 3; b++) {
    const ly = h * (0.24 + b * 0.26) + Math.sin(S.drift * 6 + b * 2.1) * h * 0.03;
    const lg = c.createLinearGradient(0, ly - h * 0.07, 0, ly + h * 0.07);
    lg.addColorStop(0, "transparent");
    lg.addColorStop(0.5, CMix(b / 2, 0.05 + E * 0.05, 34));
    lg.addColorStop(1, "transparent");
    c.fillStyle = lg;
    c.fillRect(0, ly - h * 0.07, w, h * 0.14);
  }

  c.globalCompositeOperation = "lighter";

  // --- populations track the music: sparse when calm, swarming when driving ---
  if (!S.seeded) {
    S.seeded = true;
    for (let i = 0; i < MAX_PLANKTON; i++) {
      plankton.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.00035,
        vy: (Math.random() - 0.5) * 0.00035,
        lit: 0,
        cool: Math.random() * 40,
        sz: 0.6 + Math.random() * 1.6,
        hue: Math.random(),
      });
    }
  }
  const jTarget = Math.min(MAX_JELLY, Math.round(3 + E * 12));
  if (jellies.length < jTarget) {
    jellies.push({
      x: Math.random(),
      y: 0.15 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.0012,
      vy: -0.0006 - Math.random() * 0.0009,
      ph: Math.random(),
      rate: 0.004 + Math.random() * 0.004,
      sz: 0.5 + Math.random() * 0.6,
      hue: Math.random(),
      fi: 0,
      seed: Math.random() * TAU,
    });
  } else if (jellies.length > jTarget) {
    jellies.pop();
  }

  // --- disturbance waves ---
  const pushWave = (x: number, y: number, amp: number, gen: number) => {
    if (waves.length >= MAX_WAVES) return;
    waves.push({
      x, y, r: R * 0.01,
      a: amp,
      sp: R * (0.006 + E * 0.016) * (0.7 + Math.random() * 0.6),
      gen,
    });
  };
  if (beat) {
    const n = 1 + Math.floor(E * 3);
    for (let k = 0; k < n; k++) {
      pushWave(Math.random(), 0.1 + Math.random() * 0.8, 0.55 + E * 0.45, 0);
    }
  }
  // ambient stirring, rare when calm
  if (Math.random() < 0.006 + E2 * 0.05) {
    pushWave(Math.random(), Math.random(), 0.3 + E * 0.3, 0);
  }

  // chains reach further the busier the music is
  const maxGen = E < 0.3 ? 1 : E < 0.6 ? 2 : 4;
  const chainOdds = 0.006 + E2 * 0.09;

  const waveRing = R * 0.055 * (1 + E * 0.8);
  const invRing = 1 / waveRing;
  for (let i = waves.length - 1; i >= 0; i--) {
    const wv = waves[i];
    wv.r += wv.sp * sp * (1 + beatE * 0.6);
    wv.a *= 0.972 - E * 0.012;
    if (wv.a < 0.035 || wv.r > R * 1.3) { waves.splice(i, 1); continue; }
  }

  // --- plankton: ignite where a wave front passes, then chain ---
  const spr = sparkSprite(C1(0.9, 74));
  const dark = 0.14 + trebV * 0.1;
  // dim, unlit cells all in one batched fill
  c.beginPath();
  for (let i = 0; i < plankton.length; i++) {
    const p = plankton[i];
    p.x += p.vx * sp * (1 + E * 2.4);
    p.y += p.vy * sp * (1 + E * 2.4) - 0.00008 * sp;
    if (p.x < -0.02) p.x += 1.04; else if (p.x > 1.02) p.x -= 1.04;
    if (p.y < -0.02) p.y += 1.04; else if (p.y > 1.02) p.y -= 1.04;
    if (p.cool > 0) p.cool -= 1;

    if (p.lit <= 0.02 && p.cool <= 0) {
      const px = p.x * w, py = p.y * h;
      for (let k = 0; k < waves.length; k++) {
        const wv = waves[k];
        const dx = px - wv.x * w, dy = py - wv.y * h;
        const d = Math.sqrt(dx * dx + dy * dy);
        const off = d - wv.r;
        if (off > -waveRing && off < waveRing) {
          const near = 1 - Math.abs(off) * invRing;
          if (Math.random() < near * (0.25 + E * 0.6) * wv.a) {
            p.lit = 1;
            p.cool = 26 + Math.random() * 40;
            if (wv.gen < maxGen && Math.random() < chainOdds) {
              pushWave(p.x, p.y, wv.a * (0.55 + E * 0.35), wv.gen + 1);
            }
          }
          break;
        }
      }
    }
    if (p.lit > 0.02) continue; // lit cells are drawn with the sprite below
    const rr = p.sz * TK * 0.9;
    const x2 = p.x * w, y2 = p.y * h;
    c.moveTo(x2 + rr, y2);
    c.arc(x2, y2, rr, 0, TAU);
  }
  c.fillStyle = C2(dark * (0.4 + I * 0.7), 52);
  c.fill();

  // lit cells: sprite blits, no per-particle shadowBlur
  for (let i = 0; i < plankton.length; i++) {
    const p = plankton[i];
    if (p.lit <= 0.02) continue;
    p.lit *= 0.93 - E * 0.02;
    const rr = p.sz * TK * (2.6 + p.lit * 4.5 + beatE * 1.2);
    c.globalAlpha = Math.min(0.7, p.lit * (0.5 + I * 0.5));
    c.drawImage(spr, p.x * w - rr, p.y * h - rr, rr * 2, rr * 2);
  }
  c.globalAlpha = 1;

  // --- wave fronts themselves, one glow setting for all of them ---
  if (waves.length) {
    glow(Math.min(22, 10 * (1 + beatE * 0.8)), C1());
    for (let i = 0; i < waves.length; i++) {
      const wv = waves[i];
      c.strokeStyle = CMix(0.35, wv.a * 0.24 * (0.4 + I * 0.6), 60);
      c.lineWidth = Math.max(0.5, (0.9 + wv.a * 1.6) * TK);
      c.beginPath();
      c.arc(wv.x * w, wv.y * h, wv.r, 0, TAU);
      c.stroke();
    }
    noGlow();
  }

  // --- jellyfish ---
  const pulseBoost = 1 + E * 3.2 + beatE * (0.6 + E * 1.6);
  for (let i = 0; i < jellies.length; i++) {
    const j = jellies[i];
    if (j.fi < 1) j.fi = Math.min(1, j.fi + 0.015);

    const prevPh = j.ph;
    j.ph += j.rate * sp * pulseBoost;
    if (j.ph >= 1) j.ph -= 1;
    // the jet happens at the contraction snap, so motion is genuinely pulsed
    const contracted = j.ph < 0.35 ? Math.sin(j.ph / 0.35 * Math.PI) : 0;
    if (prevPh > j.ph) {
      const kick = (0.0016 + E * 0.006) * (0.6 + bassV * 0.8);
      const ang = Math.atan2(j.vy, j.vx) || -Math.PI / 2;
      j.vx += Math.cos(ang) * kick;
      j.vy += Math.sin(ang) * kick;
    }
    // in loud passages the swarm converges; in calm ones it wanders freely
    if (E > 0.45) {
      const dx = 0.5 - j.x, dy = 0.5 - j.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (E - 0.45) * 0.00016;
      j.vx += (dx / d) * pull;
      j.vy += (dy / d) * pull;
    }
    j.vx += Math.sin(S.drift * 9 + j.seed) * 0.000024;
    j.vy -= 0.0000085 * sp;
    j.vx *= 0.985;
    j.vy *= 0.985;
    j.x += j.vx * sp;
    j.y += j.vy * sp;
    if (j.x < -0.12) j.x += 1.24; else if (j.x > 1.12) j.x -= 1.24;
    if (j.y < -0.2) { j.y = 1.16; j.vy = -0.0004 - Math.random() * 0.0008; }
    else if (j.y > 1.2) j.y = -0.16;

    const bx = j.x * w, by = j.y * h;
    const base = R * 0.075 * j.sz * (0.75 + E * 0.35);
    // contraction squeezes the bell horizontally and stretches it vertically
    const rx = base * (1 - contracted * 0.34);
    const ry = base * (0.62 + contracted * 0.42);
    if (!(rx > 0.4) || !(ry > 0.4)) continue;
    // capped: reactivity goes to 2x and 16 additive bells must not stack to white
    const a = Math.min(0.6, j.fi * (0.32 + midV * 0.22 + beatE * 0.2 + E * 0.12) * (0.4 + I * 0.7));

    // tendrils: sampled sine ribbons, fixed segment count
    c.strokeStyle = CMix(j.hue, a * 0.4, 58);
    c.lineWidth = Math.max(0.4, (0.7 + E * 0.7) * TK);
    c.beginPath();
    for (let tn = 0; tn < TENDRILS; tn++) {
      const off = (tn / (TENDRILS - 1) - 0.5) * rx * 1.5;
      const len = base * (2.1 + E * 1.5 + contracted * 0.8);
      c.moveTo(bx + off, by + ry * 0.75);
      for (let s2 = 1; s2 <= TSEG; s2++) {
        const f = s2 / TSEG;
        const sway = Math.sin(S.drift * 22 + j.seed + tn * 1.3 - f * 3.4) * rx * 0.55 * f;
        c.lineTo(bx + off + sway - j.vx * w * f * 12, by + ry * 0.75 + len * f);
      }
    }
    c.stroke();

    // bell: filled dome + glowing rim
    const bg = c.createRadialGradient(bx, by - ry * 0.2, 0, bx, by, base * 1.5);
    bg.addColorStop(0, CMix(j.hue, a * 0.6, 62 + contracted * 8));
    bg.addColorStop(0.55, CMix(j.hue, a * 0.28, 48));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.beginPath();
    for (let s2 = 0; s2 <= BELL_SEGS; s2++) {
      const th = Math.PI + (s2 / BELL_SEGS) * Math.PI;
      const px = bx + Math.cos(th) * rx;
      const py = by + Math.sin(th) * ry;
      if (s2 === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = CMix(j.hue, Math.min(0.7, a * 1.3 + contracted * 0.2), 70);
    c.lineWidth = Math.max(0.6, (1 + contracted * 1.6 + beatE) * TK);
    c.stroke();
  }

  // --- one shared bloom pass on the brightest bells, blur capped ---
  if (jellies.length) {
    glow(Math.min(26, (9 + E * 10) * (1 + beatE * 0.7)), C1());
    c.strokeStyle = C1(Math.min(0.3, (0.1 + E * 0.12 + beatE * 0.16) * (0.4 + I * 0.6)), 68);
    c.lineWidth = Math.max(0.6, 1.4 * TK);
    c.beginPath();
    for (let i = 0; i < jellies.length; i++) {
      const j = jellies[i];
      const r2 = R * 0.05 * j.sz * (0.75 + E * 0.35);
      c.moveTo(j.x * w + r2, j.y * h);
      c.arc(j.x * w, j.y * h, r2, 0, TAU);
    }
    c.stroke();
    noGlow();
  }
};
