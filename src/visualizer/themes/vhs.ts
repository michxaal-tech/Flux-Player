import type { ThemeDraw } from "../themeTypes";

interface Ribbon {
  /** phase offset into the wobble */
  ph: number;
  /** drift rate multiplier */
  sp: number;
  /** vertical wobble frequency */
  wob: number;
}
interface Drop {
  x: number; y: number; wd: number; hgt: number; life: number; hot: number;
}

const STRIPS = 48;      // fixed scanline-slice count — cost never scales with h
const RIBBONS = 3;
const MAX_DROPS = 18;
const MAX_GRAIN = 240;

// Cached scanline tile. A repeating pattern is one fillRect regardless of how
// tall the canvas is; drawing h/3 individual lines would scale with pixels.
let scanCv: HTMLCanvasElement | null = null;
let scanPat: CanvasPattern | null = null;
let scanKey = "";
function getScan(c: CanvasRenderingContext2D, col: string): CanvasPattern | null {
  if (scanPat && scanKey === col) return scanPat;
  scanKey = col;
  const cv = scanCv ?? document.createElement("canvas");
  cv.width = 3;
  cv.height = 3;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 3, 3);
  g.fillStyle = col;
  g.fillRect(0, 0, 3, 1);
  scanCv = cv;
  scanPat = c.createPattern(cv, "repeat");
  return scanPat;
}

// A worn-out VHS tape playing something abstract: three luminous ribbons
// drifting behind the artefacts. The picture is rebuilt every frame out of
// horizontal slices, so the tape's tracking error can displace each scanline
// independently — a band of damage rolls up the frame, the heads switch at the
// bottom edge, and the chroma channels smear apart from the luma.
// A quiet passage plays back nearly clean: soft scanlines, a slow drifting
// picture, one lazy tracking band. A loud passage destroys the tape — violent
// tearing on every beat, the chroma ripped inches off the luma, dropout dashes
// punching holes through the image and static boiling over everything.
export const VHS: ThemeDraw = ({
  c, w, h, freq, liveAudio, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.vhs ??= {
    rib: [] as Ribbon[],
    drops: [] as Drop[],
    cols: ["", "", ""] as string[],
    band: 0.4,
    glitch: 0,
    tear: 0,
    dropT: 0,
  });
  const rib: Ribbon[] = S.rib;
  const drops: Drop[] = S.drops;
  const cols: string[] = S.cols;
  if (rib.length === 0) {
    for (let i = 0; i < RIBBONS; i++) {
      rib.push({ ph: i * 2.1, sp: 0.55 + i * 0.3, wob: 2.1 + i * 1.5 });
    }
  }

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const sp = cfg.speed;

  // --- tape condition -------------------------------------------------------
  S.glitch *= 0.86;
  S.tear *= 0.8;
  if (beat) {
    S.glitch = Math.min(1.7, S.glitch + 0.35 + E * 1.25);
    S.tear = Math.min(1.6, S.tear + 0.3 + E * 1.1);
  }
  // 0 → near-clean playback, ~1.8 → the tape is being eaten
  const dmg = Math.min(1.9, (0.06 + E * 0.85) * I + S.glitch * 0.75);

  // the tracking band rolls upward, faster the harder the tape is being pushed
  S.band -= (0.0011 + E * 0.0065) * sp * (1 + S.glitch * 0.5);
  if (S.band < -0.3) S.band += 1.6;
  const bandH = 0.05 + E * 0.16;

  // horizontal displacement of the scanline at normalised height yn
  const off = (yn: number): number => {
    let o = Math.sin(yn * 5.3 + vt * 0.011 * sp) * w * 0.004 * (0.35 + dmg);
    const d = yn - S.band;
    if (d > -bandH && d < bandH) {
      const k = 1 - Math.abs(d) / bandH;
      o += Math.sin(yn * 211 + vt * 0.8) * w * (0.018 + E * 0.055) * k * (0.4 + dmg);
      o += k * k * w * 0.028 * dmg;
    }
    if (yn > 0.9) {
      // head-switching noise: the last few lines never track properly
      const k2 = (yn - 0.9) * 10;
      o += Math.sin(yn * 337 + vt * 1.6) * w * (0.026 + E * 0.05) * k2 * (0.5 + dmg * 0.8);
      o += k2 * w * 0.018 * dmg;
    }
    return o;
  };

  // --- picture: opaque base, never additive (a trail buffer would blow out) --
  c.globalCompositeOperation = "source-over";
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, CMix(0.15, 1, 9 + bassV * 3));
  bg.addColorStop(0.55, CMix(0.6, 1, 5));
  bg.addColorStop(1, CMix(0.9, 1, 8));
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  const stripH = h / STRIPS + 1.2;
  const ribPass = (dx: number, amul: number) => {
    for (let k = 0; k < RIBBONS; k++) {
      const rb = rib[k];
      c.fillStyle = cols[k];
      for (let s = 0; s < STRIPS; s++) {
        const yn = (s + 0.5) / STRIPS;
        const fv = liveAudio
          ? freq[(yn * 150) | 0] / 255
          : 0.22 + 0.18 * Math.sin(vt * 0.02 + yn * 4 + k);
        // the subject behind the artefacts drifts lazily when calm and
        // thrashes when the music drives
        const rx = w * (0.5 + (0.22 + E * 0.16) * Math.sin(
          yn * rb.wob * (1 + E * 0.9) + vt * (0.004 + E * 0.024) * rb.sp * sp + rb.ph,
        ));
        const hw = w * (0.03 + 0.085 * fv * I) * (1 + beatE * 0.35);
        const a = (0.4 + fv * 0.5) * amul;
        if (a < 0.02) continue;
        c.globalAlpha = a > 1 ? 1 : a;
        c.fillRect(rx - hw + dx + off(yn), s * stripH - 0.6, hw * 2, stripH);
      }
    }
    c.globalAlpha = 1;
  };

  // luma pass
  const lit = Math.min(60, 36 + midV * 12 + beatE * 6);
  for (let k = 0; k < RIBBONS; k++) cols[k] = CMix(k * 0.5, 1, lit);
  ribPass(0, 1);

  // chroma bleed / ghosting: the colour channels lag the luma and smear apart
  const chroma = w * (0.003 + E * 0.011) * (1 + S.tear * 2.2) * I;
  const ga = Math.min(0.5, 0.16 + E * 0.16 + S.tear * 0.16);
  c.globalCompositeOperation = "lighter";
  for (let k = 0; k < RIBBONS; k++) cols[k] = C1(1, 48);
  ribPass(-chroma, ga);
  for (let k = 0; k < RIBBONS; k++) cols[k] = C2(1, 48);
  ribPass(chroma * 1.35, ga);
  c.globalCompositeOperation = "source-over";

  // --- beat: colour tearing, slices of the picture copied out of place ------
  if (S.tear > 0.12) {
    const cv = c.canvas;
    const n = 1 + Math.round(S.tear * (1 + E * 2.5));
    for (let i = 0; i < n && i < 5; i++) {
      const ty = Math.random() * h * 0.94;
      const th = h * (0.012 + Math.random() * (0.03 + E * 0.07));
      const tox = (Math.random() - 0.5) * w * (0.05 + E * 0.22) * S.tear;
      const sy = (ty / h) * cv.height;
      const sh = (th / h) * cv.height;
      if (sh < 1) continue;
      c.drawImage(cv, 0, sy, cv.width, sh, tox, ty, w, th);
      // the smeared edge left behind by the displaced slice
      c.globalCompositeOperation = "lighter";
      c.fillStyle = (i & 1) === 0 ? C1(S.tear * 0.22, 52) : C2(S.tear * 0.22, 52);
      c.fillRect(tox > 0 ? 0 : w + tox, ty, Math.abs(tox), th);
      c.globalCompositeOperation = "source-over";
    }
  }

  // --- rolling tracking band: brightened, then chewed by noise dashes -------
  {
    const by = (S.band - bandH) * h;
    const bh = bandH * 2 * h;
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, C1(0, 40));
    g.addColorStop(0.5, C1(Math.min(0.3, 0.05 + E * 0.14 + beatE * 0.1), 62));
    g.addColorStop(1, C1(0, 40));
    c.globalCompositeOperation = "lighter";
    c.fillStyle = g;
    c.fillRect(0, by, w, bh);
    c.globalCompositeOperation = "source-over";
    // torn line at the leading edge of the band
    glow(Math.min(18, 8 * (1 + beatE)), C2());
    c.strokeStyle = C2(Math.min(0.55, 0.14 + E * 0.3 + beatE * 0.22), 66);
    c.lineWidth = (0.8 + dmg * 0.9) * TK;
    c.beginPath();
    c.moveTo(0, by);
    c.lineTo(w, by);
    c.stroke();
    noGlow();
    // hash marks inside the damaged band
    const hn = Math.min(90, (10 + E * 60 + dmg * 26) | 0);
    c.fillStyle = C1(0.3 + E * 0.2, 66);
    for (let i = 0; i < hn; i++) {
      const yy = by + Math.random() * bh;
      c.fillRect(Math.random() * w, yy, w * (0.008 + Math.random() * 0.06), 1.6);
    }
  }

  // --- dropout static: short dashes where the tape has lost its oxide -------
  S.dropT -= 1 + E * 3;
  if (S.dropT <= 0 || (beat && Math.random() < 0.3 + E * 0.6)) {
    S.dropT = 26 - E * 20;
    const n = 1 + ((E * 4) | 0);
    for (let i = 0; i < n; i++) {
      if (drops.length >= MAX_DROPS) break;
      drops.push({
        x: Math.random() * w,
        y: Math.random() * h,
        wd: w * (0.03 + Math.random() * (0.1 + E * 0.3)),
        hgt: h * (0.004 + Math.random() * 0.012),
        life: 1,
        hot: Math.random() < 0.5 ? 1 : 0,
      });
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.life *= 0.78 - E * 0.06;
    if (d.life < 0.06) { drops.splice(i, 1); continue; }
    const dy = d.y;
    c.fillStyle = d.hot ? C1(d.life * 0.7, 72) : CMix(0.5, d.life * 0.75, 8);
    c.fillRect(d.x + off(dy / h), dy, d.wd, d.hgt);
  }

  // --- head-switching tear along the bottom edge ----------------------------
  {
    const hy = h * 0.945;
    c.fillStyle = CMix(0.5, 0.72, 6);
    c.fillRect(0, hy, w, h - hy);
    const n = 28;
    const rowH = (h - hy) / n + 1;
    for (let i = 0; i < n; i++) {
      const yn = 0.945 + (i / n) * 0.055;
      const a = 0.1 + Math.random() * (0.25 + E * 0.45);
      c.fillStyle = Math.random() < 0.55 ? C1(a, 58) : C2(a, 52);
      c.fillRect(
        (Math.random() - 0.5) * w * 0.4 + off(yn),
        hy + (i / n) * (h - hy),
        w * (0.1 + Math.random() * 0.9),
        rowH,
      );
    }
    c.fillStyle = C1(0.3 + beatE * 0.2, 60);
    c.fillRect(0, hy - 1.5 * TK, w, 1.5 * TK);
  }

  // --- static grain ---------------------------------------------------------
  const grains = Math.min(MAX_GRAIN, (24 + trebV * 60 + E * 90 + beatE * (30 + E * 110)) | 0);
  const half = grains >> 1;
  c.fillStyle = C1(0.16 + E * 0.12, 74);
  for (let i = 0; i < half; i++) c.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.6);
  c.fillStyle = CMix(0.5, 0.22, 6);
  for (let i = half; i < grains; i++) c.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.6);

  // --- scanlines + vignette -------------------------------------------------
  const pat = getScan(c, CMix(0.5, Math.min(0.5, 0.22 + (1 - E) * 0.12), 3));
  if (pat) {
    c.fillStyle = pat;
    c.fillRect(0, 0, w, h);
  }
  const vg = c.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.22, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vg.addColorStop(0, CMix(0.5, 0, 4));
  vg.addColorStop(1, CMix(0.5, 0.72, 3));
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
};
