import type { ThemeDraw } from "../themeTypes";
import { ak } from "../rate";

// CANYON — a wireframe terrain flying toward you, built as a real heightfield.
// Each grid vertex is projected through a perspective divide, so the mesh
// genuinely converges at the horizon and the near rows tower over you.
//
// The terrain scrolls by one row per beat, so the landscape moves *with* the
// music rather than at a constant crawl. Layers arrive as the track fills out:
// bare wireframe, then filled facets, then ridge lights along the peaks, then
// a sun on the horizon. A drop cracks the floor open and throws the mesh apart.

const COLS = 26;           // across the canyon
const ROWS = 22;           // into the distance
const SPACING = 0.42;

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface State {
  /** heightfield rows, newest pushed at the far end */
  rows: number[][];
  scroll: number;
  w2: number;
  w3: number;
  crack: number;
}

export const CANYON: ThemeDraw = (x) => {
  const { c, fs, w, h, cx, cy, R, vt, freq, beat, beatE, energy, dropE, hitE, cfg, bassV, trebV, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.canyon ??= {
    rows: [] as number[][],
    scroll: 0,
    w2: 0,
    w3: 0,
    crack: 0,
  }) as State;

  if (S.rows.length === 0) {
    for (let r = 0; r < ROWS; r++) S.rows.push(new Array<number>(COLS).fill(0));
  }

  const t2 = cl01((energy - 0.26) / 0.28);
  const t3 = cl01((energy - 0.5) / 0.28);
  S.w2 += (t2 - S.w2) * ak(0.03, fs);
  S.w3 += (t3 - S.w3) * ak(0.03, fs);
  S.crack = Math.max(S.crack * 0.94, dropE);

  // ── scroll one row per beat ────────────────────────────────────────────
  // L.flow advances in beats, so the terrain's travel speed is the tempo.
  const flowNow = L.flow * 1.0;
  S.scroll = flowNow % 1;
  const rowIndex = Math.floor(flowNow);
  const seededRow = (S as unknown as { lastRow?: number }).lastRow;
  if (seededRow !== rowIndex) {
    (S as unknown as { lastRow?: number }).lastRow = rowIndex;
    // a new row enters at the far end, shaped by the current spectrum
    const bins = freq.length;
    const row = new Array<number>(COLS);
    for (let i = 0; i < COLS; i++) {
      // mirrored so the canyon is symmetric — a valley down the middle
      const m = i < COLS / 2 ? i : COLS - 1 - i;
      const bin = Math.min(bins - 1, 2 + Math.floor((m / (COLS / 2)) * 52));
      row[i] = Math.pow((freq[bin] ?? 0) / 255, 1.6);
    }
    S.rows.shift();
    S.rows.push(row);
  }

  // ── camera ─────────────────────────────────────────────────────────────
  const camY = 0.55 - dropE * 0.2;
  const f = R * 0.95;
  const heightK = 1.5 + energy * 0.9 + dropE * 1.4;

  /** grid (col, row) → screen, with depth. `frac` is the sub-row scroll. */
  const proj = (col: number, row: number): [number, number, number] => {
    const wx = (col - (COLS - 1) / 2) * SPACING;
    const wz = (row - S.scroll) * SPACING + 0.7;
    if (wz < 0.12) return [0, 0, -1];
    const rIdx = Math.max(0, Math.min(ROWS - 1, Math.round(row)));
    let hgt = (S.rows[rIdx]?.[col] ?? 0) * heightK;
    // a drop tears the floor open down the middle
    if (S.crack > 0.1) {
      const mid = Math.abs(col - (COLS - 1) / 2) / ((COLS - 1) / 2);
      hgt -= (1 - mid) * S.crack * 2.4;
    }
    const wy = hgt - camY;
    return [cx + (f * wx) / wz, cy - (f * wy) / wz, wz];
  };

  // ── layer 4 (drawn first, behind): sun on the horizon ──────────────────
  if (S.w3 > 0.03) {
    const sy = cy - h * 0.02;
    const sr = R * (0.16 + bassV * 0.05 + dropE * 0.1);
    const sg = c.createRadialGradient(cx, sy, 0, cx, sy, sr);
    sg.addColorStop(0, C1(0.4 * S.w3 + dropE * 0.3, 70));
    sg.addColorStop(0.6, C2(0.16 * S.w3, 52));
    sg.addColorStop(1, "transparent");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(cx, sy, sr, 0, Math.PI * 2);
    c.fill();
    // horizontal slats across the sun, the way this look always does it
    c.fillStyle = "rgba(5,6,10,0.55)";
    for (let i = 0; i < 7; i++) {
      const yy = sy - sr + (i / 7) * sr * 2;
      c.fillRect(cx - sr, yy, sr * 2, sr * 0.055);
    }
  }

  // ── layer 2: filled facets, far to near ────────────────────────────────
  if (S.w2 > 0.03) {
    for (let r = ROWS - 2; r >= 0; r--) {
      for (let i = 0; i < COLS - 1; i++) {
        const a = proj(i, r), b = proj(i + 1, r), d = proj(i + 1, r + 1), e = proj(i, r + 1);
        if (a[2] < 0 || b[2] < 0 || d[2] < 0 || e[2] < 0) continue;
        const hgt = S.rows[r]?.[i] ?? 0;
        // fade with distance so the far mesh dissolves into the sun
        const fade = cl01(1 - r / ROWS);
        c.fillStyle = CMix(hgt, S.w2 * fade * (0.1 + hgt * 0.35), 20 + hgt * 26);
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.lineTo(d[0], d[1]);
        c.lineTo(e[0], e[1]);
        c.closePath();
        c.fill();
      }
    }
  }

  // ── layer 1: the wireframe itself, always present ──────────────────────
  c.lineWidth = 0.8 * TK;
  c.strokeStyle = C2(0.2 + bassV * 0.2 + beatE * 0.1, 54);
  c.beginPath();
  for (let r = 0; r < ROWS; r++) {
    let started = false;
    for (let i = 0; i < COLS; i++) {
      const p = proj(i, r);
      if (p[2] < 0) { started = false; continue; }
      if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
    }
  }
  for (let i = 0; i < COLS; i += 2) {
    let started = false;
    for (let r = 0; r < ROWS; r++) {
      const p = proj(i, r);
      if (p[2] < 0) { started = false; continue; }
      if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
    }
  }
  c.stroke();

  // ── layer 3: ridge lights on the peaks ─────────────────────────────────
  if (S.w3 > 0.03) {
    glow(Math.min(20, 8 + beatE * 12), C1());
    c.strokeStyle = C1(S.w3 * (0.4 + trebV * 0.4), 72);
    c.lineWidth = (1 + beatE * 1.8) * TK;
    c.beginPath();
    for (let r = 0; r < ROWS; r++) {
      let started = false;
      for (let i = 0; i < COLS; i++) {
        if ((S.rows[r]?.[i] ?? 0) < 0.42) { started = false; continue; }
        const p = proj(i, r);
        if (p[2] < 0) { started = false; continue; }
        if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
      }
    }
    c.stroke();
    noGlow();
  }

  // ── drop: light pours out of the crack ─────────────────────────────────
  if (S.crack > 0.12) {
    const g = c.createLinearGradient(cx, cy + h * 0.5, cx, cy - h * 0.1);
    g.addColorStop(0, C1(S.crack * 0.55, 76));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cx - w * 0.12 * (0.4 + S.crack), cy - h * 0.1, w * 0.24 * (0.4 + S.crack), h * 0.6);
  }

  if (hitE > 0.5) {
    // percussive hits flash the nearest ridge
    c.strokeStyle = C1(hitE * 0.4, 78);
    c.lineWidth = 1.6 * TK;
    c.beginPath();
    let started = false;
    for (let i = 0; i < COLS; i++) {
      const p = proj(i, 0);
      if (p[2] < 0) { started = false; continue; }
      if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
    }
    c.stroke();
  }
};
