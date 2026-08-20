/**
 * Whole-frame bloom, built from a mip chain.
 *
 * The visualizer's halo used to come from `shadowBlur` on every stroke and
 * fill. That is priced per draw call — and capping the radius does not help,
 * because the price is the extra layer allocated, drawn and blurred per call,
 * not the radius. Measured at 1440x900 with everything turned up, it was 78%
 * of RING's frame and 71% of WAVES', for eight and twelve strokes.
 *
 * Blooming the finished frame instead costs the same whether a theme drew six
 * paths or six hundred. But it does cost *something* on every theme, including
 * the ones that barely glowed — the first cut of this made CROWN 24% slower
 * even as it made RING 3.5x faster. So the chain is shaped around the two
 * operations that actually dominate: reading the full-resolution frame, and
 * writing back over it. There is exactly one of each.
 *
 *   src ──▶ L0 ¼ ──▶ M ¼ (highlights) ──▶ B1 ⅛ ──▶ B2 1/16
 *    read              └──────────── ACC ¼ ───────────┘
 *                                     └─▶ dst  write
 *
 * Everything between those two is at a sixteenth of the area or less.
 *
 * The threshold matters as much as the blur. Adding a whole frame back to
 * itself just lifts the mid-tones and the picture goes foggy; and thresholding
 * on `contrast()` alone does not work either, because that is per-channel and
 * a saturated magenta has two channels at full — it survives as if it were
 * white. So the highlights pass is masked by a *greyscale* copy of itself:
 * near 0 below the knee, near 1 above, which leaves only genuinely bright
 * pixels contributing.
 */

// 0: quarter-size copy of the frame   1: its highlights   2: ⅛   3: 1/16
// 4: the accumulator the three blurred levels are summed into
const mip: HTMLCanvasElement[] = [];
const mipCtx: CanvasRenderingContext2D[] = [];

function level(i: number, w: number, h: number): CanvasRenderingContext2D {
  if (!mip[i]) {
    mip[i] = document.createElement("canvas");
    mipCtx[i] = mip[i].getContext("2d")!;
  }
  const cv = mip[i];
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const c = mipCtx[i];
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = "none";
  return c;
}

export interface BloomOpts {
  /** overall strength, 0 = off. ~0.5 is a normal halo, 1 is a hot one */
  strength: number;
  /**
   * How wide the halo spreads, 0..1. Low values weight the sharp level (a
   * tight rim on the strokes); high values weight the coarse ones (a glow that
   * fills the space between them).
   */
  spread: number;
  /**
   * Brightness knee, 0..1 — how bright a pixel has to be before it blooms.
   * Lower means more of the frame contributes.
   */
  knee: number;
}

/**
 * Reads `src`, adds a blurred copy of its highlights back over `dst`.
 *
 * `dst` and `src` may be the same canvas: every pixel is read into the chain
 * before anything is written back. `w`/`h` are in the destination's *transform*
 * units (CSS px), since that is what the caller is drawing in.
 */
export function bloomFrame(
  dst: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  w: number,
  h: number,
  { strength, spread, knee }: BloomOpts,
): void {
  if (strength <= 0.02 || src.width < 16 || src.height < 16) return;

  const qw = Math.max(4, src.width >> 2);
  const qh = Math.max(4, src.height >> 2);

  // ── the one full-resolution read ──
  const c0 = level(0, qw, qh);
  c0.globalCompositeOperation = "copy";
  c0.drawImage(src, 0, 0, qw, qh);

  // ── highlights, entirely at quarter size from here on ──
  const cm = level(1, qw, qh);
  cm.globalCompositeOperation = "copy";
  cm.drawImage(mip[0], 0, 0);
  cm.globalCompositeOperation = "multiply";
  // brightness/contrast pair: the knee slides where the mask turns on, the
  // contrast makes the turn sharp enough that mid-tones contribute nothing
  cm.filter = `grayscale(1) brightness(${(0.42 + knee * 0.5).toFixed(3)}) contrast(7)`;
  cm.drawImage(mip[0], 0, 0);
  cm.filter = "none";
  cm.globalCompositeOperation = "source-over";

  // ── two halvings, blurred a pixel each so the upscale is smooth, not blocky
  const c2 = level(2, Math.max(2, qw >> 1), Math.max(2, qh >> 1));
  c2.globalCompositeOperation = "copy";
  c2.filter = "blur(1px)";
  c2.drawImage(mip[1], 0, 0, mip[2].width, mip[2].height);
  const c3 = level(3, Math.max(2, qw >> 2), Math.max(2, qh >> 2));
  c3.globalCompositeOperation = "copy";
  c3.filter = "blur(1px)";
  c3.drawImage(mip[2], 0, 0, mip[3].width, mip[3].height);

  // ── sum the three levels while they are still small ──
  // Three weights that sum to 1, slid by `spread`: at 0 nearly all of it is
  // the sharp level, at 1 the widest.
  const wgt = [(1 - spread) * (1 - spread), 2 * spread * (1 - spread) + 0.18, spread * spread];
  const tot = wgt[0] + wgt[1] + wgt[2];
  const acc = level(4, qw, qh);
  acc.globalCompositeOperation = "copy";
  acc.globalAlpha = wgt[0] / tot;
  // The sharp level is only a quarter-size downsample — hard-edged, and it
  // gets stretched back up 4x at the end, which shows as a square-ish rim
  // around bright strokes. A pixel of blur here is four at full size, which is
  // exactly the tight rim this level is meant to be.
  acc.filter = "blur(1.2px)";
  acc.drawImage(mip[1], 0, 0);
  acc.filter = "none";
  acc.globalCompositeOperation = "lighter";
  acc.globalAlpha = wgt[1] / tot;
  acc.drawImage(mip[2], 0, 0, qw, qh);
  acc.globalAlpha = wgt[2] / tot;
  acc.drawImage(mip[3], 0, 0, qw, qh);
  acc.globalAlpha = 1;
  acc.globalCompositeOperation = "source-over";

  // ── the one full-resolution write ──
  dst.save();
  dst.globalCompositeOperation = "lighter";
  dst.filter = "none";
  dst.globalAlpha = strength > 1 ? 1 : strength;
  dst.drawImage(mip[4], 0, 0, qw, qh, 0, 0, w, h);
  dst.restore();
}
