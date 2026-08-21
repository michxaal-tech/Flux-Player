import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

interface RingState {
  rot: number;
  dir: number;
  /** beat flare, decays to 0 */ flare: number;
  /** which panel the strobe is currently on */ cursor: number;
}

const RINGS = 4;
const PANELS = [8, 12, 16, 24];         // 60 glass panels total, fixed
const R0 = [0.16, 0.34, 0.52, 0.72];    // inner radius of each ring, as a fraction of the rose
const R1 = [0.32, 0.5, 0.7, 0.95];
const MAX_SHAFTS = 6;

// One pre-rendered light shaft, re-tinted only when the palette/mood key
// changes. Up to six sweep the frame every frame; a blurred gradient wedge per
// shaft per frame would not hold 60fps.
let shaftCv: HTMLCanvasElement | null = null;
let shaftKey = "";
const SW = 220, SH = 64;
function getShaft(inner: string, mid: string): HTMLCanvasElement {
  if (shaftCv && shaftKey === inner + mid) return shaftCv;
  const cv = shaftCv ?? document.createElement("canvas");
  cv.width = SW; cv.height = SH;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, SW, SH);
  const lg = g.createLinearGradient(0, 0, SW, 0);
  lg.addColorStop(0, inner);
  lg.addColorStop(0.4, mid);
  lg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(0, SH * 0.5 - 2);
  g.lineTo(SW, 0);
  g.lineTo(SW, SH);
  g.lineTo(0, SH * 0.5 + 2);
  g.closePath();
  g.fill();
  shaftCv = cv;
  shaftKey = inner + mid;
  return cv;
}

// A gothic rose window seen from inside the nave. Four traceried rings of
// coloured glass are lit from behind, and shafts of light fall through them
// into the dark. In a quiet passage the whole window turns with slow majesty
// and the glow behind it is warm and steady, two shafts drifting. As the music
// drives, the rings counter-rotate hard, a strobe runs around each ring firing
// panels in sequence, and six shafts whip across the frame; every beat flares
// the glass and throws the light.
export const CATHEDRAL: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, vt, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.cathedral ??= {
    rings: [] as RingState[],
    shafts: [] as { ang: number; sp: number; a: number }[],
    glowV: 0,
    sweep: 0,
  });

  const rings: RingState[] = S.rings;
  const shafts: { ang: number; sp: number; a: number }[] = S.shafts;
  if (rings.length === 0) {
    for (let i = 0; i < RINGS; i++) {
      rings.push({ rot: (i * 0.37) % (Math.PI * 2), dir: i % 2 === 0 ? 1 : -1, flare: 0, cursor: 0 });
    }
    for (let i = 0; i < MAX_SHAFTS; i++) {
      shafts.push({ ang: (i / MAX_SHAFTS) * Math.PI * 2, sp: (i % 2 === 0 ? 1 : -1) * (0.4 + Math.random() * 0.8), a: 0 });
    }
  }

  const E = energy;
  const rose = R * 0.46;
  S.glowV += ((0.35 + E * 0.4 + bassV * 0.25) - S.glowV) * ak(0.08, fs);

  // ── backlight behind the glass ────────────────────────────────────────────
  c.globalCompositeOperation = "source-over";
  const bl = rose * (1.5 + beatE * 0.25);
  const bg = c.createRadialGradient(cx, cy, 0, cx, cy, bl);
  bg.addColorStop(0, C1(0.28 + S.glowV * 0.2 + beatE * 0.14, 60 + E * 8));
  bg.addColorStop(0.45, C2(0.16 + S.glowV * 0.1, 44));
  bg.addColorStop(1, "transparent");
  c.fillStyle = bg;
  c.beginPath();
  c.arc(cx, cy, bl, 0, Math.PI * 2);
  c.fill();

  // ── the glass ─────────────────────────────────────────────────────────────
  // strobe cursor: parked when calm, racing around the rings when driving
  S.sweep += (0.006 + E * E * 0.5) * cfg.speed * fs;
  const strobeW = 0.6 + (1 - E) * 4.5;   // wide soft lighting → tight hard strobe

  for (let i = 0; i < RINGS; i++) {
    const rg = rings[i];
    const f = i / (RINGS - 1);
    rg.rot += rg.dir * (0.0016 + E * 0.026 * (0.5 + f) + beatE * 0.012 * E) * cfg.speed * fs;
    if (beat) rg.flare = Math.min(1, rg.flare + 0.5 + E * 0.5);
    rg.flare *= dk(0.87, fs);

    const n = PANELS[i];
    const inner = rose * R0[i];
    const outer = rose * R1[i];
    const gap = (Math.PI * 2 / n) * (0.1 + 0.06 * (1 - E));
    const step = (Math.PI * 2) / n;
    rg.cursor = (S.sweep * (1 + f * 0.6) * n * 0.25) % n;

    for (let k = 0; k < n; k++) {
      // distance (in panels) from the strobe cursor, wrapped
      let d = Math.abs(k - rg.cursor);
      if (d > n * 0.5) d = n - d;
      const hot = Math.max(0, 1 - d / strobeW);
      const a0 = rg.rot + k * step + gap * 0.5;
      const a1 = a0 + step - gap;
      c.beginPath();
      c.arc(cx, cy, outer, a0, a1);
      c.arc(cx, cy, inner, a1, a0, true);
      c.closePath();
      const tint = (k * 0.37 + i * 0.23) % 1;
      const lightAmt = 0.3 + S.glowV * 0.22 + hot * (0.24 + E * 0.26) + rg.flare * 0.16 * hot;
      const lum = 26 + f * 8 + hot * (16 + E * 18) + rg.flare * 8 * hot + midV * 6;
      c.fillStyle = CMix(tint, Math.min(0.82, lightAmt), Math.min(74, lum));
      c.fill();
    }
  }

  // ── stone tracery: one batched stroke for every mullion and ring ──────────
  c.globalCompositeOperation = "lighter";
  c.beginPath();
  for (let i = 0; i < RINGS; i++) {
    const rg = rings[i];
    const n = PANELS[i];
    const inner = rose * R0[i];
    const outer = rose * R1[i];
    c.moveTo(cx + outer, cy);
    c.arc(cx, cy, outer, 0, Math.PI * 2);
    c.moveTo(cx + inner, cy);
    c.arc(cx, cy, inner, 0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = rg.rot + k * ((Math.PI * 2) / n);
      const co = Math.cos(a), si = Math.sin(a);
      c.moveTo(cx + co * inner, cy + si * inner);
      c.lineTo(cx + co * outer, cy + si * outer);
    }
  }
  glow(Math.min(20, 7 + beatE * 9), C1());
  c.strokeStyle = C1(0.12 + beatE * 0.14 + E * 0.06, 52);
  c.lineWidth = (1 + beatE * 1.1) * TK;
  c.stroke();
  noGlow();

  // ── the oculus at the heart of the window ─────────────────────────────────
  // painted, not added — it sits in one place every frame
  c.globalCompositeOperation = "source-over";
  const oc = rose * R0[0] * (0.92 + beatE * 0.12);
  const og = c.createRadialGradient(cx, cy, 0, cx, cy, oc);
  og.addColorStop(0, C1(0.62 + beatE * 0.18, 70));
  og.addColorStop(0.55, C2(0.34 + S.glowV * 0.12, 52));
  og.addColorStop(1, "transparent");
  c.fillStyle = og;
  c.beginPath();
  c.arc(cx, cy, oc, 0, Math.PI * 2);
  c.fill();

  // ── light shafts falling through the glass ────────────────────────────────
  c.globalCompositeOperation = "lighter";
  const lum = Math.round((54 + E * 10 + beatE * 8) / 6) * 6;   // <= 72, quantised
  const spr = getShaft(C1(0.42, lum + 8), C2(0.18, lum));
  const want = 2 + Math.round(E * (MAX_SHAFTS - 2));
  const len = Math.hypot(w, h) * 0.75;
  const sweepSp = (0.0022 + E * E * 0.05) * cfg.speed;
  for (let i = 0; i < MAX_SHAFTS; i++) {
    const s = shafts[i];
    const alive = i < want;
    s.a += ((alive ? 1 : 0) - s.a) * ak(0.05, fs);
    if (s.a < 0.03) continue;
    s.ang += s.sp * sweepSp * (1 + beatE * 2.4 * E) * fs;
    if (beat && E > 0.45 && Math.random() < 0.4) s.sp = -s.sp;
    const wobble = Math.sin(vt * 0.01 + i * 1.7) * (0.04 + E * 0.12);
    const a = s.ang + wobble;
    const halfW = rose * (0.1 + E * 0.09) * (1 + beatE * 0.35);
    // a calm shaft drifts slowly, so its additive contribution is kept small
    c.globalAlpha = Math.min(0.3, s.a * (0.09 + E * 0.12 + beatE * 0.13) * I);
    c.save();
    c.translate(cx + Math.cos(a) * rose * 0.35, cy + Math.sin(a) * rose * 0.35);
    c.rotate(a);
    c.drawImage(spr, 0, -halfW, len, halfW * 2);
    c.restore();
  }
  c.globalAlpha = 1;
};
