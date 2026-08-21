import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// A storm seen from directly above its eye, and every drop is a strike.
//
// The spiral is drawn as arms rather than as a swirl of particles: each arm is
// one long stroked curve whose radius grows with angle, so a dozen strokes give
// something with real structure and depth for the cost of a dozen strokes. The
// arms rotate at different rates by radius — the inner ones faster, as a real
// vortex does — which is what stops it reading as a spinning picture.
//
// The strike is forked lightning drawn from the eye outward, with a white flash
// on the frame and a shock ring behind it. Lightning is a recursive bisect: take
// the line, push its middle sideways, repeat. Four levels is plenty and it is
// generated fresh per strike so no two are the same.

interface Bolt { pts: { x: number; y: number }[]; life: number; }
interface State { bolts: Bolt[]; flash: number; ring: number; ringA: number; spin: number; seen: number; }

/** A jagged path from a to b, by recursive midpoint displacement. */
function fork(ax: number, ay: number, bx: number, by: number, depth: number, amp: number): { x: number; y: number }[] {
  let pts = [{ x: ax, y: ay }, { x: bx, y: by }];
  for (let d = 0; d < depth; d++) {
    const next: { x: number; y: number }[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      // displace perpendicular to the segment, less each level
      const off = (Math.random() - 0.5) * amp * len;
      next.push({ x: mx - (dy / len) * off, y: my + (dx / len) * off });
      next.push(q);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

export const MAELSTROM: ThemeDraw = ({ c, w, h, cx, cy, R, fs, vt, freq, liveAudio, beat, beatE, dropE, bassV, midV, trebV, cfg, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.maelstrom ??= { bolts: [], flash: 0, ring: 0, ringA: 0, spin: 0, seen: 0 }) as State;

  if (L.dropSlots !== S.seen) {
    S.seen = L.dropSlots;
    S.flash = 1;
    S.ring = 0.04;
    S.ringA = 1;
    // several bolts out of the eye at once, in different directions
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const len = 0.75 + Math.random() * 0.6;
      S.bolts.push({ pts: fork(0, 0, Math.cos(a) * len, Math.sin(a) * len, 5, 0.42), life: 1 });
    }
  }
  S.flash *= dk(0.82, fs);

  S.spin += (0.0024 + beatE * 0.012 + dropE * 0.02) * cfg.speed * fs;

  // ── the storm floor: a dark wash that lifts toward the eye ──
  const floor = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
  floor.addColorStop(0, CMix(0.6, 0.3 + dropE * 0.3, 26));
  floor.addColorStop(0.6, CMix(0.2, 0.16, 14));
  floor.addColorStop(1, "transparent");
  c.fillStyle = floor;
  c.fillRect(0, 0, w, h);

  // ── the arms ──
  const ARMS = 11;
  for (let a = 0; a < ARMS; a++) {
    const f = a / ARMS;
    const band = liveAudio ? freq[Math.floor(10 + f * 180)] / 255 : 0.2;
    c.beginPath();
    const TURNS = 2.6;
    const STEPS = 54;
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      // inner radius turns faster: the differential is the vortex
      const rr = R * (0.05 + u * 0.92);
      const twist = S.spin * (1.9 - u * 1.35);
      const ang = f * Math.PI * 2 + u * TURNS * Math.PI * 2 + twist;
      // the arm breathes with its band, so the storm has texture
      const wob = Math.sin(u * 9 + vt * 0.01 + a) * R * 0.02 * (0.4 + band);
      const x = cx + Math.cos(ang) * (rr + wob);
      const y = cy + Math.sin(ang) * (rr + wob) * 0.82; // slight tilt, so it reads as seen from above
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = CMix(f, 0.16 + band * 0.5 * I + beatE * 0.16 + dropE * 0.2, 54 + band * 24);
    c.lineWidth = (0.9 + band * 3.4 + bassV * 1.6 + dropE * 2) * TK;
    glow(10 + beatE * 14 + dropE * 20, CMix(f));
    c.stroke();
    noGlow();
  }

  // ── the eye ──
  // Small and not very bright, because it never moves: the trail buffer
  // compounds a stationary fill to about five times what one frame draws, and
  // an eye that looked right in a single frame was a white hole a second later.
  const eyeR = R * (0.05 + bassV * 0.025 + S.flash * 0.1);
  const eye = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, eyeR * 2.6));
  eye.addColorStop(0, `hsla(0,0%,100%,${Math.min(0.5, 0.1 + S.flash * 0.34 + bassV * 0.1)})`);
  eye.addColorStop(0.35, C1(0.14 + S.flash * 0.22, 78));
  eye.addColorStop(1, "transparent");
  c.fillStyle = eye;
  c.beginPath();
  c.arc(cx, cy, eyeR * 2.6, 0, Math.PI * 2);
  c.fill();

  // ── the strike ──
  for (let i = S.bolts.length - 1; i >= 0; i--) {
    const b = S.bolts[i];
    b.life *= dk(0.8, fs);
    if (b.life < 0.05) { S.bolts.splice(i, 1); continue; }
    c.beginPath();
    for (let k = 0; k < b.pts.length; k++) {
      const p = b.pts[k];
      const x = cx + p.x * R, y = cy + p.y * R * 0.82;
      k === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    // wide coloured halo, then the white channel inside it
    c.strokeStyle = C2(b.life * 0.6, 70);
    c.lineWidth = (3 + b.life * 9) * TK;
    glow(30 * b.life, C2());
    c.stroke();
    noGlow();
    c.strokeStyle = `hsla(0,0%,100%,${Math.min(1, b.life * 1.1)})`;
    c.lineWidth = (0.8 + b.life * 2.2) * TK;
    c.stroke();
  }

  // ── the shock ring ──
  if (S.ringA > 0.02) {
    S.ring += (0.02 + bassV * 0.02) * fs;
    S.ringA *= dk(0.955, fs);
    c.beginPath();
    c.ellipse(cx, cy, S.ring * R * 2.2, S.ring * R * 1.8, 0, 0, Math.PI * 2);
    c.strokeStyle = `hsla(0,0%,100%,${S.ringA * 0.7})`;
    c.lineWidth = (1.5 + S.ringA * 6) * TK;
    glow(26 * S.ringA, C1());
    c.stroke();
    noGlow();
  }

  // ── the flash on the frame ──
  if (S.flash > 0.02) {
    c.fillStyle = `hsla(0,0%,100%,${S.flash * 0.3})`;
    c.fillRect(0, 0, w, h);
  }
  void midV;
  void trebV;
};
