import type { ThemeDraw } from "../themeTypes";

// Curtains of light hanging in depth, drifting past each other.
//
// The depth is parallax and nothing else: the near curtains are wider, move
// further per unit of time, and are drawn last. There is no projection here
// and no per-layer maths beyond a scale factor — layering translucent shapes
// that move at different rates is enough for the eye to read space, which is
// why this costs a fraction of the 3D themes and reads deeper than some.
//
// Each curtain is a single filled path with a vertical gradient, so the whole
// theme is eight fills. That is what lets it hold a full frame rate with the
// bloom on, where a version built from hundreds of soft blobs could not.
const LAYERS = 8;

export const VEIL: ThemeDraw = ({ c, w, h, vt, freq, liveAudio, beatE, dropE, bassV, midV, I, TK, CMix, C1 }) => {
  c.globalCompositeOperation = "lighter";

  // back to front, so the near curtains sit over the far ones
  for (let i = 0; i < LAYERS; i++) {
    const f = i / (LAYERS - 1);
    // depth: 0 far, 1 near
    const near = f;
    const band = liveAudio ? freq[Math.floor(10 + (1 - f) * 150)] / 255 : 0.18 + 0.1 * Math.sin(vt * 0.015 + i);

    // Near layers drift faster. The whole illusion is in this line.
    const drift = vt * 0.0011 * (0.25 + near * 1.5);
    // width of one curtain, and how many fit across
    const span = w * (0.16 + near * 0.3);
    const count = Math.ceil(w / span) + 2;
    const amp = h * (0.04 + near * 0.1) * (1 + bassV * 0.5 + dropE * 0.4);

    for (let k = 0; k < count; k++) {
      // wrap: each curtain re-enters from the left as it leaves the right
      const x0 = ((k * span + drift * w) % (w + span * 2)) - span;
      const ph = i * 2.1 + k * 1.3;

      const edge = (u: number, side: number) =>
        x0 +
        side * span * 0.5 +
        Math.sin(u * 3.1 + vt * 0.0041 * (0.5 + near) + ph) * amp * 0.5 +
        Math.sin(u * 1.4 - vt * 0.0027 + ph * 1.6) * amp * 0.35;

      c.beginPath();
      for (let s = 0; s <= 10; s++) {
        const u = s / 10;
        const y = u * h;
        const x = edge(u, -1);
        s === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      for (let s = 10; s >= 0; s--) {
        const u = s / 10;
        c.lineTo(edge(u, 1), u * h);
      }
      c.closePath();

      const g = c.createLinearGradient(0, 0, 0, h);
      // brightest through the middle of the frame, so the curtains fade out at
      // top and bottom rather than being cut off by the edge
      // `lighter` plus the trail means eight overlapping curtains compound:
      // the alpha that looks right for one is a white band where they cross.
      const a = (0.02 + band * 0.075 * I + beatE * 0.018) * (0.3 + near * 0.7);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.42, CMix((f + midV * 0.2) % 1, a, 58 + near * 18));
      g.addColorStop(0.72, CMix((f + 0.3) % 1, a * 0.8, 52 + near * 14));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fill();

      // a bright hem down the leading edge of the nearest layers only — on the
      // far ones it would just be noise at that alpha
      if (near > 0.42) {
        c.beginPath();
        for (let s = 0; s <= 10; s++) {
          const u = s / 10;
          const x = edge(u, -1);
          s === 0 ? c.moveTo(x, u * h) : c.lineTo(x, u * h);
        }
        c.strokeStyle = C1((0.12 + band * 0.4 + beatE * 0.2) * near, 84);
        c.lineWidth = (0.9 + band * 2.2) * TK;
        c.stroke();
      }
    }
  }
  c.globalCompositeOperation = "source-over";
};
