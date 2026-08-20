import type { ThemeDraw } from "../themeTypes";
import { ak } from "../rate";

// A sun low over water, and the glitter path running back toward you.
//
// The reflection is the whole theme. A mirrored copy of the disc looks wrong
// and always has — water does not mirror, it shatters. What it actually
// produces is a *column* of separate horizontal glints, short and dim near the
// horizon where the waves are foreshortened into nothing, longer and brighter
// as they come toward the viewer. Driving each glint's width from its own
// frequency bin is what makes the path move with the music without anything
// visibly "reacting".
export const HORIZON: ThemeDraw = ({ c, w, h, fs, vt, freq, liveAudio, beat, beatE, dropE, bassV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.horizon ??= { swell: 0 });
  // one value of state, and it is a *target* followed toward, not a counter —
  // a swell that rises on a drop and settles over a few seconds
  S.swell += (dropE - S.swell) * ak(0.05, fs);
  const horizonY = h * (0.52 - S.swell * 0.02);
  const sunY = horizonY - h * (0.06 + bassV * 0.03 + beatE * 0.02);
  const sunR = Math.min(w, h) * (0.085 + bassV * 0.018 + dropE * 0.022);
  const sunX = w * 0.5;

  // ── sky ──
  const sky = c.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, CMix(0.05, 0.14, 22));
  sky.addColorStop(0.62, CMix(0.4, 0.3, 34));
  sky.addColorStop(1, CMix(0.85, 0.55 + beatE * 0.2, 52 + beatE * 8));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, horizonY);

  // ── the disc, with a haze around it ──
  const halo = c.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 3.4);
  halo.addColorStop(0, C1(0.16 + beatE * 0.1, 70));
  halo.addColorStop(0.35, C2(0.06, 58));
  halo.addColorStop(1, "transparent");
  c.fillStyle = halo;
  c.fillRect(0, 0, w, horizonY + sunR);

  c.save();
  c.beginPath();
  c.rect(0, 0, w, horizonY);
  c.clip();
  glow(18 * (1 + beatE), C1());
  c.fillStyle = C1(0.72, 72);
  c.beginPath();
  c.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  c.fill();
  noGlow();
  // banding across the disc, the way a low sun sits behind haze layers
  for (let i = 0; i < 7; i++) {
    const f = i / 7;
    const by = sunY - sunR + f * sunR * 2 + Math.sin(vt * 0.004 + i) * 2;
    c.fillStyle = CMix(0.7, 0.1 + f * 0.16, 30);
    c.fillRect(sunX - sunR, by, sunR * 2, sunR * (0.055 + f * 0.05));
  }
  c.restore();

  // ── water ──
  const sea = c.createLinearGradient(0, horizonY, 0, h);
  sea.addColorStop(0, CMix(0.8, 0.42, 30));
  sea.addColorStop(1, CMix(0.1, 0.5, 12));
  c.fillStyle = sea;
  c.fillRect(0, horizonY, w, h - horizonY);

  // ── the glitter path ──
  const rowsN = 46;
  for (let i = 0; i < rowsN; i++) {
    const f = i / rowsN;
    // perspective: rows crowd together toward the horizon
    const y = horizonY + Math.pow(f, 1.9) * (h - horizonY);
    const rowH = Math.max(1, Math.pow(f, 1.5) * h * 0.022 + 1) * TK;
    const band = liveAudio ? freq[6 + ((i * 5) % 150)] / 255 : 0.2 + 0.15 * Math.sin(vt * 0.02 + i);
    // width of the path at this depth, widening toward the viewer
    const halfW = sunR * (0.35 + f * 1.9) * (1 + trebV * 0.2);
    // three glints per row, scattered inside the path
    for (let k = 0; k < 3; k++) {
      const ph = i * 1.7 + k * 2.4;
      const jitter = Math.sin(vt * 0.011 * (1 + f) + ph) * halfW * 0.85;
      const len = halfW * (0.1 + band * 0.5 * I) * (0.4 + Math.abs(Math.sin(vt * 0.017 + ph)) * 0.9);
      if (len < 0.6) continue;
      const a = (0.07 + band * 0.34 + beatE * 0.12) * (0.3 + f * 0.7);
      c.fillStyle = C1(Math.min(0.95, a), 74 + band * 18);
      c.fillRect(sunX + jitter - len / 2, y, len, rowH);
    }
  }

  // the horizon line itself, so the two halves meet on something
  c.fillStyle = C1(0.5 + beatE * 0.3, 82);
  c.fillRect(0, horizonY - 0.5 * TK, w, 1.2 * TK);

  // a beat sends a wave of brightness out along the path
  if (beat) S.swell = Math.min(1, S.swell + 0.12);
};
