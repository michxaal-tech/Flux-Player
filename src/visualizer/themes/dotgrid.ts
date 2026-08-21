import type { ThemeDraw } from "../themeTypes";

interface Ring {
  /** radius in grid units */
  r: number;
  amp: number;
}

// Infinite perspective dot field: a plane of points receding to a horizon,
// scrolling toward the viewer. The spectrum lifts the plane into terrain and
// each beat drops a ripple ring that travels outward, dots rising and
// brightening as the wavefront passes. Depth fog keeps the horizon soft.
export const DOTGRID: ThemeDraw = ({
  c, w, h, fs, freq, liveAudio, vt, beat, beatE, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.dotgrid ??= { rings: [] as Ring[], scroll: 0 });

  const COLS = 26; // across the plane
  const ROWS = 18; // depth slices
  const horizon = h * 0.34;
  const eye = h * 0.55; // focal length in px

  S.scroll += 0.035 * (1 + bassV * 1.4) * fs;
  if (S.scroll >= 1) S.scroll -= 1;

  if (beat) S.rings.push({ r: 0, amp: 0.7 + bassV * 0.8 });
  for (let i = S.rings.length - 1; i >= 0; i--) {
    S.rings[i].r += 0.42;
    S.rings[i].amp *= 0.982;
    if (S.rings[i].r > 30 || S.rings[i].amp < 0.05) S.rings.splice(i, 1);
  }
  if (S.rings.length > 14) S.rings.splice(0, S.rings.length - 14);

  // soft horizon glow band, brightening on the beat
  const hg = c.createLinearGradient(0, horizon - h * 0.16, 0, horizon + h * 0.1);
  hg.addColorStop(0, "transparent");
  hg.addColorStop(0.55, C1(0.05 + beatE * 0.14, 62));
  hg.addColorStop(1, "transparent");
  c.fillStyle = hg;
  c.fillRect(0, horizon - h * 0.16, w, h * 0.26);

  // back-to-front so nearer dots overlap farther ones correctly
  for (let row = ROWS - 1; row >= 0; row--) {
    // depth with sub-row scrolling: z shrinks toward the viewer
    const dz = row + S.scroll;
    const z = 0.55 + dz * 0.78;
    const persp = eye / z;
    const py = horizon + persp * 0.42;
    if (py > h + 40) continue;
    const fade = Math.max(0, 1 - dz / ROWS); // depth fog
    if (fade < 0.02) continue;

    for (let col = 0; col < COLS; col++) {
      const u = col / (COLS - 1) - 0.5; // -0.5 … 0.5 across the plane
      const px = w / 2 + u * persp * 2.6;
      if (px < -30 || px > w + 30) continue;

      // spectrum lifts the terrain — mirrored so bass sits center-screen
      const bin = Math.floor(Math.abs(u) * 2 * 150) + 2;
      const fv = liveAudio ? freq[Math.min(255, bin)] / 255 : 0.14 + 0.1 * Math.sin(vt * 0.03 + col * 0.4 + row * 0.3);

      // ripple rings measured in grid space from the field's center
      const gd = Math.hypot(u * COLS * 0.9, dz - 1.5);
      let hot = 0;
      for (const rg of S.rings) {
        const k = Math.max(0, 1 - Math.abs(gd - rg.r) / 2.2);
        hot = Math.max(hot, k * k * rg.amp);
      }

      const lift = (fv * I * 0.5 + hot * 1.1) * persp * 0.34;
      const y = py - lift;
      const size = Math.max(0.35, (0.7 + fv * I * 1.5 + hot * 2.6) * (persp / eye) * 3.1 * TK);
      const a = Math.min(1, (0.14 + fv * 0.55 + hot * 0.9) * fade);
      if (a < 0.02) continue;

      // hot dots bloom; the rest stay cheap flat dots (thousands per frame)
      if (hot > 0.25) {
        glow(9 * hot, C2());
        c.fillStyle = C2(a, 76 + hot * 20);
      } else {
        c.fillStyle = CMix(Math.abs(u) * 2, a, 58 + fv * 22);
      }
      c.beginPath();
      c.arc(px, y, size, 0, Math.PI * 2);
      c.fill();
      if (hot > 0.25) noGlow();

      // vertical light shaft under strongly lifted dots — gives the field body
      if (hot > 0.45 && row < ROWS - 3) {
        c.strokeStyle = C2(a * 0.28 * hot, 70);
        c.lineWidth = size * 0.5;
        c.beginPath();
        c.moveTo(px, y);
        c.lineTo(px, py);
        c.stroke();
      }
    }
  }
  noGlow();

  // beat flash on the nearest scanline, tying the field to the low end
  if (beatE > 0.05) {
    c.fillStyle = C1(beatE * 0.1 + midV * 0.03, 70);
    c.fillRect(0, h - 3, w, 3);
  }
};
