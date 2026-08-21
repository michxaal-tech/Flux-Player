import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

/** a horizontal signal tear during overload */
interface Tear { y: number; hh: number; dx: number; a: number }

const TRACE = 128;        // oscilloscope sample count, fixed at any canvas size
const BARS = 44;
const SCANS = 80;         // scanline count is FIXED — never derived from h
const GX = 16, GY = 10;   // grid divisions
const TEAR_MAX = 6;
const MAXV = 14;

// Static geometry tables — immutable module data, not animation state.
const CUBE_V = [
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
];
const CUBE_E = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
const OCTA_V = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
const OCTA_E = [0, 2, 2, 1, 1, 3, 3, 0, 0, 4, 4, 1, 1, 5, 5, 0, 2, 4, 4, 3, 3, 5, 5, 2];

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0); // NaN → 0
const sstep = (a: number, b: number, x: number) => {
  const d = b - a;
  let u = d > 1e-6 ? (x - a) / d : x >= b ? 1 : 0;
  u = u > 0 ? (u < 1 ? u : 1) : 0;
  return u * u * (3 - 2 * u);
};

const PANELS = [
  { x: 0.035, y: 0.09, w: 0.2, h: 0.14, k: 0 },
  { x: 0.765, y: 0.09, w: 0.2, h: 0.14, k: 1 },
  { x: 0.035, y: 0.3, w: 0.075, h: 0.32, k: 2 },
  { x: 0.89, y: 0.3, w: 0.075, h: 0.32, k: 2 },
  { x: 0.3, y: 0.035, w: 0.4, h: 0.045, k: 3 },
];

/**
 * CATHODE — a retro-futurist CRT terminal that boots up with the arrangement.
 *
 * Stage 1 (quiet): a phosphor grid and one calm oscilloscope trace.
 * Stage 2 (mid energy): the instrumentation powers on — a spectrum analyser
 * across the floor, VU columns and readout panels around the edges.
 * Stage 3 (high energy): wireframe geometry spins up in the centre of the tube.
 * Drop: `dropE` rising pushes the sync out — the grid begins to warp and the
 * colour separates; at its peak the whole system overloads: signal tears rip
 * horizontally through the picture, the trace splits chromatically and
 * everything strobes. `section` swaps the solid, the palette and the grid pitch.
 */
export const CATHODE: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, vt, freq, wave, liveAudio, beat, beatE, hit, hitE,
  energy, dropE, section, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L, trackName,
}) => {
  const S = (L.scratch.cathode ??= {
    tears: [] as Tear[],
    proj: new Float32Array(MAXV * 2),
    depth: new Float32Array(MAXV),
    meters: new Float32Array(16),
    w2: 0, w3: 0,
    ov: 0, burst: 0, strobe: 0,
    prevD: 0, cool: 0,
    sec: -1, pal: 0, shape: 0,
  });

  const tears: Tear[] = S.tears;
  const proj: Float32Array = S.proj;
  const depth: Float32Array = S.depth;
  const meters: Float32Array = S.meters;

  const spd = cfg.speed;
  const E = cl01(energy);
  const D = cl01(dropE);
  const BE = cl01(beatE);
  const HE = cl01(hitE);
  const sec = section | 0;

  if (S.sec !== sec) {
    S.sec = sec;
    S.pal = (sec % 4) / 4;
    S.shape = sec % 3;
  }
  const P = S.pal;

  // ── layer weights (smoothstep + inertia → no threshold flicker) ───────────
  const t2 = Math.max(sstep(0.22, 0.45, E), sstep(0.3, 0.62, cl01(midV)) * 0.85);
  const t3 = Math.max(sstep(0.5, 0.74, E), sstep(0.4, 0.76, cl01(trebV)) * 0.8);
  S.w2 += (t2 - S.w2) * ak(0.035, fs);
  S.w3 += (t3 - S.w3) * ak(0.028, fs);
  const W2 = cl01(S.w2);
  const W3 = cl01(S.w3);

  // ── overload envelope ─────────────────────────────────────────────────────
  S.cool -= fs;
  if (D > 0.5 && D < S.prevD - 0.004 && S.cool <= 0) {
    S.cool = 70;
    S.burst = 1;
    S.strobe = 1;
  }
  S.prevD = D;
  S.burst *= dk(0.955, fs);
  S.strobe *= dk(0.9, fs);
  S.ov += (Math.max(D * 0.8, S.burst) - S.ov) * ak(0.16, fs);
  const OV = cl01(S.ov);
  const ST = cl01(S.strobe);

  // ── the tube ──────────────────────────────────────────────────────────────
  c.globalCompositeOperation = "source-over";
  const bg = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
  bg.addColorStop(0, CMix(P, (0.2 + OV * 0.1) * (0.5 + I * 0.5), 10 + E * 4 + ST * 6));
  bg.addColorStop(1, CMix(1 - P, 0.3, 4));
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  // ── STAGE 1a: phosphor grid, warping as sync is lost ──────────────────────
  const warp = OV * h * 0.035;
  const gp = vt * 0.03 * spd;
  c.beginPath();
  for (let i = 0; i <= GX; i++) {
    const bx = (i / GX) * w;
    for (let j = 0; j <= GY; j++) {
      const y = (j / GY) * h;
      const x = bx + Math.sin(y * 0.02 + gp + i) * warp;
      if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }
  for (let j = 0; j <= GY; j++) {
    const by = (j / GY) * h;
    for (let i = 0; i <= GX; i++) {
      const x = (i / GX) * w;
      const y = by + Math.cos(x * 0.015 - gp + j) * warp * 0.6;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }
  c.strokeStyle = CMix(P + 0.2, (0.1 + E * 0.08 + OV * 0.1) * (0.4 + I * 0.6), 40 + E * 8);
  c.lineWidth = Math.max(0.5, 0.8 * TK);
  c.stroke();

  // ── sample the waveform into fixed-size trace space ───────────────────────
  const wl = wave.length;
  const traceY = (i: number, ampMul: number) => {
    const f = i / (TRACE - 1);
    let v: number;
    if (liveAudio && wl > 1) v = wave[Math.min(wl - 1, Math.floor(f * wl))] / 255 - 0.5;
    else v = Math.sin(f * 12.6 + vt * 0.04 * spd) * 0.22;
    return cy + v * h * 0.3 * ampMul;
  };

  const strokeTrace = (dx: number, dy: number, ampMul: number) => {
    c.beginPath();
    for (let i = 0; i < TRACE; i++) {
      const x = (i / (TRACE - 1)) * w + dx;
      const y = traceY(i, ampMul) + dy;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  };

  const amp = (0.6 + E * 0.6 + BE * 0.5 + OV * 0.9) * (0.5 + I * 0.6);
  const split = OV * R * 0.02 + HE * R * 0.004;

  // chromatic separation: two offset ghosts, then the live trace
  if (split > 0.4) {
    c.globalCompositeOperation = "lighter";
    c.lineWidth = Math.max(0.8, 1.2 * TK);
    c.strokeStyle = C1(Math.min(0.3, 0.14 + OV * 0.16), 62);
    strokeTrace(-split, 0, amp);
    c.strokeStyle = C2(Math.min(0.3, 0.14 + OV * 0.16), 62);
    strokeTrace(split, 0, amp);
    c.globalCompositeOperation = "source-over";
  }
  c.strokeStyle = CMix(P + 0.5, Math.min(0.7, (0.34 + BE * 0.2) * (0.4 + I * 0.7)), 66 + BE * 6);
  c.lineWidth = (1.1 + BE * 1.2 + E * 0.6) * TK;
  glow(Math.min(20, 8 + BE * 8 + OV * 6), C2());
  strokeTrace(0, 0, amp);
  noGlow();

  // ── STAGE 2: analyser floor, VU columns, readout panels ───────────────────
  if (W2 > 0.015) {
    const fl = freq.length;
    const floorY = h * 0.93;
    const bw = w / BARS;
    c.beginPath();
    for (let i = 0; i < BARS; i++) {
      const fi = fl > 1 ? Math.min(fl - 1, Math.floor(Math.pow(i / BARS, 1.4) * fl * 0.7)) : 0;
      const v = (liveAudio && fl > 0 ? freq[fi] / 255 : 0.25 + Math.sin(i * 0.6 + vt * 0.05) * 0.15) * W2;
      const bh = Math.max(1, v * h * 0.3 * (0.6 + I * 0.7) * (1 + BE * 0.25));
      c.rect(i * bw + bw * 0.18, floorY - bh, bw * 0.64, bh);
    }
    c.fillStyle = CMix(P + 0.35, Math.min(0.55, W2 * (0.24 + E * 0.14)), 54);
    c.fill();
    // bar caps
    c.beginPath();
    c.moveTo(0, floorY);
    c.lineTo(w, floorY);
    c.strokeStyle = CMix(P, Math.min(0.4, W2 * (0.2 + BE * 0.15)), 60);
    c.lineWidth = (0.8 + BE) * TK;
    c.stroke();

    // panel frames + meters
    const pa = W2 * (0.4 + I * 0.6);
    c.lineWidth = Math.max(0.6, 0.9 * TK);
    c.strokeStyle = CMix(P + 0.2, Math.min(0.4, pa * 0.32), 52);
    c.beginPath();
    for (let p = 0; p < PANELS.length; p++) {
      const pn = PANELS[p];
      c.rect(pn.x * w, pn.y * h, pn.w * w, pn.h * h);
    }
    c.stroke();

    for (let p = 0; p < PANELS.length; p++) {
      const pn = PANELS[p];
      const px = pn.x * w, py = pn.y * h, pw = pn.w * w, ph = pn.h * h;
      const drive = p % 2 === 0 ? cl01(bassV) : cl01(trebV);
      meters[p] += ((drive * 0.7 + E * 0.3) - meters[p]) * ak(0.15, fs);
      const mv = cl01(meters[p]);
      c.beginPath();
      if (pn.k === 0) {
        for (let r = 0; r < 4; r++) {
          const ry = py + ph * (0.18 + r * 0.22);
          const len = pw * 0.86 * cl01(mv * (1.1 - r * 0.18) + Math.sin(vt * 0.05 + r) * 0.08);
          c.rect(px + pw * 0.07, ry, len, ph * 0.11);
        }
      } else if (pn.k === 1) {
        for (let r = 0; r < 5; r++) {
          for (let q = 0; q < 8; q++) {
            if (((q * 7 + r * 3 + (vt * 0.05 * spd) | 0) % 5) > 2 + (1 - mv) * 2) continue;
            c.rect(px + pw * (0.08 + q * 0.108), py + ph * (0.14 + r * 0.17), pw * 0.07, ph * 0.1);
          }
        }
      } else if (pn.k === 2) {
        const segs = 12;
        for (let r = 0; r < segs; r++) {
          if (r / segs > mv) continue;
          c.rect(px + pw * 0.18, py + ph * (0.96 - (r + 1) * 0.078), pw * 0.64, ph * 0.05);
        }
      } else {
        const n = 20;
        for (let r = 0; r < n; r++) {
          const f = ((r / n) + vt * 0.002 * spd) % 1;
          const hh = ph * (0.25 + 0.5 * Math.abs(Math.sin(r * 1.3 + vt * 0.04)) * (0.4 + mv));
          c.rect(px + f * pw * 0.97, py + (ph - hh) * 0.5, pw * 0.012, hh);
        }
      }
      c.fillStyle = CMix(P + 0.45 + p * 0.05, Math.min(0.5, pa * (0.28 + mv * 0.2 + HE * 0.1)), 58);
      c.fill();
    }

    // labels — a handful of fillText calls, never in a hot loop
    // (named `fontPx`, not `fs`: `fs` is the engine's frame factor everywhere)
    const fontPx = Math.max(8, Math.round(R * 0.021));
    c.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    c.textBaseline = "top";
    c.fillStyle = CMix(P + 0.5, Math.min(0.55, pa * 0.4), 64);
    c.fillText("SIG", PANELS[0].x * w + 4, PANELS[0].y * h - fontPx - 3);
    c.fillText("SPEC", PANELS[1].x * w + 4, PANELS[1].y * h - fontPx - 3);
    c.fillText(OV > 0.35 ? "SYNC ??" : "SYNC OK", PANELS[2].x * w, PANELS[2].y * h - fontPx - 3);
    c.fillText(`CH ${(sec % 16).toString(16).toUpperCase()}`, PANELS[3].x * w, PANELS[3].y * h - fontPx - 3);
    const nm = (trackName || "NO SIGNAL").toUpperCase().slice(0, 22);
    c.fillText(nm, PANELS[4].x * w + 6, PANELS[4].y * h + PANELS[4].h * h + 4);
  }

  // ── STAGE 3: wireframe solid spinning up in the centre ────────────────────
  if (W3 > 0.015) {
    const useCube = S.shape !== 1;
    const useOcta = S.shape !== 0;
    const ry = vt * 0.009 * spd * (0.4 + E) + OV * 0.6;
    const rx = vt * 0.0055 * spd * (0.3 + E * 0.8);
    const cy1 = Math.cos(ry), sy1 = Math.sin(ry);
    const cx1 = Math.cos(rx), sx1 = Math.sin(rx);
    const scale = R * (0.14 + W3 * 0.14) * (1 + BE * 0.14 + OV * 0.25);

    const project = (V: number[]) => {
      const n = V.length / 3;
      for (let i = 0; i < n && i < MAXV; i++) {
        const x0 = V[i * 3], y0 = V[i * 3 + 1], z0 = V[i * 3 + 2];
        const x1 = x0 * cy1 + z0 * sy1;
        const z1 = -x0 * sy1 + z0 * cy1;
        const y2 = y0 * cx1 - z1 * sx1;
        const z2 = y0 * sx1 + z1 * cx1;
        const pz = 3.1 - z2;
        const k = pz > 0.4 ? 2.6 / pz : 2.6 / 0.4;
        proj[i * 2] = cx + x1 * scale * k;
        proj[i * 2 + 1] = cy + y2 * scale * k;
        depth[i] = z2;
      }
      return n;
    };

    const strokeEdges = (E2: number[]) => {
      c.beginPath();
      for (let e = 0; e < E2.length; e += 2) {
        const a = E2[e], b = E2[e + 1];
        c.moveTo(proj[a * 2], proj[a * 2 + 1]);
        c.lineTo(proj[b * 2], proj[b * 2 + 1]);
      }
      c.stroke();
    };

    c.lineWidth = (0.9 + W3 * 1.3 + BE * 0.8) * TK;
    glow(Math.min(22, 9 + BE * 8 + OV * 8), C1());
    if (useCube) {
      project(CUBE_V);
      c.strokeStyle = CMix(P + 0.3, Math.min(0.55, W3 * (0.3 + BE * 0.2)), 62);
      if (split > 0.4) {
        c.save();
        c.translate(-split * 0.7, 0);
        c.strokeStyle = C1(Math.min(0.3, W3 * 0.25), 58);
        strokeEdges(CUBE_E);
        c.restore();
        c.strokeStyle = CMix(P + 0.3, Math.min(0.55, W3 * (0.3 + BE * 0.2)), 62);
      }
      strokeEdges(CUBE_E);
      // vertices
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = (1.2 + (depth[i] + 1) * 0.9 + BE * 1.4) * TK;
        c.moveTo(proj[i * 2] + r, proj[i * 2 + 1]);
        c.arc(proj[i * 2], proj[i * 2 + 1], r, 0, Math.PI * 2);
      }
      c.fillStyle = C2(Math.min(0.5, W3 * (0.26 + HE * 0.2)), 68);
      c.fill();
    }
    if (useOcta) {
      project(OCTA_V);
      c.strokeStyle = C2(Math.min(0.5, W3 * (0.26 + BE * 0.18)), 64);
      strokeEdges(OCTA_E);
    }
    noGlow();
  }

  // ── OVERLOAD: signal tears ────────────────────────────────────────────────
  if (OV > 0.12) {
    if ((hit || beat) && tears.length < TEAR_MAX && Math.random() < 0.35 + OV * 0.5) {
      tears.push({
        y: Math.random() * h,
        hh: h * (0.01 + Math.random() * 0.05) * (0.4 + OV),
        dx: (Math.random() - 0.5) * w * 0.12 * OV,
        a: 0.6 + Math.random() * 0.4,
      });
    }
  }
  for (let i = tears.length - 1; i >= 0; i--) {
    const tr = tears[i];
    tr.a *= dk(0.86, fs);
    tr.y += tr.hh * 0.15 * spd * fs;
    if (tr.a < 0.06) { tears.splice(i, 1); continue; }
    c.save();
    c.beginPath();
    c.rect(0, tr.y, w, tr.hh);
    c.clip();
    c.fillStyle = CMix(P, Math.min(0.24, tr.a * 0.2), 22);
    c.fillRect(0, tr.y, w, tr.hh);
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = C1(Math.min(0.5, tr.a * 0.42), 66);
    c.lineWidth = (1 + tr.a) * TK;
    strokeTrace(tr.dx, 0, amp * 1.2);
    c.restore();
  }
  c.globalCompositeOperation = "source-over";

  // ── scanlines (fixed count) + strobe + edge bloom ─────────────────────────
  c.beginPath();
  const sh = h / SCANS;
  const roll = (vt * 0.4 * spd) % (sh * 2);
  for (let i = 0; i < SCANS; i++) c.rect(0, i * sh + roll, w, sh * 0.45);
  c.fillStyle = CMix(P, 0.14 + OV * 0.06, 2); // near-black, but palette-derived
  c.fill();

  if (ST > 0.02) {
    c.fillStyle = CMix(P + 0.5, Math.min(0.22, ST * 0.2 * (0.4 + I * 0.6)), 70);
    c.fillRect(0, 0, w, h);
  }
  if (OV > 0.05) {
    const eg = c.createLinearGradient(0, 0, 0, h);
    eg.addColorStop(0, C2(Math.min(0.2, OV * 0.16), 62));
    eg.addColorStop(0.5, "transparent");
    eg.addColorStop(1, C1(Math.min(0.2, OV * 0.16), 62));
    c.fillStyle = eg;
    c.fillRect(0, 0, w, h);
  }
};
