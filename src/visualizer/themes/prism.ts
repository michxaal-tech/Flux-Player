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
  // Widening wedge, but already broad where it leaves the crystal. A needle
  // tip left uncovered background between neighbouring rays, which read as a
  // black notch hugging the prism's flat edges.
  g.beginPath();
  g.moveTo(0, RH * 0.5 - 7);
  g.lineTo(RW, 0);
  g.lineTo(RW, RH);
  g.lineTo(0, RH * 0.5 + 7);
  g.closePath();
  g.fill();
  // Fade the inner end *without narrowing it*. Every ray of every beam starts
  // at the same place, so a wedge that is full brightness where it leaves the
  // crystal means dozens of them summing on one spot — that pile-up, not the
  // core glow, is what turned the middle into a white disc. The width has to
  // stay: a needle tip is what left a black notch against the flat edges.
  g.globalCompositeOperation = "destination-out";
  const fade = g.createLinearGradient(0, 0, RW * 0.34, 0);
  fade.addColorStop(0, "rgba(0,0,0,0.82)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, RW * 0.34, RH);
  g.globalCompositeOperation = "source-over";
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
  c, w, h, cx, cy, R, vt, beat, beatE, energy, dropE, hit, hitE, cfg, bassV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.prism ??= {
    beams: [] as Beam[],
    shards: [] as Shard[],
    rot: 0,
    flash: 0,
    drift: 0,
    /** rings thrown off the crystal when a drop lands */
    waves: [] as number[],
    /** latches high through a drop so the aftermath keeps burning */
    burn: 0,
  });

  const beams: Beam[] = S.beams;
  const shards: Shard[] = S.shards;
  if (beams.length === 0) beams.push({ ang: 0, ph: 0, life: 0, a: 1 });

  // ── the drop ──────────────────────────────────────────────────────────────
  // D drives everything below: the crystal is overdriven rather than merely
  // brighter — it spins up hard, splits into the full beam count, sweeps the
  // whole 360°, and throws shockwaves. `burn` decays slowly so the aftermath
  // keeps glowing instead of snapping back the instant the envelope falls.
  const D = dropE;
  S.burn = Math.max(S.burn * 0.965, D);
  const B = S.burn;
  // energy is bumped by the drop so every existing energy-driven term escalates
  const E = Math.min(1.6, energy + D * 0.85);

  // ── prism spin: a lazy turn when calm, a blur when driving ────────────────
  S.rot += (0.0035 + E * 0.055 + beatE * 0.05 * E + D * D * 0.42) * cfg.speed;
  S.drift += (0.0012 + E * 0.006 + D * 0.03) * cfg.speed;
  S.flash *= 0.88;
  if (D > 0.5 && S.waves.length < 5 && (vt | 0) % 9 === 0) S.waves.push(0);
  for (let i = S.waves.length - 1; i >= 0; i--) {
    S.waves[i] += (0.014 + D * 0.03) * cfg.speed;
    if (S.waves[i] > 1) S.waves.splice(i, 1);
  }

  // ── beat fractures the input beam into splinters ──────────────────────────
  // during a drop every percussive hit counts, not just the tempo grid
  if (beat || (D > 0.25 && hit)) {
    S.flash = Math.min(1, S.flash + 0.45 + E * 0.5 + D * 0.6);
    const want = 1 + Math.round(Math.min(1, E + D) * (MAX_BEAMS - 1));
    while (beams.length < want) {
      beams.push({
        ang: (Math.random() - 0.5) * (0.7 + E * 2.4),
        ph: Math.random() * 6.28,
        life: 26 + Math.random() * 40,
        a: 0.5 + Math.random() * 0.5,
      });
    }
    // glass debris off the crystal faces
    const n = Math.min(Math.round((4 + E * 16 + bassV * 8) * I), MAX_SHARDS - shards.length);
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
  // the crystal swells and jitters through the drop
  const pr = R * (0.13 + bassV * 0.03) * (1 + beatE * 0.12 + B * 0.42 + hitE * D * 0.16);
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
  c.strokeStyle = C1(0.12 + beatE * 0.16 + S.flash * 0.1, 68);
  c.lineWidth = (1.4 + beatE * 2.2 + E * 1.2) * TK;
  c.stroke();
  noGlow();
  c.lineCap = "butt";

  // ── refracted spectrum fans ───────────────────────────────────────────────
  // Sprite keys are quantised so the wedges are only re-rendered when the
  // palette or the overall mood actually shifts.
  // Alphas stay low on purpose: the fan barely moves in a calm passage, and
  // additive paint over a slow trail buffer clips to white if it is not kept
  // well under the per-frame trail fade.
  const baseL = Math.round((52 + E * 12 + beatE * 8) / 6) * 6;   // <= 72
  const baseA = Math.round((0.07 + E * 0.045) * 40) / 40;
  const key = baseL + ":" + baseA + ":" + C1(1, 50) + C2(1, 50);
  for (let k = 0; k < BANDS; k++) {
    getRay(k, CMix(k / (BANDS - 1), baseA, baseL), key + k);
  }

  // at full drop the fan opens all the way round, so the prism stops being a
  // beam-splitter and becomes a star burning in every direction at once
  const spread = 0.42 + E * 1.35 + D * 4.4;
  // strobing/jitter only really bites at high energy
  const shatter = Math.min(1.3, E * E * I);
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    const wob = Math.sin(vt * (0.01 + E * 0.05) + b.ph) * (0.03 + E * 0.22);
    const exit = b.ang + wob + S.drift * 0.35 + Math.sin(S.rot) * (0.12 + E * 0.5);
    for (let k = 0; k < BANDS; k++) {
      const f = k / (BANDS - 1);
      const jit = shatter * Math.sin(vt * (0.09 + f * 0.05) + k * 2.1 + b.ph) * 0.42;
      const a2 = exit + (f - 0.5) * spread + jit;
      const strobe = 1 - shatter * 0.55 * (0.5 + 0.5 * Math.sin(vt * 0.55 + k * 1.7));
      const len = rayLen * (0.55 + f * 0.3) * (1 + beatE * 0.25 + B * 0.7);
      const halfW = R * (0.035 + E * 0.05) * (1 + beatE * 0.5 + B * 0.8);
      c.globalAlpha = Math.min(0.19, b.a * (0.1 + trebV * 0.06 + beatE * 0.09 + B * 0.13) * strobe);
      c.save();
      // originate *inside* the crystal: the triangle's flat edges sit at
      // 0.5·pr while its corners reach pr, so any origin outside that leaves a
      // visible gap along the edges
      c.translate(px + Math.cos(a2) * pr * 0.22, py + Math.sin(a2) * pr * 0.22);
      c.rotate(a2);
      c.drawImage(raySprites[k], 0, -halfW, len, halfW * 2);
      c.restore();
    }
  }
  c.globalAlpha = 1;

  // ── core glow ─────────────────────────────────────────────────────────────
  // Painted between the rays and the crystal so the hand-off is a bloom rather
  // than a seam. Without it the flat edges of the triangle sit against bare
  // background wherever the fan happens not to point.
  {
    const gr = pr * (1.7 + beatE * 0.3 + B * 0.9);
    const cg2 = c.createRadialGradient(px, py, 0, px, py, gr);
    // kept under saturation on purpose: additive over the ray fan, a hotter
    // core clips to flat white and the crystal loses its colour entirely
    // Alphas kept low because this is the one part of the theme that never
    // moves, and a stationary element is multiplied by the trail — about 4.7x
    // at the default TRAILS. What reads as reasonable in a single frame is a
    // blinding white core a second later.
    cg2.addColorStop(0, C1(0.055 + S.flash * 0.05 + B * 0.05, 60));
    cg2.addColorStop(0.35, CMix(0.5, 0.03 + B * 0.045, 52));
    cg2.addColorStop(1, "transparent");
    c.fillStyle = cg2;
    c.beginPath();
    c.arc(px, py, gr, 0, Math.PI * 2);
    c.fill();
  }

  // ── drop shockwaves ───────────────────────────────────────────────────────
  if (S.waves.length) {
    c.save();
    glow(Math.min(24, 10 + B * 16), C2());
    for (const rr of S.waves) {
      const a3 = (1 - rr) ** 2 * (0.5 + B * 0.5);
      c.strokeStyle = CMix(rr, a3 * 0.75, 70);
      c.lineWidth = (1.5 + (1 - rr) * 5) * TK;
      c.beginPath();
      c.arc(px, py, rr * Math.hypot(w, h) * 0.55, 0, Math.PI * 2);
      c.stroke();
    }
    noGlow();
    c.restore();
  }

  // ── the crystal itself ────────────────────────────────────────────────────
  const faces = 3;
  c.save();
  c.translate(px, py);
  c.rotate(S.rot);
  const cg = c.createRadialGradient(0, 0, 0, 0, 0, pr);
  cg.addColorStop(0, C1(0.13 + S.flash * 0.16, 64));
  cg.addColorStop(0.6, C2(0.08, 44));
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
  c.strokeStyle = C2(0.26 + beatE * 0.22, 64);
  c.lineWidth = (1.2 + beatE * 1.6) * TK;
  c.stroke();
  // internal creases catching the light
  c.beginPath();
  for (let i = 0; i < faces; i++) {
    const a2 = (i / faces) * Math.PI * 2 - Math.PI / 2;
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a2) * pr, Math.sin(a2) * pr);
  }
  c.strokeStyle = C1(0.13 + E * 0.12, 60);
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
      c.fillStyle = CMix(t / (SHARD_TIERS - 1), 0.22 + beatE * 0.18, 60 + E * 8);
      c.fill();
    }
  }

  // ── impact bloom at the prism on a hit ────────────────────────────────────
  if (S.flash > 0.04) {
    const fg = c.createRadialGradient(px, py, 0, px, py, pr * (2.4 + S.flash * 2));
    fg.addColorStop(0, C1(S.flash * 0.26, 70));
    fg.addColorStop(0.45, C2(S.flash * 0.16, 56));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(px, py, pr * (2.4 + S.flash * 2), 0, Math.PI * 2);
    c.fill();
  }
};
