import type { ThemeDraw } from "../themeTypes";

// HIVE — a honeycomb wall receding into depth, cells lighting with the spectrum
// and pushing toward you as they do. Real perspective: each cell sits at its own
// z, and both its size and its screen position come from the depth divide, so
// the grid genuinely converges toward the vanishing point.
//
// Layers: the flat comb outline, then cells extruding forward with the music,
// then swarm motes threading between them, then a pulse that travels outward
// cell-to-cell. A drop punches a hole clean through the wall.

const COLS = 13;
const ROWS = 9;
const MOTES = 110;

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface Mote { x: number; y: number; z: number; sp: number; ph: number }
interface State {
  lvl: number[];
  motes: Mote[];
  w2: number;
  w3: number;
  pulse: number;
  blast: number;
}

export const HIVE: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, freq, beat, beatE, energy, dropE, hit, hitE, cfg, bassV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const N = COLS * ROWS;
  const S = (L.scratch.hive ??= {
    lvl: new Array<number>(N).fill(0),
    motes: [] as Mote[],
    w2: 0,
    w3: 0,
    pulse: -1,
    blast: 0,
  }) as State;

  const t2 = cl01((energy - 0.24) / 0.28);
  const t3 = cl01((energy - 0.52) / 0.28);
  S.w2 += (t2 - S.w2) * 0.03;
  S.w3 += (t3 - S.w3) * 0.03;
  S.blast = Math.max(S.blast * 0.93, dropE);

  const camZ = 2.3 - energy * 0.2;
  const f = R * 0.9;
  const SP = 0.3;                    // cell spacing in world units

  /** world → screen with depth; also returns the depth divisor for sizing */
  const proj = (wx: number, wy: number, wz: number): [number, number, number] => {
    const z = wz + camZ;
    if (z < 0.08) return [0, 0, -1];
    return [cx + (f * wx) / z, cy - (f * wy) / z, z];
  };

  const bins = freq.length;
  const cells: { i: number; px: number; py: number; d: number; lvl: number; rr: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let q = 0; q < COLS; q++) {
      const i = r * COLS + q;
      // hex offset: every other row shifts half a cell
      const wx = (q - (COLS - 1) / 2) * SP + (r % 2 ? SP * 0.5 : 0);
      const wy = (r - (ROWS - 1) / 2) * SP * 0.86;

      // mirror the spectrum out from the centre so the wall stays composed
      const dx = Math.abs(q - (COLS - 1) / 2) / ((COLS - 1) / 2);
      const dy = Math.abs(r - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
      const rad = Math.min(1, Math.hypot(dx, dy) / 1.414);
      const bin = Math.min(bins - 1, 3 + Math.floor(rad * 54));
      let target = Math.pow((freq[bin] ?? 0) / 255, 1.5);

      // a pulse travelling outward, retriggered on every hit
      if (S.pulse >= 0) {
        const band = Math.exp(-((rad - S.pulse) ** 2) / 0.006);
        target = Math.min(1, target + band * 0.8);
      }
      S.lvl[i] += (target - S.lvl[i]) * 0.2;

      // depth: louder cells come toward you. The drop blows the centre out.
      let wz = -S.lvl[i] * (0.55 + S.w2 * 0.7);
      if (S.blast > 0.1) wz -= (1 - rad) * S.blast * 2.4;

      const p = proj(wx, wy, wz);
      if (p[2] < 0) continue;
      // cell radius shrinks with depth — this is what makes it read as a wall
      const rr = (f * SP * 0.5) / p[2];
      cells.push({ i, px: p[0], py: p[1], d: p[2], lvl: S.lvl[i], rr });
    }
  }

  if (S.pulse >= 0) {
    S.pulse += 0.022 * cfg.speed;
    if (S.pulse > 1.3) S.pulse = -1;
  }
  if (hit && S.pulse < 0 && S.w2 > 0.2) S.pulse = 0;

  // far to near, so nearer cells overlap the ones behind
  cells.sort((a, b) => b.d - a.d);

  // ── layer 1 + 2: the comb ──────────────────────────────────────────────
  for (const cell of cells) {
    const { px, py, rr, lvl } = cell;
    const lit = lvl;
    // filled face only once the arrangement has filled out
    if (S.w2 > 0.03 && lit > 0.05) {
      c.fillStyle = CMix(lit, S.w2 * lit * 0.5, 24 + lit * 30);
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const hx = px + Math.cos(a) * rr * 0.92;
        const hy = py + Math.sin(a) * rr * 0.92;
        if (k === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
      }
      c.closePath();
      c.fill();
    }
    c.strokeStyle = CMix(lit, 0.14 + lit * 0.6 + beatE * 0.1, 44 + lit * 28);
    c.lineWidth = (0.6 + lit * 2) * TK;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const hx = px + Math.cos(a) * rr * 0.92;
      const hy = py + Math.sin(a) * rr * 0.92;
      if (k === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
    }
    c.closePath();
    c.stroke();
  }

  // ── layer 3: motes threading through the comb ──────────────────────────
  if (S.w3 > 0.03) {
    const want = Math.round(MOTES * S.w3);
    while (S.motes.length < want) {
      S.motes.push({
        x: (Math.random() - 0.5) * 4,
        y: (Math.random() - 0.5) * 3,
        z: -Math.random() * 2.2,
        sp: 0.004 + Math.random() * 0.012,
        ph: Math.random() * 6.28,
      });
    }
    if (S.motes.length > want) S.motes.length = want;

    glow(Math.min(18, 6 + beatE * 10), C1());
    c.fillStyle = C1(0.4 * S.w3 + trebV * 0.35, 74);
    for (const m of S.motes) {
      m.z += m.sp * cfg.speed * (1 + energy + S.blast * 4);
      m.x += Math.sin(vt * 0.01 + m.ph) * 0.002;
      if (m.z > 1.4) { m.z = -2.2; m.x = (Math.random() - 0.5) * 4; m.y = (Math.random() - 0.5) * 3; }
      const p = proj(m.x, m.y, m.z);
      if (p[2] < 0) continue;
      const rr = Math.max(0.5, (R * 0.0035 * (1 + beatE * 0.8)) / p[2]);
      c.beginPath();
      c.arc(p[0], p[1], rr, 0, Math.PI * 2);
      c.fill();
    }
    noGlow();
  }

  // ── drop: light pours through the hole punched in the wall ─────────────
  if (S.blast > 0.1) {
    const br = R * (0.1 + S.blast * 0.7);
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, br);
    bg.addColorStop(0, C1(S.blast * 0.6, 78));
    bg.addColorStop(0.5, C2(S.blast * 0.25, 60));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.beginPath();
    c.arc(cx, cy, br, 0, Math.PI * 2);
    c.fill();
  }

  if (beat && S.pulse < 0 && S.w3 > 0.4) S.pulse = 0;
  if (hitE > 0.6) {
    c.strokeStyle = C2(hitE * 0.3, 76);
    c.lineWidth = 1.4 * TK;
    c.beginPath();
    c.arc(cx, cy, R * (0.2 + hitE * 0.2), 0, Math.PI * 2);
    c.stroke();
  }
};
