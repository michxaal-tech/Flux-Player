import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

const MAXS = 7;    // hard cap on creatures
const SEG = 26;    // nodes per body — fixed, never scales with canvas size
const MAXSP = 180; // hard cap on trail sparks

interface Serp {
  live: number;
  /** 0 → 1 fade in, back to 0 on retire */
  fade: number;
  retiring: number;
  nx: Float32Array; ny: Float32Array;
  ang: number; turn: number; ph: number; hue: number; size: number;
  shed: number;
}
interface Spark { x: number; y: number; vx: number; vy: number; a: number; sz: number }

const mkSerp = (): Serp => ({
  live: 0, fade: 0, retiring: 0,
  nx: new Float32Array(SEG), ny: new Float32Array(SEG),
  ang: 0, turn: 0, ph: 0, hue: 0, size: 1, shed: 0,
});

// Pre-rendered spark so the trail never pays for a per-particle shadowBlur.
let sparkSprite: HTMLCanvasElement | null = null;
let sparkKey = "";
function getSpark(color: string): HTMLCanvasElement {
  if (sparkSprite && sparkKey === color) return sparkSprite;
  sparkKey = color;
  const cv = sparkSprite ?? document.createElement("canvas");
  cv.width = cv.height = 40;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 40, 40);
  const rg = g.createRadialGradient(20, 20, 0, 20, 20, 20);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.32, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 40, 40);
  sparkSprite = cv;
  return cv;
}

// Luminous ribbon-serpents swimming through open space. Their bodies are
// tapered chains that follow the head, shedding glowing motes as they go.
// In a calm passage two of them cruise in long, wide, lazy arcs, barely
// bending. As the music drives, more of them fade into being — up to seven —
// and their undulation tightens into fast, violent coiling; every beat cracks
// them like a whip, snapping the head into a hard turn and blowing a burst of
// light off the body.
export const SERPENT: ThemeDraw = ({
  c, cx, cy, R, fs, vt, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.serpent ??= {
    serps: [] as Serp[],
    sparks: [] as Spark[],
  });
  if (S.serps.length === 0) for (let i = 0; i < MAXS; i++) S.serps.push(mkSerp());

  const E = energy;
  const serps: Serp[] = S.serps;
  const sparks: Spark[] = S.sparks;

  // ── population tracks the music: 2 when calm, up to 7 when driving ───────
  const want = 2 + Math.round(E * (MAXS - 2));
  let alive = 0;
  for (let i = 0; i < MAXS; i++) if (serps[i].live && !serps[i].retiring) alive++;
  if (alive < want) {
    for (let i = 0; i < MAXS; i++) {
      const s = serps[i];
      if (s.live) continue;
      s.live = 1; s.fade = 0; s.retiring = 0;
      s.ang = Math.random() * Math.PI * 2;
      s.turn = 0;
      s.ph = Math.random() * 6.28;
      s.hue = Math.random();
      s.size = 0.7 + Math.random() * 0.7;
      s.shed = 0;
      const a2 = Math.random() * Math.PI * 2;
      const hx = cx + Math.cos(a2) * R * 0.3;
      const hy = cy + Math.sin(a2) * R * 0.28;
      const sp = R * 0.03;
      for (let k = 0; k < SEG; k++) {
        s.nx[k] = hx - Math.cos(s.ang) * sp * k;
        s.ny[k] = hy - Math.sin(s.ang) * sp * k;
      }
      break;
    }
  } else if (alive > want) {
    for (let i = MAXS - 1; i >= 0; i--) {
      if (serps[i].live && !serps[i].retiring) { serps[i].retiring = 1; break; }
    }
  }

  // ── motion constants: graceful cruise vs. violent whipping ───────────────
  const spacing = R * 0.03;
  const undF = 0.035 + E * 0.24;                       // undulation rate
  const undA = 0.018 + E * 0.115;                      // how hard it bends
  let spd = R * (0.0038 + E * 0.014) * cfg.speed * (1 + beatE * (0.4 + E * 1.8)) * fs;
  // clamped *after* the frame factor: the chain is stable per step taken, so the
  // limit belongs on the step this frame actually makes
  if (spd > spacing * 0.85) spd = spacing * 0.85;
  const bound = R * 0.5;

  for (let n = 0; n < MAXS; n++) {
    const s = serps[n];
    if (!s.live) continue;
    if (s.retiring) {
      s.fade -= 0.02 * fs;
      if (s.fade <= 0) { s.live = 0; s.fade = 0; s.retiring = 0; continue; }
    } else if (s.fade < 1) {
      s.fade = Math.min(1, s.fade + 0.02 * fs);
    }

    if (beat) s.turn += (Math.random() - 0.5) * (0.03 + E * 0.5) * I;
    s.ang += (Math.sin(vt * undF + s.ph) * undA + s.turn) * fs;
    s.turn *= dk(0.87, fs);

    // steer home so they never wander off-frame
    const dxc = cx - s.nx[0], dyc = cy - s.ny[0];
    const dc = Math.sqrt(dxc * dxc + dyc * dyc);
    if (dc > bound) {
      let da = Math.atan2(dyc, dxc) - s.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      s.ang += da * ak(Math.min(0.14, (dc / bound - 1) * 0.3), fs);
    }

    s.nx[0] += Math.cos(s.ang) * spd;
    s.ny[0] += Math.sin(s.ang) * spd;
    for (let i = 1; i < SEG; i++) {
      const dx = s.nx[i - 1] - s.nx[i], dy = s.ny[i - 1] - s.ny[i];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      s.nx[i] = s.nx[i - 1] - (dx / d) * spacing;
      s.ny[i] = s.ny[i - 1] - (dy / d) * spacing;
    }

    // shed motes off the tail — a trickle when calm, a burst on every beat
    s.shed -= fs;
    const burst = beat ? Math.round(2 + E * 7) : (s.shed <= 0 ? 1 : 0);
    if (burst > 0) {
      s.shed = Math.round(9 - E * 7);
      for (let k = 0; k < burst && sparks.length < MAXSP; k++) {
        const i = SEG - 1 - ((Math.random() * 6) | 0);
        sparks.push({
          x: s.nx[i], y: s.ny[i],
          vx: (Math.random() - 0.5) * R * 0.006 * (1 + E * 2),
          vy: (Math.random() - 0.5) * R * 0.006 * (1 + E * 2),
          a: 0.5 + Math.random() * 0.5,
          sz: (1 + Math.random() * 2.2) * s.size,
        });
      }
    }
  }

  // ── bodies: one gradient fill each, no shadowBlur on the fill ────────────
  const baseW = R * (0.024 + E * 0.014) * (1 + beatE * 0.55);
  for (let n = 0; n < MAXS; n++) {
    const s = serps[n];
    if (!s.live || s.fade <= 0) continue;
    const bw = baseW * s.size * s.fade;
    c.beginPath();
    for (let side = 0; side < 2; side++) {
      for (let q = 0; q < SEG; q++) {
        const i = side === 0 ? q : SEG - 1 - q;
        const ia = i > 0 ? i - 1 : 0;
        const ib = i < SEG - 1 ? i + 1 : SEG - 1;
        const dx = s.nx[ib] - s.nx[ia], dy = s.ny[ib] - s.ny[ia];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
        const t = i / (SEG - 1);
        const hw =
          bw * Math.pow(1 - t, 0.55) * Math.min(1, (i + 0.7) * 0.5) * (side === 0 ? 1 : -1);
        const px = s.nx[i] + (-dy / d) * hw;
        const py = s.ny[i] + (dx / d) * hw;
        if (side === 0 && q === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
    }
    c.closePath();
    const grad = c.createLinearGradient(s.nx[0], s.ny[0], s.nx[SEG - 1], s.ny[SEG - 1]);
    grad.addColorStop(0, CMix(s.hue, s.fade * (0.7 + beatE * 0.3), 80 + beatE * 10));
    grad.addColorStop(0.45, CMix((s.hue + 0.35) % 1, s.fade * (0.4 + midV * 0.2), 60));
    grad.addColorStop(1, CMix((s.hue + 0.7) % 1, s.fade * 0.1, 44));
    c.fillStyle = grad;
    c.fill();
  }

  // ── spines: one glow setup for all the creatures ─────────────────────────
  glow(Math.min(24, 11 * (1 + beatE * 0.9)), C1());
  for (let n = 0; n < MAXS; n++) {
    const s = serps[n];
    if (!s.live || s.fade <= 0) continue;
    c.beginPath();
    c.moveTo(s.nx[0], s.ny[0]);
    for (let i = 1; i < SEG; i++) c.lineTo(s.nx[i], s.ny[i]);
    c.strokeStyle = CMix(s.hue, s.fade * (0.45 + beatE * 0.4 + bassV * 0.15), 84);
    c.lineWidth = (0.9 + beatE * 1.6) * TK;
    c.stroke();
  }
  // heads
  for (let n = 0; n < MAXS; n++) {
    const s = serps[n];
    if (!s.live || s.fade <= 0) continue;
    c.fillStyle = C1(s.fade * (0.6 + beatE * 0.4), 92);
    c.beginPath();
    c.arc(s.nx[0], s.ny[0], baseW * s.size * 0.42 * s.fade, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();

  // ── shed motes: sprite blits, no per-particle blur ───────────────────────
  const spr = getSpark(C1(0.85, 78));
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.x += p.vx * cfg.speed * fs;
    p.y += p.vy * cfg.speed * fs;
    const drag = dk(0.97, fs);
    p.vx *= drag; p.vy *= drag;
    p.a *= dk(0.955 - E * 0.02, fs);
    if (p.a < 0.04) { sparks.splice(i, 1); continue; }
    const r = p.sz * (1 + beatE * 0.6) * TK * 2.6;
    c.globalAlpha = p.a;
    c.drawImage(spr, p.x - r, p.y - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;
};
