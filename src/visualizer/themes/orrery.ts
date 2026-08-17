import type { ThemeDraw } from "../themeTypes";

// ORRERY — nested orbital rings tilted in 3D, with bodies running along them.
// Real perspective: every point is rotated in two axes and divided by depth, so
// a ring genuinely passes behind the centre and its bodies shrink as they go.
//
// Layers, in the order they arrive: the rings alone, then bodies riding them,
// then trailing arcs behind each body, then a bright core that the bodies feed.
// A drop tips the whole system flat toward the camera and slings the bodies out.

interface Body { ring: number; a: number; sp: number; sz: number }

const RINGS = 7;
const SEGS = 72;           // points per ring — fixed, so cost is size-independent
const BODIES = 34;
const TRAIL = 14;          // trail samples per body

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

// Pre-rendered glowing body. A shadowBlur'd arc per body meant 34 blurred fills
// a frame, which measured 8x the cost of every other part of the theme put
// together; a sprite blit carries the same halo for a plain drawImage.
let bodyCv: HTMLCanvasElement | null = null;
let bodyKey = "";
const SPR = 48;
function bodySprite(color: string): HTMLCanvasElement {
  if (bodyCv && bodyKey === color) return bodyCv;
  const cv = bodyCv ?? document.createElement("canvas");
  cv.width = SPR; cv.height = SPR;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, SPR, SPR);
  const rg = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
  rg.addColorStop(0, color);
  rg.addColorStop(0.32, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, SPR, SPR);
  bodyCv = cv;
  bodyKey = color;
  return cv;
}

interface State {
  bodies: Body[];
  spin: number;
  tilt: number;
  flare: number;
  w2: number;
  w3: number;
}

export const ORRERY: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, freq, beat, beatE, energy, dropE, hit, hitE, cfg, bassV, midV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.orrery ??= {
    bodies: [] as Body[],
    spin: 0,
    tilt: 0.5,
    flare: 0,
    w2: 0,
    w3: 0,
  }) as State;

  if (S.bodies.length === 0) {
    for (let i = 0; i < BODIES; i++) {
      const ring = i % RINGS;
      S.bodies.push({
        ring,
        a: Math.random() * Math.PI * 2,
        // inner rings run faster, like real orbits
        sp: (0.004 + Math.random() * 0.004) * (RINGS - ring) * 0.4,
        sz: 0.5 + Math.random() * 0.9,
      });
    }
  }

  const t2 = cl01((energy - 0.3) / 0.28);
  const t3 = cl01((energy - 0.55) / 0.28);
  S.w2 += (t2 - S.w2) * 0.03;
  S.w3 += (t3 - S.w3) * 0.03;

  S.spin += (0.003 + energy * 0.006) * cfg.speed;
  // a drop tips the whole system to face you, then it eases back
  const tiltTarget = 0.5 - dropE * 0.46;
  S.tilt += (tiltTarget - S.tilt) * 0.06;
  S.flare = Math.max(S.flare * 0.93, dropE);

  const ct = Math.cos(S.tilt), stl = Math.sin(S.tilt);
  const camZ = 3.4 - energy * 0.3 - dropE * 0.8;
  const f = R * 1.05;

  // Trig hoisted to frame scope. proj runs ~1000 times a frame (rings, bodies
  // and every trail sample), and recomputing the spin and tilt sines inside it
  // cost more than everything else in the theme combined.
  const cs = Math.cos(S.spin), sn = Math.sin(S.spin);

  /** ring-space (angle, radius, plane offset) → screen, with depth.
   * `st`/`ctil` are the ring's precomputed tilt sine and cosine. */
  const proj = (a: number, rr: number, yOff: number, st: number, ctil: number): [number, number, number] => {
    const wx = Math.cos(a) * rr;
    const wz0 = Math.sin(a) * rr;
    // each ring has its own extra tilt so they are not coplanar
    const wy0 = wz0 * st + yOff;
    const wz1 = wz0 * ctil;
    const rx = wx * cs - wz1 * sn;
    const rz = wx * sn + wz1 * cs + camZ;
    // then pitch by the system tilt
    const py = wy0 * ct - rz * stl;
    const pz = wy0 * stl + rz * ct;
    if (pz < 0.05) return [0, 0, -1];
    return [cx + (f * rx) / pz, cy - (f * py) / pz, pz];
  };

  const ringR = (i: number) => 0.45 + i * 0.34;
  // per-ring tilt sine/cosine, computed once instead of per projected point
  const tiltS: number[] = [];
  const tiltC: number[] = [];
  for (let i = 0; i < RINGS; i++) {
    const tl = (i % 2 === 0 ? 1 : -1) * (0.12 + i * 0.07);
    tiltS.push(Math.sin(tl));
    tiltC.push(Math.cos(tl));
  }

  // ── layer 1: the rings ─────────────────────────────────────────────────
  const bins = freq.length;
  for (let i = 0; i < RINGS; i++) {
    const bin = Math.min(bins - 1, 4 + i * 7);
    const lvl = (freq[bin] ?? 0) / 255;
    const rr = ringR(i) * (1 + lvl * 0.06 + beatE * 0.02);
    c.strokeStyle = CMix(i / (RINGS - 1), 0.16 + lvl * 0.4 + beatE * 0.1, 46 + lvl * 24);
    c.lineWidth = (0.7 + lvl * 2.2) * TK;
    c.beginPath();
    let started = false;
    for (let k = 0; k <= SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      const [px, py, d] = proj(a, rr, 0, tiltS[i], tiltC[i]);
      if (d < 0) { started = false; continue; }
      if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
    }
    c.stroke();
  }

  // ── layer 2: bodies riding the rings ───────────────────────────────────
  if (S.w2 > 0.03) {
    // painter's order so near bodies cover far ones
    const drawList: { px: number; py: number; d: number; b: Body }[] = [];
    for (const b of S.bodies) {
      b.a += b.sp * cfg.speed * (1 + energy * 0.8 + dropE * 3);
      const [px, py, d] = proj(b.a, ringR(b.ring), 0, tiltS[b.ring], tiltC[b.ring]);
      if (d < 0) continue;
      drawList.push({ px, py, d, b });
    }
    drawList.sort((p, q) => q.d - p.d);

    // ── layer 3: trailing arcs ───────────────────────────────────────────
    if (S.w3 > 0.03) {
      c.lineWidth = 1.1 * TK;
      // batched by ring: all bodies on a ring share a colour, so this is 7
      // strokes a frame instead of one per body
      for (let ri = 0; ri < RINGS; ri++) {
        c.beginPath();
        let any = false;
        for (const { b } of drawList) {
          if (b.ring !== ri) continue;
          let started = false;
          for (let k = 0; k < TRAIL; k++) {
            const a = b.a - k * b.sp * 5 * cfg.speed;
            const [px, py, d] = proj(a, ringR(ri), 0, tiltS[ri], tiltC[ri]);
            if (d < 0) { started = false; continue; }
            if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
            any = true;
          }
        }
        if (!any) continue;
        c.strokeStyle = CMix(ri / (RINGS - 1), 0.22 * S.w3, 62);
        c.stroke();
      }
    }

    // one sprite for the whole frame; the per-body colour difference was never
    // visible under the glow, so the ring tint moves to a single alpha instead
    const spr = bodySprite(CMix(0.5, 1, 62 + midV * 14));
    c.globalAlpha = Math.min(1, (0.55 + trebV * 0.4) * S.w2);
    for (const { px, py, d, b } of drawList) {
      const rr = Math.max(0.8, (R * 0.012 * b.sz * (1 + beatE * 0.5 + hitE * 0.4)) / d);
      const sz = rr * 5.5;
      c.drawImage(spr, px - sz / 2, py - sz / 2, sz, sz);
    }
    c.globalAlpha = 1;
  }

  // ── layer 4: the core the whole system orbits ──────────────────────────
  const coreR = R * (0.035 + bassV * 0.05 + beatE * 0.03 + S.flare * 0.16);
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2);
  cg.addColorStop(0, C1(0.5 + S.flare * 0.3, 74));
  cg.addColorStop(0.35, C2(0.2 + S.flare * 0.2, 58));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, coreR * 3.2, 0, Math.PI * 2);
  c.fill();

  // ── drop: the system slings outward and the core spikes ────────────────
  if (S.flare > 0.08) {
    const spokes = 16;
    glow(Math.min(26, 14 + S.flare * 14), C1());
    c.strokeStyle = C1(S.flare * 0.6, 76);
    c.lineWidth = (1 + S.flare * 3) * TK;
    c.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + S.spin * 2;
      const r0 = coreR * 1.2;
      const r1 = coreR * (2.5 + S.flare * 9);
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    c.stroke();
    noGlow();
  }

  if (hit) S.flare = Math.max(S.flare, 0.18);
  if (beat) S.spin += 0.002;
};
