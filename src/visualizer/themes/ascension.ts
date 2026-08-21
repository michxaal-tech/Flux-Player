import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

/** drifting background star, positions in 0..1 space so resizes never jolt it */
interface Star { x: number; y: number; z: number; ph: number }
/** layer-2 meteor: a falling head with a motion trail (inverted during the rush) */
interface Rain { x: number; y: number; vx: number; vy: number; a: number; z: number }
/** drop-only vertical light beam */
interface Pillar { x: number; a: number; wd: number }
/** drop-only shockwave ring */
interface Ring { r: number; a: number }

const STARS = 300;        // hard cap — identical cost on a phone and a 5K display
const RAIN_MAX = 130;
const PILLAR_MAX = 9;
const RING_MAX = 4;
const TIERS = 3;          // depth tiers → 3 batched fills for the whole starfield
const RIB_SEGS = 26;      // aurora ribbon sample count, fixed

const cl01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0); // also maps NaN → 0
const sstep = (a: number, b: number, x: number) => {
  const d = b - a;
  let u = d > 1e-6 ? (x - a) / d : x >= b ? 1 : 0;
  u = u > 0 ? (u < 1 ? u : 1) : 0;
  return u * u * (3 - 2 * u);
};

// Pre-rendered meteor head. One drawImage per particle is far cheaper than a
// shadowBlur'd arc, and there can be 130 in flight during the rush.
let headCv: HTMLCanvasElement | null = null;
let headKey = "";
function headSprite(color: string): HTMLCanvasElement {
  if (headCv && headKey === color) return headCv;
  headKey = color;
  const cv = headCv ?? document.createElement("canvas");
  cv.width = cv.height = 40;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 40, 40);
  const rg = g.createRadialGradient(20, 20, 0, 20, 20, 20);
  rg.addColorStop(0, "rgba(255,255,255,0.85)");
  rg.addColorStop(0.32, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 40, 40);
  headCv = cv;
  return cv;
}

/**
 * ASCENSION — a staged night sky.
 *
 * Stage 1 (any energy): a calm starfield drifting upward, nothing else.
 * Stage 2 (mid energy): meteors begin raining down with long trails.
 * Stage 3 (treble/vocals): aurora ribbons unfurl across the top of the sky.
 * Drop: `dropE` rising darkens the sky and drags the stars into a gathering
 * crawl; at its peak the whole field inverts — the rain reverses and everything
 * tears upward through a shockwave while light pillars stand up off the horizon.
 * `section` re-seeds the sky, tilts the drift and moves the palette so the piece
 * doesn't look the same in the second half as it did in the first.
 */
export const ASCENSION: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, vt, beat, beatE, hit, hitE, energy, dropE, section,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.ascension ??= {
    stars: [] as Star[],
    rain: [] as Rain[],
    pillars: [] as Pillar[],
    rings: [] as Ring[],
    w2: 0, w3: 0,          // smoothed layer weights, 0..1
    charge: 0, rush: 0, flash: 0,
    prevD: 0, cool: 0, acc: 0,
    sec: -1, tilt: 0, pal: 0, ribs: 3,
  });

  const stars: Star[] = S.stars;
  const rain: Rain[] = S.rain;
  const pillars: Pillar[] = S.pillars;
  const rings: Ring[] = S.rings;

  if (stars.length === 0) {
    for (let i = 0; i < STARS; i++) {
      stars.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.999, ph: Math.random() * 6.283 });
    }
  }

  const spd = cfg.speed;
  const E = cl01(energy);
  const D = cl01(dropE);
  const BE = cl01(beatE);
  const HE = cl01(hitE);
  const sec = section | 0;

  // ── section change: new sky, new drift, new palette position ──────────────
  if (S.sec !== sec) {
    S.sec = sec;
    S.pal = (sec % 5) / 5;
    S.tilt = ((sec % 3) - 1) * 0.4;
    S.ribs = 2 + (sec % 3);
    for (let i = 0; i < STARS; i += 2) {           // re-seed half the field
      stars[i].x = Math.random();
      stars[i].y = Math.random();
      stars[i].ph = Math.random() * 6.283;
    }
  }
  const P = S.pal;

  // ── layer weights: smoothstep windows + inertia, so nothing flickers on ───
  const t2 = Math.max(sstep(0.24, 0.46, E), sstep(0.3, 0.6, cl01(midV)) * 0.85);
  const t3 = Math.max(sstep(0.5, 0.74, E), sstep(0.42, 0.78, cl01(trebV)) * 0.9);
  S.w2 += (t2 - S.w2) * ak(0.035, fs);
  S.w3 += (t3 - S.w3) * ak(0.03, fs);
  const W2 = cl01(S.w2);
  const W3 = cl01(S.w3);

  // ── drop: charge while dropE climbs, detonate on its peak ─────────────────
  S.charge += (D - S.charge) * ak(0.12, fs);
  const CH = cl01(S.charge);
  S.cool -= fs;
  if (D > 0.5 && D < S.prevD - 0.004 && S.cool <= 0) {
    S.cool = 70;
    S.rush = 1;
    S.flash = 1;
    if (rings.length < RING_MAX) rings.push({ r: R * 0.04, a: 0.9 });
    const np = Math.min(PILLAR_MAX - pillars.length, 5 + ((Math.random() * 3) | 0));
    for (let i = 0; i < np; i++) {
      pillars.push({ x: 0.08 + Math.random() * 0.84, a: 0.75 + Math.random() * 0.25, wd: 0.012 + Math.random() * 0.03 });
    }
    // the field inverts: everything that was falling is thrown upward
    for (let i = 0; i < rain.length; i++) {
      const p = rain[i];
      p.vy = -Math.abs(p.vy) * (2.4 + Math.random() * 2.6);
      p.vx *= 0.3;
      p.a = 1;
    }
  }
  S.prevD = D;
  S.rush *= dk(0.955, fs);
  S.flash *= dk(0.9, fs);
  const RU = cl01(S.rush);
  const FL = cl01(S.flash);

  // ── sky wash (source-over: painting the scene, never additively) ──────────
  c.globalCompositeOperation = "source-over";
  const sky = c.createLinearGradient(0, 0, 0, h);
  const dark = 1 - CH * 0.55;                       // the sky drains as tension builds
  sky.addColorStop(0, CMix(P, (0.16 + CH * 0.16) * (0.5 + I * 0.5), (10 + E * 5) * dark));
  sky.addColorStop(0.55, CMix(1 - P, (0.12 + CH * 0.14) * (0.5 + I * 0.5), (6 + RU * 10) * dark));
  sky.addColorStop(1, CMix(P, (0.18 + RU * 0.2) * (0.5 + I * 0.5), (4 + RU * 22 + FL * 14) * dark));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // ── STAGE 1: the starfield ────────────────────────────────────────────────
  const drift = (0.00042 + E * 0.0007) * spd * (1 + CH * 2.2 + RU * 16) * fs;
  const sway = S.tilt * 0.0002 * spd * fs;
  const streaky = RU > 0.02 || CH > 0.35;
  const stretch = h * (0.004 + CH * 0.03 + RU * 0.5);

  for (let i = 0; i < STARS; i++) {
    const s = stars[i];
    s.y -= drift * (0.35 + s.z);
    s.x += sway * (0.35 + s.z);
    if (s.y < -0.03) { s.y = 1.03; s.x = Math.random(); }
    if (s.x < -0.02) s.x = 1.02; else if (s.x > 1.02) s.x = -0.02;
  }

  if (streaky) {
    c.lineCap = "round";
    for (let ti = 0; ti < TIERS; ti++) {
      const f = ti / (TIERS - 1);
      c.beginPath();
      for (let i = 0; i < STARS; i++) {
        const s = stars[i];
        if (((s.z * TIERS) | 0) !== ti) continue;
        const sx = s.x * w, sy = s.y * h;
        c.moveTo(sx, sy);
        c.lineTo(sx, sy + stretch * (0.4 + s.z));
      }
      c.strokeStyle = CMix(P + f * 0.25, (0.18 + f * 0.2 + RU * 0.3) * (0.4 + I * 0.6), 54 + f * 16 + RU * 8);
      c.lineWidth = (0.7 + f * 1.2) * TK;
      c.stroke();
    }
    c.lineCap = "butt";
  } else {
    for (let ti = 0; ti < TIERS; ti++) {
      const f = ti / (TIERS - 1);
      c.beginPath();
      for (let i = 0; i < STARS; i++) {
        const s = stars[i];
        if (((s.z * TIERS) | 0) !== ti) continue;
        const tw = 0.55 + Math.sin(vt * 0.02 + s.ph) * 0.45;
        const sz = (0.9 + f * 1.5) * TK * (0.6 + tw * 0.6);
        c.rect(s.x * w, s.y * h, sz, sz);
      }
      c.fillStyle = CMix(P + f * 0.25, (0.2 + f * 0.24 + BE * 0.1) * (0.4 + I * 0.6), 56 + f * 18);
      c.fill();
    }
  }

  // ── STAGE 2: meteor rain (fades in with W2) ───────────────────────────────
  if (W2 > 0.01) {
    S.acc += W2 * (0.35 + E * 1.6) * fs + (hit ? W2 * 2.5 : 0);
    while (S.acc >= 1 && rain.length < RAIN_MAX) {
      S.acc -= 1;
      const up = RU > 0.15;
      const z = Math.random();
      const v = (0.006 + z * 0.012) * (0.7 + E * 0.8);
      rain.push({
        x: Math.random(),
        y: up ? 1.03 : -0.03,
        vx: (Math.random() - 0.5) * 0.0016 + S.tilt * 0.0006,
        vy: up ? -v * 3.2 : v,
        a: 0.55 + Math.random() * 0.45,
        z,
      });
    }
    if (S.acc > 3) S.acc = 3;

    // trails: two batched strokes, one glow setup for all of them
    c.lineCap = "round";
    glow(Math.min(18, 8 + BE * 8), C1());
    for (let ti = 0; ti < 2; ti++) {
      c.beginPath();
      let any = false;
      for (let i = 0; i < rain.length; i++) {
        const p = rain[i];
        if ((p.z > 0.5 ? 1 : 0) !== ti) continue;
        any = true;
        const tl = 16 + p.z * 26 + RU * 22;
        const px = p.x * w, py = p.y * h;
        let dx = p.vx * w * tl, dy = p.vy * h * tl;
        // clamp the trail so the rush can't paint full-height bars of light
        const lim = h * 0.4;
        if (dy > lim || dy < -lim) { const k = lim / (dy < 0 ? -dy : dy); dx *= k; dy *= k; }
        c.moveTo(px, py);
        c.lineTo(px - dx, py - dy);
      }
      if (!any) continue;
      c.strokeStyle = CMix(P + 0.4 + ti * 0.2, (0.22 + ti * 0.16 + RU * 0.2) * W2 * (0.4 + I * 0.7), 58 + ti * 12);
      c.lineWidth = (0.8 + ti * 1.3) * TK;
      c.stroke();
    }
    noGlow();
    c.lineCap = "butt";

    // heads via sprite, then integrate + cull
    const head = headSprite(C2(0.85, 74));
    c.globalCompositeOperation = "lighter";
    for (let i = rain.length - 1; i >= 0; i--) {
      const p = rain[i];
      p.x += p.vx * spd * fs;
      p.y += p.vy * spd * (1 + BE * 0.35 + RU * 1.6) * fs;
      if (RU > 0.02) p.vy -= 0.0012 * RU * spd * fs; // the rush accelerates upward
      p.a *= dk(0.992, fs);
      if (p.y > 1.08 || p.y < -0.08 || p.a < 0.05) { rain.splice(i, 1); continue; }
      const r = R * (0.006 + p.z * 0.008) * (1 + BE * 0.4) * TK;
      c.globalAlpha = Math.min(0.85, p.a * W2 * (0.5 + I * 0.5));
      c.drawImage(head, p.x * w - r, p.y * h - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  } else if (rain.length) {
    rain.length = 0;
  }

  // ── STAGE 3: aurora ribbons overhead (fades in with W3) ───────────────────
  if (W3 > 0.01) {
    const ribs = S.ribs;
    const tb = cl01(trebV);
    for (let rb = 0; rb < ribs; rb++) {
      const f = ribs > 1 ? rb / (ribs - 1) : 0;
      const baseY = h * (0.1 + f * 0.17);
      const amp = h * (0.03 + f * 0.025) * (0.6 + tb * 0.9 + BE * 0.3);
      const thick = h * (0.05 + f * 0.05) * (0.7 + W3 * 0.6);
      const ph = vt * 0.008 * spd + rb * 2.1 + sec * 0.9;
      const a = W3 * (0.12 + tb * 0.06) * (0.45 + I * 0.55) * (1 - CH * 0.4);

      c.beginPath();
      for (let i = 0; i <= RIB_SEGS; i++) {
        const x = (i / RIB_SEGS) * w;
        const y = baseY + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.013 - ph * 1.4 + f * 3) * amp * 0.5;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      for (let i = RIB_SEGS; i >= 0; i--) {
        const x = (i / RIB_SEGS) * w;
        const y = baseY + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.013 - ph * 1.4 + f * 3) * amp * 0.5;
        c.lineTo(x, y + thick);
      }
      c.closePath();
      const rg = c.createLinearGradient(0, baseY - amp, 0, baseY + thick + amp);
      rg.addColorStop(0, "transparent");
      rg.addColorStop(0.42, CMix(P + 0.5 + f * 0.3, Math.min(0.2, a), 52 + f * 10));
      rg.addColorStop(1, "transparent");
      c.fillStyle = rg;
      c.fill();

      // crest line — one capped glow per ribbon
      c.beginPath();
      for (let i = 0; i <= RIB_SEGS; i++) {
        const x = (i / RIB_SEGS) * w;
        const y = baseY + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.013 - ph * 1.4 + f * 3) * amp * 0.5;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = CMix(P + 0.5 + f * 0.3, Math.min(0.34, W3 * (0.16 + tb * 0.14 + HE * 0.12)), 70);
      c.lineWidth = (0.8 + W3 * 1.6) * TK;
      glow(Math.min(20, 9 + BE * 8), C2());
      c.stroke();
      noGlow();
    }
  }

  // ── charge: gathering strands converging on the horizon ───────────────────
  if (CH > 0.05) {
    c.globalCompositeOperation = "lighter";
    const gy = h * 0.86;
    c.beginPath();
    for (let i = 0; i < 22; i++) {
      const f = i / 21;
      const x = f * w;
      const pull = CH * (0.5 + Math.sin(i * 1.7 + vt * 0.05) * 0.5);
      c.moveTo(x, gy);
      c.lineTo(cx + (x - cx) * (1 - pull * 0.55), gy - h * (0.06 + pull * 0.42));
    }
    c.strokeStyle = C2(Math.min(0.24, CH * 0.2 * (0.4 + I * 0.6)), 62);
    c.lineWidth = (0.7 + CH * 1.4) * TK;
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }

  // ── detonation: pillars, shockwave, horizon bloom ─────────────────────────
  if (pillars.length || rings.length || FL > 0.02) {
    c.globalCompositeOperation = "lighter";

    for (let i = pillars.length - 1; i >= 0; i--) {
      const p = pillars[i];
      p.a *= dk(0.93, fs);
      if (p.a < 0.04) { pillars.splice(i, 1); continue; }
      const px = p.x * w, pw = Math.max(2, p.wd * w * (0.5 + p.a));
      const pg = c.createLinearGradient(0, h, 0, h * 0.08);
      pg.addColorStop(0, CMix(P + 0.3, Math.min(0.2, p.a * 0.2 * (0.4 + I * 0.6)), 68));
      pg.addColorStop(0.5, C1(Math.min(0.12, p.a * 0.12), 60));
      pg.addColorStop(1, "transparent");
      c.fillStyle = pg;
      c.fillRect(px - pw * 0.5, h * 0.08, pw, h * 0.92);
    }

    if (rings.length) {
      glow(Math.min(24, 14 * (1 + BE)), C2());
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg2 = rings[i];
        rg2.r += R * (0.03 + E * 0.03) * spd * fs;
        rg2.a *= dk(0.925, fs);
        if (rg2.a < 0.04 || rg2.r > R * 1.6) { rings.splice(i, 1); continue; }
        c.strokeStyle = C2(Math.min(0.4, rg2.a * 0.35), 74);
        c.lineWidth = (1 + rg2.a * 3.5) * TK;
        c.beginPath();
        c.arc(cx, cy, rg2.r, 0, Math.PI * 2);
        c.stroke();
      }
      noGlow();
    }

    c.globalCompositeOperation = "source-over";

    // horizon bloom: painted, NOT additive — a large additive wash here would
    // saturate the trail buffer to white within a few frames
    if (FL > 0.02) {
      const bg = c.createRadialGradient(cx, h * 0.9, 0, cx, h * 0.9, R * 0.9);
      bg.addColorStop(0, C1(Math.min(0.34, FL * 0.32 * (0.4 + I * 0.6)), 72));
      bg.addColorStop(0.45, C2(Math.min(0.2, FL * 0.18), 62));
      bg.addColorStop(1, "transparent");
      c.fillStyle = bg;
      c.fillRect(0, h * 0.35, w, h * 0.65);
    }
  }

  // ── beat pulse on the horizon line, always present ────────────────────────
  if (BE > 0.02 || bassV > 0.02) {
    const hy = h * 0.88;
    const hg = c.createLinearGradient(0, hy - h * 0.05, 0, hy + h * 0.05);
    hg.addColorStop(0, "transparent");
    hg.addColorStop(0.5, CMix(P, Math.min(0.2, (0.05 + BE * 0.12 + cl01(bassV) * 0.06) * (0.4 + I * 0.6)), 58));
    hg.addColorStop(1, "transparent");
    c.fillStyle = hg;
    c.fillRect(0, hy - h * 0.05, w, h * 0.1);
  }
  if (beat && rings.length < RING_MAX && RU > 0.1) rings.push({ r: R * 0.03, a: 0.5 });
};
