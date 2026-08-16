import type { ThemeDraw } from "../themeTypes";

// Glowing ocean under a moon. Two swells roll in from the left and right and
// crash together in the center — on the crash (or a strong beat) the sea
// flashes and throws up a burst of luminous spray. Majestic on purpose.
export const TIDE: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beat, beatE, cfg, bassV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.tide ??= {
    travel: 0,
    flash: 0,
    foam: [] as { x: number; y: number; vx: number; vy: number; a: number; sz: number }[],
  });

  // painted scene, not additive — "lighter" would blow the sea out to white
  c.globalCompositeOperation = "source-over";

  // moon + halo, brightening on the beat
  const mx = w / 2, my = h * 0.18, mr = Math.min(w, h) * 0.07;
  const mg = c.createRadialGradient(mx, my, 0, mx, my, mr * 3.2);
  mg.addColorStop(0, `rgba(255,255,255,${0.55 + beatE * 0.35})`);
  mg.addColorStop(0.22, C1(0.22 + beatE * 0.25, 78));
  mg.addColorStop(1, "transparent");
  c.fillStyle = mg;
  c.beginPath();
  c.arc(mx, my, mr * 3.2, 0, Math.PI * 2);
  c.fill();

  // star specks, twinkling harder on the beat
  for (let i = 0; i < 26; i++) {
    const sx = (i * 613) % w;
    const sy = (i * 271) % Math.floor(h * 0.4);
    const tw = 0.25 + Math.abs(Math.sin(vt * 0.02 + i * 1.7)) * 0.5 + beatE * 0.4;
    c.fillStyle = `rgba(255,255,255,${Math.min(1, tw) * 0.6})`;
    c.fillRect(sx, sy, 1.6, 1.6);
  }

  // swells advance from both edges toward the center
  S.travel += (0.0035 + bassV * 0.009) * cfg.speed;
  let crash = false;
  if (S.travel >= 1 || (beat && S.travel > 0.55)) {
    crash = true;
    S.flash = 1;
    S.travel = 0;
  }
  S.flash *= 0.9;

  const crestSigma = w * 0.06;
  const layers = 3;
  for (let ly = 0; ly < layers; ly++) {
    const f = ly / (layers - 1); // 0 back … 1 front
    const baseY = h * (0.58 + f * 0.16);
    const amp = h * (0.018 + f * 0.028) * (1 + bassV * 1.2);
    const swellH = h * (0.05 + f * 0.1) * (0.35 + S.travel) * (0.6 + bassV + beatE * 0.5);
    const crestX = -w * 0.05 + w * 0.55 * S.travel; // left crest; right is mirrored
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      let y =
        baseY +
        Math.sin(x * 0.01 + vt * 0.02 * (1 + f)) * amp +
        Math.sin(x * 0.023 - vt * 0.013 + ly * 2) * amp * 0.6;
      const fv = liveAudio ? freq[Math.floor((x / w) * 160)] / 255 : 0.15;
      y -= fv * h * 0.02 * I;
      const dl = x - crestX, dr = x - (w - crestX);
      y -= swellH * Math.exp(-(dl * dl) / (2 * crestSigma * crestSigma));
      y -= swellH * Math.exp(-(dr * dr) / (2 * crestSigma * crestSigma));
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    const grad = c.createLinearGradient(0, baseY - swellH, 0, h);
    grad.addColorStop(0, CMix(f, 0.55 + bassV * 0.15 + S.flash * 0.25, 46 + S.flash * 14));
    grad.addColorStop(1, CMix(1 - f, 0.8, 14));
    c.fillStyle = grad;
    c.fill();
    // glowing crest line
    c.beginPath();
    for (let x = 0; x <= w; x += 8) {
      let y =
        baseY +
        Math.sin(x * 0.01 + vt * 0.02 * (1 + f)) * amp +
        Math.sin(x * 0.023 - vt * 0.013 + ly * 2) * amp * 0.6;
      const fv = liveAudio ? freq[Math.floor((x / w) * 160)] / 255 : 0.15;
      y -= fv * h * 0.02 * I;
      const dl = x - crestX, dr = x - (w - crestX);
      y -= swellH * Math.exp(-(dl * dl) / (2 * crestSigma * crestSigma));
      y -= swellH * Math.exp(-(dr * dr) / (2 * crestSigma * crestSigma));
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(f, 0.45 + beatE * 0.35 + S.flash * 0.4, 66 + S.flash * 18);
    c.lineWidth = (1.2 + f * 1.6 + beatE * 2) * TK;
    glow((10 + f * 10) * (1 + beatE + S.flash), C1());
    c.stroke();
  }
  noGlow();

  // the crash: burst of luminous spray + center flash (additive again)
  c.globalCompositeOperation = "lighter";
  const crashY = h * 0.66;
  if (crash) {
    for (let k = 0; k < 60; k++) {
      const a2 = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const sp = h * (0.004 + Math.random() * 0.011);
      S.foam.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.08,
        y: crashY,
        vx: Math.cos(a2) * sp,
        vy: Math.sin(a2) * sp,
        a: 1,
        sz: 1 + Math.random() * 2.4,
      });
    }
  }
  if (S.flash > 0.03) {
    const fg = c.createRadialGradient(w / 2, crashY, 0, w / 2, crashY, h * 0.3 * (1.3 - S.flash));
    fg.addColorStop(0, `rgba(255,255,255,${S.flash * 0.5})`);
    fg.addColorStop(0.4, C2(S.flash * 0.4, 75));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.beginPath();
    c.arc(w / 2, crashY, h * 0.3, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = S.foam.length - 1; i >= 0; i--) {
    const p = S.foam[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += h * 0.00035; // gravity
    p.a *= 0.965;
    if (p.a < 0.04 || p.y > h) { S.foam.splice(i, 1); continue; }
    c.fillStyle = `hsla(0, 0%, 100%, ${p.a * 0.9})`;
    glow(12, C1());
    c.beginPath();
    c.arc(p.x, p.y, p.sz * (1 + beatE * 0.5) * TK, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
