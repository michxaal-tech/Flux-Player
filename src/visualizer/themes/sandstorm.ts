import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface Grain {
  x: number; y: number;
  vx: number; vy: number;
  /** alpha, <= 0 means the slot is free; also the batching key */ a: number;
  /** streak length multiplier */ len: number;
}
interface Devil {
  x: number; y: number;
  /** vortex radius */ r: number;
  /** swirl phase */ ph: number;
  /** strength 0..1 */ s: number;
  vx: number;
}

const MAX_GRAINS = 400;   // hard-capped pool, recycled — never grows
const TIERS = 4;          // brightness buckets → 4 batched strokes for all the sand
const MAX_DEVILS = 3;
const LAYERS = 4;         // dune ridges
const SEGS = 88;          // fixed ridge resolution at any canvas size
const DEVIL_SEGS = 26;

// A desert under wind. Dune ridges march across the frame and sand peels off
// their crests in sheets. In a calm passage the air is almost still: soft
// rounded dunes, slow ripples crawling along the ridges, a thin veil of grains
// drifting sideways. When the music drives it becomes a whiteout — the ridges
// reshape faster than they can settle, the sand turns into dense driving
// streaks, and dust devils tear across the screen dragging grains into their
// vortices. Beats arrive as gusts that punch a fresh sheet off every crest.
export const SANDSTORM: ThemeDraw = ({
  c, w, h, R, fs, vt, beat, beatE, energy, cfg, bassV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.sandstorm ??= {
    grains: [] as Grain[],
    devils: [] as Devil[],
    head: 0,
    gust: 0,
    ph: 0,
    haze: 0,
  });

  const grains: Grain[] = S.grains;
  const devils: Devil[] = S.devils;
  if (grains.length === 0) {
    for (let i = 0; i < MAX_GRAINS; i++) {
      grains.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0, len: 1 });
    }
  }

  const E = energy;
  const wind = R * (0.0018 + E * 0.026) * cfg.speed * (1 + beatE * 0.5 * E);
  S.gust += ((0.2 + E * 1.4 + beatE * 1.1 * E) - S.gust) * ak(0.08, fs);
  S.ph += (0.004 + E * 0.05) * cfg.speed * fs; // how fast the dunes reshape
  S.haze += ((E * E) - S.haze) * ak(0.03, fs);

  // ── dune ridges — a painted scene, never additive ─────────────────────────
  c.globalCompositeOperation = "source-over";

  const ridgeY = (x: number, f: number, baseY: number, amp: number) => {
    const k = x / (w || 1);
    return (
      baseY -
      Math.sin(k * 6.1 + S.ph * (1 + f) + f * 2.3) * amp -
      Math.sin(k * 13.7 - S.ph * 1.7 + f * 4.1) * amp * 0.42 -
      Math.sin(k * 27.3 + S.ph * 2.9) * amp * 0.16 * (0.3 + E)
    );
  };

  const STEP = w / SEGS;
  for (let ly = 0; ly < LAYERS; ly++) {
    const f = ly / (LAYERS - 1);                  // 0 far … 1 near
    const baseY = h * (0.42 + f * 0.24);
    const amp = h * (0.035 + f * 0.06) * (0.7 + bassV * 0.8 + E * 0.7);
    c.beginPath();
    c.moveTo(0, h);
    for (let i = 0; i <= SEGS; i++) c.lineTo(i * STEP, ridgeY(i * STEP, f, baseY, amp));
    c.lineTo(w, h);
    c.closePath();
    const g = c.createLinearGradient(0, baseY - amp * 1.4, 0, h);
    g.addColorStop(0, CMix(f * 0.7, 0.62 + E * 0.1, 40 + f * 12 + beatE * 6));
    g.addColorStop(1, CMix(1 - f, 0.85, 10 + f * 6));
    c.fillStyle = g;
    c.fill();

    // wind-lit crest line
    c.beginPath();
    for (let i = 0; i <= SEGS; i++) {
      const x = i * STEP, y = ridgeY(x, f, baseY, amp);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = CMix(f, 0.28 + E * 0.2 + beatE * 0.25, 58 + f * 10);
    c.lineWidth = (0.9 + f * 1.2 + beatE * 1.4) * TK;
    glow(Math.min(20, (6 + f * 6) * (1 + beatE * 0.8)), C1());
    c.stroke();
  }
  noGlow();

  // ── dust devils ───────────────────────────────────────────────────────────
  const wantDevils = Math.min(MAX_DEVILS, Math.round(E * E * 3.4));
  if (devils.length < wantDevils && (beat || devils.length === 0)) {
    devils.push({
      x: Math.random() < 0.5 ? -R * 0.15 : w + R * 0.15,
      y: h * (0.42 + Math.random() * 0.3),
      r: R * (0.08 + Math.random() * 0.12),
      ph: Math.random() * 6.28,
      s: 0.1,
      vx: (Math.random() < 0.5 ? 1 : -1) * R * (0.002 + Math.random() * 0.004),
    });
  }
  for (let i = devils.length - 1; i >= 0; i--) {
    const d = devils[i];
    const alive = i < wantDevils;
    d.s += ((alive ? 1 : 0) - d.s) * ak(0.035, fs);
    d.ph += (0.05 + E * 0.22) * cfg.speed * fs;
    d.x += d.vx * (0.6 + E * 2.6) * cfg.speed * fs;
    d.y += Math.sin(d.ph * 0.3) * R * 0.0015 * fs;
    if (d.s < 0.03 || d.x < -R * 0.5 || d.x > w + R * 0.5) { devils.splice(i, 1); continue; }
  }

  // ── sand: recycle the pool, spawn off the crests ──────────────────────────
  const spawn = (x: number, y: number, force: number) => {
    const g = grains[S.head];
    S.head = (S.head + 1) % MAX_GRAINS;
    g.x = x; g.y = y;
    g.vx = wind * (0.7 + Math.random() * 0.9) * force;
    g.vy = -Math.random() * wind * (0.2 + E * 0.5) - R * 0.0004;
    g.a = 0.35 + Math.random() * 0.65;
    g.len = 0.6 + Math.random() * 1.2;
  };

  const perFrame = Math.round(2 + E * 14);
  for (let k = 0; k < perFrame; k++) {
    const f = Math.random();
    const x = Math.random() * w;
    const baseY = h * (0.42 + f * 0.24);
    const amp = h * (0.035 + f * 0.06) * (0.7 + bassV * 0.8 + E * 0.7);
    spawn(x, ridgeY(x, f, baseY, amp) - R * 0.006, 1);
  }
  if (beat) {
    // a gust rips a whole sheet off the crests
    const n = Math.round(8 + E * 60 + bassV * 20);
    for (let k = 0; k < n; k++) {
      const f = Math.random();
      const x = Math.random() * w;
      const baseY = h * (0.42 + f * 0.24);
      const amp = h * (0.035 + f * 0.06) * (0.7 + bassV * 0.8 + E * 0.7);
      spawn(x, ridgeY(x, f, baseY, amp) - R * 0.01, 1.4 + E * 1.2);
    }
  }

  const drag = dk(0.965 + E * 0.026, fs);
  const turb = R * (0.00035 + E * 0.0022) * I * fs;   // an acceleration per frame
  const fade = dk(0.988 - E * 0.006, fs);
  const windK = ak(0.03, fs);
  const swirl = R * 0.02 * fs, inward = R * 0.004 * fs;
  for (let i = 0; i < MAX_GRAINS; i++) {
    const g = grains[i];
    if (g.a <= 0.02) continue;
    g.vx += (wind - g.vx) * windK;
    const n =
      Math.sin(g.y * 0.02 + vt * 0.03) * turb +
      Math.cos(g.x * 0.013 - vt * 0.021) * turb;
    g.vy += n * 0.9 - R * 0.00012 * fs;
    g.vx += n * 0.4;

    for (let q = 0; q < devils.length; q++) {
      const d = devils[q];
      const dx = g.x - d.x, dy = g.y - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      if (dist > d.r * 2.6) continue;
      const pull = d.s * (1 - dist / (d.r * 2.6));
      // tangential swirl + a little inward pull
      g.vx += (-dy / dist) * pull * swirl - (dx / dist) * pull * inward;
      g.vy += (dx / dist) * pull * swirl - (dy / dist) * pull * inward;
    }

    g.vx *= drag; g.vy *= drag;
    g.x += g.vx * fs; g.y += g.vy * fs;
    g.a *= fade;
    if (g.x < -R * 0.12) g.x = w + R * 0.1;
    else if (g.x > w + R * 0.12) g.x = -R * 0.1;
    if (g.y > h + R * 0.1 || g.y < -R * 0.2) g.a = 0;
  }

  // ── draw the sand: TIERS batched strokes, no per-grain glow ───────────────
  // grains are bucketed by their own alpha, so a dying grain slides down the
  // buckets and fades out instead of popping
  c.lineCap = "round";
  for (let t = 0; t < TIERS; t++) {
    const tf = t / (TIERS - 1);
    let any = false;
    c.beginPath();
    for (let i = 0; i < MAX_GRAINS; i++) {
      const g = grains[i];
      if (g.a <= 0.02) continue;
      let bk = (g.a * TIERS) | 0;
      if (bk > TIERS - 1) bk = TIERS - 1;
      if (bk !== t) continue;
      const st = (1.5 + E * 6) * g.len;
      c.moveTo(g.x, g.y);
      c.lineTo(g.x - g.vx * st, g.y - g.vy * st);
      any = true;
    }
    if (!any) continue;
    c.strokeStyle = CMix(tf, 0.1 + tf * 0.24 + E * 0.14 + beatE * 0.1, 50 + tf * 18 + trebV * 6);
    c.lineWidth = (0.5 + tf * 1.1) * TK;
    c.stroke();
  }
  c.lineCap = "butt";

  // ── vortex funnels drawn over the sand ────────────────────────────────────
  if (devils.length) {
    glow(Math.min(18, 8 + beatE * 8), C2());
    for (let q = 0; q < devils.length; q++) {
      const d = devils[q];
      c.beginPath();
      for (let k = 0; k <= DEVIL_SEGS; k++) {
        const t = k / DEVIL_SEGS;
        const a = d.ph + t * (7 + E * 8);
        const rr = d.r * (0.15 + t * 0.95);
        const x = d.x + Math.cos(a) * rr;
        const y = d.y - t * d.r * (2.4 + E * 1.4) + Math.sin(a) * rr * 0.3;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = C2(d.s * (0.2 + E * 0.22 + beatE * 0.18), 60);
      c.lineWidth = (1 + E * 1.6) * TK;
      c.stroke();
    }
    noGlow();
  }

  // ── whiteout veil: only bites in the loudest passages ─────────────────────
  if (S.haze > 0.05) {
    const a = Math.min(0.08, S.haze * 0.09 + beatE * 0.015);
    const vg = c.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, C1(a, 50));
    vg.addColorStop(0.55, CMix(0.5, a * 0.7, 44));
    vg.addColorStop(1, "transparent");
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }
};
