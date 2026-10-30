import type { Frame, ModeDef } from "../types";

// SIGNAL — a Swiss poster that rearranges itself in time.
//
// A grid of bold geometric cells: discs, half-discs, quarter-arcs, rings,
// stripes and one live typographic cell counting the bar. On every bar with a
// trusted grid (or on strong onsets, or slowly over time without one) a few
// cells turn a quarter or swap colour, each with a springy settle. Two cells
// are spectrum stacks; the bass swells the discs a few percent. The point is
// rhythm you can *read*: the composition changes on the musical boundaries,
// not every frame.

type Shape = "disc" | "half" | "quarter" | "ring" | "stripes" | "eq" | "count" | "dot";
interface Cell { shape: Shape; rot: number; from: number; t: number; col: number; bg: number }
interface St { cells?: Cell[]; cols?: number; rows?: number; seed: number; idle: number; changes: number }

const SHAPES: Shape[] = ["disc", "half", "quarter", "ring", "stripes", "half", "quarter", "dot"];

function rnd(st: St): number {
  st.seed = (st.seed * 1664525 + 1013904223) >>> 0;
  return st.seed / 4294967296;
}

/** damped spring 0→1 over ~0.6s with a small overshoot */
const settle = (t: number) => (t >= 1 ? 1 : 1 - Math.exp(-t * 7) * Math.cos(t * 9));

function build(st: St, cols: number, rows: number): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const s = SHAPES[Math.floor(rnd(st) * SHAPES.length)];
    const rot = Math.floor(rnd(st) * 4);
    cells.push({ shape: s, rot, from: rot, t: 1, col: 2 + Math.floor(rnd(st) * 3), bg: rnd(st) < 0.28 ? 1 : 0 });
  }
  // fixed roles: a counter and two spectrum stacks at stable positions
  cells[Math.min(cells.length - 1, cols - 1)].shape = "count";
  cells[Math.min(cells.length - 1, cols)].shape = "eq";
  cells[Math.min(cells.length - 1, cells.length - 2)].shape = "eq";
  return cells;
}

export const signal: ModeDef = {
  id: "signal",
  name: "Signal",
  line: "A Swiss poster that rearranges itself in time",
  reacts: "Bars turn the shapes · beats count · bass swells the discs",
  dials: ["Grid", "Change"],
  kind: "2d",
  draw: (c, f: Frame, raw) => {
    const st = raw as unknown as St;
    if (!st.seed) { st.seed = 9; st.idle = 0; st.changes = 0; }
    const { w, h, css } = f;
    const portrait = h > w;
    const base = 3 + Math.round(f.a * 2);
    const cols = portrait ? base - 1 : base + 1;
    const rows = portrait ? base + 2 : base - 1;
    if (!st.cells || st.cols !== cols || st.rows !== rows) {
      st.cells = build(st, cols, rows);
      st.cols = cols; st.rows = rows;
    }
    const cells = st.cells;
    // when the composition changes
    let change = 0;
    if (f.grid > 0.5 && f.onBar) change = 2 + Math.round(f.b * 3);
    else if (f.grid > 0.5 && f.onBeat && f.b > 0.7) change = 1;
    else if (f.grid <= 0.5 && f.onset && f.transient > 0.55 && f.playing) change = 1 + Math.round(f.b);
    st.idle += f.dt;
    if (!change && st.idle > 2.6 - f.energy * 1.4 + (f.playing ? 0 : 2)) change = 1;
    if (change) {
      st.idle = 0;
      for (let k = 0; k < change; k++) {
        const cell = cells[Math.floor(rnd(st) * cells.length)];
        if (cell.shape === "count" || cell.shape === "eq") continue;
        cell.from = cell.rot + (cell.t < 1 ? 0 : 0);
        cell.rot = cell.rot + (rnd(st) < 0.5 ? 1 : -1);
        cell.t = 0;
        if (rnd(st) < 0.45) cell.col = 2 + Math.floor(rnd(st) * 3);
        if (rnd(st) < 0.12) cell.shape = SHAPES[Math.floor(rnd(st) * SHAPES.length)];
      }
    }
    const margin = Math.min(w, h) * 0.07;
    const cw = (w - margin * 2) / cols;
    const ch = (h - margin * 2) / rows;
    const sz = Math.min(cw, ch);
    const ox = (w - sz * cols) / 2, oy = (h - sz * rows) / 2;
    c.fillStyle = css[0];
    c.fillRect(0, 0, w, h);
    const gap = sz * 0.06;
    cells.forEach((cell, i) => {
      cell.t = Math.min(1, cell.t + f.dt * 1.6);
      const x = ox + (i % cols) * sz, y = oy + Math.floor(i / cols) * sz;
      const s = sz - gap;
      const cx = x + sz / 2, cy = y + sz / 2;
      if (cell.bg) {
        c.fillStyle = css[1];
        c.fillRect(x + gap / 2, y + gap / 2, s, s);
      }
      const col = css[cell.col];
      const rot = (cell.from + (cell.rot - cell.from) * settle(cell.t)) * (Math.PI / 2);
      c.save();
      c.translate(cx, cy);
      c.rotate(rot);
      c.fillStyle = col;
      c.strokeStyle = col;
      const swell = 1 + f.bass * 0.07 + f.accent * 0.03;
      const r = (s / 2) * 0.92;
      switch (cell.shape) {
        case "disc":
          c.beginPath(); c.arc(0, 0, r * swell * 0.95, 0, Math.PI * 2); c.fill(); break;
        case "dot":
          c.beginPath(); c.arc(0, 0, r * 0.32 * swell, 0, Math.PI * 2); c.fill(); break;
        case "half":
          c.beginPath(); c.arc(0, s / 2 - gap, r * swell, Math.PI, 0); c.fill(); break;
        case "quarter":
          c.beginPath(); c.moveTo(-s / 2, -s / 2); c.arc(-s / 2, -s / 2, s * 0.98, 0, Math.PI / 2); c.closePath(); c.fill(); break;
        case "ring":
          c.lineWidth = s * 0.14; c.beginPath(); c.arc(0, 0, r * 0.72 * swell, 0, Math.PI * 2); c.stroke(); break;
        case "stripes":
          for (let k = 0; k < 4; k++) c.fillRect(-s / 2, -s / 2 + (k * s) / 4, s, s / 8); break;
        case "eq": {
          c.rotate(-rot);
          const n = 6;
          for (let k = 0; k < n; k++) {
            const v = f.spectrum[Math.floor(((k + 0.5) / n) * 44)] ?? 0;
            const bh = Math.max(s * 0.03, v * s);
            c.fillStyle = k % 2 ? css[3] : css[2];
            c.fillRect(-s / 2 + (k * s) / n, s / 2 - bh, s / n - gap * 0.5, bh);
          }
          break;
        }
        case "count": {
          c.rotate(-rot);
          // the bar counter: real beat numbers when the grid is trusted, a
          // slow breathing dash when it isn't — never an invented count
          c.fillStyle = css[4];
          c.textAlign = "center";
          c.textBaseline = "middle";
          if (f.grid > 0.45 && f.beatIndex >= 0) {
            const beatInBar = Math.floor(f.barPhase * 4) % 4;
            const pop = 1 + Math.exp(-f.phase * 9) * 0.12;
            c.font = `800 ${Math.round(s * 0.78 * pop)}px "Bricolage Grotesque Variable", sans-serif`;
            c.fillText(String(beatInBar + 1), 0, s * 0.04);
          } else {
            c.globalAlpha = 0.45 + Math.sin(f.time * 1.5) * 0.25;
            c.fillRect(-s * 0.22, -s * 0.03, s * 0.44, s * 0.06);
            c.globalAlpha = 1;
          }
          break;
        }
      }
      c.restore();
    });
  },
};
