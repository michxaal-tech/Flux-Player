import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Peak {
  /** grid coordinates */ gx: number; gy: number;
  amp: number;
  /** influence radius in grid cells */ rad: number;
  life: number;
  age: number;
  /** ripple rate — how fast the uplift breathes */ rip: number;
}

const GW = 48;            // fixed coarse grid — never scales with pixels
const GH = 30;
const CW = GW - 1;
const CH = GH - 1;
const NL = 11;            // contour levels
const BANDS = NL + 1;     // elevation slots between them
const SBANDS = BANDS / 2; // shading steps — every other contour is a band edge,
                          // and the coarser steps give long horizontal runs
const WAVES = 3;
const MAX_PEAKS = 8;
const TAU = Math.PI * 2;

// A survey map of terrain that will not hold still. The elevation field is three
// travelling waves plus whatever uplift the music has thrown into it; contours
// are cut out of a fixed 48x30 grid with marching squares, and the ground
// between them is shaded in stepped bands. A survey line sweeps the sheet.
// In a calm passage the land breathes: a few enormous, soft contours drifting
// across the sheet over many seconds. In a driving passage the ground erupts —
// every beat punches a sharp peak up through the surface, the contours pack in
// tight around it and ripple outward before the next hit lands.
export const TOPOGRAPH: ThemeDraw = ({
  c, fs, w, h, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.topograph ??= {
    field: new Float32Array(GW * GH),
    cmin: new Float32Array(CW * CH),
    cmax: new Float32Array(CW * CH),
    band: new Uint8Array(CW * CH),
    levels: new Float32Array(NL),
    // separable wave tables: sin(kx*u + ph) etc, so the grid loop needs no trig
    sa: [new Float32Array(GW), new Float32Array(GW), new Float32Array(GW)],
    ca: [new Float32Array(GW), new Float32Array(GW), new Float32Array(GW)],
    sb: [new Float32Array(GH), new Float32Array(GH), new Float32Array(GH)],
    cb: [new Float32Array(GH), new Float32Array(GH), new Float32Array(GH)],
    amp: new Float32Array(WAVES),
    cols: [] as string[],
    peaks: [] as Peak[],
    scan: -0.2,
  });
  const field: Float32Array = S.field;
  const cmin: Float32Array = S.cmin;
  const cmax: Float32Array = S.cmax;
  const bandOf: Uint8Array = S.band;
  const levels: Float32Array = S.levels;
  const sa: Float32Array[] = S.sa;
  const ca: Float32Array[] = S.ca;
  const sb: Float32Array[] = S.sb;
  const cb: Float32Array[] = S.cb;
  const amp: Float32Array = S.amp;
  const cols: string[] = S.cols;
  const peaks: Peak[] = S.peaks;
  if (cols.length === 0) for (let i = 0; i < SBANDS; i++) cols.push("");

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const spd = cfg.speed;

  // --- uplift events --------------------------------------------------------
  if (beat && peaks.length < MAX_PEAKS) {
    const n = E < 0.35 ? 1 : 1 + Math.round(E * 2);
    for (let k = 0; k < n; k++) {
      if (peaks.length >= MAX_PEAKS) break;
      peaks.push({
        gx: 3 + Math.random() * (GW - 6),
        gy: 2 + Math.random() * (GH - 4),
        // calm: a broad, shallow swell. driving: a narrow, violent spike
        amp: (0.3 + E * 1.5) * (0.6 + bassV * 0.8) * I,
        rad: (16 - E * 11) * (0.7 + Math.random() * 0.6),
        life: 1,
        age: 0,
        rip: 0.02 + E * 0.16,
      });
    }
  }
  for (let i = peaks.length - 1; i >= 0; i--) {
    const p = peaks[i];
    p.age += spd * fs;
    p.life *= dk(0.998 - E * 0.028, fs);   // lingers for ~20s when calm, ~1s when loud
    if (p.life < 0.03) peaks.splice(i, 1);
  }

  // --- rebuild the elevation field -----------------------------------------
  // renamed from `fs`, which now means the engine's frame factor everywhere
  const fieldScale = 1 + E * 3.2;               // broad swells → tight ridges
  const rate = (0.0035 + E * 0.028) * spd;
  const kx = [2.1 * fieldScale, -1.4 * fieldScale, 3.6 * fieldScale];
  const ky = [1.3 * fieldScale, 2.6 * fieldScale, -3.0 * fieldScale];
  const phs = [vt * rate, vt * rate * 0.72 + 1.7, vt * rate * 1.35 + 3.2];
  amp[0] = 0.62 * (0.55 + E * 0.7) * (1 + bassV * 0.3);
  amp[1] = 0.4 * (0.55 + E * 0.7);
  amp[2] = 0.24 * (0.35 + E * 1.1) * (1 + trebV * 0.4);

  for (let m = 0; m < WAVES; m++) {
    const k = kx[m] * TAU, ph = phs[m];
    const A = sa[m], B = ca[m];
    for (let i = 0; i < GW; i++) {
      const t = (i / CW) * k + ph;
      A[i] = Math.sin(t);
      B[i] = Math.cos(t);
    }
    const k2 = ky[m] * TAU;
    const Cc = sb[m], D = cb[m];
    for (let j = 0; j < GH; j++) {
      const t = (j / CH) * k2;
      Cc[j] = Math.sin(t);
      D[j] = Math.cos(t);
    }
  }

  let fmin = 1e9, fmax = -1e9;
  for (let j = 0; j < GH; j++) {
    const row = j * GW;
    const s0 = sb[0][j], c0 = cb[0][j];
    const s1 = sb[1][j], c1 = cb[1][j];
    const s2 = sb[2][j], c2 = cb[2][j];
    for (let i = 0; i < GW; i++) {
      const v =
        amp[0] * (sa[0][i] * c0 + ca[0][i] * s0) +
        amp[1] * (sa[1][i] * c1 + ca[1][i] * s1) +
        amp[2] * (sa[2][i] * c2 + ca[2][i] * s2);
      field[row + i] = v;
      if (v < fmin) fmin = v;
      if (v > fmax) fmax = v;
    }
  }

  // stamp the uplifts in, touching only the cells inside each footprint
  for (let n = 0; n < peaks.length; n++) {
    const p = peaks[n];
    const rr = p.rad;
    const i0 = Math.max(0, Math.floor(p.gx - rr));
    const i1 = Math.min(GW - 1, Math.ceil(p.gx + rr));
    const j0 = Math.max(0, Math.floor(p.gy - rr));
    const j1 = Math.min(GH - 1, Math.ceil(p.gy + rr));
    const inv = 1 / (rr * rr || 1);
    // high energy makes the uplift ring outward instead of just fading
    const pulse = p.amp * p.life * (1 - E * 0.5 + E * 0.5 * Math.cos(p.age * p.rip));
    for (let j = j0; j <= j1; j++) {
      const dy = j - p.gy;
      const row = j * GW;
      for (let i = i0; i <= i1; i++) {
        const dx = i - p.gx;
        const d2 = (dx * dx + dy * dy) * inv;
        if (d2 >= 1) continue;
        const f = 1 - d2;
        const v = field[row + i] + pulse * f * f;
        field[row + i] = v;
        if (v < fmin) fmin = v;
        if (v > fmax) fmax = v;
      }
    }
  }

  const range = fmax - fmin || 1;
  const invRange = 1 / range;
  for (let i = 0; i < NL; i++) levels[i] = fmin + ((i + 1) / (NL + 1)) * range;

  // --- per-cell band index + min/max, in one pass --------------------------
  for (let j = 0; j < CH; j++) {
    const o = j * GW;
    const co = j * CW;
    for (let i = 0; i < CW; i++) {
      const v0 = field[o + i], v1 = field[o + i + 1];
      const v2 = field[o + GW + i + 1], v3 = field[o + GW + i];
      let mn = v0, mx = v0;
      if (v1 < mn) mn = v1; else if (v1 > mx) mx = v1;
      if (v2 < mn) mn = v2; else if (v2 > mx) mx = v2;
      if (v3 < mn) mn = v3; else if (v3 > mx) mx = v3;
      cmin[co + i] = mn;
      cmax[co + i] = mx;
      let b = ((((v0 + v1 + v2 + v3) * 0.25 - fmin) * invRange * BANDS) | 0) >> 1;
      if (b < 0) b = 0; else if (b >= SBANDS) b = SBANDS - 1;
      bandOf[co + i] = b;
    }
  }

  // --- shaded elevation bands, run-length merged along each row ------------
  c.globalCompositeOperation = "source-over";
  const cw = w / CW;
  const chh = h / CH;
  for (let b = 0; b < SBANDS; b++) {
    const f = b / (SBANDS - 1);
    cols[b] = CMix(f, 1, Math.min(46, 5 + f * 30 + midV * 5 + beatE * 4));
  }
  for (let j = 0; j < CH; j++) {
    const co = j * CW;
    const y = j * chh;
    let runB = bandOf[co];
    let runI = 0;
    for (let i = 1; i <= CW; i++) {
      const b = i < CW ? bandOf[co + i] : -1;
      if (b !== runB) {
        c.fillStyle = cols[runB];
        c.fillRect(runI * cw, y, (i - runI) * cw + 0.6, chh + 0.6);
        runB = b < 0 ? 0 : b;
        runI = i;
      }
    }
  }

  // --- contour lines: marching squares, one batched stroke per level -------
  const heavy = (1 + E * 1.4 + beatE * 1.2) * TK;
  glow(Math.min(18, (5 + E * 7) * (1 + beatE * 0.7)), C1());
  for (let li = 0; li < NL; li++) {
    const lv = levels[li];
    const index = (li & 1) === 1;   // index contours sit on the shading edges
    c.beginPath();
    let any = false;
    for (let j = 0; j < CH; j++) {
      const o = j * GW;
      const co = j * CW;
      const y0 = j * chh;
      for (let i = 0; i < CW; i++) {
        if (lv < cmin[co + i] || lv > cmax[co + i]) continue;
        const v0 = field[o + i], v1 = field[o + i + 1];
        const v2 = field[o + GW + i + 1], v3 = field[o + GW + i];
        let code = 0;
        if (v0 > lv) code |= 1;
        if (v1 > lv) code |= 2;
        if (v2 > lv) code |= 4;
        if (v3 > lv) code |= 8;
        if (code === 0 || code === 15) continue;
        const x0 = i * cw;
        let d = v1 - v0;
        const ex0 = x0 + cw * (d !== 0 ? (lv - v0) / d : 0.5), ey0 = y0;
        d = v2 - v1;
        const ex1 = x0 + cw, ey1 = y0 + chh * (d !== 0 ? (lv - v1) / d : 0.5);
        d = v2 - v3;
        const ex2 = x0 + cw * (d !== 0 ? (lv - v3) / d : 0.5), ey2 = y0 + chh;
        d = v3 - v0;
        const ex3 = x0, ey3 = y0 + chh * (d !== 0 ? (lv - v0) / d : 0.5);
        any = true;
        switch (code) {
          case 1: case 14: c.moveTo(ex3, ey3); c.lineTo(ex0, ey0); break;
          case 2: case 13: c.moveTo(ex0, ey0); c.lineTo(ex1, ey1); break;
          case 3: case 12: c.moveTo(ex3, ey3); c.lineTo(ex1, ey1); break;
          case 4: case 11: c.moveTo(ex1, ey1); c.lineTo(ex2, ey2); break;
          case 6: case 9: c.moveTo(ex0, ey0); c.lineTo(ex2, ey2); break;
          case 7: case 8: c.moveTo(ex3, ey3); c.lineTo(ex2, ey2); break;
          case 5:
            c.moveTo(ex3, ey3); c.lineTo(ex0, ey0);
            c.moveTo(ex1, ey1); c.lineTo(ex2, ey2);
            break;
          default: // 10
            c.moveTo(ex0, ey0); c.lineTo(ex1, ey1);
            c.moveTo(ex2, ey2); c.lineTo(ex3, ey3);
            break;
        }
      }
    }
    if (!any) continue;
    const f = li / (NL - 1);
    if (index) {
      c.strokeStyle = C2(Math.min(0.7, 0.34 + E * 0.2 + beatE * 0.22), Math.min(74, 58 + f * 12));
      c.lineWidth = heavy;
    } else {
      c.strokeStyle = C1(Math.min(0.55, 0.2 + trebV * 0.14 + beatE * 0.14), Math.min(70, 46 + f * 18));
      c.lineWidth = heavy * 0.5;
    }
    c.stroke();
  }
  noGlow();

  // --- survey scan sweeping the sheet --------------------------------------
  S.scan += (0.0014 + E * 0.0042) * spd * fs;
  if (S.scan > 1.2) S.scan = -0.2;
  const sxp = S.scan * w;
  const bandW = w * (0.07 + E * 0.06);
  c.globalCompositeOperation = "lighter";
  const sg = c.createLinearGradient(sxp - bandW, 0, sxp + bandW * 0.15, 0);
  sg.addColorStop(0, C1(0, 40));
  sg.addColorStop(1, C1(Math.min(0.22, 0.07 + E * 0.08 + beatE * 0.06), 60));
  c.fillStyle = sg;
  c.fillRect(sxp - bandW, 0, bandW * 1.15, h);
  c.globalCompositeOperation = "source-over";
  glow(Math.min(20, 9 * (1 + beatE)), C2());
  c.strokeStyle = C2(Math.min(0.65, 0.3 + E * 0.2 + beatE * 0.25), 70);
  c.lineWidth = 1.3 * TK;
  c.beginPath();
  c.moveTo(sxp, 0);
  c.lineTo(sxp, h);
  c.stroke();
  noGlow();
  // benchmark ticks riding the scan line — fixed count, never per-pixel
  c.beginPath();
  for (let k = 0; k <= 18; k++) {
    const yy = (k / 18) * h;
    const gi = Math.min(GW - 1, Math.max(0, Math.round((sxp / w) * CW)));
    const gj = Math.min(GH - 1, Math.round((k / 18) * CH));
    const el = (field[gj * GW + gi] - fmin) * invRange;
    const len = R * (0.008 + el * 0.03);
    c.moveTo(sxp - len, yy);
    c.lineTo(sxp + len, yy);
  }
  c.strokeStyle = C1(0.28 + beatE * 0.2, 62);
  c.lineWidth = 1 * TK;
  c.stroke();
};
