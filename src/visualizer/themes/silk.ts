import type { ThemeDraw } from "../themeTypes";

// Silk ribbons: five translucent bands flowing across the frame like fabric
// in wind. Each ribbon rides its own frequency band; every beat sends a
// visible surge travelling left-to-right along the cloth.
export const SILK: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beat, beatE, cfg, bassV, I, TK, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.silk ??= { surges: [] as { x: number; ribbon: number }[] });
  const RIBBONS = 5;
  if (beat) S.surges.push({ x: -0.1, ribbon: Math.floor(Math.random() * RIBBONS) });
  for (let i = S.surges.length - 1; i >= 0; i--) {
    S.surges[i].x += 0.022 * cfg.speed;
    if (S.surges[i].x > 1.25) S.surges.splice(i, 1);
  }

  for (let rb = 0; rb < RIBBONS; rb++) {
    const f = rb / (RIBBONS - 1);
    const band = liveAudio ? freq[Math.floor(20 + f * 150)] / 255 : 0.15 + 0.1 * Math.sin(vt * 0.02 + rb);
    const baseY = h * (0.22 + f * 0.56);
    const amp = h * (0.045 + band * 0.11 * I + bassV * 0.03);
    const thick = h * (0.05 + band * 0.05) * (1 + beatE * 0.25);

    const edgeY = (x: number) => {
      const p = x / w;
      let y =
        baseY +
        Math.sin(p * 5.2 + vt * 0.017 * (1 + f * 0.6) + rb * 2.2) * amp +
        Math.sin(p * 11 - vt * 0.011 + rb) * amp * 0.45 +
        Math.sin(p * 2.1 + vt * 0.006 + rb * 4) * amp * 0.8;
      for (const sg of S.surges) {
        if (sg.ribbon !== rb) continue;
        const d = p - sg.x;
        y -= h * 0.07 * Math.exp(-(d * d) / 0.006) * (1 + bassV);
      }
      return y;
    };

    // ribbon body — translucent gradient fill between two flowing edges
    c.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const y = edgeY(x);
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    for (let x = w; x >= 0; x -= 10) {
      const twist = Math.sin((x / w) * 6.4 + vt * 0.013 + rb) * 0.5 + 0.75;
      c.lineTo(x, edgeY(x) + thick * twist);
    }
    c.closePath();
    const grad = c.createLinearGradient(0, baseY - amp, 0, baseY + amp + thick);
    grad.addColorStop(0, CMix(f, 0.2 + band * 0.3 + beatE * 0.12, 66));
    grad.addColorStop(1, CMix((f + 0.35) % 1, 0.1 + band * 0.18, 52));
    c.fillStyle = grad;
    c.fill();

    // luminous top hem
    c.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const y = edgeY(x);
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(f, 0.5 + band * 0.4 + beatE * 0.3, 72 + beatE * 10);
    c.lineWidth = (1.2 + band * 2 + beatE * 1.6) * TK;
    glow(12 * (1 + beatE * 1.4), CMix(f));
    c.stroke();
    noGlow();

    // surge highlight bead
    for (const sg of S.surges) {
      if (sg.ribbon !== rb || sg.x < 0 || sg.x > 1) continue;
      const bx = sg.x * w;
      c.fillStyle = `hsla(0, 0%, 100%, 0.85)`;
      glow(22, CMix(f));
      c.beginPath();
      c.arc(bx, edgeY(bx), (3 + beatE * 3) * TK, 0, Math.PI * 2);
      c.fill();
      noGlow();
    }
  }
};
