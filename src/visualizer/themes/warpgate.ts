import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// A gate you are flying toward, and every drop is the moment it opens.
//
// Most of the time it is a ring structure ahead of you: concentric arcs
// counter-rotating, spokes, and a lens in the middle you cannot quite see
// through. On a drop the lens tears open, the rings slam outward past the
// camera, and the corridor behind it turns into streaks — the punch-through of
// every hyperspace shot ever filmed, which is exactly the reference.
//
// The streaks are what sell it, and they are cheap: a star is a line from where
// it was to where it is, so the faster it travels the longer it draws, with no
// motion blur pass anywhere.

interface Star { x: number; y: number; z: number; }
interface Ring { z: number; hot: number; }
interface State {
  stars: Star[];
  rings: Ring[];
  punch: number;
  seen: number;
  spin: number;
}

const STARS = 260;

export const WARPGATE: ThemeDraw = ({ c, w, h, cx, cy, R, fs, vt, freq, liveAudio, beat, beatE, dropE, bassV, midV, trebV, cfg, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.warpgate ??= { stars: [], rings: [], punch: 0, seen: 0, spin: 0 }) as State;
  if (!S.stars.length) {
    for (let i = 0; i < STARS; i++) {
      S.stars.push({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() });
    }
  }

  // ── the drop: punch through ──
  if (L.dropSlots !== S.seen) {
    S.seen = L.dropSlots;
    S.punch = 1;
    for (let i = 0; i < 5; i++) S.rings.push({ z: 0.98 - i * 0.06, hot: 1 });
  }
  S.punch *= dk(0.9, fs);

  const warp = S.punch * 1.6 + dropE * 0.7;
  S.spin += (0.0016 + beatE * 0.01 + warp * 0.02) * cfg.speed * fs;

  // ── the corridor ──
  // Stars fly toward the camera; how far they travel per unit time is the whole
  // sense of speed, so it is where the drop is felt before anything is drawn.
  const speed = (0.0022 + bassV * 0.02 + beatE * 0.01) * (1 + warp * 5) * cfg.speed;
  for (const s of S.stars) {
    const pz = s.z;
    s.z -= speed * fs;
    if (s.z <= 0.02) {
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = 1;
      continue;
    }
    const k = 0.95;
    const sx = cx + (s.x / s.z) * cx * k, sy = cy + (s.y / s.z) * cy * k;
    const px = cx + (s.x / pz) * cx * k, py = cy + (s.y / pz) * cy * k;
    const near = 1 - s.z;
    const col = CMix((s.x + s.y + 2) / 4, Math.min(1, 0.18 + near * 0.8), 70 + near * 22);
    c.strokeStyle = col;
    c.lineWidth = (0.5 + near * (1.6 + warp * 3)) * TK;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(sx, sy);
    c.stroke();
  }

  // ── the gate ──
  const gateR = R * (0.3 + bassV * 0.03) * (1 + S.punch * 0.5);
  const arcs = 7;
  for (let i = 0; i < arcs; i++) {
    const f = i / arcs;
    const dir = i % 2 ? 1 : -1;
    const rr = gateR * (0.55 + f * 0.85);
    const band = liveAudio ? freq[Math.floor(12 + f * 170)] / 255 : 0.2;
    const gap = 0.5 + band * 0.9 * I;
    const a0 = S.spin * dir * (1 + f * 0.7) + f * 2.1;
    c.beginPath();
    c.arc(cx, cy, rr, a0, a0 + gap);
    c.strokeStyle = CMix(f, 0.3 + band * 0.6 + beatE * 0.2, 62 + band * 20);
    c.lineWidth = (1.6 + band * 4 + beatE * 2) * TK;
    glow(12 + beatE * 16 + S.punch * 30, CMix(f));
    c.stroke();
    // a second arc opposite it, so the ring reads as a structure not a scratch
    c.beginPath();
    c.arc(cx, cy, rr, a0 + Math.PI, a0 + Math.PI + gap * 0.7);
    c.stroke();
    noGlow();
  }

  // spokes into the lens
  const spokes = 16;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + S.spin * 0.5;
    const inner = gateR * (0.3 + trebV * 0.08);
    const outer = gateR * (1.35 + midV * 0.1);
    c.strokeStyle = C2(0.1 + trebV * 0.35 + beatE * 0.2, 60);
    c.lineWidth = (0.7 + beatE * 1.2) * TK;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    c.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    c.stroke();
  }

  // ── the lens: closed and glowing, torn open on the drop ──
  const lensR = gateR * (0.3 + trebV * 0.05) * (1 + S.punch * 2.6);
  const lens = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, lensR));
  lens.addColorStop(0, `hsla(0,0%,100%,${Math.min(0.95, 0.25 + S.punch * 0.7 + bassV * 0.3)})`);
  lens.addColorStop(0.45, C1(0.4 + S.punch * 0.5, 82));
  lens.addColorStop(1, "transparent");
  c.fillStyle = lens;
  c.beginPath();
  c.arc(cx, cy, lensR, 0, Math.PI * 2);
  c.fill();

  // ── rings thrown off by the punch, racing past the camera ──
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const rg = S.rings[i];
    rg.z -= (0.012 + bassV * 0.02) * fs;
    rg.hot *= dk(0.985, fs);
    if (rg.z <= 0.02) { S.rings.splice(i, 1); continue; }
    const rr = (gateR * 1.1) / rg.z;
    if (rr > R * 4) { S.rings.splice(i, 1); continue; }
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.strokeStyle = `hsla(0,0%,100%,${Math.min(0.8, rg.hot * (1 - rg.z) * 0.9)})`;
    c.lineWidth = (1 + rg.hot * 5) * TK;
    glow(20 * rg.hot, C1());
    c.stroke();
    noGlow();
  }
};
