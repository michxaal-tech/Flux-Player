import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Curtain {
  /** 0..1 horizontal anchor */
  x: number;
  ph: number;
  sp: number;
  dir: number;
  hue: number;
  /** beat impulse, decays — drives whipping */
  whip: number;
  /** shred amount at high energy */
  tear: number;
}

interface Mote {
  x: number; y: number; vx: number; vy: number; a: number; sz: number; hue: number;
}

interface Rip {
  y: number; a: number; sp: number;
}

const TAU = Math.PI * 2;
const CURTAINS = 7;
const COLS = 20; // fixed slat count — cost never scales with canvas size
const GROUP = 4; // slats per ribbon; the sheet tears apart along group edges
const ROWS = 5;
const MAX_MOTES = 150;
const MAX_RIPS = 8;

// Pre-rendered mote glow. drawImage of a sprite costs a fraction of a
// shadowBlur'd arc, and there can be 150 motes in the air at once.
let moteCv: HTMLCanvasElement | null = null;
let moteKey = "";
function moteSprite(color: string): HTMLCanvasElement {
  if (moteCv && moteKey === color) return moteCv;
  moteKey = color;
  const cv = moteCv ?? document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 32, 32);
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, "rgba(255,255,255,0.92)");
  rg.addColorStop(0.34, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
  moteCv = cv;
  return cv;
}

// Curtains of aurora light hanging down the frame like silk sheets. Each sheet
// is sliced into slats whose horizontal offset (and therefore shading) follows a
// travelling fold wave, so the cloth reads as folded in 3D and the folds slide
// downward like the light is falling. Calm passages: few, very long folds
// swaying hypnotically across wide sheets. Driving passages: the sheets whip,
// the slats separate into narrow torn ribbons, folds pack in tight and the whole
// wall strobes on every beat.
export const AURORAFALL: ThemeDraw = ({
  c, w, h, R, fs, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.aurorafall ??= {
    cur: [] as Curtain[],
    motes: [] as Mote[],
    rips: [] as Rip[],
    strobe: 0,
    moteAcc: 0,
  });
  const cur: Curtain[] = S.cur;
  const motes: Mote[] = S.motes;
  const rips: Rip[] = S.rips;

  if (cur.length === 0) {
    for (let i = 0; i < CURTAINS; i++) {
      cur.push({
        x: (i + 0.5) / CURTAINS,
        ph: Math.random() * TAU,
        sp: 0.6 + Math.random() * 0.8,
        dir: Math.random() < 0.5 ? -1 : 1,
        hue: i / (CURTAINS - 1),
        whip: 0,
        tear: 0,
      });
    }
  }

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  // --- the energy split: long lazy folds vs packed whipping ribbons ---
  const foldFreq = 0.9 + E * 5.5;              // wavelength: huge → tight
  const shear = 0.9 + E * 4.2;                 // fold twist down the sheet
  const swayRate = (0.006 + E * 0.052) * sp;   // hypnotic drift → violent whip
  const fallRate = (0.004 + E * 0.05) * sp;    // folds sliding downward
  const halfW = R * (0.125 - E * 0.05);        // wide silk → narrow ribbons
  const sharp = 1.2 + E * 2.6;                 // fold contrast

  // strobe only really exists at high energy
  S.strobe = beat ? 1 : S.strobe * dk(0.8, fs);
  const strobe = S.strobe * E2;

  for (const cu of cur) {
    cu.whip *= dk(0.9, fs);
    cu.tear *= dk(0.93, fs);
    if (beat) {
      cu.whip += (0.25 + E * 1.9) * I * (0.6 + Math.random() * 0.7);
      if (E > 0.5) cu.tear = 1;
    }
    cu.ph += swayRate * cu.sp * (1 + cu.whip * 1.6) * fs;
    cu.x += (0.00018 + E * 0.0016) * cu.sp * cu.dir * sp * fs;
    if (cu.x < -0.15) cu.x += 1.3;
    if (cu.x > 1.15) cu.x -= 1.3;

    const baseX = cu.x * w;
    const topY = -h * 0.08;
    const botY = Math.min(
      h * 1.02,
      h * (0.52 + E * 0.24 + 0.3 * (0.5 + 0.5 * Math.sin(vt * 0.004 * sp + cu.ph * 0.7))),
    );
    const span = botY - topY;
    const foldAmp = halfW * (0.42 + cu.whip * 0.7 + bassV * 0.25);
    const swayAmp = R * (0.045 + E * 0.1) * (1 + cu.whip);
    const fallPh = vt * fallRate + cu.ph;

    // horizontal position of the sheet at slat-coord u, height-coord yn, with
    // `off` the whole ribbon's independent displacement once the sheet tears
    const xAt = (u: number, yn: number, off: number) =>
      baseX +
      (u - 0.5) * halfW * 2 +
      off +
      Math.sin(u * foldFreq * TAU + fallPh + yn * shear) * foldAmp +
      Math.sin(vt * 0.007 * sp + yn * (0.7 + E * 2.2) + cu.ph) * swayAmp;

    // one gradient per sheet — a vertical linear gradient is x-independent, so
    // every slat reuses it and only globalAlpha changes per slat
    // lightness must stay under 100 — seven overlapping sheets painting near
    // white saturate the trail buffer and the whole frame washes out
    const lit = Math.min(74, 52 + strobe * 12 + beatE * 6 + trebV * 6);
    const g = c.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, CMix(cu.hue, 0, lit));
    g.addColorStop(0.16, CMix(cu.hue, 0.75, lit));
    g.addColorStop(0.55, CMix((cu.hue + 0.35) % 1, 0.5, lit - 8));
    g.addColorStop(1, CMix((cu.hue + 0.6) % 1, 0, 34));
    c.fillStyle = g;

    const bright = Math.min(0.72, (0.22 + midV * 0.3 + bassV * 0.14 + beatE * 0.22) * (1 + strobe * 0.7) * I);
    const tearGap = (E2 * 0.8 + cu.tear * 0.5) / COLS;
    const ribAmp = (E2 * 0.5 + cu.tear * 0.6) * halfW;
    let bestU = 0, bestSh = 0, bestOff = 0;
    for (let j = 0; j < COLS; j++) {
      const u0 = j / COLS;
      const u1 = (j + 1) / COLS - (j % GROUP === GROUP - 1 ? tearGap : 0);
      const um = (u0 + u1) * 0.5;
      // each torn ribbon whips on its own phase
      const off = ribAmp > 0.01
        ? Math.sin(((j / GROUP) | 0) * 2.3 + vt * (0.02 + E * 0.05) * sp + cu.ph) * ribAmp
        : 0;
      // fold shading: facing the light where the fold crests
      const fold = 0.5 + 0.5 * Math.cos(um * foldFreq * TAU + fallPh + 0.5 * shear);
      const sh = 0.14 + 0.86 * Math.pow(fold, sharp);
      if (sh > bestSh) { bestSh = sh; bestU = um; bestOff = off; }
      const a = sh * bright;
      if (a < 0.015) continue;
      c.globalAlpha = a > 1 ? 1 : a;
      c.beginPath();
      for (let r = 0; r <= ROWS; r++) {
        const yn = r / ROWS;
        const y = topY + span * yn;
        const x = xAt(u0, yn, off);
        if (r === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      for (let r = ROWS; r >= 0; r--) {
        const yn = r / ROWS;
        c.lineTo(xAt(u1, yn, off), topY + span * yn);
      }
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;

    // shimmer: a hot filament running down the brightest fold
    c.beginPath();
    for (let r = 0; r <= ROWS; r++) {
      const yn = r / ROWS;
      const y = topY + span * yn;
      const x = xAt(bestU, yn, bestOff);
      if (r === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = CMix(cu.hue, Math.min(0.7, (0.22 + beatE * 0.3 + strobe * 0.3) * I), 78);
    c.lineWidth = (0.9 + beatE * 1.4 + E * 1.2) * TK;
    c.stroke();
  }

  // --- horizontal light tears: only when the music is driving ---
  if (beat && E > 0.45 && rips.length < MAX_RIPS) {
    const n = 1 + Math.floor(E * 2);
    for (let k = 0; k < n; k++) {
      rips.push({ y: Math.random() * h, a: 0.5 + E * 0.5, sp: (Math.random() - 0.5) * h * 0.01 });
    }
  }
  if (rips.length) {
    glow(Math.min(28, 16 * (1 + beatE)), C2());
    c.lineWidth = (1 + E * 2.5) * TK;
    for (let i = rips.length - 1; i >= 0; i--) {
      const rp = rips[i];
      rp.y += rp.sp * sp * fs;
      rp.a *= dk(0.84, fs);
      if (rp.a < 0.04) { rips.splice(i, 1); continue; }
      c.strokeStyle = C2(rp.a * 0.7, 88);
      c.beginPath();
      c.moveTo(0, rp.y);
      c.lineTo(w, rp.y);
      c.stroke();
    }
    noGlow();
  }

  // --- falling light-motes ---
  S.moteAcc += (0.35 + E * 2.6 + beatE * (2 + E * 8)) * fs;
  while (S.moteAcc >= 1) {
    S.moteAcc -= 1;
    if (motes.length >= MAX_MOTES) break;
    motes.push({
      x: Math.random() * w,
      y: -h * 0.05 - Math.random() * h * 0.1,
      vx: (Math.random() - 0.5) * h * 0.0015,
      vy: h * (0.0016 + Math.random() * 0.0026),
      a: 0.4 + Math.random() * 0.6,
      sz: 1 + Math.random() * 2.2,
      hue: Math.random(),
    });
  }
  if (S.moteAcc > 4) S.moteAcc = 4;

  const spr = moteSprite(C1(0.85, 78));
  const streak = 1 + E * 3.2 + beatE * 1.5;
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.y += m.vy * (1 + E * 3.5 + beatE * 2) * sp * fs;
    m.x += (m.vx + Math.sin(vt * 0.01 + m.y * 0.01) * h * 0.0006 * (1 + E * 2)) * sp * fs;
    m.a *= dk(0.994, fs);
    if (m.y > h * 1.06 || m.a < 0.05) { motes.splice(i, 1); continue; }
    const rw = m.sz * TK * 2.2;
    c.globalAlpha = m.a * (0.5 + trebV * 0.5 + beatE * 0.4);
    c.drawImage(spr, m.x - rw, m.y - rw * streak, rw * 2, rw * 2 * streak);
  }
  c.globalAlpha = 1;
};
