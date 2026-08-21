import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// The screen is a sheet of black glass with something behind it, and every drop
// breaks it further.
//
// The cracks are permanent for the length of the track: each drop drives a new
// fracture out from the last break rather than resetting, so by the third one
// the frame is a spiderweb with light pouring through it. That accumulation is
// the point — a drop that flashes and returns to the same picture has no
// consequence, and consequence is what makes one feel like an event.
//
// Cracks are grown once and then only *lit*, not regenerated: a fracture that
// redraws itself every frame reads as static, and the drawing cost of a hundred
// branching polylines is not something to pay sixty times a second.

interface Crack {
  /** points along the fracture, in unit space from the origin */
  pts: { x: number; y: number }[];
  /** 0..1 how far it has opened */
  open: number;
  /** how bright the light through it is right now */
  heat: number;
  born: number;
}

interface Shard {
  x: number; y: number; vx: number; vy: number;
  rot: number; spin: number; size: number; a: number;
}

interface State {
  cracks: Crack[];
  shards: Shard[];
  flash: number;
  seen: number;
  seed: number;
}

/** Deterministic per-theme noise, so a crack keeps its shape frame to frame. */
function grow(S: State, ox: number, oy: number, len: number, ang: number): Crack {
  const rnd = () => ((S.seed = (S.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pts = [{ x: ox, y: oy }];
  let x = ox, y = oy, a = ang;
  const steps = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < steps; i++) {
    // the jitter grows along the fracture, so it frays rather than staying a line
    a += (rnd() - 0.5) * (0.35 + (i / steps) * 0.5);
    const step = (len / steps) * (0.6 + rnd() * 0.8);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push({ x, y });
  }
  return { pts, open: 0, heat: 1, born: 0 };
}

export const RUPTURE: ThemeDraw = ({ c, w, h, cx, cy, R, fs, vt, freq, liveAudio, beat, beatE, dropE, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.rupture ??= { cracks: [], shards: [], flash: 0, seen: 0, seed: 991 }) as State;

  // The sheet starts already damaged. Waiting for the first drop left the
  // theme as a ring on an empty field for however long the intro runs, which
  // is a bad first impression and not what anyone picked it for — the drops
  // should make it *worse*, not make it exist.
  if (!S.cracks.length) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const ck = grow(S, Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.5, a);
      ck.heat = 0.12;
      S.cracks.push(ck);
    }
  }

  // ── a new drop: break it further ──
  if (L.dropSlots !== S.seen) {
    S.seen = L.dropSlots;
    S.flash = 1;
    // Each break starts from an existing crack's tip where there is one, so the
    // damage spreads through the sheet instead of appearing beside it.
    let from = { x: 0, y: 0 };
    if (S.cracks.length) {
      const pick = S.cracks[Math.floor(Math.random() * S.cracks.length)].pts;
      from = pick[pick.length - 1];
    }
    const branches = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < branches; i++) {
      const ang = (i / branches) * Math.PI * 2 + Math.random() * 0.7;
      S.cracks.push(grow(S, from.x, from.y, 0.42 + Math.random() * 0.5, ang));
    }
    // and the sheet throws off shards
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.004 + Math.random() * 0.016;
      S.shards.push({
        x: from.x, y: from.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.002,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.14,
        size: 0.012 + Math.random() * 0.045, a: 1,
      });
    }
    if (S.cracks.length > 90) S.cracks.splice(0, S.cracks.length - 90);
  }

  S.flash *= dk(0.88, fs);

  // ── the light behind the glass ──
  //
  // Kept deliberately dim, and this is the whole difficulty of the theme. The
  // trail buffer adds each frame to the last, so anything large, bright and
  // stationary converges to roughly five times its per-frame brightness: a
  // backlight that looked right in one frame turned the entire screen into a
  // white disc within a second, with the cracks invisible inside it.
  //
  // So the light in this theme is the *cracks* — glow around a filament is
  // local and thin, and thin things do not compound. This is only the hint of
  // something behind them.
  const heat = 0.06 + bassV * 0.09 + dropE * 0.12 + S.flash * 0.16;
  const back = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.5 + dropE * 0.3));
  back.addColorStop(0, C1(Math.min(0.22, heat), 62));
  back.addColorStop(0.55, C2(Math.min(0.12, heat * 0.5), 48));
  back.addColorStop(1, "transparent");
  c.fillStyle = back;
  c.fillRect(0, 0, w, h);

  // ── the cracks ──
  const scale = R;
  for (const ck of S.cracks) {
    ck.born += fs;
    // opens quickly then settles, so a fresh break lurches apart and the old
    // ones sit still
    ck.open += (1 - ck.open) * (1 - dk(0.86, fs));
    ck.heat = Math.max(dropE * 0.8 + bassV * 0.35, ck.heat * dk(0.97, fs));
    const spread = 1 + ck.open * 0.08 + dropE * 0.05;

    c.beginPath();
    for (let i = 0; i < ck.pts.length; i++) {
      const p = ck.pts[i];
      const x = cx + p.x * scale * spread;
      const y = cy + p.y * scale * spread;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    // the glow first, wide and dim, then a white-hot filament inside it
    c.strokeStyle = CMix((ck.pts[0].x + 1) * 0.5, Math.min(0.9, 0.18 + ck.heat * 0.7), 62 + ck.heat * 22);
    c.lineWidth = (1.6 + ck.heat * 5 + bassV * 1.4) * TK;
    glow(14 + ck.heat * 26, C1());
    c.stroke();
    noGlow();
    c.strokeStyle = `hsla(0,0%,100%,${Math.min(0.95, 0.12 + ck.heat * 0.75)})`;
    c.lineWidth = Math.max(0.4, (0.5 + ck.heat * 1.6) * TK);
    c.stroke();
  }

  // ── the stress pattern in the glass ──
  //
  // Faceted rather than round: a smooth circle on this theme reads as a hoop
  // sitting in front of the sheet, and the point is that everything here is
  // the sheet. Few enough segments that each edge is visibly straight, and the
  // spectrum pushes the corners rather than the whole ring.
  for (let ring = 0; ring < 3; ring++) {
    const rf = 0.22 + ring * 0.15;
    const SEG = 13 + ring * 4;
    c.beginPath();
    for (let i = 0; i <= SEG; i++) {
      const f = (i % SEG) / SEG;
      const a = f * Math.PI * 2 + vt * 0.0008 * (ring % 2 ? 1 : -1) + ring;
      const v = liveAudio ? freq[Math.floor(8 + f * 200)] / 255 : 0.14 + 0.08 * Math.sin(vt * 0.02 + i);
      const r = R * (rf + v * 0.12 * I + beatE * 0.02 + dropE * 0.05);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath();
    c.strokeStyle = CMix(ring / 3, 0.1 + midV * 0.24 + beatE * 0.16 + dropE * 0.2, 56);
    c.lineWidth = (0.6 + trebV * 1.3 + dropE * 1.4) * TK;
    glow(6 + dropE * 14, C2());
    c.stroke();
    noGlow();
  }

  // ── shards ──
  for (let i = S.shards.length - 1; i >= 0; i--) {
    const sh = S.shards[i];
    sh.x += sh.vx * fs;
    sh.y += sh.vy * fs;
    sh.vy += 0.00028 * fs; // they fall
    sh.rot += sh.spin * fs;
    sh.a *= dk(0.985, fs);
    if (sh.a < 0.04) { S.shards.splice(i, 1); continue; }
    const x = cx + sh.x * scale, y = cy + sh.y * scale;
    const s = sh.size * scale;
    c.save();
    c.translate(x, y);
    c.rotate(sh.rot);
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.55, s * 0.3);
    c.lineTo(-s * 0.4, s * 0.7);
    c.closePath();
    c.fillStyle = CMix((sh.x + 1) * 0.5, sh.a * 0.5, 66);
    c.fill();
    c.strokeStyle = `hsla(0,0%,100%,${sh.a * 0.6})`;
    c.lineWidth = 0.8 * TK;
    c.stroke();
    c.restore();
  }

  // ── the moment itself ──
  if (S.flash > 0.02) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.4 + S.flash * 1.3));
    g.addColorStop(0, `hsla(0,0%,100%,${S.flash * 0.34})`);
    g.addColorStop(0.4, C1(S.flash * 0.22, 88));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
};
