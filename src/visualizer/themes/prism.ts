import type { ThemeDraw } from "../themeTypes";

interface Beam {
  /** incoming angle (direction the light travels toward the prism) */
  ang: number;
  /** wobble phase */
  ph: number;
  /** 0 = permanent carrier beam, >0 = beat-spawned splinter that expires */
  life: number;
  /** brightness 0..1 */
  a: number;
}
interface Shard {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; a: number; sz: number;
  /** spectrum tier, also the batching key */
  tr: number;
}

const BANDS = 12;        // spectrum rays fanned out of each beam
const MAX_BEAMS = 6;     // hard cap on simultaneous incoming beams
const MAX_SHARDS = 90;   // hard cap on glass debris
const SHARD_TIERS = 4;

// Pre-rendered ray wedges: one sprite per spectrum band, redrawn only when the
// palette/mood key changes. Up to 6*12 = 72 rays are drawn per frame, so a
// shadowBlur'd stroke per ray would be unaffordable — these are plain
// drawImage calls with a baked-in gradient falloff.
const raySprites: HTMLCanvasElement[] = [];
const rayKeys: string[] = [];
const RW = 160, RH = 40;
function getRay(i: number, color: string, key: string): HTMLCanvasElement {
  let cv = raySprites[i];
  if (cv && rayKeys[i] === key) return cv;
  cv = cv ?? document.createElement("canvas");
  cv.width = RW; cv.height = RH;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, RW, RH);
  const lg = g.createLinearGradient(0, 0, RW, 0);
  lg.addColorStop(0, color);
  lg.addColorStop(0.45, color);
  lg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = lg;
  // widening wedge: narrow at the prism, splayed at the far end
  g.beginPath();
  g.moveTo(0, RH * 0.5 - 1.4);
  g.lineTo(RW, 0);
  g.lineTo(RW, RH);
  g.lineTo(0, RH * 0.5 + 1.4);
  g.closePath();
  g.fill();
  raySprites[i] = cv;
  rayKeys[i] = key;
  return cv;
}

// A beam of light refracting through a spinning crystal prism. In a calm
// passage a single steady shaft feeds a slowly turning prism and the spectrum
// leaves it as one wide, quiet fan. As the music drives, the prism spins up,
// every beat fractures the input into extra splayed beams, and each fan
// shatters into strobing, jittering rays that spray the whole screen.
export const PRISM: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.prism ??= {
    beams: [] as Beam[],
    shards: [] as Shard[],
    rot: 0,
    flash: 0,
    drift: 0,
  });

  const beams: Beam[] = S.beams;
  const shards: Shard[] = S.shards;
  if (beams.length === 0) beams.push({ ang: 0, ph: 0, life: 0, a: 1 });

  const E = energy;

  // ── prism spin: a lazy turn when calm, a blur when driving ────────────────
  S.rot += (0.0035 + E * 0.055 + beatE * 0.05 * E) * cfg.speed;
  S.drift += (0.0012 + E * 0.006) * cfg.speed;
  S.flash *= 0.88;

  // ── beat fractures the input beam into splinters ──────────────────────────
  if (beat) {
    S.flash = Math.min(1, S.flash + 0.45 + E * 0.5);
    const want = 1 + Math.round(E * (MAX_BEAMS - 1));
    while (beams.length < want) {
      beams.push({
        ang: (Math.random() - 0.5) * (0.7 + E * 2.4),
        ph: Math.random() * 6.28,
        life: 26 + Math.random() * 40,
        a: 0.5 + Math.random() * 0.5,
      });
    }
    // glass debris off the crystal faces
    const n = Math.min(Math.round(4 + E * 16 + bassV * 8), MAX_SHARDS - shards.length);
    for (let k = 0; k < n; k++) {
      const a2 = Math.random() * Math.PI * 2;
      const sp = R * (0.004 + Math.random() * 0.012) * (0.5 + E);
      shards.push({
        x: cx + Math.cos(a2) * R * 0.15,
        y: cy + Math.sin(a2) * R * 0.15,
        vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
        rot: a2, vr: (Math.random() - 0.5) * 0.24,
        a: 0.7 + Math.random() * 0.3,
        sz: R * (0.008 + Math.random() * 0.016),
        tr: (Math.random() * SHARD_TIERS) | 0,
      });
    }
  }

  for (let i = beams.length - 1; i >= 1; i--) {
    const b = beams[i];
    b.life -= 1 + E * 0.6;
    b.a *= 0.975;
    if (b.life <= 0 || b.a < 0.06) beams.splice(i, 1);
  }
  // splinters die off fast once the music calms down
  if (beams.length > 1 + Math.round(E * (MAX_BEAMS - 1))) beams[beams.length - 1].life -= 6;

  const px = cx, py = cy;                       // prism sits at frame centre
  const pr = R * (0.13 + bassV * 0.03) * (1 + beatE * 0.12);
  const rayLen = Math.hypot(w, h) * 0.62;
  const inLen = Math.max(w, h) * 0.62;

  // ── incoming shafts: one batched, glowing stroke for all of them ──────────
  c.lineCap = "round";
  glow(Math.min(26, 12 + beatE * 10 + E * 6), C1());
  c.beginPath();
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    const wob = Math.sin(vt * (0.01 + E * 0.05) + b.ph) * (0.03 + E * 0.22);
    const ang = Math.PI + b.ang + wob + S.drift * 0.35;
    c.moveTo(px + Math.cos(ang) * inLen, py + Math.sin(ang) * inLen);
    c.lineTo(px + Math.cos(ang) * pr * 0.9, py + Math.sin(ang) * pr * 0.9);
  }
  c.strokeStyle = C1(0.2 + beatE * 0.18 + S.flash * 0.12, 70);
  c.lineWidth = (1.4 + beatE * 2.2 + E * 1.2) * TK;
  c.stroke();
  noGlow();
  c.lineCap = "butt";

  // ── refracted spectrum fans ───────────────────────────────────────────────
  // Sprite keys are quantised so the wedges are only re-rendered when the
  // palette or the overall mood actually shifts.
  const baseL = Math.round((52 + E * 12 + beatE * 8) / 6) * 6;   // <= 72
  const baseA = Math.round((0.3 + E * 0.16) * 20) / 20;
  const key = baseL + ":" + baseA + ":" + C1(1, 50) + C2(1, 50);
  for (let k = 0; k < BANDS; k++) {
    getRay(k, CMix(k / (BANDS - 1), baseA, baseL), key + k);
  }

  const spread = 0.42 + E * 1.35;
  const shatter = E * E;   // strobing/jitter only really bites at high energy
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    const wob = Math.sin(vt * (0.01 + E * 0.05) + b.ph) * (0.03 + E * 0.22);
    const exit = b.ang + wob + S.drift * 0.35 + Math.sin(S.rot) * (0.12 + E * 0.5);
    for (let k = 0; k < BANDS; k++) {
      const f = k / (BANDS - 1);
      const jit = shatter * Math.sin(vt * (0.09 + f * 0.05) + k * 2.1 + b.ph) * 0.42;
      const a2 = exit + (f - 0.5) * spread + jit;
      const strobe = 1 - shatter * 0.55 * (0.5 + 0.5 * Math.sin(vt * 0.55 + k * 1.7));
      const len = rayLen * (0.55 + f * 0.3) * (1 + beatE * 0.25);
      const halfW = R * (0.035 + E * 0.05) * (1 + beatE * 0.5);
      c.globalAlpha = Math.min(0.55, b.a * (0.42 + trebV * 0.2 + beatE * 0.25) * strobe);
      c.save();
      c.translate(px + Math.cos(a2) * pr * 0.75, py + Math.sin(a2) * pr * 0.75);
      c.rotate(a2);
      c.drawImage(raySprites[k], 0, -halfW, len, halfW * 2);
      c.restore();
    }
  }
  c.globalAlpha = 1;

  // ── the crystal itself ────────────────────────────────────────────────────
  const faces = 3;
  c.save();
  c.translate(px, py);
  c.rotate(S.rot);
  const cg = c.createRadialGradient(0, 0, 0, 0, 0, pr);
  cg.addColorStop(0, C1(0.24 + S.flash * 0.2, 68));
  cg.addColorStop(0.6, C2(0.12, 46));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  for (let i = 0; i <= faces; i++) {
    const a2 = (i / faces) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a2) * pr, y = Math.sin(a2) * pr;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
  glow(Math.min(22, 10 + beatE * 10), C2());
  c.strokeStyle = C2(0.42 + beatE * 0.25, 66);
  c.lineWidth = (1.2 + beatE * 1.6) * TK;
  c.stroke();
  // internal creases catching the light
  c.beginPath();
  for (let i = 0; i < faces; i++) {
    const a2 = (i / faces) * Math.PI * 2 - Math.PI / 2;
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a2) * pr, Math.sin(a2) * pr);
  }
  c.strokeStyle = C1(0.2 + E * 0.16, 62);
  c.lineWidth = 0.8 * TK;
  c.stroke();
  noGlow();
  c.restore();

  // ── glass shards, batched into one fill per spectrum tier ─────────────────
  if (shards.length) {
    const grav = R * 0.00018;
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.x += s.vx * cfg.speed; s.y += s.vy * cfg.speed;
      s.vy += grav;
      s.rot += s.vr;
      s.a *= 0.955 - E * 0.012;
      if (s.a < 0.05) shards.splice(i, 1);
    }
    for (let t = 0; t < SHARD_TIERS; t++) {
      let any = false;
      c.beginPath();
      for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        if (s.tr !== t) continue;
        const sz = s.sz * (1 + beatE * 0.3) * TK;
        const c0 = Math.cos(s.rot), s0 = Math.sin(s.rot);
        c.moveTo(s.x + c0 * sz, s.y + s0 * sz);
        c.lineTo(s.x - s0 * sz * 0.7, s.y + c0 * sz * 0.7);
        c.lineTo(s.x - c0 * sz * 0.5, s.y - s0 * sz * 0.5);
        c.closePath();
        any = true;
      }
      if (!any) continue;
      c.fillStyle = CMix(t / (SHARD_TIERS - 1), 0.3 + beatE * 0.2, 62 + E * 8);
      c.fill();
    }
  }

  // ── impact bloom at the prism on a hit ────────────────────────────────────
  if (S.flash > 0.04) {
    const fg = c.createRadialGradient(px, py, 0, px, py, pr * (2.4 + S.flash * 2));
    fg.addColorStop(0, C1(S.flash * 0.34, 74));
    fg.addColorStop(0.45, C2(S.flash * 0.2, 58));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(px, py, pr * (2.4 + S.flash * 2), 0, Math.PI * 2);
    c.fill();
  }
};
