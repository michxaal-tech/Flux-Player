import type { Frame, ModeDef } from "../types";

// RIDGE — the spectrum as a range of hills receding into night fog.
//
// Each ridge is one moment of the spectrum; new ones rise at the front and
// older ones recede toward the horizon, losing contrast and taking on the
// colour of the mist the way real distance does. A moon sits on the horizon
// and brightens with the level. Quiet passages leave long low swells rolling
// back; loud ones throw up peaks. The front ridge catches a hard rim of light
// on each trusted beat (on onsets otherwise).

interface St { rows?: Float32Array[]; acc: number; stars?: Float32Array }

const ROWS = 34;
const COLS = 64;

export const ridge: ModeDef = {
  id: "ridge",
  name: "Ridge",
  line: "The spectrum as hills receding into fog",
  reacts: "Loudness raises the peaks · time carries them away · beats rim the front ridge",
  dials: ["Relief", "Fog"],
  kind: "2d",
  draw: (c, f: Frame, raw) => {
    const st = raw as unknown as St;
    if (!st.rows) {
      st.rows = Array.from({ length: ROWS }, () => new Float32Array(COLS));
      st.acc = 0;
      st.stars = new Float32Array(120).map(() => Math.random());
    }
    const rows = st.rows;
    const { w, h, css } = f;
    // push a new ridge at a pace set by movement; even paused it drifts slowly
    st.acc += f.dt * (f.playing ? 9 : 2.2) * (0.6 + f.drift * 0.6);
    while (st.acc >= 1) {
      st.acc -= 1;
      const r = rows.pop()!;
      for (let i = 0; i < COLS; i++) {
        // mirror the spectrum around the centre so the range has a summit
        const x = Math.abs(i / (COLS - 1) - 0.5) * 2;
        const v = f.spectrum[Math.min(f.spectrum.length - 1, Math.floor(x * 40))] ?? 0;
        const swell = Math.sin(f.time * 0.4 + i * 0.21) * 0.06 + Math.sin(f.time * 0.17 + i * 0.07) * 0.08;
        r[i] = Math.max(0, v * (0.35 + f.a * 0.9) * (1 - x * 0.35) + 0.08 + swell * (0.4 + f.drift));
      }
      rows.unshift(r);
    }
    const horizon = h * 0.46;
    // sky
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, css[0]);
    sky.addColorStop(1, css[1]);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, horizon + 2);
    // stars
    const S = st.stars!;
    c.fillStyle = css[4];
    for (let i = 0; i < S.length; i += 3) {
      c.globalAlpha = (0.15 + 0.35 * Math.abs(Math.sin(f.time * 0.6 + S[i + 2] * 20))) * (1 - f.calm * 0.4);
      c.fillRect(S[i] * w, S[i + 1] * horizon * 0.9, 1.4 * f.px, 1.4 * f.px);
    }
    c.globalAlpha = 1;
    // moon on the horizon
    const mx = w * 0.62, my = horizon - h * 0.07, mr = Math.min(w, h) * (0.075 + f.level * 0.012);
    const halo = c.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    halo.addColorStop(0, css[3] + "66");
    halo.addColorStop(1, css[3] + "00");
    c.fillStyle = halo;
    c.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    c.fillStyle = css[4];
    c.globalAlpha = 0.85;
    c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    // ground below the horizon
    c.fillStyle = css[0];
    c.fillRect(0, horizon, w, h - horizon);

    const fog = 0.35 + f.b * 0.55;
    const rim = f.grid > 0.5 ? f.accent : f.transient;
    // back to front so nearer ridges occlude further ones
    for (let k = ROWS - 1; k >= 0; k--) {
      const z = k / (ROWS - 1); // 0 front, 1 back
      const persp = Math.pow(1 - z, 1.9);
      const y0 = horizon + persp * (h * 0.6);
      const amp = h * (0.035 + persp * 0.3);
      const spread = w * (0.55 + persp * 0.75);
      const r = rows[k];
      c.beginPath();
      for (let i = 0; i < COLS; i++) {
        const x = w / 2 + (i / (COLS - 1) - 0.5) * spread * 2;
        const y = y0 - r[i] * amp;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.lineTo(w * 2, y0 + 2);
      c.lineTo(-w, y0 + 2);
      c.closePath();
      // nearer ridges are darker against the lit mist behind them
      const mist = Math.min(1, z * fog * 1.6);
      c.fillStyle = css[0];
      c.fill();
      c.globalAlpha = mist * 0.75;
      c.fillStyle = css[1];
      c.fill();
      c.globalAlpha = (1 - z) * 0.9 * (1 - mist * 0.6) + 0.08;
      c.strokeStyle = k === 0 ? css[4] : z < 0.35 ? css[3] : css[2];
      c.lineWidth = f.px * (k === 0 ? 1.6 + rim * 2.5 : 1 + (1 - z) * 0.8);
      c.stroke();
    }
    c.globalAlpha = 1;
    // low mist bands drifting across the valley
    for (let i = 0; i < 3; i++) {
      const y = horizon + h * (0.05 + i * 0.09);
      const g = c.createLinearGradient(0, y - h * 0.05, 0, y + h * 0.05);
      g.addColorStop(0, css[1] + "00");
      g.addColorStop(0.5, css[2] + "22");
      g.addColorStop(1, css[1] + "00");
      c.fillStyle = g;
      c.globalAlpha = fog * (0.6 + 0.4 * Math.sin(f.time * 0.2 + i));
      c.fillRect(0, y - h * 0.05, w, h * 0.1);
    }
    c.globalAlpha = 1;
  },
};
