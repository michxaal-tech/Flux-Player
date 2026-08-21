// ─────────────────────────────────────────────────────────────────────────────
// TESSERACT — a 4D hypercube tumbling inside a 3D wireframe shell.
//
// 16 vertices (every ±1 combination of four coordinates) joined by 32 edges —
// two vertices share an edge exactly when their coordinate sign patterns differ
// in ONE place, which is why the edge table is built by flipping single bits.
//
// The chain is 4D → 3D → 2D and every step is a real perspective divide:
//   • 4D → 3D  scale by DW / (DW - q), where q is the fourth coordinate. Points
//     with a larger q are "nearer" in the fourth dimension and get magnified, so
//     as the shape rotates through the ZW/XW planes the inner cube swells,
//     overtakes the outer one and turns the solid inside out. That inversion is
//     the whole point — it cannot be faked with a 2D transform.
//   • 3D → 2D  yaw, pitch, push the scene DZ down the view axis, divide by the
//     resulting camera depth.
// Around it sits an icosahedron (12 vertices, 30 edges found by taking every
// pair a unit edge-length apart) rotating on its own, slower axis. All 62 edges
// go into ONE painter's-algorithm sort by mean camera depth and are painted far
// → near in source-over, so near struts genuinely cover the far ones.
//
// Edge brightness and thickness track frequency bands; vertices burn as nodes.
// Beats and hits kick the tumble rate; a drop collapses BOTH projection
// distances at once — the camera falls through the shape while the 4D blow-up
// runs away — and the edges bloom.
// ─────────────────────────────────────────────────────────────────────────────
import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface TessState {
  /** rotation angles in the XY, ZW and XW planes, and their angular velocities */
  axy: number; azw: number; axw: number;
  vxy: number; vzw: number; vxw: number;
  /** slow 3D view spin and the shell's own counter-spin */
  yaw: number; shell: number;
  /** smoothed dropE, the collapse envelope it detonates into, and the flash */
  chg: number; col: number; flash: number;
  arm: number; peak: number;
}

const NV = 16;                 // hypercube vertices
const NE = 32;                 // hypercube edges
const IV_N = 12;               // icosahedron vertices
const IE_N = 30;               // icosahedron edges
const EDGES_ALL = NE + IE_N;   // 62 strokes a frame — a hard cap, size-independent
const GLOW_MAX = 10;           // at most this many edges join the single blurred pass
const TAU = Math.PI * 2;

const HV = new Float64Array(NV * 4);      // 4D vertices
const HE = new Int32Array(NE * 2);        // hypercube edge endpoints
const HBIN = new Int32Array(NE);          // spectrum bin per edge
const IV = new Float64Array(IV_N * 3);    // icosahedron vertices, unit length
const IE = new Int32Array(IE_N * 2);

(function buildGeometry() {
  // vertex v encodes its four signs in four bits; flipping one bit steps along
  // one edge, so (v, v ^ 1<<b) with v < neighbour enumerates all 32 edges once.
  for (let v = 0; v < NV; v++) {
    for (let b = 0; b < 4; b++) HV[v * 4 + b] = (v >> b) & 1 ? 1 : -1;
  }
  let e = 0;
  for (let v = 0; v < NV; v++) {
    for (let b = 0; b < 4; b++) {
      const u = v ^ (1 << b);
      if (u > v) { HE[e * 2] = v; HE[e * 2 + 1] = u; e++; }
    }
  }
  for (let i = 0; i < NE; i++) HBIN[i] = 4 + ((Math.pow(i / NE, 1.3) * 116) | 0);

  // icosahedron: three mutually perpendicular golden rectangles
  const P = (1 + Math.sqrt(5)) / 2;
  const raw = [
    0, 1, P, 0, 1, -P, 0, -1, P, 0, -1, -P,
    1, P, 0, 1, -P, 0, -1, P, 0, -1, -P, 0,
    P, 0, 1, -P, 0, 1, P, 0, -1, -P, 0, -1,
  ];
  const inv = 1 / Math.hypot(1, P);
  for (let i = 0; i < IV_N * 3; i++) IV[i] = raw[i] * inv;
  // every pair exactly one edge-length apart is an edge; the edge length of this
  // construction is 2, so after normalising it is 2*inv — compare squared.
  const want = (2 * inv) * (2 * inv);
  let ie = 0;
  for (let a = 0; a < IV_N; a++) {
    for (let b = a + 1; b < IV_N && ie < IE_N; b++) {
      const dx = IV[a * 3] - IV[b * 3];
      const dy = IV[a * 3 + 1] - IV[b * 3 + 1];
      const dz = IV[a * 3 + 2] - IV[b * 3 + 2];
      if (Math.abs(dx * dx + dy * dy + dz * dz - want) < 1e-6) { IE[ie * 2] = a; IE[ie * 2 + 1] = b; ie++; }
    }
  }
})();

// ── frame scratch, all fixed length: nothing here allocates per frame ─────────
const PX = new Float64Array(NV), PY = new Float64Array(NV), PZ = new Float64Array(NV);
const PS = new Float64Array(NV);          // 4D magnification per vertex (node size / heat)
const IX = new Float64Array(IV_N), IY = new Float64Array(IV_N), IZ = new Float64Array(IV_N);
const EDEP = new Float64Array(EDGES_ALL); // mean camera depth per edge
const ELVL = new Float64Array(NE);        // band level per hypercube edge
const ORDER: number[] = Array.from({ length: EDGES_ALL }, (_, i) => i);

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);   // also maps NaN → 0

export const TESSERACT: ThemeDraw = ({
  c, cx, cy, R, fs, freq, liveAudio, vt, beat, beatE, hit, hitE, energy, dropE,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: TessState = (L.scratch.tesseract ??= {
    axy: 0.4, azw: 0, axw: 1.1,
    vxy: 0.006, vzw: 0.009, vxw: 0.004,
    yaw: 0, shell: 0,
    chg: 0, col: 0, flash: 0, arm: 0, peak: 0,
  });

  const spd = cfg.speed;
  const E = cl01(energy);
  const BE = cl01(beatE);
  const HE_ = cl01(hitE);
  const D = cl01(dropE);
  const bs = cl01(bassV), md = cl01(midV), tb = cl01(trebV);

  // ── tumble: velocities ease toward an energy-driven baseline, beats kick them ─
  // (velocities, not angles, so a kick decays instead of snapping the pose back)
  const base = 0.002 + E * 0.0065;
  const relax = ak(0.06, fs);
  S.vxy += (base - S.vxy) * relax;
  S.vzw += (base * 1.45 - S.vzw) * relax;
  S.vxw += (base * 0.72 - S.vxw) * relax;
  if (beat) { S.vxy += 0.003 + E * 0.005; S.vzw += 0.004 + E * 0.007; }
  if (hit) S.vxw += 0.002 + HE_ * 0.004;
  // hard ceiling: stacked kicks in a dense passage must never blur it to mush
  if (S.vxy > 0.03) S.vxy = 0.03;
  if (S.vzw > 0.036) S.vzw = 0.036;
  if (S.vxw > 0.028) S.vxw = 0.028;
  S.axy += S.vxy * spd * fs;
  S.azw += S.vzw * spd * fs;
  S.axw += S.vxw * spd * fs;
  S.yaw += (0.0012 + E * 0.0026) * spd * fs;
  S.shell -= (0.0008 + E * 0.0015) * spd * fs;

  // ── drop: charge, then a one-shot collapse of both projection distances ─────
  S.chg += (D - S.chg) * ak(0.12, fs);
  if (D > 0.55) { S.arm = 1; if (D > S.peak) S.peak = D; }
  if (S.arm && (D < S.peak * 0.8 || D < 0.28)) {
    S.arm = 0; S.peak = 0;
    S.col = 1;
    S.flash = 1;
    S.vzw += 0.05;                 // the tumble runs away as it falls through
  }
  S.col *= dk(0.945, fs);
  S.flash *= dk(0.9, fs);
  const CH = cl01(S.chg);
  const CO = cl01(S.col);
  const FL = cl01(S.flash);

  // Projection distances. Both collapse on the drop: DW nearer the shape means a
  // violent 4D blow-up, DZ nearer means the camera falls through it. Both are
  // floored so the divides can never explode or flip sign.
  const DW = Math.max(1.8, 2.75 - CH * 0.4 - CO * 0.75 - bs * 0.1);
  const DZ = Math.max(3.0, 5.0 - CH * 0.8 - CO * 1.5);
  const F3 = 2.2;
  const SCL = 0.24 * R;            // everything is scaled off R, never absolute pixels

  const c1 = Math.cos(S.axy), s1 = Math.sin(S.axy);
  const c2 = Math.cos(S.azw), s2 = Math.sin(S.azw);
  const c3 = Math.cos(S.axw), s3 = Math.sin(S.axw);
  const cyw = Math.cos(S.yaw), syw = Math.sin(S.yaw);
  const pitch = 0.28 + Math.sin(S.yaw * 0.7) * 0.16;
  const cpx = Math.cos(pitch), spx = Math.sin(pitch);

  /** 3D world → screen. Shared by the hypercube's 3D shadow and the shell. */
  const to2D = (x: number, y: number, z: number, o: number, xs: Float64Array, ys: Float64Array, zs: Float64Array) => {
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cpx + z1 * spx;
    let z2 = z1 * cpx - y * spx + DZ;
    if (z2 < 1.2) z2 = 1.2;        // near plane: a vertex passing the camera can't blow up
    const k = (F3 / z2) * SCL;
    xs[o] = cx + x1 * k;
    ys[o] = cy - y2 * k;
    zs[o] = z2;
  };

  // ── rotate the 16 vertices in three planes, then 4D → 3D → 2D ──────────────
  let sMin = 1e9, sMax = -1e9;
  for (let v = 0; v < NV; v++) {
    const x0 = HV[v * 4], y0 = HV[v * 4 + 1], z0 = HV[v * 4 + 2], q0 = HV[v * 4 + 3];
    // a 4D rotation turns a PLANE, not an axis: each of these mixes exactly two
    // coordinates and leaves the other two alone.
    const x1 = x0 * c1 - y0 * s1, y1 = x0 * s1 + y0 * c1;          // XY plane
    const z1 = z0 * c2 - q0 * s2, q1 = z0 * s2 + q0 * c2;          // ZW plane
    const x2 = x1 * c3 - q1 * s3, q2 = x1 * s3 + q1 * c3;          // XW plane
    // 4D perspective divide — the step that makes the inner cube invert. The
    // divisor is floored at half of DW, so the magnification is hard-capped at
    // 2x however violently the drop collapses DW.
    const s = DW / Math.max(DW * 0.5, DW - q2);
    PS[v] = s;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    to2D(x2 * s, y1 * s, z1 * s, v, PX, PY, PZ);
  }
  const sSpan = sMax - sMin > 1e-4 ? sMax - sMin : 1;

  // ── the shell: its own slow spin about a tilted axis ───────────────────────
  const cs = Math.cos(S.shell), ss = Math.sin(S.shell);
  const IR = 3.2 * (1 + BE * 0.05 + CO * 0.12);   // shell radius: always outside the hypercube
  for (let v = 0; v < IV_N; v++) {
    const x0 = IV[v * 3] * IR, y0 = IV[v * 3 + 1] * IR, z0 = IV[v * 3 + 2] * IR;
    to2D(x0 * cs - z0 * ss, y0, x0 * ss + z0 * cs, v, IX, IY, IZ);
  }

  // ── band levels + mean depth per edge, then ONE painter's sort over all 62 ──
  let zLo = 1e9, zHi = -1e9;
  for (let i = 0; i < NE; i++) {
    const a = HE[i * 2], b = HE[i * 2 + 1];
    const bin = HBIN[i];
    const raw = liveAudio ? freq[bin] / 255 : 0.18 + 0.14 * Math.sin(vt * 0.03 + i * 0.7);
    // weight by the band the bin actually sits in, so bass edges answer to bass
    const bw = bin < 20 ? 0.45 + bs * 0.85 : bin < 60 ? 0.45 + md * 0.85 : 0.45 + tb * 0.85;
    ELVL[i] = cl01(raw * bw * (0.5 + I * 0.7));
    const d = (PZ[a] + PZ[b]) * 0.5;
    EDEP[i] = d;
    if (d < zLo) zLo = d;
    if (d > zHi) zHi = d;
  }
  for (let i = 0; i < IE_N; i++) {
    const d = (IZ[IE[i * 2]] + IZ[IE[i * 2 + 1]]) * 0.5;
    EDEP[NE + i] = d;
    if (d < zLo) zLo = d;
    if (d > zHi) zHi = d;
  }
  const zSpan = zHi - zLo > 1e-4 ? zHi - zLo : 1;
  ORDER.sort((a, b) => EDEP[b] - EDEP[a]);   // far → near

  c.save();

  // ── the wire pass: source-over so the sort actually occludes ───────────────
  c.globalCompositeOperation = "source-over";
  c.lineCap = "round";
  const aScale = (0.4 + I * 0.7) * (1 + FL * 0.9);
  for (let n = 0; n < EDGES_ALL; n++) {
    const id = ORDER[n];
    // near = 1, far = 0. Depth drives alpha, lightness and width together, which
    // is what reads as volume in a wireframe.
    const near = cl01((zHi - EDEP[id]) / zSpan);
    if (id < NE) {
      const a = HE[id * 2], b = HE[id * 2 + 1];
      const lv = ELVL[id];
      c.strokeStyle = CMix(
        0.1 + (id / NE) * 0.8,
        Math.min(0.9, (0.16 + near * 0.3 + lv * 0.4 + BE * 0.1) * aScale),
        Math.min(78, 34 + near * 20 + lv * 22 + FL * 12),
      );
      c.lineWidth = Math.max(0.4, (0.5 + near * 0.9 + lv * 2.2 + CO * 1.2) * TK);
      c.beginPath();
      c.moveTo(PX[a], PY[a]);
      c.lineTo(PX[b], PY[b]);
      c.stroke();
    } else {
      const i = id - NE;
      const a = IE[i * 2], b = IE[i * 2 + 1];
      c.strokeStyle = C2(Math.min(0.6, (0.08 + near * 0.14 + md * 0.1 + CH * 0.12) * aScale), Math.min(78, 30 + near * 22 + FL * 14));
      c.lineWidth = Math.max(0.35, (0.4 + near * 0.7 + CO * 0.8) * TK);
      c.beginPath();
      c.moveTo(IX[a], IY[a]);
      c.lineTo(IX[b], IY[b]);
      c.stroke();
    }
  }

  // ── ONE blurred pass for the whole frame: the hottest few edges, batched ────
  c.globalCompositeOperation = "lighter";
  const thr = 0.42 - FL * 0.2 - CO * 0.15;
  let hot = 0;
  c.beginPath();
  for (let i = 0; i < NE && hot < GLOW_MAX; i++) {
    if (ELVL[i] < thr) continue;
    hot++;
    const a = HE[i * 2], b = HE[i * 2 + 1];
    c.moveTo(PX[a], PY[a]);
    c.lineTo(PX[b], PY[b]);
  }
  if (hot) {
    c.strokeStyle = C1(Math.min(0.55, (0.14 + BE * 0.14 + FL * 0.3) * aScale), 76);
    c.lineWidth = Math.max(0.5, (0.9 + BE * 1.2 + CO * 2) * TK);
    glow(Math.min(28, 10 + BE * 8 + FL * 12), C1());
    c.stroke();
    noGlow();
  }
  c.lineCap = "butt";

  // ── nodes: 16 arcs, split into two batches by 4D nearness, two fills total ──
  const nr = R * 0.0055 * (1 + BE * 0.3 + CO * 0.5);
  for (let g = 0; g < 2; g++) {
    c.beginPath();
    let any = false;
    for (let v = 0; v < NV; v++) {
      const f = (PS[v] - sMin) / sSpan;           // 0 = deepest in w, 1 = nearest
      if ((f > 0.5 ? 1 : 0) !== g) continue;
      any = true;
      const rr = Math.max(0.6, nr * (0.5 + f * 1.2) * TK);
      c.moveTo(PX[v] + rr, PY[v]);
      c.arc(PX[v], PY[v], rr, 0, TAU);
    }
    if (!any) continue;
    c.fillStyle = g === 0
      ? C2(Math.min(0.4, (0.13 + md * 0.12) * aScale), 56)
      : C1(Math.min(0.5, (0.2 + tb * 0.16 + BE * 0.14 + FL * 0.2) * aScale), 76);
    glow(Math.min(18, 6 + BE * 5 + FL * 8), g === 0 ? C2() : C1());
    c.fill();
    noGlow();
  }

  // ── core bloom: a gradient, so no per-primitive blur is needed ──────────────
  if (FL > 0.02 || CH > 0.05 || BE > 0.05) {
    const br = R * (0.18 + CH * 0.2 + FL * 0.55 + BE * 0.08);
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, br);
    bg.addColorStop(0, C1(Math.min(0.45, (0.06 + BE * 0.1 + FL * 0.35 + CH * 0.1) * aScale), 76));
    bg.addColorStop(0.45, CMix(0.5, Math.min(0.2, 0.03 + FL * 0.16), 56));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.beginPath();
    c.arc(cx, cy, br, 0, TAU);
    c.fill();
  }

  // ── charge: the shell is dragged inward as the drop builds ─────────────────
  if (CH > 0.08) {
    c.beginPath();
    for (let v = 0; v < IV_N; v++) {
      c.moveTo(IX[v], IY[v]);
      c.lineTo(cx + (IX[v] - cx) * (1 - CH * 0.55), cy + (IY[v] - cy) * (1 - CH * 0.55));
    }
    c.strokeStyle = C2(Math.min(0.3, CH * 0.22 * aScale), 62);
    c.lineWidth = Math.max(0.4, (0.6 + CH * 1.4) * TK);
    c.stroke();
  }

  c.restore();   // hands back the "lighter" composite, alpha, lineWidth, lineCap and transform we arrived with
};
