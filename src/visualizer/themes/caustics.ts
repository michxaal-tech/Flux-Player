import type { ThemeDraw } from "../themeTypes";

// Light on the bottom of a swimming pool.
//
// The web of bright lines is what you get where a rippled surface focuses
// sunlight, and it falls out of one function rather than being drawn: three
// travelling sine waves are summed, and the light is wherever that sum passes
// through zero. Raising the falloff to a high power is what turns a broad
// gradient into a filament — the caustic is *thin* because the crossing is
// sharp, not because anything is stroked thinly.
//
// Nothing here accumulates: every cell is a function of vt, so it runs at the
// panel's rate without a frame counter anywhere in it.
export const CAUSTICS: ThemeDraw = ({ c, w, h, vt, freq, liveAudio, beatE, bassV, midV, I, TK, CMix, C1, L }) => {
  // Cell size in CSS px rather than a fixed grid count, so the web keeps the
  // same scale on a phone and on a 2560px canvas instead of stretching.
  const cell = Math.max(5, Math.min(13, w / 128)) * (1 + (1 - Math.min(1, TK)) * 0.3);
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const swell = 1 + bassV * 0.5 + beatE * 0.4;
  const t1 = vt * 0.0075;
  const t2 = vt * 0.0052;
  const t3 = vt * 0.0034;

  // depth shimmer: the whole field breathes slightly, as if the surface above
  // it were rising and falling
  const depth = 1 + Math.sin(vt * 0.0021) * 0.14;

  for (let gy = 0; gy < rows; gy++) {
    const y = gy * cell;
    const v = (y / h - 0.5) * 6.2 * depth;
    // the water is deeper toward the top of the frame, so the light there is
    // fainter and bluer — this is the whole reason it reads as underwater
    const near = 0.35 + (gy / rows) * 0.65;
    for (let gx = 0; gx < cols; gx++) {
      const x = gx * cell;
      const u = (x / w - 0.5) * 6.2 * depth;
      const s =
        Math.sin(u * 1.9 + t1) +
        Math.sin(v * 2.3 - t2 + Math.cos(u * 0.7 + t3) * 1.3) +
        Math.sin((u + v) * 1.35 + t3 * 1.7) * 0.85;
      const d = Math.abs(s);
      if (d > 1.05) continue; // far from a crossing: no light here at all
      // A high power is what keeps the filament thin. Raising it also darkens
      // everything, which is the point: the trail buffer adds each frame to the
      // last, so a line bright enough to look right in one frame accumulates to
      // white over a few and the web turns into a flood.
      const lit = Math.pow(1 - d / 1.05, 8) * near * swell;
      if (lit < 0.02) continue;
      c.fillStyle = CMix((u + v) * 0.06 + 0.5, Math.min(0.8, lit * (0.32 + I * 0.2)), 58 + lit * 24);
      c.fillRect(x, y, cell + 1, cell + 1);
    }
  }

  // Sunbeams slanting down through the water, brightest with the mids. Drawn
  // over the floor rather than into it, so they read as being in the volume
  // between the surface and the bottom.
  const beams = 5;
  for (let i = 0; i < beams; i++) {
    const f = i / beams;
    const sway = Math.sin(vt * 0.0038 + i * 2.1) * w * 0.06;
    const x0 = w * (0.1 + f * 0.8) + sway;
    const band = liveAudio ? freq[24 + i * 26] / 255 : 0.2;
    const g = c.createLinearGradient(x0, 0, x0 + w * 0.18, h);
    g.addColorStop(0, C1((0.05 + band * 0.12 + midV * 0.06) * (1 + beatE * 0.6), 82));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0 - w * 0.03, 0);
    c.lineTo(x0 + w * 0.03, 0);
    c.lineTo(x0 + w * 0.2, h);
    c.lineTo(x0 + w * 0.12, h);
    c.closePath();
    c.fill();
  }

  // and a few motes suspended in the beams
  const motes = 26;
  for (let i = 0; i < motes; i++) {
    const ph = i * 2.399;
    const mx = ((Math.sin(ph * 3.1) * 0.5 + 0.5) * w + Math.sin(vt * 0.002 + ph) * w * 0.04) % w;
    const my = (((Math.sin(ph * 1.7) * 0.5 + 0.5) * h + vt * 0.12 * (0.4 + (i % 5) * 0.2)) % h + h) % h;
    const tw = 0.25 + Math.abs(Math.sin(vt * 0.012 + ph)) * 0.75;
    c.fillStyle = C1(tw * (0.18 + beatE * 0.3), 90);
    c.fillRect(mx, my, 1.8 * TK, 1.8 * TK);
  }
  void L;
};
