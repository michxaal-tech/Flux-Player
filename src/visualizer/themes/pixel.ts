import type { ThemeDraw } from "../themeTypes";

// 8-bit night: a chunky pixel city skyline equalizer under a pixel moon, with
// a little pixel rocket that jumps on every beat. Flat retro palette, crisp
// squares, zero glow.
const ROCKET = [
  "..X..",
  ".XXX.",
  ".XXX.",
  "XXXXX",
  "X.X.X",
];

export const PIXEL: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beat, beatE, bassV, trebV, CMix, L }) => {
  const S = (L.scratch.pixel ??= { jumpV: 0, jumpY: 0 });

  c.globalCompositeOperation = "source-over";
  const px = Math.max(6, Math.floor(w / 96)); // pixel size
  const gw = Math.floor(w / px), gh = Math.floor(h / px);
  const put = (gx: number, gy: number, style: string) => {
    c.fillStyle = style;
    c.fillRect(gx * px, gy * px, px - 1, px - 1);
  };

  // night sky fill
  c.fillStyle = "#04040a";
  c.fillRect(0, 0, w, h);

  // pixel stars
  for (let i = 0; i < 40; i++) {
    const sx = (i * 37) % gw;
    const sy = (i * 23) % Math.floor(gh * 0.5);
    if ((i + Math.floor(vt / 20)) % 5 === 0) continue; // twinkle by skipping
    put(sx, sy, `rgba(255,255,255,${0.25 + ((i * 13) % 10) / 25 + trebV * 0.3})`);
  }

  // pixel moon
  const mx = Math.floor(gw * 0.8), my = Math.floor(gh * 0.16), mr = 4 + Math.round(beatE * 2);
  for (let dy = -mr; dy <= mr; dy++)
    for (let dx = -mr; dx <= mr; dx++)
      if (dx * dx + dy * dy <= mr * mr) put(mx + dx, my + dy, CMix(0.15, 0.9, 80));

  // skyline equalizer: chunky towers with window pixels
  const N = 16;
  const towerW = Math.floor(gw / N);
  const baseRow = gh - 3;
  for (let i = 0; i < N; i++) {
    const fv = liveAudio ? freq[Math.floor((i / N) * 180)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i);
    const rows = Math.max(1, Math.round(fv * (gh * 0.55) * (1 + beatE * 0.4)));
    for (let r = 0; r < rows; r++) {
      const gy = baseRow - r;
      const heat = r / (gh * 0.55);
      for (let cxp = 0; cxp < towerW - 1; cxp++) {
        const isWindow = (cxp + r) % 2 === 0 && r < rows - 1;
        put(
          i * towerW + cxp, gy,
          isWindow
            ? CMix(heat, 0.9, 62 + beatE * 12)
            : CMix((i / N) * 0.8, 0.85, 30 + heat * 18)
        );
      }
    }
    // tower cap
    for (let cxp = 0; cxp < towerW - 1; cxp++)
      put(i * towerW + cxp, baseRow - rows, CMix(0.9, 0.95, 74));
  }
  // ground
  for (let gx = 0; gx < gw; gx++) put(gx, gh - 2, CMix(0.5, 0.8, 22));

  // pixel rocket that jumps on the beat
  if (beat) S.jumpV = -1.6 - bassV * 1.4;
  S.jumpV += 0.12;
  S.jumpY = Math.min(0, S.jumpY + S.jumpV);
  if (S.jumpY === 0) S.jumpV = 0;
  const rx = Math.floor(gw * 0.5 - 2 + Math.sin(vt * 0.01) * gw * 0.3);
  const ry = gh - 8 + Math.round(S.jumpY);
  ROCKET.forEach((row, dy) =>
    row.split("").forEach((ch2, dx) => {
      if (ch2 === "X") put(rx + dx, ry + dy, CMix(0.5, 1, 68 + beatE * 14));
    })
  );
  // thruster flame while airborne
  if (S.jumpY < 0) {
    put(rx + 2, ry + 5, CMix(0.1, 0.95, 62));
    if (Math.random() < 0.6) put(rx + 2, ry + 6, CMix(0.05, 0.8, 55));
  }
  c.globalCompositeOperation = "lighter";
};
