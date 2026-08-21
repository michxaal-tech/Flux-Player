import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Swell {
  /** 0 at the edge → 1 at center-screen impact */
  p: number;
  amp: number;
  side: -1 | 1;
}

// Pre-rendered glow dot for spray: drawImage of a sprite is orders of
// magnitude cheaper than a shadowBlur'd arc per particle, and there can be
// 100+ particles in flight after a crash.
let foamSprite: HTMLCanvasElement | null = null;
let foamKey = "";
function getFoamSprite(color: string): HTMLCanvasElement {
  if (foamSprite && foamKey === color) return foamSprite;
  foamKey = color;
  const cv = foamSprite ?? document.createElement("canvas");
  cv.width = cv.height = 48;
  const g = cv.getContext("2d")!;
  const rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  rg.addColorStop(0, "rgba(255,255,255,0.95)");
  rg.addColorStop(0.3, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 48, 48);
  foamSprite = cv;
  return cv;
}

// Glowing ocean under a moon. Swells continuously roll in from both edges at
// different phases — spawned by the surf itself and extra-large ones by the
// beat — and each crashes center-screen with a flash and luminous spray.
// There is no global reset, so the sea never snaps back or loops.
export const TIDE: ThemeDraw = ({ c, fs, w, h, freq, liveAudio, vt, beat, beatE, cfg, bassV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.tide ??= {
    swells: [] as Swell[],
    foam: [] as { x: number; y: number; vx: number; vy: number; a: number; sz: number }[],
    flash: 0,
    spawnT: 0,
  });

  // painted scene, not additive — "lighter" would blow the sea out to white
  c.globalCompositeOperation = "source-over";

  // moon + halo, brightening on the beat
  const mx = w / 2, my = h * 0.18, mr = Math.min(w, h) * 0.07;
  const mg = c.createRadialGradient(mx, my, 0, mx, my, mr * 3.2);
  mg.addColorStop(0, C1(0.55 + beatE * 0.35, 92));
  mg.addColorStop(0.22, C1(0.22 + beatE * 0.25, 78));
  mg.addColorStop(1, "transparent");
  c.fillStyle = mg;
  c.beginPath();
  c.arc(mx, my, mr * 3.2, 0, Math.PI * 2);
  c.fill();

  // star specks, twinkling harder on the beat
  for (let i = 0; i < 26; i++) {
    const sx = (i * 613) % w;
    const sy = (i * 271) % Math.floor(h * 0.4);
    const tw = 0.25 + Math.abs(Math.sin(vt * 0.02 + i * 1.7)) * 0.5 + beatE * 0.4;
    c.fillStyle = `rgba(255,255,255,${Math.min(1, tw) * 0.6})`;
    c.fillRect(sx, sy, 1.6, 1.6);
  }

  // keep swells coming: a fresh pair on every beat, ambient pairs in between
  const spawnPair = (amp: number) => {
    if (S.swells.length >= 8) return;
    S.swells.push({ p: 0, amp, side: -1 }, { p: 0, amp: amp * (0.8 + Math.random() * 0.4), side: 1 });
  };
  S.spawnT--;
  if (beat) {
    spawnPair(0.8 + bassV * 0.6);
    S.spawnT = 45;
  } else if (S.spawnT <= 0) {
    spawnPair(0.45 + Math.random() * 0.2);
    S.spawnT = 80;
  }

  const crashY = h * 0.66;
  for (let i = S.swells.length - 1; i >= 0; i--) {
    const sw = S.swells[i];
    sw.p += (0.007 + bassV * 0.005) * cfg.speed * fs;
    if (sw.p >= 1) {
      // impact: spray + flash proportional to the swell's size
      S.flash = Math.max(S.flash, 0.5 + sw.amp * 0.5);
      const count = Math.min(Math.floor(20 + sw.amp * 40), 120 - S.foam.length);
      for (let k = 0; k < count; k++) {
        const a2 = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
        const sp = h * (0.003 + Math.random() * 0.01) * (0.6 + sw.amp * 0.6);
        S.foam.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.08,
          y: crashY,
          vx: Math.cos(a2) * sp + sw.side * -h * 0.001,
          vy: Math.sin(a2) * sp,
          a: 1,
          sz: 1 + Math.random() * 2.4,
        });
      }
      S.swells.splice(i, 1);
    }
  }
  S.flash *= dk(0.9, fs);

  // crest x for a swell: edge → just past center, easing in from offscreen
  const crestX = (sw: Swell) =>
    sw.side === -1 ? -w * 0.06 + sw.p * w * 0.56 : w * 1.06 - sw.p * w * 0.56;

  const crestSigma = w * 0.055;
  const cutoff = crestSigma * 3.2; // beyond ~3σ the bump is invisible — skip the exp
  const inv2Sig = 1 / (2 * crestSigma * crestSigma);
  const surfaceY = (x: number, f: number, baseY: number, amp: number, bumpAmp: number) => {
    let y =
      baseY +
      Math.sin(x * 0.01 + vt * 0.02 * (1 + f)) * amp +
      Math.sin(x * 0.023 - vt * 0.013 + f * 4) * amp * 0.6;
    const fv = liveAudio ? freq[Math.floor((x / w) * 160)] / 255 : 0.15;
    y -= fv * h * 0.02 * I;
    for (const sw of S.swells) {
      const d = x - crestX(sw);
      if (d > cutoff || d < -cutoff) continue;
      // ramp the bump in as it enters so it never pops into existence
      const ramp = Math.min(1, sw.p * 6);
      y -= bumpAmp * sw.amp * ramp * Math.exp(-d * d * inv2Sig);
    }
    return y;
  };

  // fixed sample count: the wave costs the same in a small window and
  // full-screen (per-pixel stepping made full-screen do double the math)
  const layers = 3;
  const SEGS = 110;
  const STEP = w / SEGS;
  for (let ly = 0; ly < layers; ly++) {
    const f = ly / (layers - 1); // 0 back … 1 front
    const baseY = h * (0.58 + f * 0.16);
    const amp = h * (0.018 + f * 0.028) * (1 + bassV * 1.2);
    const bumpAmp = h * (0.04 + f * 0.09) * (0.6 + bassV + beatE * 0.4);
    // compute the surface once, reuse for fill + crest stroke
    const pts: number[] = [];
    for (let i = 0; i <= SEGS; i++) pts.push(surfaceY(i * STEP, f, baseY, amp, bumpAmp));
    c.beginPath();
    c.moveTo(0, h);
    pts.forEach((y2, i) => c.lineTo(i * STEP, y2));
    c.lineTo(w, h);
    c.closePath();
    const grad = c.createLinearGradient(0, baseY - h * 0.12, 0, h);
    grad.addColorStop(0, CMix(f, 0.55 + bassV * 0.15 + S.flash * 0.25, 46 + S.flash * 14));
    grad.addColorStop(1, CMix(1 - f, 0.8, 14));
    c.fillStyle = grad;
    c.fill();
    // glowing crest line (blur capped — giant blurs on full-width strokes
    // are the single most expensive canvas op)
    c.beginPath();
    pts.forEach((y2, i) => (i === 0 ? c.moveTo(0, y2) : c.lineTo(i * STEP, y2)));
    c.strokeStyle = CMix(f, 0.45 + beatE * 0.35 + S.flash * 0.4, 66 + S.flash * 18);
    c.lineWidth = (1.2 + f * 1.6 + beatE * 2) * TK;
    glow(Math.min(26, (10 + f * 10) * (1 + beatE + S.flash)), C1());
    c.stroke();
  }
  noGlow();

  // spray + impact flash (additive again)
  c.globalCompositeOperation = "lighter";
  if (S.flash > 0.03) {
    const fg = c.createRadialGradient(w / 2, crashY, 0, w / 2, crashY, h * 0.3 * (1.3 - S.flash));
    fg.addColorStop(0, C1(S.flash * 0.5, 90));
    fg.addColorStop(0.4, C2(S.flash * 0.4, 75));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(w / 2, crashY, h * 0.3, 0, Math.PI * 2);
    c.fill();
  }
  const spr = getFoamSprite(C1(0.85, 80));
  for (let i = S.foam.length - 1; i >= 0; i--) {
    const p = S.foam[i];
    p.x += p.vx * fs;
    p.y += p.vy * fs;
    p.vy += h * 0.00035 * fs; // gravity
    p.a *= dk(0.965, fs);
    if (p.a < 0.04 || p.y > h) { S.foam.splice(i, 1); continue; }
    const r = p.sz * (1 + beatE * 0.5) * TK * 3; // sprite halo included
    c.globalAlpha = p.a;
    c.drawImage(spr, p.x - r, p.y - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;
};
