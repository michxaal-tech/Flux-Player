import type { ThemeDraw } from "../themeTypes";
import { light } from "../light";

// Ink rising through water.
//
// A plume is a lot of soft blobs that grow and fade as they climb, and the
// tempting way to write it is a particle array pushed and popped every frame.
// This does it as a function instead: puff `i` is always at the same point in
// its life for a given time, because its age *is* the clock, offset per puff.
// Nothing is stored, nothing accumulates, and it therefore runs identically at
// any refresh rate — and it can never leak, drift or need clearing between
// tracks.
//
// The blobs are blitted from the shared light sprite rather than filled with a
// per-puff radial gradient: a gradient object per blob per frame is the single
// most expensive way to draw a soft circle, and there are 90 of them here.
// Enough that consecutive puffs overlap. At 90 they read as a chain of beads
// rather than as smoke — the blobs have to merge before the eye stops counting
// them, and merging is a function of spacing against radius, not of either
// alone.
const PUFFS = 150;

export const PLUME: ThemeDraw = ({ c, w, h, vt, beatE, dropE, bassV, midV, I, CMix, C1, C2, TK }) => {
  const rise = vt * 0.00042 * (1 + bassV * 0.7 + dropE * 0.5);
  // The column leans, slowly, the way a real one does when the air moves. It
  // is one sine at a long period — anything faster reads as a wobble.
  const lean = Math.sin(vt * 0.0016) * 0.5 + Math.sin(vt * 0.0009 + 1.7) * 0.3;

  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < PUFFS; i++) {
    // golden-angle offsets, so the puffs never fall into visible ranks
    const ph = i * 2.3999632;
    const age = (rise + i / PUFFS) % 1;
    // ease the climb: fast off the bottom, slowing as it spreads and cools
    const climb = 1 - Math.pow(1 - age, 1.8);
    const y = h * (1.04 - climb * 1.12);

    // Lateral spread grows with age — that widening is most of what makes it
    // read as a plume rather than a column of dots.
    const spread = w * (0.02 + climb * 0.19);
    const curl =
      Math.sin(ph * 1.3 + vt * 0.0042 + climb * 5.2) * spread +
      Math.sin(ph * 2.7 - vt * 0.0026 + climb * 2.6) * spread * 0.55;
    const x = w * 0.5 + curl + lean * w * 0.1 * climb;

    // varied per puff, so the column has texture instead of a single silhouette
    const vary = 0.72 + (Math.sin(ph * 5.7) * 0.5 + 0.5) * 0.56;
    const r = Math.max(3, h * (0.03 + climb * 0.1) * vary * (1 + bassV * 0.3 + beatE * 0.18)) * TK;
    // bright and dense at the source, thin and cool as it disperses
    const a = Math.pow(1 - age, 1.5) * (0.035 + midV * 0.045 + I * 0.028) * (1 + beatE * 0.5);
    // Quantised to eight steps along the ramp, and it matters. The light
    // sprite is cached per colour string, so a colour that varies continuously
    // per puff rebuilds a canvas and a radial gradient for every one of them —
    // which is slower than the shadowBlur the sprite exists to avoid, and made
    // this theme's frame time wobble badly enough that measuring it twice gave
    // two different answers.
    const q = Math.round(climb * 7) / 7;
    light(c, CMix(0.15 + q * 0.7, 1, 58 + (1 - q) * 24), x, y, r, a);
  }

  // The source: a small hot core the whole column leaves from, so the plume
  // has somewhere to come from rather than simply beginning.
  const coreR = h * (0.035 + bassV * 0.05 + beatE * 0.04);
  const g = c.createRadialGradient(w * 0.5, h * 1.0, 0, w * 0.5, h * 1.0, coreR * 2.4);
  g.addColorStop(0, C1(0.5 + bassV * 0.4, 88));
  g.addColorStop(0.4, C2(0.22 + beatE * 0.25, 70));
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(w * 0.5 - coreR * 2.6, h - coreR * 2.6, coreR * 5.2, coreR * 2.8);
  c.globalCompositeOperation = "source-over";
};
