import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Trace {
  /** flat [x0,y0,x1,y1,…] in 0..1 space — right angles survive any resize */
  pts: number[];
  /** cumulative length at each vertex */
  cum: number[];
  len: number;
  /** index of the source node this trace fans out from */
  node: number;
  /** overload level, 0..~1.4 */
  heat: number;
}

interface Pad {
  x: number; y: number; r: number; via: boolean;
}

interface Pulse {
  tr: number; s: number; sp: number; a: number; hue: number;
}

const GX = 30;
const GY = 18;
const NODES = 16;
const MAX_TRACES = 86;
const MAX_PADS = 220;
const MAX_PULSES = 250;

// Pre-rendered pulse head. Sprites keep shadowBlur out of the 250-pulse loop.
let padCv: HTMLCanvasElement | null = null;
let padKey = "";
function headSprite(color: string): HTMLCanvasElement {
  if (padCv && padKey === color) return padCv;
  padKey = color;
  const cv = padCv ?? document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 32, 32);
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, "rgba(255,255,255,0.95)");
  rg.addColorStop(0.3, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
  padCv = cv;
  return cv;
}

// A living printed circuit board. The routing — orthogonal traces fanning out of
// source nodes, with solder pads and vias — is generated once into scratch state
// and only re-routed if the aspect ratio changes materially; every frame just
// animates light travelling along it. Quiet passages: a couple of lone pulses
// creeping down cold, dim copper. Loud passages: a data-storm — dozens of pulses
// per second, source nodes detonating on every beat, and traces accumulating so
// much heat they overload and glow white-hot.
export const CIRCUITRY: ThemeDraw = ({
  c, w, h, fs, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.circuitry ??= {
    key: "",
    traces: [] as Trace[],
    nodes: [] as { x: number; y: number }[],
    pads: [] as Pad[],
    pulses: [] as Pulse[],
    bursts: [] as { x: number; y: number; r: number; a: number }[],
    acc: 0,
  });

  // --- layout: built ONCE, reused every frame ---
  const key = `${Math.round((w / Math.max(1, h)) * 3)}`;
  if (S.key !== key) {
    S.key = key;
    const traces: Trace[] = [];
    const nodes: { x: number; y: number }[] = [];
    const pads: Pad[] = [];
    for (let n = 0; n < NODES && traces.length < MAX_TRACES; n++) {
      const nx = 2 + Math.floor(Math.random() * (GX - 4));
      const ny = 1 + Math.floor(Math.random() * (GY - 2));
      nodes.push({ x: nx / GX, y: ny / GY });
      if (pads.length < MAX_PADS) pads.push({ x: nx / GX, y: ny / GY, r: 1, via: false });
      const fan = 2 + Math.floor(Math.random() * 3);
      for (let f = 0; f < fan && traces.length < MAX_TRACES; f++) {
        let gx = nx, gy = ny;
        const pts: number[] = [gx / GX, gy / GY];
        let horiz = Math.random() < 0.5;
        const segs = 3 + Math.floor(Math.random() * 4);
        for (let s = 0; s < segs; s++) {
          const step = (2 + Math.floor(Math.random() * 6)) * (Math.random() < 0.5 ? 1 : -1);
          if (horiz) gx = Math.max(0, Math.min(GX, gx + step));
          else gy = Math.max(0, Math.min(GY, gy + step));
          pts.push(gx / GX, gy / GY);
          horiz = !horiz;
        }
        const cum: number[] = [0];
        let len = 0;
        for (let i = 2; i < pts.length; i += 2) {
          len += Math.abs(pts[i] - pts[i - 2]) + Math.abs(pts[i + 1] - pts[i - 1]);
          cum.push(len);
        }
        if (len < 0.06) continue;
        traces.push({ pts, cum, len, node: n, heat: 0 });
        if (pads.length < MAX_PADS) {
          pads.push({ x: pts[pts.length - 2], y: pts[pts.length - 1], r: 0.55, via: true });
        }
      }
    }
    S.traces = traces;
    S.nodes = nodes;
    S.pads = pads;
    S.pulses = [];
    S.bursts = [];
  }

  const traces: Trace[] = S.traces;
  const nodes: { x: number; y: number }[] = S.nodes;
  const pads: Pad[] = S.pads;
  const pulses: Pulse[] = S.pulses;
  const bursts: { x: number; y: number; r: number; a: number }[] = S.bursts;
  if (traces.length === 0) return;

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const spd = cfg.speed;

  // walk to the point at arc-length s; reused buffer, no per-pulse allocation
  const at = { x: 0, y: 0, seg: 0 };
  const locate = (tr: Trace, s: number) => {
    const cum = tr.cum, pts = tr.pts;
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const f = segLen > 1e-6 ? (s - cum[seg]) / segLen : 0;
    at.seg = seg;
    at.x = pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * f;
    at.y = pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * f;
  };

  // --- board: painted opaque so the copper reads crisp ---
  c.globalCompositeOperation = "source-over";
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, CMix(0.15, 1, 5 + E * 3));
  bg.addColorStop(1, CMix(0.75, 1, 8 + E * 5 + beatE * 3));
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "lighter";

  // --- cold copper: every trace in ONE path, ONE stroke ---
  c.beginPath();
  for (const tr of traces) {
    const p = tr.pts;
    c.moveTo(p[0] * w, p[1] * h);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] * w, p[i + 1] * h);
  }
  c.strokeStyle = CMix(0.3, (0.13 + E * 0.16 + bassV * 0.08) * (0.5 + I * 0.5), 44 + E * 10);
  c.lineWidth = Math.max(0.6, (1.1 + E * 0.5) * TK);
  c.lineJoin = "miter";
  c.stroke();

  // --- pads + vias: one batched fill each ---
  const padR = Math.min(w, h) * 0.006;
  c.beginPath();
  for (const p of pads) {
    if (p.via) continue;
    const r = padR * (2.1 + beatE * 0.7);
    c.moveTo(p.x * w + r, p.y * h);
    c.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
  }
  c.fillStyle = C1((0.16 + midV * 0.25 + beatE * 0.3) * (0.5 + I * 0.6), 62);
  c.fill();
  c.beginPath();
  for (const p of pads) {
    if (!p.via) continue;
    const r = padR * 1.15;
    c.moveTo(p.x * w + r, p.y * h);
    c.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
  }
  c.fillStyle = C2((0.12 + trebV * 0.25) * (0.5 + I * 0.6), 58);
  c.fill();

  // --- spawn pulses ---
  const mkPulse = (ti: number) => {
    if (pulses.length >= MAX_PULSES) return;
    pulses.push({
      tr: ti,
      s: 0,
      sp: (0.0022 + E * 0.016) * (0.75 + Math.random() * 0.5),
      a: 0.55 + Math.random() * 0.45,
      hue: Math.random(),
    });
  };
  // ambient: a trickle when calm, a flood when driving
  S.acc += (0.035 + E2 * 3.4) * fs;
  while (S.acc >= 1) {
    S.acc -= 1;
    mkPulse((Math.random() * traces.length) | 0);
  }
  if (S.acc > 3) S.acc = 3;
  // beat: a source node fires everything wired to it
  if (beat && nodes.length) {
    const fires = 1 + Math.floor(E * 2.5);
    for (let f = 0; f < fires; f++) {
      const n = (Math.random() * nodes.length) | 0;
      for (let i = 0; i < traces.length; i++) if (traces[i].node === n) mkPulse(i);
      if (bursts.length < 8) bursts.push({ x: nodes[n].x, y: nodes[n].y, r: 0, a: 0.7 + E * 0.3 });
    }
  }

  // --- pulses travelling the copper ---
  const head = headSprite(C1(0.9, 80));
  const tail = 0.02 + E * 0.05;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pu = pulses[i];
    const tr = traces[pu.tr];
    pu.s += pu.sp * spd * (1 + beatE * 0.8) * fs;
    if (pu.s > tr.len) {
      // arrival: dump the charge into the end pad
      tr.heat += 0.25 + E * 0.4;
      pulses.splice(i, 1);
      continue;
    }
    tr.heat += (0.012 + E * 0.05) * fs;
    const s1 = pu.s;
    const s0 = Math.max(0, s1 - tail);
    locate(tr, s1);
    const hx = at.x * w, hy = at.y * h;
    const endSeg = at.seg;
    // trail follows the copper around its corners
    c.beginPath();
    c.moveTo(hx, hy);
    for (let sg = endSeg; sg >= 0; sg--) {
      if (tr.cum[sg] <= s0) break;
      c.lineTo(tr.pts[sg * 2] * w, tr.pts[sg * 2 + 1] * h);
    }
    locate(tr, s0);
    c.lineTo(at.x * w, at.y * h);
    c.strokeStyle = CMix(pu.hue, pu.a * (0.5 + E * 0.4) * (0.4 + I * 0.7), 74);
    c.lineWidth = Math.max(0.8, (1.4 + E * 1.2 + beatE) * TK);
    c.stroke();
    const r = Math.min(w, h) * 0.012 * (1 + E * 0.6 + beatE * 0.5) * TK;
    c.globalAlpha = Math.min(1, pu.a * (0.6 + beatE * 0.4));
    c.drawImage(head, hx - r, hy - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;

  // --- overload: hot traces in two batched, glowed strokes ---
  const hotCut = 0.35;
  for (let band = 0; band < 2; band++) {
    const lo = band === 0 ? hotCut : 0.85;
    const hi = band === 0 ? 0.85 : 99;
    let any = false;
    c.beginPath();
    for (const tr of traces) {
      if (tr.heat < lo || tr.heat >= hi) continue;
      any = true;
      const p = tr.pts;
      c.moveTo(p[0] * w, p[1] * h);
      for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] * w, p[i + 1] * h);
    }
    if (!any) continue;
    c.strokeStyle = band === 0
      ? CMix(0.4, (0.3 + E * 0.3) * (0.4 + I * 0.7), 66)
      : C2((0.55 + beatE * 0.4) * (0.4 + I * 0.7), 88);
    c.lineWidth = Math.max(0.9, (1.6 + band * 1.6 + E * 1.2) * TK);
    glow(Math.min(28, (8 + band * 12) * (1 + beatE * 0.8)), band === 0 ? C1() : C2());
    c.stroke();
    noGlow();
  }
  const cool = dk(0.93, fs);
  for (const tr of traces) tr.heat *= cool;

  // --- source-node detonations ---
  if (bursts.length) {
    glow(Math.min(26, 16 * (1 + beatE)), C2());
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.r += Math.min(w, h) * (0.008 + E * 0.02) * spd * fs;
      b.a *= dk(0.87, fs);
      if (b.a < 0.04) { bursts.splice(i, 1); continue; }
      c.strokeStyle = C2(b.a * 0.7, 86);
      c.lineWidth = (1 + b.a * 2.5) * TK;
      c.beginPath();
      c.arc(b.x * w, b.y * h, b.r, 0, Math.PI * 2);
      c.stroke();
    }
    noGlow();
  }

  // --- storm-only scanline sweep ---
  if (E > 0.5) {
    const sy = ((vt * (2 + E * 8) * spd) % (h * 1.2)) - h * 0.1;
    const sg = c.createLinearGradient(0, sy - h * 0.06, 0, sy + h * 0.06);
    sg.addColorStop(0, "transparent");
    sg.addColorStop(0.5, C1((E - 0.5) * 0.14 + beatE * 0.06, 70));
    sg.addColorStop(1, "transparent");
    c.fillStyle = sg;
    c.fillRect(0, sy - h * 0.06, w, h * 0.12);
  }
};
