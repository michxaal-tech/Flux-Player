import type { ThemeDraw } from "../themeTypes";

interface Boid {
  x: number; y: number; vx: number; vy: number;
  /** 0..1 depth, drives size/brightness tier (also used for batching) */
  z: number;
}
interface Shock { x: number; y: number; r: number; amp: number }

const N = 340;          // hard cap on the flock — never scales with canvas size
const COLS = 12, ROWS = 8, CELLS = COLS * ROWS;
const NEIGH_CAP = 22;   // bounds the worst case when the flock balls up in one cell
const TIERS = 3;        // depth tiers → 3 batched strokes for the whole flock

// A starling murmuration. Hundreds of boids behave as one organism: in a
// driving passage cohesion clamps down and the flock rockets between waypoints
// as a tight dark ribbon; in a calm passage separation widens and the flock
// falls apart into a slow, wide, drifting haze. Every beat detonates a
// shockwave from the flock's own centre that blows the birds apart before
// cohesion drags them back together.
export const MURMUR: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, I, TK, C1, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.murmur ??= {
    boids: [] as Boid[],
    shocks: [] as Shock[],
    // spatial hash scratch — allocated once, reused every frame
    cellOf: new Int32Array(N),
    counts: new Int32Array(CELLS),
    start: new Int32Array(CELLS + 1),
    cursor: new Int32Array(CELLS),
    order: new Int32Array(N),
    tx: 0, ty: 0, gtx: 0, gty: 0, tt: 0,
    ccx: 0, ccy: 0, spread: 0,
  });

  if (S.boids.length === 0) {
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());
      S.boids.push({
        x: cx + Math.cos(a) * R * 0.34 * rr,
        y: cy + Math.sin(a) * R * 0.3 * rr,
        vx: Math.cos(a), vy: Math.sin(a),
        z: Math.random() * 0.999,
      });
    }
    S.tx = S.gtx = cx;
    S.ty = S.gty = cy;
  }

  const E = energy;

  // ── flock waypoint ────────────────────────────────────────────────────────
  // Calm: the waypoint crawls and is barely pulled on, so the flock drifts.
  // Driving: it jumps far on beats and the flock rockets after it.
  S.tt--;
  if (S.tt <= 0 || (beat && E > 0.5)) {
    const a = Math.random() * Math.PI * 2;
    const rad = R * (0.1 + Math.random() * (0.08 + E * 0.34));
    S.gtx = cx + Math.cos(a) * rad;
    S.gty = cy + Math.sin(a) * rad * 0.8;
    S.tt = Math.floor(120 - E * 90);
  }
  const chase = 0.012 + E * 0.09;
  S.tx += (S.gtx - S.tx) * chase;
  S.ty += (S.gty - S.ty) * chase;

  // ── beat shockwaves ───────────────────────────────────────────────────────
  if (beat && S.shocks.length < 4) {
    S.shocks.push({
      x: S.ccx || cx, y: S.ccy || cy,
      r: R * 0.02, amp: (0.5 + E * 1.1 + bassV * 0.5) * I,
    });
  }
  for (let i = S.shocks.length - 1; i >= 0; i--) {
    const s = S.shocks[i];
    s.r += R * (0.022 + E * 0.05) * cfg.speed;
    s.amp *= 0.9;
    if (s.amp < 0.05 || s.r > R * 1.3) S.shocks.splice(i, 1);
  }

  // ── spatial hash (counting sort, no per-frame allocation) ─────────────────
  const { cellOf, counts, start, cursor, order, boids } = S;
  counts.fill(0);
  const cw = w / COLS, chh = h / ROWS;
  for (let i = 0; i < N; i++) {
    const b: Boid = boids[i];
    let ci = (b.x / cw) | 0; if (ci < 0) ci = 0; else if (ci >= COLS) ci = COLS - 1;
    let cj = (b.y / chh) | 0; if (cj < 0) cj = 0; else if (cj >= ROWS) cj = ROWS - 1;
    const k = cj * COLS + ci;
    cellOf[i] = k;
    counts[k]++;
  }
  start[0] = 0;
  for (let k = 0; k < CELLS; k++) { start[k + 1] = start[k] + counts[k]; cursor[k] = start[k]; }
  for (let i = 0; i < N; i++) order[cursor[cellOf[i]]++] = i;

  // ── energy-driven flocking constants ──────────────────────────────────────
  const sepR = R * (0.058 - E * 0.042);   // wide personal space when calm
  const percR = R * (0.22 - E * 0.11);
  const percR2 = percR * percR;
  const maxSp = R * (0.0022 + E * 0.0125) * cfg.speed * (1 + beatE * 1.1 * E);
  const minSp = maxSp * 0.42;
  const cohW = 0.00008 + E * 0.0011;
  const aliW = 0.02 + E * 0.16;
  const sepA = maxSp * (0.34 + E * 0.2);
  const seekW = (0.0003 + E * 0.0062) * I;
  const wander = 0.05 + (1 - E) * 0.1;    // lazy meander dominates when calm
  const band = R * 0.14;
  const shocks: Shock[] = S.shocks;

  let sumX = 0, sumY = 0, sumSq = 0;

  for (let i = 0; i < N; i++) {
    const b: Boid = boids[i];
    let sx = 0, sy = 0, ax = 0, ay = 0, gx = 0, gy = 0, nn = 0, ns = 0, checked = 0;
    const k = cellOf[i];
    const ci = k % COLS, cj = (k / COLS) | 0;

    for (let dj = -1; dj <= 1 && checked < NEIGH_CAP; dj++) {
      const jj = cj + dj;
      if (jj < 0 || jj >= ROWS) continue;
      for (let di = -1; di <= 1 && checked < NEIGH_CAP; di++) {
        const ii = ci + di;
        if (ii < 0 || ii >= COLS) continue;
        const kk = jj * COLS + ii;
        const s0 = start[kk], s1 = s0 + counts[kk];
        for (let p = s0; p < s1; p++) {
          const j = order[p];
          if (j === i) continue;
          if (++checked > NEIGH_CAP) break;
          const o: Boid = boids[j];
          const dx = o.x - b.x, dy = o.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > percR2) continue;
          nn++;
          gx += o.x; gy += o.y;
          ax += o.vx; ay += o.vy;
          if (d2 < sepR * sepR && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const f = (sepR - d) / sepR;
            sx -= (dx / d) * f; sy -= (dy / d) * f;
            ns++;
          }
        }
      }
    }

    if (nn > 0) {
      const inv = 1 / nn;
      b.vx += (gx * inv - b.x) * cohW;
      b.vy += (gy * inv - b.y) * cohW;
      b.vx += (ax * inv - b.vx) * aliW;
      b.vy += (ay * inv - b.vy) * aliW;
    }
    if (ns > 0) {
      const m = Math.sqrt(sx * sx + sy * sy) || 1;
      b.vx += (sx / m) * sepA;
      b.vy += (sy / m) * sepA;
    }

    // waypoint pull — near-zero when calm, brutal when driving
    b.vx += (S.tx - b.x) * seekW;
    b.vy += (S.ty - b.y) * seekW;

    // organic meander (a cheap flow field), strongest in the quiet passages
    const turn =
      (Math.sin(b.x * 0.006 + vt * 0.011) + Math.cos(b.y * 0.007 - vt * 0.013 + b.z * 6)) * wander;
    const cs = Math.cos(turn), sn = Math.sin(turn);
    const rvx = b.vx * cs - b.vy * sn;
    b.vy = b.vx * sn + b.vy * cs;
    b.vx = rvx;

    for (let q = 0; q < shocks.length; q++) {
      const s = shocks[q];
      const dx = b.x - s.x, dy = b.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      const kk = 1 - Math.abs(d - s.r) / band;
      if (kk > 0) {
        const f = kk * s.amp * maxSp * 2.4;
        b.vx += (dx / d) * f;
        b.vy += (dy / d) * f;
      }
    }

    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 1e-5) {
      const kk = sp > maxSp ? maxSp / sp : sp < minSp ? minSp / sp : 1;
      if (kk !== 1) { b.vx *= kk; b.vy *= kk; }
    } else {
      b.vx = maxSp;
    }

    b.x += b.vx; b.y += b.vy;
    const m2 = R * 0.07;
    if (b.x < -m2) b.x = w + m2; else if (b.x > w + m2) b.x = -m2;
    if (b.y < -m2) b.y = h + m2; else if (b.y > h + m2) b.y = -m2;

    sumX += b.x; sumY += b.y;
    sumSq += b.x * b.x + b.y * b.y;
  }

  const invN = 1 / N;
  const mx = sumX * invN, my = sumY * invN;
  const varr = sumSq * invN - (mx * mx + my * my);
  S.ccx = mx; S.ccy = my;
  S.spread += (Math.sqrt(Math.max(0, varr)) - S.spread) * 0.1;

  // ── the flock's own aura: a tight hot core when driving, a wide haze when calm
  const halo = Math.max(R * 0.06, S.spread * 2.1);
  const hg = c.createRadialGradient(mx, my, 0, mx, my, halo);
  hg.addColorStop(0, CMix(0.35, 0.05 + E * 0.1 + beatE * 0.16, 52 + E * 16));
  hg.addColorStop(0.55, CMix(0.7, 0.02 + E * 0.04, 40));
  hg.addColorStop(1, "transparent");
  c.fillStyle = hg;
  c.beginPath();
  c.arc(mx, my, halo, 0, Math.PI * 2);
  c.fill();

  // ── shock rings ───────────────────────────────────────────────────────────
  if (shocks.length) {
    glow(Math.min(20, 12 * (1 + beatE)), C1());
    c.lineWidth = (1 + beatE * 2) * TK;
    for (let q = 0; q < shocks.length; q++) {
      const s = shocks[q];
      c.strokeStyle = C1(s.amp * 0.22, 72);
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.stroke();
    }
    noGlow();
  }

  // ── the birds: 3 batched strokes, one glow setup for the whole flock ──────
  c.lineCap = "round";
  glow(Math.min(18, 7 + beatE * 9), C1());
  for (let ti = 0; ti < TIERS; ti++) {
    const f = ti / (TIERS - 1);
    const tl = 2 + f * 1.8 + E * 3.5 + beatE * 3;
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const b: Boid = boids[i];
      if (((b.z * TIERS) | 0) !== ti) continue;
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - b.vx * tl, b.y - b.vy * tl);
    }
    c.strokeStyle = CMix(f, 0.3 + f * 0.32 + beatE * 0.22 + E * 0.12, 52 + f * 24 + beatE * 12);
    c.lineWidth = (0.6 + f * 1.5) * TK;
    c.stroke();
  }
  noGlow();
  c.lineCap = "butt";
};
