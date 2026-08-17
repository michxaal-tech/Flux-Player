import type { ThemeDraw } from "../themeTypes";

interface Track {
  x: number; y: number;
  vx: number; vy: number;
  /** signed turn per frame — charge / momentum in the magnetic field */
  curl: number;
  /** energy loss: the track tightens as it slows */
  loss: number;
  a: number;
  /** colour tier 0..TIERS-1 */ tier: number;
  /** points written so far (capped at SEG) */ n: number;
  /** trail, newest at index 0 */ pts: Float32Array;
  live: number;
}
interface Dep { x: number; y: number; a: number; r: number; tier: number }

const MAXT = 180;    // track pool — hard cap, never grows
const SEG = 14;      // points kept per track
const TIERS = 4;
const MAX_DEP = 40;
const TICKS = 44;    // detector segmentation, fixed

// Pre-rendered energy-deposit bloom. One drawImage per deposit instead of a
// shadowBlur'd arc each.
const depCv: HTMLCanvasElement[] = [];
const depKey: string[] = [];
function getDep(i: number, hot: string, mid: string): HTMLCanvasElement {
  const key = hot + "|" + mid;
  let cv = depCv[i];
  if (cv && depKey[i] === key) return cv;
  cv = cv ?? document.createElement("canvas");
  cv.width = cv.height = 56;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 56, 56);
  const rg = g.createRadialGradient(28, 28, 0, 28, 28, 28);
  rg.addColorStop(0, hot);
  rg.addColorStop(0.34, mid);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 56, 56);
  depCv[i] = cv;
  depKey[i] = key;
  return cv;
}

// A particle detector seen down the beam axis. Beams collide at the centre and
// the debris sprays outward through a magnetic field, so every track curves —
// hard for the slow, soft-bending particles, barely at all for the stiff ones —
// and spirals in tighter as it loses energy. Tracks that make it to the
// calorimeter dump a bloom into the outer ring.
// A quiet passage gives you a rare, clean event: a handful of tracks drawing
// themselves slowly out to the wall, with long gaps of an empty, idling
// detector. A loud passage never stops: collisions stack on top of each other,
// the tracking volume fills with curling spray and the calorimeter saturates.
export const QUANTUM: ThemeDraw = ({
  c, w, h, cx, cy, R, vt, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.quantum ??= {
    tr: [] as Track[],
    dep: [] as Dep[],
    head: 0,
    flash: 0,
    idle: 0,
    sat: 0,
  });
  const tr: Track[] = S.tr;
  const dep: Dep[] = S.dep;
  if (tr.length === 0) {
    for (let i = 0; i < MAXT; i++) {
      tr.push({
        x: 0, y: 0, vx: 0, vy: 0, curl: 0, loss: 0, a: 0, tier: 0, n: 0,
        pts: new Float32Array(SEG * 2), live: 0,
      });
    }
  }

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const spd = cfg.speed;
  const rIn = R * 0.13;
  const rMid = R * 0.3;
  const rOut = R * 0.44;
  const rWall = R * 0.5;

  // --- background: the beam pipe volume, painted opaque ---------------------
  c.globalCompositeOperation = "source-over";
  const bgg = c.createRadialGradient(cx, cy, 0, cx, cy, rWall * 1.9);
  bgg.addColorStop(0, CMix(0.4, 1, 12 + bassV * 5 + beatE * 4));
  bgg.addColorStop(0.5, CMix(0.7, 1, 7));
  bgg.addColorStop(1, CMix(0.2, 1, 4));
  c.fillStyle = bgg;
  c.fillRect(0, 0, w, h);

  // --- fire collision events -----------------------------------------------
  S.idle -= 1;
  S.flash *= 0.86;
  S.sat = S.sat * 0.93 + E * 0.07;

  const fire = (mult: number) => {
    const n = Math.round((4 + E * 26) * mult);
    for (let k = 0; k < n; k++) {
      const t = tr[S.head];
      S.head = (S.head + 1) % MAXT;
      const ang = Math.random() * Math.PI * 2;
      // momentum: stiff tracks fly straight, soft ones curl into spirals
      const mom = 0.25 + Math.random() * 0.75;
      const v = R * (0.004 + mom * (0.012 + E * 0.022)) * spd * I;
      t.x = cx + (Math.random() - 0.5) * rIn * 0.2;
      t.y = cy + (Math.random() - 0.5) * rIn * 0.2;
      t.vx = Math.cos(ang) * v;
      t.vy = Math.sin(ang) * v;
      t.curl = (Math.random() < 0.5 ? -1 : 1) * (0.012 + (1 - mom) * (0.05 + E * 0.06));
      t.loss = 0.995 - (1 - mom) * 0.012 - E * 0.004;
      t.a = 1;
      t.tier = (Math.random() * TIERS) | 0;
      t.n = 0;
      t.live = 1;
    }
    S.flash = Math.min(1.4, S.flash + 0.5 + E * 0.7);
  };

  if (beat) {
    if (E < 0.34) {
      // rare, clean single events with real dead time between them
      if (S.idle <= 0) { fire(0.7); S.idle = Math.round(70 - E * 120); }
    } else {
      fire(1);
      if (E > 0.7 && Math.random() < E) fire(0.7);
    }
  }
  if (E > 0.5 && Math.random() < (E - 0.5) * 0.6) fire(0.35);

  // --- detector geometry ----------------------------------------------------
  const satL = Math.min(64, 34 + S.sat * 20 + beatE * 10);
  // inner tracker + calorimeter rings
  c.beginPath();
  c.arc(cx, cy, rIn, 0, Math.PI * 2);
  c.moveTo(cx + rMid, cy);
  c.arc(cx, cy, rMid, 0, Math.PI * 2);
  c.moveTo(cx + rOut, cy);
  c.arc(cx, cy, rOut, 0, Math.PI * 2);
  c.moveTo(cx + rWall, cy);
  c.arc(cx, cy, rWall, 0, Math.PI * 2);
  c.strokeStyle = C1(0.2 + S.sat * 0.18, satL - 6);
  c.lineWidth = 1 * TK;
  glow(Math.min(16, 6 * (1 + beatE)), C1());
  c.stroke();
  noGlow();
  // calorimeter cells: one batched path of radial ticks
  c.beginPath();
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2 + vt * 0.0004 * spd;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.moveTo(cx + ca * rOut, cy + sa * rOut);
    c.lineTo(cx + ca * rWall, cy + sa * rWall);
  }
  c.strokeStyle = C2(0.16 + S.sat * 0.16 + beatE * 0.1, satL);
  c.lineWidth = 1 * TK;
  c.stroke();
  // muon spokes outside the wall
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - vt * 0.0006 * spd;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.moveTo(cx + ca * rWall * 1.06, cy + sa * rWall * 1.06);
    c.lineTo(cx + ca * rWall * 1.3, cy + sa * rWall * 1.3);
  }
  c.strokeStyle = C1(0.12 + S.sat * 0.1, 40);
  c.lineWidth = 2.4 * TK;
  c.stroke();

  // --- propagate the tracks -------------------------------------------------
  const wallSq = rWall * rWall;
  for (let i = 0; i < MAXT; i++) {
    const t = tr[i];
    if (!t.live) continue;
    // bend in the field
    const ct = Math.cos(t.curl * spd), stt = Math.sin(t.curl * spd);
    const nvx = t.vx * ct - t.vy * stt;
    const nvy = t.vx * stt + t.vy * ct;
    t.vx = nvx * t.loss;
    t.vy = nvy * t.loss;
    t.x += t.vx;
    t.y += t.vy;
    t.a *= 0.988 - E * 0.012;
    // push the trail down one slot, newest first
    t.pts.copyWithin(2, 0, (SEG - 1) * 2);
    t.pts[0] = t.x;
    t.pts[1] = t.y;
    if (t.n < SEG) t.n++;

    const dx = t.x - cx, dy = t.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > wallSq) {
      // calorimeter hit
      if (dep.length < MAX_DEP) {
        const d = Math.sqrt(d2) || 1;
        dep.push({
          x: cx + (dx / d) * rWall * 0.94,
          y: cy + (dy / d) * rWall * 0.94,
          a: 0.8 + Math.random() * 0.2,
          r: R * (0.03 + Math.random() * 0.04) * (1 + E * 0.8),
          tier: t.tier,
        });
      }
      t.live = 0;
      continue;
    }
    if (t.a < 0.05) t.live = 0;
  }

  // --- draw the tracks: one batched, glowed stroke per colour tier ----------
  const lineL = Math.min(74, 56 + midV * 8 + beatE * 8);
  glow(Math.min(20, (7 + E * 8) * (1 + beatE * 0.8)), C1());
  c.lineWidth = (0.7 + E * 0.9 + beatE * 0.8) * TK;
  for (let q = 0; q < TIERS; q++) {
    c.beginPath();
    let any = false;
    for (let i = 0; i < MAXT; i++) {
      const t = tr[i];
      if (!t.live || t.tier !== q || t.n < 2) continue;
      const p = t.pts;
      c.moveTo(p[0], p[1]);
      for (let k = 1; k < t.n; k++) c.lineTo(p[k * 2], p[k * 2 + 1]);
      any = true;
    }
    if (!any) continue;
    c.strokeStyle = CMix(q / (TIERS - 1), Math.min(0.7, 0.3 + trebV * 0.2 + beatE * 0.2), lineL);
    c.stroke();
  }
  noGlow();

  // --- energy deposits in the calorimeter ----------------------------------
  if (dep.length) {
    const dl = Math.round((50 + E * 14 + beatE * 12) / 6) * 6;
    for (let q = 0; q < TIERS; q++) {
      getDep(q, CMix(q / (TIERS - 1), 0.75, Math.min(76, dl + 16)), CMix(q / (TIERS - 1), 0.34, dl));
    }
    c.globalCompositeOperation = "lighter";
    for (let i = dep.length - 1; i >= 0; i--) {
      const d = dep[i];
      d.a *= 0.9 - E * 0.03;
      d.r *= 1.02;
      if (d.a < 0.05) { dep.splice(i, 1); continue; }
      c.globalAlpha = Math.min(0.75, d.a * 0.7);
      c.drawImage(depCv[d.tier], d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  // --- the collision itself -------------------------------------------------
  if (S.flash > 0.03) {
    c.globalCompositeOperation = "lighter";
    const fr = rIn * (1.4 + S.flash * 1.6);
    const fg = c.createRadialGradient(cx, cy, 0, cx, cy, fr);
    fg.addColorStop(0, C1(Math.min(0.6, S.flash * 0.5), 76));
    fg.addColorStop(0.4, C2(Math.min(0.4, S.flash * 0.32), 60));
    fg.addColorStop(1, "transparent");
    c.fillStyle = fg;
    c.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
    // the two incoming beams
    c.strokeStyle = C2(Math.min(0.55, S.flash * 0.45), 70);
    c.lineWidth = (1 + S.flash * 2.5) * TK;
    c.beginPath();
    c.moveTo(cx - rWall * 1.35, cy);
    c.lineTo(cx - rIn * 0.4, cy);
    c.moveTo(cx + rIn * 0.4, cy);
    c.lineTo(cx + rWall * 1.35, cy);
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }
};
