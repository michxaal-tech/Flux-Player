import type { ThemeDraw } from "../themeTypes";
import { ak } from "../rate";

// MONOLITH — a ring of tall obelisks standing on a reflective floor, seen from
// inside the ring. Genuinely 3D: every corner goes through a yaw/pitch camera
// and a perspective divide, slabs are painted back-to-front, and their two
// camera-facing sides are shaded differently so the volumes read as solid.
//
// It layers rather than doing one thing: the floor grid is always there, the
// slabs rise out of it with the spectrum, light seams climb them as the music
// fills out, orbiting sparks appear on top of that, and a drop fires a ground
// shockwave with beams shooting up the tallest slabs.

interface Spark { a: number; r: number; y: number; sp: number }

const SLABS = 22;          // hard cap — same cost on a phone and a 5K display
const SPARKS = 90;
const GRID_R = 9;          // floor grid rings
const GRID_SPOKES = 24;

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface State {
  h: number[];             // smoothed slab heights, 0..1
  seam: number[];          // per-slab light-seam position
  sparks: Spark[];
  rot: number;
  wave: number;            // drop shockwave radius, <0 = idle
  w2: number;              // layer-2 weight (seams)
  w3: number;              // layer-3 weight (sparks)
}

export const MONOLITH: ThemeDraw = (x) => {
  const { c, w, h, cx, cy, R, fs, vt, freq, beat, beatE, energy, dropE, hitE, cfg, bassV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.monolith ??= {
    h: new Array<number>(SLABS).fill(0),
    seam: new Array<number>(SLABS).fill(0),
    sparks: [] as Spark[],
    rot: 0,
    wave: -1,
    w2: 0,
    w3: 0,
  }) as State;

  // ── arrangement weights ────────────────────────────────────────────────
  // Layers ease in and out with musical intensity rather than snapping, so a
  // quiet passage really is a bare floor and a full one is the whole scene.
  const t2 = cl01((energy - 0.28) / 0.3);
  const t3 = cl01((energy - 0.52) / 0.3);
  const ease = ak(0.03, fs);
  S.w2 += (t2 - S.w2) * ease;
  S.w3 += (t3 - S.w3) * ease;

  S.rot += (0.0016 + energy * 0.004 + dropE * 0.01) * cfg.speed * fs;

  // ── camera ─────────────────────────────────────────────────────────────
  // Standard yaw about Y then a fixed pitch, followed by the perspective
  // divide. camY is the eye height above the floor plane.
  const yaw = S.rot;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  const pitch = 0.34 + Math.sin(vt * 0.004) * 0.05 - dropE * 0.12;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const camY = 0.42 - dropE * 0.14;
  const camZ = 3.1 - energy * 0.35 - dropE * 0.7;
  const f = R * 0.92;

  /** world (x, y, z) → screen [sx, sy, depth]; depth <= 0 is behind the camera */
  const proj = (wx: number, wy: number, wz: number): [number, number, number] => {
    const rx = wx * cyaw - wz * syaw;
    const rz = wx * syaw + wz * cyaw + camZ;
    const ry = wy - camY;
    const py = ry * cp - rz * sp;
    const pz = ry * sp + rz * cp;
    if (pz < 0.05) return [0, 0, -1];
    return [cx + (f * rx) / pz, cy - (f * py) / pz, pz];
  };

  // ── layer 1: floor grid, always present ────────────────────────────────
  c.save();
  c.lineWidth = 0.7 * TK;
  c.strokeStyle = C2(0.12 + bassV * 0.1, 46);
  c.beginPath();
  for (let i = 1; i <= GRID_R; i++) {
    const rr = i * 0.42;
    let started = false;
    for (let k = 0; k <= GRID_SPOKES; k++) {
      const a = (k / GRID_SPOKES) * Math.PI * 2;
      const [px, py, d] = proj(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      if (d < 0) { started = false; continue; }
      if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
    }
  }
  c.stroke();
  c.restore();

  // ── layer 2: the slabs ─────────────────────────────────────────────────
  const ringR = 1.9;
  // depth-sort so near slabs cover far ones — painter's algorithm
  const order: { i: number; d: number }[] = [];
  for (let i = 0; i < SLABS; i++) {
    const a = (i / SLABS) * Math.PI * 2;
    const [, , d] = proj(Math.cos(a) * ringR, 0, Math.sin(a) * ringR);
    order.push({ i, d });
  }
  order.sort((p, q) => q.d - p.d);

  const bins = freq.length;
  for (const { i, d } of order) {
    if (d < 0) continue;
    const a = (i / SLABS) * Math.PI * 2;
    // mirror the spectrum around the ring so the composition stays balanced
    const m = i < SLABS / 2 ? i : SLABS - 1 - i;
    const bin = Math.min(bins - 1, 3 + Math.floor((m / (SLABS / 2)) * 46));
    const target = Math.pow((freq[bin] ?? 0) / 255, 1.5);
    S.h[i] += (target - S.h[i]) * ak(0.18, fs);
    const hh = 0.12 + S.h[i] * (1.5 + dropE * 0.9) * (0.5 + cfg.intensity * 0.5);

    const halfW = 0.15;
    const ca = Math.cos(a), sa = Math.sin(a);
    // slab footprint: a rectangle tangent to the ring
    const px0 = ca * ringR - sa * halfW, pz0 = sa * ringR + ca * halfW;
    const px1 = ca * ringR + sa * halfW, pz1 = sa * ringR - ca * halfW;
    // the far face is offset outward, giving the slab thickness
    const ox = ca * 0.16, oz = sa * 0.16;

    const bl = proj(px0, 0, pz0), br = proj(px1, 0, pz1);
    const tl = proj(px0, hh, pz0), tr = proj(px1, hh, pz1);
    const blo = proj(px0 + ox, 0, pz0 + oz), tlo = proj(px0 + ox, hh, pz0 + oz);
    if (bl[2] < 0 || br[2] < 0 || tl[2] < 0 || tr[2] < 0) continue;

    const lit = 0.2 + S.h[i] * 0.5;
    // side face first, then the front — the front covers the shared edge
    c.fillStyle = CMix(m / (SLABS / 2), lit * 0.5, 26 + S.h[i] * 14);
    c.beginPath();
    c.moveTo(bl[0], bl[1]);
    c.lineTo(blo[0], blo[1]);
    c.lineTo(tlo[0], tlo[1]);
    c.lineTo(tl[0], tl[1]);
    c.closePath();
    c.fill();

    c.fillStyle = CMix(m / (SLABS / 2), lit, 34 + S.h[i] * 22 + dropE * 10);
    c.beginPath();
    c.moveTo(bl[0], bl[1]);
    c.lineTo(br[0], br[1]);
    c.lineTo(tr[0], tr[1]);
    c.lineTo(tl[0], tl[1]);
    c.closePath();
    c.fill();

    // bright cap, so the tops read as edges rather than as the sky
    c.strokeStyle = C1(0.35 + S.h[i] * 0.5, 66 + S.h[i] * 12);
    c.lineWidth = (1 + S.h[i] * 2) * TK;
    c.beginPath();
    c.moveTo(tl[0], tl[1]);
    c.lineTo(tr[0], tr[1]);
    c.stroke();

    // ── layer 3: light seams climbing the slabs ──────────────────────────
    if (S.w2 > 0.04) {
      S.seam[i] = (S.seam[i] + (0.006 + S.h[i] * 0.02) * cfg.speed) % 1;
      const sy = S.seam[i] * hh;
      const sl = proj(px0, sy, pz0), sr = proj(px1, sy, pz1);
      if (sl[2] > 0 && sr[2] > 0) {
        c.strokeStyle = C2(S.w2 * (0.3 + hitE * 0.5), 70);
        c.lineWidth = (0.8 + hitE * 1.6) * TK;
        c.beginPath();
        c.moveTo(sl[0], sl[1]);
        c.lineTo(sr[0], sr[1]);
        c.stroke();
      }
    }

    // ── drop: beams fire up the tallest slabs ────────────────────────────
    if (dropE > 0.15 && S.h[i] > 0.35) {
      const top = proj((px0 + px1) / 2, hh + dropE * 4.5, (pz0 + pz1) / 2);
      const base = proj((px0 + px1) / 2, hh, (pz0 + pz1) / 2);
      if (top[2] > 0 && base[2] > 0) {
        const bg = c.createLinearGradient(base[0], base[1], top[0], top[1]);
        bg.addColorStop(0, C1(dropE * 0.7, 74));
        bg.addColorStop(1, "transparent");
        c.strokeStyle = bg;
        c.lineWidth = (2 + dropE * 5) * TK;
        c.beginPath();
        c.moveTo(base[0], base[1]);
        c.lineTo(top[0], top[1]);
        c.stroke();
      }
    }
  }

  // ── layer 4: orbiting sparks, only once the track is busy ──────────────
  if (S.w3 > 0.03) {
    const want = Math.round(SPARKS * S.w3);
    while (S.sparks.length < want) {
      S.sparks.push({
        a: Math.random() * Math.PI * 2,
        r: 0.6 + Math.random() * 2.4,
        y: 0.1 + Math.random() * 1.6,
        sp: 0.002 + Math.random() * 0.006,
      });
    }
    if (S.sparks.length > want) S.sparks.length = want;
    c.fillStyle = C1(0.4 * S.w3 + trebV * 0.3, 74);
    for (const s of S.sparks) {
      s.a += s.sp * cfg.speed * (1 + dropE * 2) * fs;
      const [px, py, d] = proj(Math.cos(s.a) * s.r, s.y, Math.sin(s.a) * s.r);
      if (d < 0) continue;
      // size falls off with depth, which is most of what sells the perspective
      const rr = Math.max(0.5, (R * 0.004 * (1 + beatE)) / d);
      c.beginPath();
      c.arc(px, py, rr, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ── drop: ground shockwave ─────────────────────────────────────────────
  if (dropE > 0.5 && S.wave < 0) S.wave = 0;
  if (S.wave >= 0) {
    S.wave += 0.02 * cfg.speed * fs;
    if (S.wave > 1) S.wave = -1;
    else {
      const rr = S.wave * 5;
      const a2 = (1 - S.wave) ** 2;
      glow(Math.min(24, 12 + dropE * 12), C1());
      c.strokeStyle = C1(a2 * 0.8, 76);
      c.lineWidth = (1.5 + a2 * 4) * TK;
      c.beginPath();
      let started = false;
      for (let k = 0; k <= GRID_SPOKES * 2; k++) {
        const a = (k / (GRID_SPOKES * 2)) * Math.PI * 2;
        const [px, py, d] = proj(Math.cos(a) * rr, 0.01, Math.sin(a) * rr);
        if (d < 0) { started = false; continue; }
        if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
      }
      c.stroke();
      noGlow();
    }
  }

  // horizon haze, so the far slabs dissolve rather than ending on hard ground
  const hz = c.createLinearGradient(0, cy - h * 0.16, 0, cy + h * 0.06);
  hz.addColorStop(0, "transparent");
  hz.addColorStop(0.5, C2(0.1 + bassV * 0.08 + dropE * 0.1, 48));
  hz.addColorStop(1, "transparent");
  c.fillStyle = hz;
  c.fillRect(0, cy - h * 0.16, w, h * 0.22);

  if (beat) S.rot += 0.004;
};
