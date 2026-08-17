import type { ThemeDraw } from "../themeTypes";

// PARALLAX — depth built out of layers that move at different speeds, which is
// the oldest trick there is for selling distance on a flat surface and still
// the most convincing one.
//
// The track starts on a single far plane of slow, small, dim marks. Every drop
// adds a *nearer* plane: faster, larger, brighter, and drifting the other way.
// So escalation reads as the camera being buried deeper in the scene rather
// than as more stuff being switched on, and a calm passage lets the near planes
// thin back out until you can see through to the far one again.

const MAXP = 9;
const TAU = Math.PI * 2;

interface Mark { x: number; y: number; ph: number; sz: number }
interface State { p: Mark[][]; off: number[] }

export const PARALLAX: ThemeDraw = (x) => {
  const { c, w, h, cx, cy, R, freq, beat, beatE, energy, dropE, bassV, midV, trebV, cfg, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.parallax ??= { p: [] as Mark[][], off: [] as number[] }) as State;
  const planes = Math.min(MAXP, 1 + L.dropSlots);
  while (S.p.length < planes) { S.p.push([]); S.off.push(Math.random()); }

  const bins = freq.length;

  // far planes first — nearer ones must draw over them
  for (let k = planes - 1; k >= 0; k--) {
    const amt = k === 0 ? 1 : (L.dropAmts[k - 1] ?? 0);
    if (amt < 0.03) { S.p[k].length = 0; continue; }

    // depth: 0 is the far plane, 1 the nearest one it is possible to unlock
    const depth = k / (MAXP - 1);
    const sgn = k % 2 ? -1 : 1;
    const speed = (0.0004 + depth * 0.004) * sgn * (1 + energy * 1.4 + dropE * 2) * cfg.speed;
    S.off[k] = (S.off[k] + speed + 1) % 1;

    const want = Math.round((34 + depth * 26) * amt);
    const M = S.p[k];
    while (M.length < want) M.push({ x: Math.random(), y: Math.random(), ph: Math.random() * TAU, sz: 0.3 + Math.random() * 0.7 });
    if (M.length > want) M.length = want;

    const bin = Math.min(bins - 1, 2 + Math.floor(depth * 40));
    const spec = ((freq[bin] ?? 0) / 255) ** 1.4;
    const hue = depth;
    // nearer planes are bigger, brighter, and blurrier at the edges — the whole
    // depth cue in three numbers
    const size = R * (0.006 + depth * 0.03) * (1 + spec * 0.8 + beatE * 0.4);
    const a = amt * (0.14 + depth * 0.4) * (0.5 + midV * 0.5);

    if (depth > 0.55) glow(Math.min(22, depth * 22), CMix(hue));
    c.fillStyle = CMix(hue, a, 52 + depth * 26);
    c.strokeStyle = CMix(hue, a * 0.7, 52 + depth * 26);
    c.lineWidth = Math.max(0.5, size * 0.35) * TK;

    for (const m of M) {
      const px = (((m.x + S.off[k]) % 1) + 1) % 1 * w;
      const py = (m.y + Math.sin(m.ph + S.off[k] * 6) * 0.02 * depth) * h;
      const r = size * m.sz;
      if (depth > 0.62) {
        // near planes are streaks, which is what motion at this scale looks like
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px - sgn * r * 4, py);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(px, py, r, 0, TAU);
        c.fill();
      }
    }
    if (depth > 0.55) noGlow();

    // a horizon rule per plane, receding toward the centre — this is what
    // makes the stack read as depth rather than as scattered dots
    const hy = cy + (depth - 0.5) * h * 0.72;
    const hg = c.createLinearGradient(0, hy - 2, 0, hy + 2);
    hg.addColorStop(0, "transparent");
    hg.addColorStop(0.5, CMix(hue, amt * (0.1 + depth * 0.24 + bassV * 0.1), 60));
    hg.addColorStop(1, "transparent");
    c.fillStyle = hg;
    c.fillRect(0, hy - 2, w, 4);
  }

  // a light source on the far plane, so there is something to be in front of
  const sr = R * (0.14 + bassV * 0.06);
  const sg = c.createRadialGradient(cx, cy - h * 0.1, 0, cx, cy - h * 0.1, sr * 2.6);
  sg.addColorStop(0, C1(0.15 + trebV * 0.1, 72));
  sg.addColorStop(0.5, C2(0.05, 56));
  sg.addColorStop(1, "transparent");
  c.fillStyle = sg;
  c.beginPath();
  c.arc(cx, cy - h * 0.1, sr * 2.6, 0, TAU);
  c.fill();

  if (beat) for (let k = 0; k < planes; k++) S.off[k] += 0.002 * (k % 2 ? -1 : 1);
};
