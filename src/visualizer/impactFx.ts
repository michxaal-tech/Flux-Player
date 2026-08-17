// Signature impact effects — the unusual half of the impact layer.
//
// The ordinary impacts (flash, shake, chroma, vignette…) live inline in the
// engine because each is a few lines. These are the ones with real machinery
// behind them: displacement fields, a frame history, dot screens.
//
// Two of them — GHOST and DATAMOSH — are only possible because the renderer
// keeps a short history of past frames. That is what makes them read as the
// visuals *remembering* something rather than as another filter over the
// current frame.
//
// Everything here reads from a snapshot rather than from the canvas it draws
// into. Sampling the destination is a feedback loop: each frame adds to the
// last and the picture ramps to white within about a second.

/** Impacts implemented here. The engine owns the plain ones. */
export const SIGNATURE_IMPACTS = [
  "MELT", "RIPPLE", "GHOST", "DATAMOSH", "HALFTONE",
  "PRISM", "CRT", "STAMP", "SHARDS", "BREATH",
] as const;

/** Which of these need the frame history kept up to date. */
const NEEDS_HISTORY = new Set(["GHOST", "DATAMOSH"]);

export interface ImpactCtx {
  c: CanvasRenderingContext2D;
  /** snapshot of the finished frame — never the destination canvas */
  src: CanvasImageSource;
  sw: number;
  sh: number;
  w: number;
  h: number;
  R: number;
  TK: number;
  /** beat punch envelope, 1 on the beat frame */
  beatE: number;
  /** percussive-hit envelope, faster than beatE */
  hitE: number;
  beat: boolean;
  /** musical time in beats */
  flow: number;
  /** frame counter, for effects that want a stable per-frame seed */
  t: number;
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
}

// ── frame history ────────────────────────────────────────────────────────
// Downscaled on purpose: these effects are about *what* was on screen a beat
// ago, not about its detail, and full-resolution copies would cost more than
// the whole impact layer.
const HIST = 26;
const HIST_W = 320;
const hist: HTMLCanvasElement[] = [];
let histHead = 0;
let histFilled = 0;

function pushHistory(src: CanvasImageSource, w: number, h: number): void {
  const hw = HIST_W;
  const hh = Math.max(2, Math.round((HIST_W * h) / Math.max(1, w)));
  let cv = hist[histHead];
  if (!cv) {
    cv = document.createElement("canvas");
    hist[histHead] = cv;
  }
  if (cv.width !== hw || cv.height !== hh) {
    cv.width = hw;
    cv.height = hh;
  }
  const g = cv.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, hw, hh);
  g.drawImage(src, 0, 0, hw, hh);
  histHead = (histHead + 1) % HIST;
  if (histFilled < HIST) histFilled++;
}

/** `back` frames ago, or null if the history has not filled that far yet. */
function frameAgo(back: number): HTMLCanvasElement | null {
  if (back >= histFilled) return null;
  const i = (histHead - 1 - back + HIST * 2) % HIST;
  return hist[i] ?? null;
}

/** Whether the history needs maintaining this frame. */
export function impactsNeedHistory(active: Set<string>): boolean {
  for (const k of NEEDS_HISTORY) if (active.has(k)) return true;
  return false;
}

export function stepImpactHistory(o: ImpactCtx): void {
  pushHistory(o.src, o.sw, o.sh);
}

/** Draws every active signature impact over the finished frame. */
export function drawSignatureImpacts(o: ImpactCtx, active: Set<string>): void {
  const { c, src, sw, sh, w, h, R, TK, beatE, hitE, flow, C1, C2, CMix } = o;

  // ── MELT ───────────────────────────────────────────────────────────────
  // Columns of the picture sag downward by different amounts and snap back,
  // like the image is running. Each column keeps its own phase so the sag
  // travels rather than the whole frame sliding.
  if (active.has("MELT") && beatE > 0.02) {
    const cols = 42;
    const cw = w / cols;
    const scw = sw / cols;
    c.save();
    for (let i = 0; i < cols; i++) {
      const ph = Math.sin(i * 1.7) * 0.5 + 0.5;
      const sag = beatE * ph * h * 0.16;
      if (sag < 0.5) continue;
      c.globalAlpha = 0.85;
      // +1 on the width closes the hairline between neighbouring columns
      c.drawImage(src, i * scw, 0, scw, sh, i * cw, sag, cw + 1, h);
    }
    c.restore();
  }

  // ── RIPPLE ─────────────────────────────────────────────────────────────
  // Concentric rings of the frame drawn at slightly different scales, so the
  // picture refracts outward from the centre like a struck water surface.
  if (active.has("RIPPLE") && beatE > 0.03) {
    const rings = 9;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.hypot(w, h) * 0.5;
    c.save();
    for (let i = rings - 1; i >= 0; i--) {
      const k = i / rings;
      // a wave travelling outward, retriggered by the beat envelope
      const disp = Math.sin(k * 14 - flow * 6) * beatE * 0.05;
      const sc = 1 + disp;
      c.save();
      c.beginPath();
      c.arc(cx, cy, maxR * (k + 1 / rings), 0, Math.PI * 2);
      if (i < rings - 1) {
        c.arc(cx, cy, maxR * k, 0, Math.PI * 2, true); // annulus
      }
      c.clip();
      c.translate(cx, cy);
      c.scale(sc, sc);
      c.drawImage(src, 0, 0, sw, sh, -cx, -cy, w, h);
      c.restore();
    }
    c.restore();
  }

  // ── GHOST ──────────────────────────────────────────────────────────────
  // The frame from roughly one beat ago, blended back in. Because the delay is
  // musical rather than fixed, the ghost lands exactly where the previous beat
  // put it, which reads as the visuals echoing themselves.
  if (active.has("GHOST")) {
    const g = frameAgo(14);
    if (g) {
      c.save();
      // A whole extra frame added on top of a bright theme clips it, and an
      // echo should read as *faint* anyway — this is a suggestion of the last
      // beat, not a second picture.
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.07 + beatE * 0.1;
      c.drawImage(g, 0, 0, g.width, g.height, 0, 0, w, h);
      c.restore();
    }
  }

  // ── DATAMOSH ───────────────────────────────────────────────────────────
  // Horizontal bands each pulled from a *different* moment in the history, so
  // the frame is assembled out of several points in time at once. Only fires
  // on the beat, then heals.
  if (active.has("DATAMOSH") && beatE > 0.25) {
    const bands = 9;
    c.save();
    for (let i = 0; i < bands; i++) {
      // deeper into the past toward the bottom, so it reads as a tear
      const back = Math.round((i / bands) * 20 * beatE);
      const g = frameAgo(back);
      if (!g) continue;
      const y = (i / bands) * h;
      const bh = h / bands;
      const gy = (i / bands) * g.height;
      const gh = g.height / bands;
      c.globalAlpha = 0.9;
      c.drawImage(g, 0, gy, g.width, gh, 0, y, w, bh + 1);
    }
    c.restore();
  }

  // ── HALFTONE ───────────────────────────────────────────────────────────
  // A print-style dot screen laid over the picture, its dots swelling on the
  // beat. Drawn as a fixed grid so cost never scales with canvas size.
  if (active.has("HALFTONE") && beatE > 0.02) {
    const step = Math.max(6, R * 0.022);
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = C1(0.1 + beatE * 0.16, 70);
    for (let yi = 0; yi < rows; yi++) {
      for (let xi = 0; xi < cols; xi++) {
        // offset every other row, the way a real halftone screen is angled
        const px = xi * step + (yi % 2 ? step * 0.5 : 0);
        const py = yi * step;
        const rr = step * 0.16 * (1 + beatE * 1.6);
        c.beginPath();
        c.arc(px, py, rr, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  // ── PRISM ──────────────────────────────────────────────────────────────
  // Radial chromatic dispersion: copies scaled out from the centre and tinted
  // across the palette, so colour separates outward instead of sideways the
  // way the plain CHROMA impact does.
  if (active.has("PRISM") && beatE > 0.03) {
    const cx = w / 2, cy = h / 2;
    c.save();
    c.globalCompositeOperation = "lighter";
    // Three full-frame copies at 0.28 each added up to 0.84 of extra light on
    // top of a frame already at full range. Budgeted so the dispersion reads as
    // colour separation rather than as a white bloom.
    // The copies are scaled about the centre, so their displacement is zero at
    // the centre and grows outward. Drawing them full-frame therefore added the
    // most light exactly where they showed the least separation, blowing out a
    // centred composition for no visual gain. Clipping to an annulus keeps the
    // dispersion where it is actually visible and leaves the core alone.
    const inner = Math.min(w, h) * 0.16;
    const outer = Math.hypot(w, h);
    for (let i = 0; i < 3; i++) {
      const k = (i - 1) * beatE * 0.05;
      if (k === 0) continue;             // the centre copy is the frame itself
      const sc = 1 + k;
      c.save();
      c.beginPath();
      c.arc(cx, cy, outer, 0, Math.PI * 2);
      c.arc(cx, cy, inner, 0, Math.PI * 2, true);
      c.clip("evenodd");
      c.globalAlpha = 0.16 * beatE;
      c.translate(cx, cy);
      c.scale(sc, sc);
      c.drawImage(src, 0, 0, sw, sh, -cx, -cy, w, h);
      c.restore();
    }
    // a palette-tinted wash so the separation reads as colour, not just blur
    const pg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.5);
    pg.addColorStop(0, "transparent");
    pg.addColorStop(0.6, CMix(0.5, beatE * 0.05, 62));
    pg.addColorStop(1, C2(beatE * 0.09, 58));
    c.globalAlpha = 1;
    c.fillStyle = pg;
    c.fillRect(0, 0, w, h);
    c.restore();
  }

  // ── CRT ────────────────────────────────────────────────────────────────
  // A bright band rolling down the screen, plus edge darkening — the way a
  // mistuned tube rolls. The roll is paced in beats, so it sweeps in time.
  if (active.has("CRT")) {
    const rollY = (((flow * 0.5) % 1) + 1) % 1 * h;
    const band = h * 0.06;
    c.save();
    c.globalCompositeOperation = "lighter";
    const rg = c.createLinearGradient(0, rollY - band, 0, rollY + band);
    rg.addColorStop(0, "transparent");
    rg.addColorStop(0.5, C1(0.14 + beatE * 0.2, 74));
    rg.addColorStop(1, "transparent");
    c.fillStyle = rg;
    c.fillRect(0, rollY - band, w, band * 2);
    c.restore();
    // scanlines, only every other row so it stays cheap and doesn't moiré
    c.save();
    c.fillStyle = `rgba(0,0,0,${0.1 + beatE * 0.08})`;
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    c.restore();
  }

  // ── STAMP ──────────────────────────────────────────────────────────────
  // On the beat a hard-edged, rotated copy of the frame is stamped over it
  // inside a palette border, like a printed contact sheet frame.
  if (active.has("STAMP") && beatE > 0.3) {
    const k = (beatE - 0.3) / 0.7;
    const sc = 0.42 + k * 0.1;
    const ang = ((o.t * 0.37) % 1 - 0.5) * 0.24;
    c.save();
    c.globalAlpha = Math.min(1, k * 1.4);
    c.translate(w / 2, h / 2);
    c.rotate(ang);
    c.scale(sc, sc);
    c.drawImage(src, 0, 0, sw, sh, -w / 2, -h / 2, w, h);
    c.strokeStyle = C1(0.9, 72);
    c.lineWidth = (6 / sc) * TK;
    c.strokeRect(-w / 2, -h / 2, w, h);
    c.restore();
  }

  // ── SHARDS ─────────────────────────────────────────────────────────────
  // The frame breaks into wedges around the centre, each rotated a little, so
  // it looks like cracked glass rather than the straight bands SLICE gives.
  if (active.has("SHARDS") && beatE > 0.2) {
    const wedges = 10;
    const cx = w / 2, cy = h / 2;
    const rad = Math.hypot(w, h);
    c.save();
    for (let i = 0; i < wedges; i++) {
      const a0 = (i / wedges) * Math.PI * 2;
      const a1 = ((i + 1) / wedges) * Math.PI * 2;
      const kick = (Math.sin(i * 3.7) * 0.5 + 0.5) * beatE;
      c.save();
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, rad, a0, a1);
      c.closePath();
      c.clip();
      // each wedge slides outward along its own bisector
      const mid = (a0 + a1) / 2;
      c.translate(Math.cos(mid) * kick * R * 0.07, Math.sin(mid) * kick * R * 0.07);
      c.rotate(kick * 0.03 * (i % 2 ? 1 : -1));
      c.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
      c.restore();
    }
    // hairline cracks along the wedge seams
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = C1(beatE * 0.4, 78);
    c.lineWidth = 1 * TK;
    c.beginPath();
    for (let i = 0; i < wedges; i++) {
      const a = (i / wedges) * Math.PI * 2;
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    c.stroke();
    c.restore();
  }

  // ── BREATH ─────────────────────────────────────────────────────────────
  // A squash wave travelling down the frame — rows near the crest stretch and
  // rows behind it compress, so the picture inhales rather than just scaling.
  if (active.has("BREATH") && beatE > 0.02) {
    const rows = 30;
    const rh = h / rows;
    const srh = sh / rows;
    c.save();
    for (let i = 0; i < rows; i++) {
      const k = i / rows;
      const wave = Math.sin(k * Math.PI * 2 - flow * Math.PI * 2);
      const stretch = 1 + wave * beatE * 0.06;
      const dw = w * stretch;
      c.globalAlpha = 0.92;
      c.drawImage(src, 0, i * srh, sw, srh, (w - dw) / 2, i * rh, dw, rh + 1);
    }
    c.restore();
  }

  c.globalAlpha = 1;
}
