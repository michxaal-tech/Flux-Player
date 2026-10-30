import type { Frame, ModeDef } from "../types";

// ORBIT — an orrery seen from slightly above.
//
// Concentric orbits in perspective, each carrying bodies. With a trusted beat
// the bodies *tick* — each beat advances them one notch with a quick spring
// settle, like the escapement of a clock, and every bar a corona leaves the
// sun. Without one they glide continuously at a pace set by energy, so music
// with no steady pulse gets motion rather than a fake metronome. Each orbit
// glows with its own slice of the spectrum.

interface St {
  init?: boolean;
  glide: number;
  coronas: number[];
  sprite?: HTMLCanvasElement;
  spriteFor?: string;
}

/** spring-ish tick: fast out, small overshoot, settle — over one beat */
const tick = (p: number) => {
  const k = Math.min(1, p / 0.42);
  return 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08 * (1 - k);
};

function glowSprite(st: St, color: string): HTMLCanvasElement {
  if (st.sprite && st.spriteFor === color) return st.sprite;
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const c = s.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.18, color);
  g.addColorStop(0.4, color + "55");
  g.addColorStop(1, color + "00");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  st.sprite = s;
  st.spriteFor = color;
  return s;
}

export const orbit: ModeDef = {
  id: "orbit",
  name: "Orbit",
  line: "An orrery that keeps time",
  reacts: "Beats tick the bodies forward · bars release coronas · spectrum lights each orbit",
  dials: ["Orbits", "Tilt"],
  kind: "2d",
  draw: (c, f: Frame, raw) => {
    const st = raw as unknown as St;
    if (!st.init) { st.init = true; st.glide = 0; st.coronas = []; }
    const { w, h, css } = f;
    c.fillStyle = css[0];
    c.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.53;
    const R = Math.min(w * 0.46, h * 0.78);
    const tilt = 0.22 + f.b * 0.4;
    const rings = 4 + Math.round(f.a * 5);
    // continuous glide when there is no trusted grid
    st.glide += f.dt * (0.08 + f.energy * 0.35 + f.drift * 0.05) * (f.playing ? 1 : 0.35);
    if (f.onBar && f.grid > 0.4) st.coronas.push(0);
    if (!f.playing && Math.random() < f.dt * 0.15 * f.drift) st.coronas.push(0);
    // faint field
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3);
    bg.addColorStop(0, css[1] + "cc");
    bg.addColorStop(1, css[0] + "00");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    const sprite = glowSprite(st, css[3]);
    const spark = glowSprite({ glide: 0, coronas: [] }, css[4]);
    type Body = { x: number; y: number; z: number; r: number; a: number; k: number };
    const bodies: Body[] = [];
    c.lineWidth = Math.max(1, f.px * 0.8);
    for (let i = 0; i < rings; i++) {
      const fr = (i + 1) / (rings + 0.6);
      const rx = R * fr, ry = rx * tilt;
      const band = f.spectrum[Math.min(f.spectrum.length - 1, Math.floor((i / rings) * 40) + 2)] ?? 0;
      c.strokeStyle = css[2];
      c.globalAlpha = 0.16 + band * 0.5 * (1 - f.calm * 0.5);
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
      // bodies: inner orbits go faster, each orbit its own notch size
      const per = 1 + (i % 3);
      const notch = (Math.PI * 2) / (8 + i * 4);
      const dir = i % 2 ? -1 : 1;
      const ticked = (f.beatIndex + tick(f.phase)) * notch;
      const glide = st.glide * (1.6 / (1 + i * 0.45)) * Math.PI;
      const base = (f.grid * ticked + (1 - f.grid) * glide) * dir + i * 1.3;
      for (let k = 0; k < per; k++) {
        const a = base + (k / per) * Math.PI * 2;
        bodies.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, z: Math.sin(a), r: (3 + (rings - i) * 0.9 + band * 6) * f.px, a, k: i });
      }
    }
    c.globalAlpha = 1;
    const drawBody = (b: Body) => {
      const depth = 0.55 + b.z * 0.45;
      const s = b.r * (0.8 + depth * 0.5) * 4;
      c.globalAlpha = 0.35 + depth * 0.65;
      // trail: a short arc behind the body
      c.drawImage(sprite, b.x - s / 2, b.y - s / 2, s, s);
    };
    // back half, sun, front half — so bodies pass behind it
    bodies.filter((b) => b.z < 0).forEach(drawBody);
    c.globalAlpha = 1;
    const sunR = R * (0.07 + f.bass * 0.03 + f.accent * 0.015);
    const sg = c.createRadialGradient(cx, cy, 0, cx, cy, sunR * 5);
    sg.addColorStop(0, css[4]);
    sg.addColorStop(0.16, css[3]);
    sg.addColorStop(0.4, css[2] + "55");
    sg.addColorStop(1, css[2] + "00");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(cx, cy, sunR * 5, 0, Math.PI * 2);
    c.fill();
    // coronas: rings leaving the sun on each bar
    for (let i = st.coronas.length - 1; i >= 0; i--) {
      st.coronas[i] += f.dt * 0.45;
      const p = st.coronas[i];
      if (p > 1) { st.coronas.splice(i, 1); continue; }
      c.strokeStyle = css[3];
      c.globalAlpha = (1 - p) * 0.55;
      c.lineWidth = f.px * (2.5 - p * 2);
      c.beginPath();
      c.ellipse(cx, cy, sunR + p * R, (sunR + p * R) * tilt, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    bodies.filter((b) => b.z >= 0).forEach(drawBody);
    // the beat's own mark: one spark that runs the outer orbit once per bar
    if (f.grid > 0.3) {
      const rx = R * (rings / (rings + 0.6));
      const a = f.barPhase * Math.PI * 2 - Math.PI / 2;
      const s = 26 * f.px;
      c.globalAlpha = f.grid * 0.9;
      c.drawImage(spark, cx + Math.cos(a) * rx - s / 2, cy + Math.sin(a) * rx * tilt - s / 2, s, s);
    }
    c.globalAlpha = 1;
  },
};
