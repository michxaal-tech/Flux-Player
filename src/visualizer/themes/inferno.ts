import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { light } from "../light";

// A firestorm, and every drop detonates in it.
//
// Three layers make it read as fire rather than as orange particles: a column
// of heat that rises and shears sideways, embers that are *lit* rather than
// filled so they bloom into each other, and a dark smoke canopy above that the
// light has to push through. The canopy is what gives the drop somewhere to go
// — a blast with nothing overhead just fades out.
//
// The detonation is a shockwave ring plus an ember blast plus a column of white
// fire up the middle, all on the same envelope, because one of those alone
// reads as an effect and three together read as an event.

interface Ember { x: number; y: number; vx: number; vy: number; r: number; a: number; hue: number; }
interface Wave { r: number; a: number; }
interface State { embers: Ember[]; waves: Wave[]; blast: number; seen: number; }

const BASE_EMBERS = 120;

export const INFERNO: ThemeDraw = ({ c, w, h, cx, cy, R, fs, vt, freq, liveAudio, beat, beatE, dropE, bassV, midV, trebV, cfg, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.inferno ??= { embers: [], waves: [], blast: 0, seen: 0 }) as State;

  if (L.dropSlots !== S.seen) {
    S.seen = L.dropSlots;
    S.blast = 1;
    S.waves.push({ r: 0.02, a: 1 });
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const sp = 0.004 + Math.random() * 0.02;
      S.embers.push({
        x: 0.5 + (Math.random() - 0.5) * 0.08,
        y: 0.98,
        vx: Math.cos(a) * sp * 0.7,
        vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 7,
        a: 1,
        hue: Math.random(),
      });
    }
  }
  S.blast *= dk(0.9, fs);

  const lift = 1 + bassV * 1.2 + dropE * 1.4 + S.blast * 2;

  // ── the heat column ──
  // Drawn as stacked horizontal bands whose width swells with the low end and
  // shears with a slow sine, which is a great deal cheaper than any real fluid
  // and reads the same at this scale.
  // Enough bands that they overlap into a body rather than reading as
  // stripes — at 28 the gaps between them were visible as scanlines.
  const bands = 46;
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < bands; i++) {
    const f = i / bands;
    const y = h * (1.02 - f * 1.05);
    const band = liveAudio ? freq[Math.floor(4 + f * 90)] / 255 : 0.2;
    const shear = Math.sin(vt * 0.006 + f * 3.1) * w * 0.09 * f;
    // Kept to a column. This grew to `w * 0.45 * lift` at the top, which is
    // wider than the screen — so the fire was not a column at all, it was the
    // whole frame with horizontal banding on it.
    const wd = w * (0.035 + f * 0.085 + band * 0.05 * I) * Math.min(2, lift);
    const a = (1 - f) * (0.15 + band * 0.26 + beatE * 0.08) * (0.6 + S.blast);
    const g = c.createLinearGradient(cx + shear - wd, 0, cx + shear + wd, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.5, CMix(0.1 + f * 0.55, Math.min(0.9, a), 56 + (1 - f) * 26));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(cx + shear - wd, y - h * 0.03, wd * 2, h * 0.04);
  }

  // ── embers ──
  const want = Math.floor(BASE_EMBERS * (0.4 + (cfg.particles ?? 1) * 0.6));
  while (S.embers.length < want) {
    S.embers.push({
      x: 0.5 + (Math.random() - 0.5) * 0.5,
      y: 1 + Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 0.0016,
      vy: -(0.0016 + Math.random() * 0.004),
      r: 1.5 + Math.random() * 5,
      a: 0.5 + Math.random() * 0.5,
      hue: Math.random(),
    });
  }
  for (let i = S.embers.length - 1; i >= 0; i--) {
    const e = S.embers[i];
    e.x += (e.vx + Math.sin(vt * 0.004 + e.hue * 9) * 0.0012) * fs;
    e.y += e.vy * (1 + bassV * 0.8 + S.blast * 2) * fs;
    e.vy *= dk(0.997, fs);
    e.a *= dk(0.992, fs);
    if (e.y < -0.06 || e.a < 0.05) {
      if (S.embers.length > want) { S.embers.splice(i, 1); continue; }
      e.x = 0.5 + (Math.random() - 0.5) * 0.5;
      e.y = 1.05;
      e.vy = -(0.0016 + Math.random() * 0.004);
      e.a = 0.5 + Math.random() * 0.5;
      continue;
    }
    // quantised colour: the light sprite is cached per colour string, and a
    // continuously varying one rebuilds a canvas per ember
    const q = Math.round(e.hue * 5) / 5;
    light(c, CMix(0.05 + q * 0.45, 1, 66), e.x * w, e.y * h, e.r * TK * (1.4 + S.blast), e.a * (0.9 + trebV * 0.6));
  }

  // ── the smoke canopy ──
  // Sits over the top of the frame and is pushed *up* by the blast, so the
  // detonation has something to shove.
  c.globalCompositeOperation = "source-over";
  // Shallower and thinner than it was: at a third of the frame in near-opaque
  // black it was not a canopy over a fire, it was a lid on one — the top half
  // of the picture went dead and took the sense of scale with it.
  const roof = h * (0.17 - S.blast * 0.08 - dropE * 0.04);
  const smoke = c.createLinearGradient(0, 0, 0, roof + h * 0.2);
  smoke.addColorStop(0, "rgba(4,4,7,0.8)");
  smoke.addColorStop(0.6, `rgba(8,6,10,${0.4 - S.blast * 0.18})`);
  smoke.addColorStop(1, "transparent");
  c.fillStyle = smoke;
  c.fillRect(0, 0, w, roof + h * 0.2);
  // lit underside, so the fire is clearly under it
  const under = c.createLinearGradient(0, roof + h * 0.1, 0, roof - h * 0.08);
  under.addColorStop(0, C1((0.2 + bassV * 0.3 + S.blast * 0.6) * 0.8, 64));
  under.addColorStop(1, "transparent");
  c.fillStyle = under;
  c.fillRect(0, roof - h * 0.08, w, h * 0.2);

  c.globalCompositeOperation = "lighter";

  // ── the detonation ──
  for (let i = S.waves.length - 1; i >= 0; i--) {
    const wv = S.waves[i];
    wv.r += (0.012 + bassV * 0.01) * fs;
    wv.a *= dk(0.97, fs);
    if (wv.a < 0.03 || wv.r > 2) { S.waves.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, h, wv.r * R * 2.4, Math.PI, Math.PI * 2);
    c.strokeStyle = C1(wv.a * 0.8, 88);
    c.lineWidth = (2 + wv.a * 7) * TK;
    glow(24 * wv.a, C1());
    c.stroke();
    noGlow();
  }

  if (S.blast > 0.02) {
    // a column of white fire straight up the middle
    const g = c.createLinearGradient(0, h, 0, h * (0.1 - S.blast * 0.1));
    g.addColorStop(0, `hsla(0,0%,100%,${S.blast * 0.85})`);
    g.addColorStop(0.35, C1(S.blast * 0.6, 86));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    const cw = w * (0.05 + S.blast * 0.16);
    c.fillRect(cx - cw, 0, cw * 2, h);
  }

  c.globalCompositeOperation = "source-over";
  void midV;
};
