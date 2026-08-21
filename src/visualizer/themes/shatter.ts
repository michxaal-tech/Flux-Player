import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

const MAXF = 6;                  // fracture pool — hard cap
const RAYS = 8;                  // radial cracks per impact
const RINGS = 3;                 // concentric cracks → RAYS*RINGS shards each
const SHARDS = RAYS * RINGS;     // 24 per fracture, 144 worst case
const RB = [0, 0.36, 0.7, 1];    // ring radii (fractions of the fracture scale)

interface Frac {
  live: number;
  x: number; y: number;
  scale: number;
  /** crack propagation, 0 → 1 */ grow: number;
  /** shard separation distance */ open: number;
  openMax: number;
  life: number;
  age: number;
  hue: number;
  ca: Float32Array; sa: Float32Array;              // ray directions
  rad: Float32Array;                               // RAYS × (RINGS+1) radius factors
  sep: Float32Array; spin: Float32Array;           // per-shard drift + tumble
  pts: Float32Array;                               // transformed quad corners, reused
}
interface Scar { x1: number; y1: number; x2: number; y2: number; a: number }

const mkFrac = (): Frac => ({
  live: 0, x: 0, y: 0, scale: 0, grow: 0, open: 0, openMax: 0, life: 0, age: 0, hue: 0,
  ca: new Float32Array(RAYS), sa: new Float32Array(RAYS),
  rad: new Float32Array(RAYS * (RINGS + 1)),
  sep: new Float32Array(SHARDS), spin: new Float32Array(SHARDS),
  pts: new Float32Array(SHARDS * 8),
});

// A sheet of glass hanging in front of the light. Impacts spider-crack it —
// radial fractures with concentric cracks between them carve out shards that
// lift off the plane, tumble apart and then settle back as the pane heals.
// Quiet passages get one small crack at a time that creeps outward and takes
// many seconds to close; loud passages keep the pane in permanent collapse,
// several full-width fractures blowing open at once. Light refracts along
// every crack line.
export const SHATTER: ThemeDraw = ({
  c, fs, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.shatter ??= {
    fracs: [] as Frac[],
    scars: [] as Scar[],
    flash: 0,
  });
  if (S.fracs.length === 0) for (let i = 0; i < MAXF; i++) S.fracs.push(mkFrac());

  const E = energy;
  const fracs: Frac[] = S.fracs;

  // ── the pane itself: a faint sheen that the cracks cut through ────────────
  const sh = c.createLinearGradient(0, 0, w, h);
  const sweep = (Math.sin(vt * 0.004) + 1) * 0.5;
  sh.addColorStop(0, CMix(0.15, 0.015, 34));
  sh.addColorStop(Math.max(0.02, Math.min(0.98, sweep)), CMix(0.6, 0.03 + trebV * 0.02 + S.flash * 0.05, 52));
  sh.addColorStop(1, CMix(0.9, 0.015, 30));
  c.fillStyle = sh;
  c.fillRect(0, 0, w, h);

  // ── spawn impacts ─────────────────────────────────────────────────────────
  let active = 0;
  for (let i = 0; i < MAXF; i++) if (fracs[i].live) active++;

  const spawn = () => {
    let slot = -1;
    let worst = 2;
    for (let i = 0; i < MAXF; i++) {
      if (!fracs[i].live) { slot = i; break; }
      if (fracs[i].life < worst) { worst = fracs[i].life; slot = i; }
    }
    if (slot < 0) return;
    const f = fracs[slot];
    f.live = 1;
    f.age = 0;
    f.grow = 0;
    f.open = 0;
    f.life = 1;
    f.hue = Math.random();
    f.x = cx + (Math.random() - 0.5) * w * 0.72;
    f.y = cy + (Math.random() - 0.5) * h * 0.66;
    f.scale = R * (0.16 + E * 0.4) * (0.7 + Math.random() * 0.7);
    f.openMax = R * (0.008 + E * 0.07) * (0.6 + bassV * 0.8) * I;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < RAYS; i++) {
      const a = a0 + (i / RAYS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      f.ca[i] = Math.cos(a);
      f.sa[i] = Math.sin(a);
      const len = 0.6 + Math.random() * 0.75;
      for (let j = 0; j <= RINGS; j++) {
        f.rad[i * (RINGS + 1) + j] = RB[j] * len * (0.82 + Math.random() * 0.4);
      }
    }
    for (let k = 0; k < SHARDS; k++) {
      f.sep[k] = 0.4 + Math.random() * 1.3;
      f.spin[k] = (Math.random() - 0.5) * 1.6;
    }
    S.flash = Math.max(S.flash, 0.35 + E * 0.65);
  };

  if (beat) {
    if (E < 0.35) {
      // calm: one lonely crack, and only once the last one has healed away
      if (active === 0 && Math.random() < 0.75) spawn();
    } else {
      spawn();
      if (E > 0.72 && Math.random() < E) spawn();
    }
  }
  // scaled by the frame factor: this is a rate per second, not per frame
  if (E > 0.6 && !beat && Math.random() < (E - 0.6) * 0.35 * fs) spawn();
  S.flash *= dk(0.86, fs);

  // ── evolve + transform ────────────────────────────────────────────────────
  const growRate = (0.035 + E * 0.5) * cfg.speed;
  const heal = dk(0.9985 - E * 0.05, fs);      // calm cracks close over many seconds
  const decay = dk(0.9975 - E * 0.032, fs);

  for (let n = 0; n < MAXF; n++) {
    const f = fracs[n];
    if (!f.live) continue;
    f.age++;
    if (f.grow < 1) f.grow = Math.min(1, f.grow + growRate);
    if (f.age < 5) f.open += f.openMax * 0.26 * fs;
    else f.open *= heal;
    f.life *= decay;
    if (f.life < 0.025) {
      // leave a healed scar behind: the longest crack lines linger
      if (S.scars.length < 26) {
        for (let i = 0; i < RAYS; i += 3) {
          const rr = f.rad[i * (RINGS + 1) + RINGS] * f.scale;
          S.scars.push({ x1: f.x, y1: f.y, x2: f.x + f.ca[i] * rr, y2: f.y + f.sa[i] * rr, a: 0.35 });
        }
      }
      f.live = 0;
      continue;
    }

    const g = f.scale * f.grow;
    const pts = f.pts;
    for (let j = 0; j < RINGS; j++) {
      for (let i = 0; i < RAYS; i++) {
        const i1 = (i + 1) % RAYS;
        const b0 = i * (RINGS + 1), b1 = i1 * (RINGS + 1);
        const r0 = f.rad[b0 + j] * g, r1 = f.rad[b1 + j] * g;
        const r2 = f.rad[b1 + j + 1] * g, r3 = f.rad[b0 + j + 1] * g;
        const x0 = f.ca[i] * r0, y0 = f.sa[i] * r0;
        const x1 = f.ca[i1] * r1, y1 = f.sa[i1] * r1;
        const x2 = f.ca[i1] * r2, y2 = f.sa[i1] * r2;
        const x3 = f.ca[i] * r3, y3 = f.sa[i] * r3;
        const mx = (x0 + x1 + x2 + x3) * 0.25;
        const my = (y0 + y1 + y2 + y3) * 0.25;
        const k = j * RAYS + i;
        const th = f.open * f.spin[k] * 0.02;
        const ct = Math.cos(th), st = Math.sin(th);
        const md = Math.sqrt(mx * mx + my * my) || 1e-4;
        const ox = f.x + (mx / md) * f.open * f.sep[k];
        const oy = f.y + (my / md) * f.open * f.sep[k];
        const o = k * 8;
        let dx = x0 - mx, dy = y0 - my;
        pts[o] = ox + mx + dx * ct - dy * st; pts[o + 1] = oy + my + dx * st + dy * ct;
        dx = x1 - mx; dy = y1 - my;
        pts[o + 2] = ox + mx + dx * ct - dy * st; pts[o + 3] = oy + my + dx * st + dy * ct;
        dx = x2 - mx; dy = y2 - my;
        pts[o + 4] = ox + mx + dx * ct - dy * st; pts[o + 5] = oy + my + dx * st + dy * ct;
        dx = x3 - mx; dy = y3 - my;
        pts[o + 6] = ox + mx + dx * ct - dy * st; pts[o + 7] = oy + my + dx * st + dy * ct;
      }
    }

    // shard bodies — one fill per ring (same colour), so 3 fills per fracture
    for (let j = 0; j < RINGS; j++) {
      c.beginPath();
      for (let i = 0; i < RAYS; i++) {
        const o = (j * RAYS + i) * 8;
        c.moveTo(pts[o], pts[o + 1]);
        c.lineTo(pts[o + 2], pts[o + 3]);
        c.lineTo(pts[o + 4], pts[o + 5]);
        c.lineTo(pts[o + 6], pts[o + 7]);
        c.closePath();
      }
      const fj = 1 - j / RINGS;
      c.fillStyle = CMix((f.hue + fj * 0.4) % 1, f.life * (0.05 + fj * 0.12 + beatE * 0.05), 40 + fj * 26);
      c.fill();
    }
  }

  // ── crack lines: every shard outline, one glowing stroke per fracture ─────
  glow(Math.min(20, 10 * (1 + beatE * 0.8)), C1());
  for (let n = 0; n < MAXF; n++) {
    const f = fracs[n];
    if (!f.live) continue;
    const pts = f.pts;
    c.beginPath();
    for (let k = 0; k < SHARDS; k++) {
      const o = k * 8;
      c.moveTo(pts[o], pts[o + 1]);
      c.lineTo(pts[o + 2], pts[o + 3]);
      c.lineTo(pts[o + 4], pts[o + 5]);
      c.lineTo(pts[o + 6], pts[o + 7]);
      c.closePath();
    }
    c.strokeStyle = C1(f.life * (0.5 + beatE * 0.4), 78 + beatE * 12);
    c.lineWidth = (0.7 + f.life * 1.1 + beatE * 0.9) * TK;
    c.stroke();
  }
  // refraction: the same crack lines offset a hair, in the second hue.
  // Unblurred — a second glowed pass per fracture is not worth the fill rate.
  noGlow();
  c.save();
  c.translate(1.4 + beatE * 2.4, -1.1 - beatE * 1.8);
  c.lineWidth = 0.7 * TK;
  for (let n = 0; n < MAXF; n++) {
    const f = fracs[n];
    if (!f.live) continue;
    const pts = f.pts;
    c.beginPath();
    for (let k = 0; k < SHARDS; k++) {
      const o = k * 8;
      c.moveTo(pts[o], pts[o + 1]);
      c.lineTo(pts[o + 2], pts[o + 3]);
      c.lineTo(pts[o + 4], pts[o + 5]);
      c.lineTo(pts[o + 6], pts[o + 7]);
      c.closePath();
    }
    c.strokeStyle = C2(f.life * 0.32, 70);
    c.stroke();
  }
  c.restore();

  // ── healed scars, batched into a single hairline stroke ──────────────────
  if (S.scars.length) {
    c.beginPath();
    for (let i = S.scars.length - 1; i >= 0; i--) {
      const s = S.scars[i];
      s.a *= dk(0.985, fs);
      if (s.a < 0.02) { S.scars.splice(i, 1); continue; }
      c.moveTo(s.x1, s.y1);
      c.lineTo(s.x2, s.y2);
    }
    c.strokeStyle = C2(0.09 + beatE * 0.06, 62);
    c.lineWidth = 0.6 * TK;
    c.stroke();
  }

  // ── impact flash ──────────────────────────────────────────────────────────
  if (S.flash > 0.03) {
    c.fillStyle = C1(S.flash * 0.09, 86);
    c.fillRect(0, 0, w, h);
  }
};
