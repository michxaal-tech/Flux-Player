// Drop escalation — the visuals get bigger every time the track drops.
//
// The offline analyser already knows where every drop in the file is, which is
// something a live FFT can never work out: it can only react after the fact.
// Knowing the whole timeline up front means the visuals can treat a song as
// having *structure* rather than just loudness — the fourth drop can hit
// harder than the first because the renderer knows it is the fourth.
//
// So each drop advances a tier, and each tier switches on one more full-screen
// effect. Once unlocked an effect stays in the set and fires on every
// subsequent drop, so the back half of a track is visibly wilder than the
// intro without any per-theme work. All of this is screen-space and runs on
// the finished frame, so it applies to all 75 themes and to the 3D projections
// equally.
import type { LiveState } from "./live";

/** The ladder, in unlock order. Tier N has every effect up to N switched on. */
export const DROP_LADDER = [
  "SHOCKWAVE",  // 1 — rings blasted out of the centre
  "CHROMA",     // 2 — the frame separates into colour-fringed copies
  "KALEIDO",    // 3 — quadrants fold into each other
  "SLAM",       // 4 — the camera punches in and shakes
  "RADIANT",    // 5 — strobing light spokes sweep out
  "ECHO",       // 6 — trailing ghosts of the frame stack up
  "SHATTER",    // 7 — the picture breaks into tumbling tiles
] as const;

export const MAX_TIER = DROP_LADDER.length;

const TILES = 18; // hard cap on shatter fragments

export interface DropFxOpts {
  c: CanvasRenderingContext2D;
  /** the finished frame, used as a texture by the copy-based effects */
  src: CanvasImageSource;
  sw: number;
  sh: number;
  w: number;
  h: number;
  L: LiveState;
  /** 0..1 user intensity */
  amt: number;
  R: number;
  TK: number;
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
}

/**
 * Advances the drop state. Call once per frame before drawing.
 *
 * `dropNew` is set by the engine on the frame a drop lands; everything else
 * here is envelope bookkeeping so the effects have something to decay against.
 */
export function stepDropFx(L: LiveState, beatStep: number, maxTier: number): void {
  const decay = (k: number) => Math.exp(-beatStep * k);

  if (L.dropNew) {
    L.dropBang = 1;
    L.dropTier = Math.min(maxTier, L.dropIdx);
    if (L.dropTier >= 1) for (let i = 0; i < 3; i++) L.dropRings.push(-i * 0.16);
    if (L.dropTier >= 7 && L.dropTiles.length === 0) {
      for (let i = 0; i < TILES; i++) {
        const a = (i / TILES) * Math.PI * 2 + Math.random() * 0.3;
        L.dropTiles.push({
          x: 0, y: 0,
          vx: Math.cos(a) * (0.004 + Math.random() * 0.01),
          vy: Math.sin(a) * (0.004 + Math.random() * 0.01),
          rot: (Math.random() - 0.5) * 0.06,
          a: 1,
        });
      }
    }
  }
  L.dropBang *= decay(1.6);

  for (let i = L.dropRings.length - 1; i >= 0; i--) {
    L.dropRings[i] += beatStep * 0.42;
    if (L.dropRings[i] > 1.15) L.dropRings.splice(i, 1);
  }
  for (let i = L.dropTiles.length - 1; i >= 0; i--) {
    const t = L.dropTiles[i];
    t.x += t.vx; t.y += t.vy;
    t.a *= decay(1.1);
    if (t.a < 0.04) L.dropTiles.splice(i, 1);
  }
}

/** Camera-level effects that must wrap the whole frame (slam). Returns a
 * teardown to call after the frame is drawn. */
export function dropCamera(L: LiveState, c: CanvasRenderingContext2D, w: number, h: number, amt: number): boolean {
  if (L.dropTier < 4) return false;
  const k = Math.max(L.dropBang, L.dropE) * amt;
  if (k < 0.02) return false;
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(1 + k * 0.14, 1 + k * 0.14);
  c.rotate((Math.random() - 0.5) * k * 0.02);
  c.translate(-w / 2 + (Math.random() - 0.5) * k * 22, -h / 2 + (Math.random() - 0.5) * k * 22);
  return true;
}

/** Draws every unlocked drop effect over the finished frame. */
export function drawDropFx(o: DropFxOpts): void {
  const { c, src, sw, sh, w, h, L, amt, R, TK, C1, C2, CMix } = o;
  const tier = L.dropTier;
  if (tier < 1) return;
  // D is what makes later drops bigger: the analysed envelope, plus the
  // one-shot bang so the instant of impact spikes above the sustained level
  const D = Math.min(1, Math.max(L.dropE, L.dropBang)) * amt;
  if (D < 0.015 && L.dropRings.length === 0 && L.dropTiles.length === 0) return;

  const cx = w / 2, cy = h / 2;
  // Total added brightness budget for the frame. These passes each redraw the
  // picture, so their alphas add on top of an already-full-range image; a stack
  // of unbudgeted copies clips to white however good each one looks alone.
  const stack = 1 + (tier >= 2 ? 1 : 0) + (tier >= 3 ? 1 : 0) + (tier >= 6 ? 1 : 0);
  const share = 0.85 / stack;
  c.save();

  // ── 1. SHOCKWAVE ────────────────────────────────────────────────────────
  if (tier >= 1 && L.dropRings.length) {
    c.globalCompositeOperation = "lighter";
    for (const r of L.dropRings) {
      if (r < 0) continue; // still staggered behind the leading ring
      const a = (1 - r) ** 2;
      c.strokeStyle = CMix(r, a * 0.7 * amt, 72);
      c.lineWidth = (2 + (1 - r) * 7) * TK;
      c.beginPath();
      c.arc(cx, cy, r * Math.hypot(w, h) * 0.6, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // ── 2. CHROMA ───────────────────────────────────────────────────────────
  if (tier >= 2 && D > 0.03) {
    const off = D * Math.min(26, R * 0.035);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = share * D;
    c.drawImage(src, 0, 0, sw, sh, -off, 0, w, h);
    c.drawImage(src, 0, 0, sw, sh, off, 0, w, h);
    c.globalAlpha = 1;
  }

  // ── 3. KALEIDO ──────────────────────────────────────────────────────────
  // Folds the top-left quadrant over the other three. Only during the drop, so
  // it reads as the picture briefly snapping into symmetry.
  if (tier >= 3 && D > 0.06) {
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(share, D * 0.9);
    for (const [fx, fy] of [[-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
      c.save();
      c.translate(cx, cy);
      c.scale(fx, fy);
      c.drawImage(src, 0, 0, sw / 2, sh / 2, -cx, -cy, w / 2, h / 2);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // ── 5. RADIANT ──────────────────────────────────────────────────────────
  // (4, SLAM, is a camera transform and is applied by dropCamera before the
  // frame is drawn rather than painted on top of it.)
  if (tier >= 5 && D > 0.05) {
    const spokes = 22;
    const rad = Math.hypot(w, h) * 0.62;
    c.globalCompositeOperation = "lighter";
    c.save();
    c.translate(cx, cy);
    c.rotate(L.flow * 0.5);
    c.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const wd = 0.012 + 0.02 * (0.5 + 0.5 * Math.sin(L.flow * 3 + i));
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - wd) * rad, Math.sin(a - wd) * rad);
      c.lineTo(Math.cos(a + wd) * rad, Math.sin(a + wd) * rad);
      c.closePath();
    }
    const rg = c.createRadialGradient(0, 0, 0, 0, 0, rad);
    rg.addColorStop(0, C1(D * 0.5, 76));
    rg.addColorStop(0.4, C2(D * 0.2, 62));
    rg.addColorStop(1, "transparent");
    c.fillStyle = rg;
    c.fill();
    c.restore();
  }

  // ── 6. ECHO ─────────────────────────────────────────────────────────────
  // Scaled ghosts of the frame stacked behind themselves — a feedback trail
  // without needing a second buffer.
  if (tier >= 6 && D > 0.04) {
    c.globalCompositeOperation = "lighter";
    for (let i = 1; i <= 3; i++) {
      const s = 1 + i * 0.09 * D;
      c.globalAlpha = (share * 0.5) * D / i;
      c.drawImage(src, 0, 0, sw, sh, cx - (w * s) / 2, cy - (h * s) / 2, w * s, h * s);
    }
    c.globalAlpha = 1;
  }

  // ── 7. SHATTER ──────────────────────────────────────────────────────────
  // The frame breaks into wedge tiles that tumble outward. Each tile samples
  // its own slice of the source, so the picture stays readable as it flies apart.
  if (tier >= 7 && L.dropTiles.length) {
    c.globalCompositeOperation = "lighter";
    const cols = 6, rows = 3;
    for (let i = 0; i < L.dropTiles.length; i++) {
      const t = L.dropTiles[i];
      const gx = i % cols, gy = ((i / cols) | 0) % rows;
      const tw = w / cols, th = h / rows;
      c.save();
      c.globalAlpha = Math.min(1, t.a) * 0.7;
      c.translate(gx * tw + tw / 2 + t.x * w, gy * th + th / 2 + t.y * h);
      c.rotate(t.rot * (1 - t.a) * 12);
      c.drawImage(
        src,
        (gx / cols) * sw, (gy / rows) * sh, sw / cols, sh / rows,
        -tw / 2, -th / 2, tw, th
      );
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // the instant of impact: a full-frame bloom so the drop reads as a hit even
  // on a theme that happens to be dark right then
  if (L.dropBang > 0.03) {
    c.globalCompositeOperation = "lighter";
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.6);
    bg.addColorStop(0, C1(L.dropBang * 0.34 * amt, 78));
    bg.addColorStop(0.5, C2(L.dropBang * 0.16 * amt, 62));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
  }

  c.restore();
}
