import type { ThemeDraw } from "../themeTypes";
import { ak, dk } from "../rate";

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
  const S = (L.scratch.horizon ??= { swell: 0, blast: 0, ring: 0, ringA: 0, seen: 0, rays: 0 });
  // one value of state, and it is a *target* followed toward, not a counter —
  // a swell that rises on a drop and settles over a few seconds
  S.swell += (dropE - S.swell) * ak(0.05, fs);

  // ── the drop ──
  //
  // A swell was all this had, and a swell is not an event: the sun got slightly
  // bigger and the water slightly brighter, which is the sort of thing you only
  // notice if you were told to look for it. Now the sun detonates — a flare
  // that whites out the disc, a shock ring racing out across the water toward
  // the viewer, god rays firing out of it, and the glitter path blown into a
  // spray — and then it all settles back and the sun is still there.
  if (L.dropSlots !== S.seen) {
    S.seen = L.dropSlots;
    S.blast = 1;
    S.ring = 0.02;
    S.ringA = 1;
    S.rays = 1;
  }
  S.blast *= dk(0.9, fs);
  S.rays *= dk(0.955, fs);
  const horizonY = h * (0.52 - S.swell * 0.02);
  const sunY = horizonY - h * (0.06 + bassV * 0.03 + beatE * 0.02);
  const sunR = Math.min(w, h) * (0.085 + bassV * 0.018 + dropE * 0.022) * (1 + S.blast * 0.55);
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
  glow(18 * (1 + beatE) + S.blast * 50, C1());
  c.fillStyle = S.blast > 0.05 ? `hsla(0,0%,100%,${0.72 + S.blast * 0.28})` : C1(0.72, 72);
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
    const halfW = sunR * (0.35 + f * 1.9) * (1 + trebV * 0.2 + S.blast * 0.8);
    // three glints per row, scattered inside the path
    for (let k = 0; k < 3; k++) {
      const ph = i * 1.7 + k * 2.4;
      const jitter = Math.sin(vt * 0.011 * (1 + f) + ph) * halfW * 0.85;
      const len = halfW * (0.1 + band * 0.5 * I) * (0.4 + Math.abs(Math.sin(vt * 0.017 + ph)) * 0.9);
      if (len < 0.6) continue;
      const a = (0.07 + band * 0.34 + beatE * 0.12 + S.blast * 0.5) * (0.3 + f * 0.7);
      c.fillStyle = C1(Math.min(0.95, a), 74 + band * 18);
      c.fillRect(sunX + jitter - len / 2, y, len, rowH);
    }
  }

  // ── god rays out of the sun, strongest just after the hit ──
  if (S.rays > 0.03) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + vt * 0.0012;
      const len = Math.min(w, h) * (0.5 + S.rays * 0.9);
      const wide = 0.02 + (i % 3) * 0.012;
      c.beginPath();
      c.moveTo(sunX, sunY);
      c.lineTo(sunX + Math.cos(a - wide) * len, sunY + Math.sin(a - wide) * len);
      c.lineTo(sunX + Math.cos(a + wide) * len, sunY + Math.sin(a + wide) * len);
      c.closePath();
      const g2 = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, len);
      g2.addColorStop(0, C1(S.rays * 0.5, 90));
      g2.addColorStop(1, "transparent");
      c.fillStyle = g2;
      c.fill();
    }
    c.restore();
  }

  // ── the shock ring, racing out over the water ──
  if (S.ringA > 0.02) {
    S.ring += (0.016 + bassV * 0.012) * fs;
    S.ringA *= dk(0.965, fs);
    // an ellipse in perspective, so it lies *on* the water rather than over it
    const rr = S.ring * w * 1.4;
    c.save();
    c.beginPath();
    c.rect(0, horizonY, w, h - horizonY);
    c.clip();
    c.beginPath();
    c.ellipse(sunX, horizonY, rr, rr * 0.34, 0, 0, Math.PI * 2);
    c.strokeStyle = `hsla(0,0%,100%,${S.ringA * 0.8})`;
    c.lineWidth = (1.5 + S.ringA * 6) * TK;
    glow(26 * S.ringA, C1());
    c.stroke();
    noGlow();
    c.restore();
  }

  // the horizon line itself, so the two halves meet on something
  c.fillStyle = S.blast > 0.05 ? `hsla(0,0%,100%,${0.5 + S.blast * 0.5})` : C1(0.5 + beatE * 0.3, 82);
  c.fillRect(0, horizonY - (0.5 + S.blast * 2) * TK, w, (1.2 + S.blast * 5) * TK);

  // ── the sky flashes, briefly ──
  if (S.blast > 0.02) {
    const fl = c.createLinearGradient(0, 0, 0, h);
    fl.addColorStop(0, `hsla(0,0%,100%,${S.blast * 0.1})`);
    fl.addColorStop(0.5, `hsla(0,0%,100%,${S.blast * 0.34})`);
    fl.addColorStop(1, `hsla(0,0%,100%,${S.blast * 0.06})`);
    c.fillStyle = fl;
    c.fillRect(0, 0, w, h);
  }

  // a beat sends a wave of brightness out along the path
  if (beat) S.swell = Math.min(1, S.swell + 0.12);
};
