import type { ThemeDraw } from "../themeTypes";

interface Filing {
  /** normalized lattice position, fixed for the life of the field */
  x: number;
  y: number;
  /** current orientation (bidirectional — filings have no head) */
  a: number;
  /** phase seed for churn */
  ph: number;
}
interface Pole {
  q: number;
  ph: number;
  ax: number;
  ay: number;
  sp: number;
  /** live pixel position, written each frame */
  px: number;
  py: number;
}
interface MagneticState {
  fil: Filing[];
  poles: Pole[];
  /** field clock — advances far faster in loud passages */
  ft: number;
  /** realignment shockwave */
  wx: number;
  wy: number;
  wr: number;
  wa: number;
}

// Fixed budgets — cost is identical in a thumbnail and full-screen.
const COLS = 36;
const ROWS = 24;                 // 864 filings, hard cap
const NPOLES = 4;
const SEEDS = 4;                 // flux curves traced per pole
const STEPS = 24;                // integration steps per curve
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Iron filings scattered on glass over a living magnet. Every filing swings to
// the local field of 2–4 wandering poles, flux curves arc between them, and
// each beat flips a polarity — a realignment shockwave visibly sweeps the
// lattice. Quiet passages are a slow, graceful comb; loud ones send the poles
// racing and the whole field churns.
export const MAGNETIC: ThemeDraw = ({
  c, w, h, R, vt, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: MagneticState = (L.scratch.magnetic ??= {
    fil: Array.from({ length: COLS * ROWS }, (_, i) => {
      const cxi = i % COLS, ryi = (i / COLS) | 0;
      // deterministic jitter so the lattice never looks like graph paper
      const j1 = Math.sin(i * 12.9898) * 43758.5453;
      const j2 = Math.sin(i * 78.233) * 12345.6789;
      return {
        x: (cxi + 0.5) / COLS + ((j1 - Math.floor(j1)) - 0.5) * (0.9 / COLS),
        y: (ryi + 0.5) / ROWS + ((j2 - Math.floor(j2)) - 0.5) * (0.9 / ROWS),
        a: (j1 - Math.floor(j1)) * Math.PI,
        ph: (j2 - Math.floor(j2)) * Math.PI * 2,
      };
    }) as Filing[],
    poles: Array.from({ length: NPOLES }, (_, i) => ({
      q: i % 2 ? -1 : 1,
      ph: i * 1.9,
      ax: 0.24 + (i % 3) * 0.07,
      ay: 0.2 + (i % 2) * 0.09,
      sp: 0.7 + i * 0.23,
      px: 0,
      py: 0,
    })) as Pole[],
    ft: 0,
    wx: 0, wy: 0, wr: 0, wa: 0,
  });

  const eS = energy * energy;
  const hot = clamp01((energy - 0.35) / 0.5);              // 0 calm → 1 driving
  const nAct = energy < 0.3 ? 2 : energy < 0.62 ? 3 : NPOLES;
  // poles crawl at rest (0.003/frame) and whip around when the music drives
  S.ft += (0.003 + eS * 0.05) * cfg.speed * (1 + beatE * hot * 1.5);
  const ft = S.ft;

  for (let i = 0; i < nAct; i++) {
    const p = S.poles[i];
    p.px = (0.5 + Math.cos(ft * p.sp + p.ph) * p.ax) * w;
    p.py = (0.5 + Math.sin(ft * p.sp * 1.31 + p.ph * 1.7) * p.ay) * h;
  }

  // ── beat: flip polarity and launch a realignment wave from that pole ──
  if (beat) {
    const idx = (Math.random() * nAct) | 0;
    if (hot > 0.5) for (let i = 0; i < nAct; i++) S.poles[i].q = -S.poles[i].q;
    else S.poles[idx].q = -S.poles[idx].q;
    S.wx = S.poles[idx].px;
    S.wy = S.poles[idx].py;
    S.wr = R * 0.02;
    S.wa = 1;
  }
  if (S.wa > 0.01) {
    S.wr += R * (0.012 + energy * 0.03) * cfg.speed;
    S.wa *= 0.93;
    if (S.wr > R * 2) S.wa = 0;
  }
  const band = R * (0.05 + hot * 0.07);
  const wIn = S.wa > 0.01 ? Math.max(0, S.wr - band) : -1;
  const wOut = S.wa > 0.01 ? S.wr + band : -1;
  const wIn2 = wIn * wIn, wOut2 = wOut * wOut;

  // ── field: sum of monopole contributions, measured in units of R ──
  const invR = 1 / (R || 1);
  // one path per colour band + one for the wave-lit filings: 4 strokes total,
  // never one stroke per filing
  const p0 = new Path2D(), p1 = new Path2D(), p2 = new Path2D(), pHot = new Path2D();
  const baseK = 0.045 + eS * 0.32;                          // alignment rate
  const churn = eS * 0.1;                                   // chaos, calm ≈ 0
  const segBase = R * (0.009 + bassV * 0.004) * (1 + beatE * 0.35 * I);

  for (let i = 0; i < S.fil.length; i++) {
    const f = S.fil[i];
    const fx = f.x * w, fy = f.y * h;
    let ex = 0, ey = 0;
    for (let k = 0; k < nAct; k++) {
      const p = S.poles[k];
      const dx = (fx - p.px) * invR, dy = (fy - p.py) * invR;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.0025) d2 = 0.0025;                         // never divide by ~0
      const inv = p.q / (d2 * Math.sqrt(d2));
      ex += dx * inv;
      ey += dy * inv;
    }
    const mag = Math.sqrt(ex * ex + ey * ey);
    const str = mag / (mag + 3);                            // 0..1, no NaN
    const ta = mag > 1e-6 ? Math.atan2(ey, ex) : f.a;

    // wave membership: compare squared distances, no per-filing sqrt
    const dwx = fx - S.wx, dwy = fy - S.wy;
    const dw2 = dwx * dwx + dwy * dwy;
    const inWave = wIn >= 0 && dw2 > wIn2 && dw2 < wOut2;

    // shortest swing to the field axis (filings are 180°-symmetric)
    let d = ta - f.a;
    d = (((d + Math.PI * 0.5) % Math.PI) + Math.PI) % Math.PI - Math.PI * 0.5;
    f.a += d * (inWave ? 0.45 + S.wa * 0.4 : baseK);
    if (churn > 0.001) f.a += Math.sin(vt * 0.11 + f.ph * 6.3) * churn;

    const len = segBase * (0.55 + str * 1.5) * (inWave ? 1.9 : 1) * TK;
    const ca = Math.cos(f.a) * len, sa = Math.sin(f.a) * len;
    const path = inWave ? pHot : str > 0.55 ? p2 : str > 0.28 ? p1 : p0;
    path.moveTo(fx - ca, fy - sa);
    path.lineTo(fx + ca, fy + sa);
  }

  c.lineCap = "round";
  c.lineWidth = (0.7 + hot * 0.3) * TK;
  c.strokeStyle = CMix(0.1, 0.2 + midV * 0.12, 44);
  c.stroke(p0);
  c.strokeStyle = CMix(0.5, 0.42 + midV * 0.18, 60);
  c.stroke(p1);
  c.strokeStyle = CMix(1, 0.62 + beatE * 0.2, 72);
  c.lineWidth = (0.9 + hot * 0.5) * TK;
  c.stroke(p2);
  if (S.wa > 0.01) {
    c.strokeStyle = C1(Math.min(1, 0.5 + S.wa * 0.5), 88);
    c.lineWidth = (1 + S.wa) * TK;
    glow(Math.min(20, 10 + S.wa * 10), C1());
    c.stroke(pHot);
    noGlow();
  }

  // ── flux curves: traced by walking the field from seeds around each pole ──
  const flux = new Path2D();
  for (let k = 0; k < nAct; k++) {
    const pole = S.poles[k];
    for (let s = 0; s < SEEDS; s++) {
      const a0 = (s / SEEDS) * Math.PI * 2 + ft * 0.3 * pole.q + k;
      let x = pole.px + Math.cos(a0) * R * 0.06;
      let y = pole.py + Math.sin(a0) * R * 0.06;
      flux.moveTo(x, y);
      const step = R * 0.035 * pole.q;
      for (let n = 0; n < STEPS; n++) {
        let ex = 0, ey = 0;
        for (let m = 0; m < nAct; m++) {
          const p = S.poles[m];
          const dx = (x - p.px) * invR, dy = (y - p.py) * invR;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.0016) d2 = 0.0016;
          const inv = p.q / (d2 * Math.sqrt(d2));
          ex += dx * inv;
          ey += dy * inv;
        }
        const m2 = Math.hypot(ex, ey);
        if (m2 < 1e-6) break;
        x += (ex / m2) * step;
        y += (ey / m2) * step;
        if (x < -w * 0.2 || x > w * 1.2 || y < -h * 0.2 || y > h * 1.2) break;
        flux.lineTo(x, y);
      }
    }
  }
  c.strokeStyle = C2(0.1 + hot * 0.22 + beatE * 0.18, 66);
  c.lineWidth = (0.7 + hot * 0.8 + beatE * 0.6) * TK;
  glow(Math.min(22, 8 + hot * 12), C2());
  c.stroke(flux);
  noGlow();

  // ── the poles themselves ──
  for (let k = 0; k < nAct; k++) {
    const p = S.poles[k];
    const pr = R * (0.05 + bassV * 0.02 + beatE * 0.03 * I);
    const col = p.q > 0 ? C1 : C2;
    const g = c.createRadialGradient(p.px, p.py, 0, p.px, p.py, pr);
    g.addColorStop(0, col(0.6 + beatE * 0.3, 92));
    g.addColorStop(0.4, col(0.28 + beatE * 0.2, 68));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.px, p.py, pr, 0, Math.PI * 2);
    c.fill();
  }

  // the wave front itself, so the jolt reads as one travelling ring
  if (S.wa > 0.02) {
    c.strokeStyle = C1(S.wa * 0.35, 82);
    c.lineWidth = (1 + S.wa * 2) * TK;
    c.beginPath();
    c.arc(S.wx, S.wy, S.wr, 0, Math.PI * 2);
    c.stroke();
  }
  c.lineCap = "butt";
};
