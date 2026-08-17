import type { ThemeDraw } from "../themeTypes";

interface Stroke {
  /** control points in 0..1 wall space */
  px: number[];
  py: number[];
  /** how far along the control polyline the can currently is */
  s: number;
  /** advance per frame, in control-point units */
  sp: number;
  /** nozzle width, fraction of min(w,h) */
  wd: number;
  hue: number;
  /** paint opacity of the core */
  a: number;
  /** frames of dwell left after the stroke finishes (for the drip to form) */
  hold: number;
}

interface Drip {
  x: number;
  y: number;
  /** fall speed, fraction of h per frame */
  v: number;
  /** remaining life, in frames */
  life: number;
  wd: number;
  hue: number;
  a: number;
}

const MAX_STROKES = 7;
const MAX_DRIPS = 70;
const TAU = Math.PI * 2;

interface Wall {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
}

// A wall being tagged in real time. The paint lives in a persistent offscreen
// canvas — every frame only the newly sprayed pixels are added, then the whole
// wall is blitted in one drawImage, so a hundred old strokes cost nothing. The
// wall is slowly erased (destination-out) so older tags sink back into the
// concrete as fresh ones cover them.
// Quiet passages: one can, one long deliberate stroke, thin paint, and drips
// that run a long way down the wall. Loud passages: half a dozen cans going at
// once, strokes ripped out in a few frames, splatter bursts on every beat and
// the wall filling up faster than it can fade.
export const GRAFFITI: ThemeDraw = ({
  c, w, h, R, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.graffiti ??= {
    wall: null as Wall | null,
    strokes: [] as Stroke[],
    drips: [] as Drip[],
    /** spawn accumulator */
    acc: 0,
    /** deterministic speck seed for the concrete */
    seed: Math.random() * 1000,
  });

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  // --- the persistent wall buffer: created once, kept until the size really moves ---
  let wall: Wall | null = S.wall;
  const iw = Math.max(2, Math.round(w));
  const ih = Math.max(2, Math.round(h));
  if (!wall || Math.abs(wall.cv.width - iw) > iw * 0.12 || Math.abs(wall.cv.height - ih) > ih * 0.12) {
    const cv = wall ? wall.cv : document.createElement("canvas");
    const prev = wall;
    // keep what was already sprayed: rescale the old paint into the new size
    let carry: HTMLCanvasElement | null = null;
    if (prev && prev.cv.width > 1) {
      carry = document.createElement("canvas");
      carry.width = prev.cv.width;
      carry.height = prev.cv.height;
      carry.getContext("2d")!.drawImage(prev.cv, 0, 0);
    }
    cv.width = iw;
    cv.height = ih;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, iw, ih);
    if (carry) g.drawImage(carry, 0, 0, iw, ih);
    wall = { cv, g };
    S.wall = wall;
  }
  const g = wall.g;

  // --- fade the old paint back into the wall (never redraw history) ---
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = `rgba(0,0,0,${0.004 + E2 * 0.026})`;
  g.fillRect(0, 0, iw, ih);
  g.globalCompositeOperation = "source-over";

  const strokes: Stroke[] = S.strokes;
  const drips: Drip[] = S.drips;
  const unit = Math.min(iw, ih);

  // --- spawn strokes: one slow tag when calm, a barrage when driving ---
  const mkStroke = (fast: boolean) => {
    if (strokes.length >= (E < 0.35 ? 2 : MAX_STROKES)) return;
    const n = 5 + Math.floor(Math.random() * 6);
    const px: number[] = [];
    const py: number[] = [];
    // a tag-ish run: a general left-to-right sweep with loops and sharp returns
    const x0 = 0.08 + Math.random() * 0.5;
    const y0 = 0.2 + Math.random() * 0.6;
    const span = (0.16 + Math.random() * 0.34) * (fast ? 1.25 : 1);
    const tall = (0.1 + Math.random() * 0.22) * (fast ? 1.3 : 1);
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      px.push(x0 + f * span * dir + (Math.random() - 0.5) * span * 0.35);
      py.push(y0 + Math.sin(f * TAU * (1 + Math.floor(Math.random() * 2))) * tall * 0.5 + (Math.random() - 0.5) * tall * 0.4);
    }
    strokes.push({
      px, py,
      s: 0,
      sp: (fast ? 0.16 + E * 0.3 : 0.028 + E * 0.05) * sp,
      wd: (fast ? 0.012 + Math.random() * 0.018 : 0.016 + Math.random() * 0.026) * (0.6 + I * 0.6),
      hue: Math.random(),
      a: 0.5 + Math.random() * 0.3,
      hold: 0,
    });
  };

  S.acc += 0.012 + E2 * 0.42;
  while (S.acc >= 1) { S.acc -= 1; mkStroke(E > 0.45); }
  if (S.acc > 2) S.acc = 2;
  if (beat) {
    const n = E < 0.3 ? 1 : 1 + Math.floor(E * 3);
    for (let k = 0; k < n; k++) mkStroke(E > 0.4);
  }

  // --- spray: only the newly covered arc-length is painted, onto the wall ---
  const sprayDot = (x: number, y: number, rad: number, col: string, alpha: number) => {
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  };

  for (let i = strokes.length - 1; i >= 0; i--) {
    const st = strokes[i];
    const last = st.px.length - 1;
    const prev = st.s;
    st.s += st.sp * (1 + beatE * 0.8);
    if (prev >= last) {
      st.hold -= 1;
      if (st.hold <= 0) strokes.splice(i, 1);
      continue;
    }
    const end = Math.min(last, st.s);
    const col = CMix(st.hue, 1, 46 + E * 10);
    const edge = C2(1, 40);
    const core = st.wd * unit;
    // walk the newly covered span in small steps so fast strokes stay solid
    const steps = Math.min(24, Math.max(1, Math.ceil((end - prev) * 18)));
    for (let k = 1; k <= steps; k++) {
      const t = prev + (end - prev) * (k / steps);
      const seg = Math.min(last - 1, Math.floor(t));
      const f = t - seg;
      const x = (st.px[seg] + (st.px[seg + 1] - st.px[seg]) * f) * iw;
      const y = (st.py[seg] + (st.py[seg + 1] - st.py[seg]) * f) * ih;
      if (!isFinite(x) || !isFinite(y)) continue;
      // soft outer haze then a wet core: reads as aerosol, not a pen line
      sprayDot(x, y, core * 1.5, edge, 0.05 * st.a);
      sprayDot(x, y, core * 0.62, col, 0.5 * st.a);
      // overspray specks
      const specks = 3 + Math.floor(E * 5);
      g.globalAlpha = 0.16 * st.a;
      g.fillStyle = col;
      for (let s2 = 0; s2 < specks; s2++) {
        const a2 = Math.random() * TAU;
        const d = core * (0.7 + Math.random() * 1.9);
        g.fillRect(x + Math.cos(a2) * d, y + Math.sin(a2) * d, 1.4, 1.4);
      }
      // drips: long and lazy when calm, short and everywhere when loud
      if (drips.length < MAX_DRIPS && Math.random() < (E < 0.35 ? 0.06 : 0.02 + E * 0.03)) {
        drips.push({
          x, y,
          v: (0.0012 + Math.random() * 0.0022) * (0.5 + E * 1.6),
          life: (E < 0.35 ? 150 + Math.random() * 220 : 40 + Math.random() * 70),
          wd: core * (0.2 + Math.random() * 0.3),
          hue: st.hue,
          a: st.a,
        });
      }
    }
    g.globalAlpha = 1;
    if (st.s >= last) st.hold = 20 + Math.floor(Math.random() * 30);
  }

  // --- splats on the beat ---
  if (beat) {
    const blobs = E < 0.3 ? 1 : 2 + Math.floor(E * 5);
    for (let b = 0; b < blobs; b++) {
      const bx = Math.random() * iw;
      const by = Math.random() * ih;
      const hue = Math.random();
      const col = CMix(hue, 1, 48 + E * 10);
      const rad = unit * (0.008 + Math.random() * 0.02) * (0.6 + bassV * 0.9 + E * 0.6);
      sprayDot(bx, by, rad, col, 0.45);
      const flecks = 6 + Math.floor(E * 20);
      g.globalAlpha = 0.3;
      g.fillStyle = col;
      for (let s2 = 0; s2 < flecks; s2++) {
        const a2 = Math.random() * TAU;
        const d = rad * (1 + Math.random() * (2.5 + E * 5));
        const rr = 0.8 + Math.random() * rad * 0.35;
        g.beginPath();
        g.arc(bx + Math.cos(a2) * d, by + Math.sin(a2) * d, rr, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      if (drips.length < MAX_DRIPS) {
        drips.push({
          x: bx, y: by + rad * 0.6,
          v: (0.0011 + Math.random() * 0.0026) * (0.5 + E * 1.4),
          life: E < 0.35 ? 180 + Math.random() * 200 : 50 + Math.random() * 80,
          wd: rad * 0.22,
          hue, a: 0.6,
        });
      }
    }
  }

  // --- drips run down the wall, painting as they go ---
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i];
    const y0 = d.y;
    d.y += d.v * ih * sp;
    d.v *= 0.998;
    d.life -= 1;
    d.a *= 0.997;
    if (d.life <= 0 || d.y > ih + 4 || d.a < 0.06) { drips.splice(i, 1); continue; }
    g.globalAlpha = d.a * 0.55;
    g.strokeStyle = CMix(d.hue, 1, 44);
    g.lineWidth = Math.max(0.6, d.wd * 2);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(d.x, y0);
    g.lineTo(d.x, d.y);
    g.stroke();
    // the bead at the bottom of the run
    g.globalAlpha = d.a * 0.5;
    g.fillStyle = CMix(d.hue, 1, 50);
    g.beginPath();
    g.arc(d.x, d.y, Math.max(0.7, d.wd * 1.4), 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }

  // --- the visible frame: concrete, then the wall blitted on top ---
  c.globalCompositeOperation = "source-over";
  const wallG = c.createLinearGradient(0, 0, w * 0.3, h);
  wallG.addColorStop(0, CMix(0.5, 1, 13 + E * 4));
  wallG.addColorStop(0.5, CMix(0.8, 1, 9 + E * 3 + beatE * 2));
  wallG.addColorStop(1, CMix(0.25, 1, 6));
  c.fillStyle = wallG;
  c.fillRect(0, 0, w, h);

  // fixed count of concrete pocks, deterministic from a stored seed
  c.fillStyle = C1(0.05, 30);
  for (let i = 0; i < 90; i++) {
    const k = i * 127.7 + S.seed;
    const x = ((k * 9301 + 49297) % 233280) / 233280 * w;
    const y = ((k * 4111 + 7919) % 190231) / 190231 * h;
    c.fillRect(x, y, 2.2, 2.2);
  }

  c.drawImage(wall.cv, 0, 0, w, h);

  // wet edges: a light additive pass over the freshest strokes only
  if (strokes.length) {
    c.globalCompositeOperation = "lighter";
    glow(Math.min(20, (7 + E * 8) * (1 + beatE * 0.7)), C1());
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let i = 0; i < strokes.length; i++) {
      const st = strokes[i];
      const last = st.px.length - 1;
      const end = Math.min(last, st.s);
      if (end < 0.02) continue;
      const from = Math.max(0, end - 0.9);
      c.beginPath();
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const t = from + (end - from) * (k / steps);
        const seg = Math.min(last - 1, Math.floor(t));
        const f = t - seg;
        const x = (st.px[seg] + (st.px[seg + 1] - st.px[seg]) * f) * w;
        const y = (st.py[seg] + (st.py[seg + 1] - st.py[seg]) * f) * h;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = CMix(st.hue, Math.min(0.45, (0.16 + midV * 0.16 + beatE * 0.16) * (0.4 + I * 0.6)), 66);
      c.lineWidth = Math.max(0.8, st.wd * R * 0.9 * TK);
      c.stroke();
      // the can nozzle itself
      const seg = Math.min(last - 1, Math.floor(end));
      const f = end - seg;
      const nx = (st.px[seg] + (st.px[seg + 1] - st.px[seg]) * f) * w;
      const ny = (st.py[seg] + (st.py[seg + 1] - st.py[seg]) * f) * h;
      if (st.s < last) {
        c.fillStyle = C1(Math.min(0.5, 0.25 + trebV * 0.2 + beatE * 0.2), 72);
        c.beginPath();
        c.arc(nx, ny, Math.max(1, st.wd * R * 0.5 * TK), 0, TAU);
        c.fill();
      }
    }
    noGlow();
    c.lineCap = "butt";
    c.lineJoin = "miter";
    c.globalCompositeOperation = "source-over";
  }
};
