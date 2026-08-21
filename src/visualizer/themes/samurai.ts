import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Stroke {
  x1: number; y1: number;
  x2: number; y2: number;
  /** quadratic control point — the arc of the blade */
  kx: number; ky: number;
  /** half-width of the brush at its fattest */
  wd: number;
  /** 0 → 1 as the brush travels */ p: number;
  /** progress per frame */ sp: number;
  /** ink density, fades as it dries */ a: number;
  /** where along the stroke the brush is heaviest */ bias: number;
  /** dry-brush texture seed */ seed: number;
  hue: number;
  /** 0 = free slot */ live: number;
}
interface Spray { x: number; y: number; vx: number; vy: number; a: number; sz: number }

const MAXS = 24;          // brush strokes on the paper at once
const MAX_SPRAY = 170;
const SEG = 20;           // samples along a stroke — fixed, never scales

// Sumi-e sword work. Each beat is a cut: a brush loaded with ink is dragged
// across the paper in a single arc, fat through the middle and tapering to
// nothing at both ends, flicking spray off the tip as it travels. The ink then
// dries — the stroke darkens, thins and sinks into the paper. Behind it all
// hangs a single sun disc.
// A contemplative passage gives you one stroke at a time, drawn slowly across
// several seconds, left to sit on the page before the next is allowed. A driving
// passage is a flurry: several blades crossing per beat, drawn almost instantly,
// heavy spray, the paper never clearing.
export const SAMURAI: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.samurai ??= {
    st: [] as Stroke[],
    spray: [] as Spray[],
    head: 0,
    idle: 0,
  });
  const st: Stroke[] = S.st;
  const spray: Spray[] = S.spray;
  if (st.length === 0) {
    for (let i = 0; i < MAXS; i++) {
      st.push({ x1: 0, y1: 0, x2: 0, y2: 0, kx: 0, ky: 0, wd: 0, p: 0, sp: 0, a: 0, bias: 0.5, seed: 0, hue: 0, live: 0 });
    }
  }

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const spd = cfg.speed;

  // --- paper ----------------------------------------------------------------
  c.globalCompositeOperation = "source-over";
  const paper = c.createLinearGradient(0, 0, w * 0.35, h);
  paper.addColorStop(0, CMix(0.35, 1, 11));
  paper.addColorStop(0.5, CMix(0.6, 1, 7));
  paper.addColorStop(1, CMix(0.2, 1, 10));
  c.fillStyle = paper;
  c.fillRect(0, 0, w, h);

  // --- the sun disc (palette's second colour — never a hardcoded red) -------
  const sunY = cy - R * 0.1;
  const sunR = R * (0.2 + bassV * 0.02) * (1 + beatE * 0.05);
  const halo = c.createRadialGradient(cx, sunY, sunR * 0.7, cx, sunY, sunR * 2.4);
  halo.addColorStop(0, C2(0.22 + beatE * 0.12, 44));
  halo.addColorStop(1, "transparent");
  c.fillStyle = halo;
  c.beginPath();
  c.arc(cx, sunY, sunR * 2.4, 0, Math.PI * 2);
  c.fill();
  const disc = c.createRadialGradient(cx, sunY, 0, cx, sunY, sunR);
  disc.addColorStop(0, C2(0.92, Math.min(62, 46 + E * 8 + beatE * 8)));
  disc.addColorStop(0.82, C2(0.86, 40));
  disc.addColorStop(1, C2(0.5, 32));
  c.fillStyle = disc;
  c.beginPath();
  c.arc(cx, sunY, sunR, 0, Math.PI * 2);
  c.fill();
  // horizon rule
  c.fillStyle = CMix(0.5, 0.3, 26);
  c.fillRect(0, cy + R * 0.42, w, 1.2 * TK);

  // --- cutting --------------------------------------------------------------
  let liveN = 0;
  for (let i = 0; i < MAXS; i++) if (st[i].live && st[i].p < 1) liveN++;

  const cut = () => {
    const s = st[S.head];
    S.head = (S.head + 1) % MAXS;
    const ang = Math.random() * Math.PI * 2;
    const len = R * (0.85 + Math.random() * (0.5 + E * 0.7));
    const mx = cx + (Math.random() - 0.5) * w * (0.18 + E * 0.5);
    const my = cy + (Math.random() - 0.5) * h * (0.18 + E * 0.5);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    s.x1 = mx - ca * len * 0.5;
    s.y1 = my - sa * len * 0.5;
    s.x2 = mx + ca * len * 0.5;
    s.y2 = my + sa * len * 0.5;
    // the blade's arc: bow the stroke sideways
    const bow = len * (0.06 + Math.random() * (0.1 + E * 0.22)) * (Math.random() < 0.5 ? -1 : 1);
    s.kx = mx - sa * bow;
    s.ky = my + ca * bow;
    s.wd = R * (0.016 + Math.random() * 0.016) * (1 + bassV * 0.5) * TK * (1.35 - E * 0.45);
    s.p = 0;
    // calm: the brush crawls (~2.5s per stroke). driving: gone in a few frames
    s.sp = (0.006 + E * 0.14) * spd * (0.7 + Math.random() * 0.6);
    s.a = 1;
    s.bias = 0.34 + Math.random() * 0.32;
    s.seed = Math.random() * 100;
    s.hue = Math.random() * 0.35;
    s.live = 1;
  };

  S.idle -= fs;
  if (beat) {
    if (E < 0.32) {
      // contemplative: nothing new until the last cut has finished travelling
      if (liveN === 0 && S.idle <= 0) { cut(); S.idle = 40; }
    } else {
      cut();
      const extra = Math.floor(E * 3.2);
      for (let k = 0; k < extra; k++) if (Math.random() < E) cut();
    }
  } else if (E > 0.66 && Math.random() < (E - 0.66) * 0.5 * fs) cut();

  // --- advance the brushes, flicking spray off each travelling tip ----------
  // ink dries faster the harder the piece is being played
  const dry = dk(0.9975 - E * 0.028, fs);
  for (let n = 0; n < MAXS; n++) {
    const s = st[n];
    if (!s.live) continue;
    if (s.p >= 1) {
      s.a *= dry;
      if (s.a < 0.035) s.live = 0;
      continue;
    }
    s.p = Math.min(1, s.p + s.sp * fs);
    // spray is thrown per unit of travel, not per frame, so the count carries
    // the frame factor — the fraction is resolved by a coin toss
    const flickR = (1 + Math.round(E * 5 + beatE * 3)) * fs;
    const flick = Math.floor(flickR) + (Math.random() < flickR % 1 ? 1 : 0);
    for (let k = 0; k < flick; k++) {
      if (spray.length >= MAX_SPRAY) break;
      const u = s.p;
      const iu = 1 - u;
      const hx = iu * iu * s.x1 + 2 * iu * u * s.kx + u * u * s.x2;
      const hy = iu * iu * s.y1 + 2 * iu * u * s.ky + u * u * s.y2;
      const tx = 2 * (iu * (s.kx - s.x1) + u * (s.x2 - s.kx));
      const ty = 2 * (iu * (s.ky - s.y1) + u * (s.y2 - s.ky));
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const jit = (Math.random() - 0.5) * 1.6;
      const vsp = R * (0.002 + Math.random() * (0.004 + E * 0.014)) * I;
      spray.push({
        x: hx + (Math.random() - 0.5) * s.wd * 2,
        y: hy + (Math.random() - 0.5) * s.wd * 2,
        vx: (tx / tl) * vsp - (ty / tl) * vsp * jit,
        vy: (ty / tl) * vsp + (tx / tl) * vsp * jit,
        a: 0.5 + Math.random() * 0.5,
        sz: R * (0.0018 + Math.random() * 0.005),
      });
    }
  }

  // tapered brush body: walk out one side of the arc and back along the other
  const outline = (s: Stroke) => {
    const end = s.p;
    c.beginPath();
    for (let i = 0; i <= SEG * 2 + 1; i++) {
      const back = i > SEG;
      const idx = back ? SEG * 2 + 1 - i : i;
      const u = (idx / SEG) * end;
      const iu = 1 - u;
      const bx = iu * iu * s.x1 + 2 * iu * u * s.kx + u * u * s.x2;
      const by = iu * iu * s.y1 + 2 * iu * u * s.ky + u * u * s.y2;
      const tx = 2 * (iu * (s.kx - s.x1) + u * (s.x2 - s.kx));
      const ty = 2 * (iu * (s.ky - s.y1) + u * (s.y2 - s.ky));
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      // nothing at the ends, heaviest at `bias`, roughened for dry brush
      const t = u < s.bias ? u / (s.bias || 1) : (1 - u) / ((1 - s.bias) || 1);
      const prof = Math.pow(t < 0 ? 0 : t > 1 ? 1 : t, 0.55);
      const rough = 1 + Math.sin(u * 37 + s.seed) * 0.16 + Math.sin(u * 91 + s.seed * 2) * 0.09;
      const ww = s.wd * prof * rough * (back ? -1 : 1);
      c.lineTo(bx - (ty / tl) * ww, by + (tx / tl) * ww);
    }
    c.closePath();
  };

  // pass 1: dried ink, flat and unglowed — the bulk of the strokes on screen
  const lit = Math.min(76, 56 + midV * 8 + beatE * 6);
  for (let n = 0; n < MAXS; n++) {
    const s = st[n];
    if (!s.live || s.p < 1) continue;
    outline(s);
    c.fillStyle = CMix(s.hue, Math.min(0.88, s.a * 0.74), lit);
    c.fill();
  }
  // pass 2: only the wet blades get the bloom, so shadowBlur is paid a
  // handful of times per frame rather than 24
  glow(Math.min(22, (7 + E * 9) * (1 + beatE * 0.7)), C1());
  for (let n = 0; n < MAXS; n++) {
    const s = st[n];
    if (!s.live || s.p >= 1) continue;
    outline(s);
    c.fillStyle = CMix(s.hue, Math.min(0.92, s.a * 0.9), Math.min(76, lit + 10));
    c.fill();
  }
  noGlow();

  // --- ink spray, batched into one path -------------------------------------
  if (spray.length) {
    const drag = dk(0.9 - E * 0.05, fs);
    c.beginPath();
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i];
      p.x += p.vx * spd * fs;
      p.y += p.vy * spd * fs;
      p.vx *= drag;
      p.vy *= drag;
      p.vy += R * 0.00018 * fs;
      p.a *= dk(0.955 - E * 0.02, fs);
      if (p.a < 0.05) { spray.splice(i, 1); continue; }
      const rr = p.sz * (0.5 + p.a);
      c.moveTo(p.x + rr, p.y);
      c.arc(p.x, p.y, rr, 0, Math.PI * 2);
    }
    c.fillStyle = C1(Math.min(0.6, 0.28 + trebV * 0.2 + beatE * 0.2), 68);
    c.fill();
  }

  // --- a faint seal mark in the corner, breathing with the piece ------------
  const sealS = R * 0.05;
  const sx = w - R * 0.14, sy = h - R * 0.14;
  c.strokeStyle = C2(0.22 + beatE * 0.16, 46);
  c.lineWidth = 2 * TK;
  c.strokeRect(sx - sealS, sy - sealS, sealS * 2, sealS * 2);
  c.fillStyle = C2(0.14 + Math.abs(Math.sin(vt * 0.01)) * 0.1, 42);
  c.fillRect(sx - sealS * 0.55, sy - sealS * 0.55, sealS * 1.1, sealS * 1.1);
};
