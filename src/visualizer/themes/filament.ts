import type { ThemeDraw } from "../themeTypes";
import { light } from "../light";

// Fibre optics in a dark room: a bundle of glowing threads swaying together,
// with light travelling up them.
//
// The strands are drawn as one stroked path each, not as a chain of glowing
// dots — a bundle of forty threads cannot afford a blurred sprite per segment.
// The travelling light is where the sprites go, a handful of them, and because
// each bead's position is `(vt * speed + offset) mod 1` rather than something
// stepped forward, they arrive at the same rate whatever the refresh rate is.
const STRANDS = 34;

export const FILAMENT: ThemeDraw = ({ c, w, h, vt, freq, liveAudio, beatE, dropE, bassV, midV, I, TK, CMix, glow, noGlow }) => {
  const sway = 1 + bassV * 0.8 + dropE * 0.6;

  for (let i = 0; i < STRANDS; i++) {
    const f = i / (STRANDS - 1);
    const band = liveAudio ? freq[Math.floor(8 + f * 170)] / 255 : 0.18 + 0.12 * Math.sin(vt * 0.02 + i);
    // Anchored at the bottom, free at the top: amplitude grows with height,
    // which is what makes it look hung rather than drawn.
    const baseX = w * (0.06 + f * 0.88);
    const ph = i * 0.9;
    const amp = w * (0.02 + band * 0.05) * sway;

    const at = (u: number) => {
      const y = h * (1.02 - u * 1.06);
      const bend =
        Math.sin(u * 2.1 + vt * 0.0075 + ph) * amp * u * u +
        Math.sin(u * 4.3 - vt * 0.0049 + ph * 1.7) * amp * 0.4 * u;
      return [baseX + bend, y] as const;
    };

    c.beginPath();
    for (let k = 0; k <= 16; k++) {
      const [x, y] = at(k / 16);
      k === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    // fainter toward the back of the bundle, so it has depth
    const near = 0.45 + Math.abs(Math.sin(f * 7.3)) * 0.55;
    c.strokeStyle = CMix(f, (0.1 + band * 0.42 * I + beatE * 0.14) * near, 58 + band * 20);
    c.lineWidth = (0.6 + band * 1.5 + beatE * 0.8) * near * TK;
    glow(9 * (1 + beatE * 1.2), CMix(f));
    c.stroke();
    noGlow();

    // Light travelling up the thread. Bright threads carry more of them, so
    // the bundle gets busier with the music instead of merely brighter.
    const beads = band > 0.5 ? 3 : band > 0.26 ? 2 : 1;
    for (let b = 0; b < beads; b++) {
      const u = ((vt * 0.0016 * (0.6 + band) + i * 0.137 + b / beads) % 1 + 1) % 1;
      const [bx, by] = at(u);
      // fades in off the base and out at the tip, so nothing pops into being
      const fade = Math.sin(u * Math.PI);
      const r = (2.4 + band * 4 + beatE * 2.4) * near * TK;
      light(c, CMix(f, 1, 82), bx, by, r, fade * (0.25 + band * 0.5 + midV * 0.2) * near);
    }
  }

  // the floor the bundle stands on, catching a little of the light
  const g = c.createLinearGradient(0, h * 0.86, 0, h);
  g.addColorStop(0, "transparent");
  g.addColorStop(1, CMix(0.5, 0.14 + beatE * 0.12, 44));
  c.fillStyle = g;
  c.fillRect(0, h * 0.86, w, h * 0.14);
};
