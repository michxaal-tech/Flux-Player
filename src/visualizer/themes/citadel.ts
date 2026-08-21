import type { ThemeDraw } from "../themeTypes";
import { dk, ak } from "../rate";

/** One extruded block of the city, living in world space (u lateral, d depth). */
interface Tower {
  /** stable random, re-rolled on recycle — drives the layout rule */
  rs: number;
  u: number;
  /** lateral target; u eases toward it so section changes re-plan the skyline */
  uT: number;
  d: number;
  /** half width, world units */
  wd: number;
  bin: number;
  /** smoothed spectrum height 0..~1.25 */
  hs: number;
  /** percussive window-flare, decays fast */
  lit: number;
  hue: number;
  ph: number;
  /** rebuild ramp: <=0 rubble, 1 fully raised */
  rb: number;
  // ── screen-space cache, recomputed in place every frame (no allocation) ──
  sxL: number;
  sxR: number;
  yB: number;
  yT: number;
}
interface Shard {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; a: number; sz: number;
}
interface CitadelState {
  tw: Tower[];
  sh: Shard[];
  gridPh: number;
  /** skyward beam envelope */
  beam: number;
  /** ground shockwave radius 0..1 and its alpha */
  ring: number;
  ringA: number;
  /** drop arming latch + observed peak of dropE */
  arm: number;
  peak: number;
  flash: number;
  /** smoothed layer weights */
  w2: number;
  w3: number;
  /** smoothed dropE — the "charge" */
  chg: number;
  sec: number;
}

const TAU = Math.PI * 2;
const TOWER_N = 56;          // hard cap — never scales with canvas size
const SHARD_N = 96;
const DNEAR = 0.62;
const DFAR = 5.2;
const GLAT = 12;             // lateral grid lines
const GRATIO = Math.pow(DFAR / DNEAR, 1 / GLAT);
const BRIDGE_MAX = 26;
const RING_MAX = 7;

const cl01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const byDepth = (a: Tower, b: Tower) => b.d - a.d;   // far → near painter's order
const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/** The city re-plans itself when the arrangement turns over. */
const layoutU = (r: number, sec: number) => {
  const m = ((sec % 3) + 3) % 3;
  if (m === 1) return (r < 0.5 ? -1 : 1) * (0.5 + (r < 0.5 ? r : r - 0.5) * 2.4); // avenue
  if (m === 2) return (r - 0.5) * 1.5;                                            // dense core
  return (r - 0.5) * 2.9;                                                         // sprawl
};
const bandOf = (d: number) => (d < 1.5 ? 0 : d < 2.8 ? 1 : 2);

// A vast structure assembling itself out of the dark, in stages.
//   • quiet   — nothing but a lone foundation grid receding to the horizon
//   • rising  — towers extrude upward off the grid, heights tracking the spectrum
//   • driving — orbiting rings and light-bridges lace the skyline together
//   • drop    — the charge runs up every tower, then a beam erupts skyward, the
//               skyline blows apart into shards and rebuilds itself block by block
export const CITADEL: ThemeDraw = ({
  c, w, h, cx, R, fs, freq, liveAudio, vt, beat, beatE, hit, hitE, energy, dropE, section,
  cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S: CitadelState = (L.scratch.citadel ??= {
    tw: [] as Tower[],
    sh: [] as Shard[],
    gridPh: 0, beam: 0, ring: 0, ringA: 0,
    arm: 0, peak: 0, flash: 0,
    w2: 0, w3: 0, chg: 0, sec: -1,
  });

  if (S.tw.length === 0) {
    for (let i = 0; i < TOWER_N; i++) {
      const rs = Math.random();
      S.tw.push({
        rs, u: layoutU(rs, 0), uT: layoutU(rs, 0),
        d: DNEAR + ((i + 0.5) / TOWER_N) * (DFAR - DNEAR),
        wd: 0.028 + Math.random() * 0.05,
        bin: 3 + ((Math.random() * 96) | 0),
        hs: 0, lit: 0, hue: Math.random(), ph: Math.random(), rb: 1,
        sxL: 0, sxR: 0, yB: 0, yT: 0,
      });
    }
  }

  // ── arrangement change: new street plan + new palette mix ────────────────
  if (section !== S.sec) {
    S.sec = section;
    for (let i = 0; i < TOWER_N; i++) {
      const t = S.tw[i];
      t.rs = Math.random();
      t.uT = layoutU(t.rs, section);
      t.hue = Math.random();
    }
  }

  // ── layer weights: smoothed so nothing flickers at a threshold ───────────
  S.w2 += (cl01((energy - 0.24) / 0.26) - S.w2) * ak(0.035, fs);
  S.w3 += (cl01((energy - 0.52) / 0.28) - S.w3) * ak(0.025, fs);
  S.chg += (dropE - S.chg) * ak(0.14, fs);
  const w2 = S.w2, w3 = S.w3, chg = S.chg;

  const HZ = h * 0.42;                 // horizon
  const PX = w * 0.46;                 // lateral projection scale
  const PY = h * 0.30;                 // ground drop below horizon
  const bx = cx, by = HZ + PY / 1.35;  // where the beam stands

  // ── detonation ───────────────────────────────────────────────────────────
  const detonate = () => {
    S.beam = 1;
    S.ring = 0.02;
    S.ringA = 1;
    S.flash = 0.9;
    for (let i = 0; i < TOWER_N && S.sh.length < SHARD_N; i++) {
      const t = S.tw[i];
      const hgt = t.yB - t.yT;
      if (hgt < 3) continue;
      const n = hgt > h * 0.12 ? 3 : 2;
      for (let k = 0; k < n && S.sh.length < SHARD_N; k++) {
        const a2 = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = h * (0.004 + Math.random() * 0.012);
        S.sh.push({
          x: (t.sxL + t.sxR) * 0.5 + (Math.random() - 0.5) * (t.sxR - t.sxL),
          y: t.yT + Math.random() * hgt * 0.5,
          vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.22,
          a: 1, sz: R * (0.006 + Math.random() * 0.016),
        });
      }
      t.rb = -t.ph * 0.9;              // staggered rebuild
      t.hs *= 0.2;
    }
  };
  if (dropE > 0.55) { S.arm = 1; if (dropE > S.peak) S.peak = dropE; }
  if (S.arm && (dropE < S.peak * 0.8 || dropE < 0.28)) { detonate(); S.arm = 0; S.peak = 0; }

  // ═════ painted scene, source-over — additive full-screen fills white out ══
  c.globalCompositeOperation = "source-over";

  const sky = c.createLinearGradient(0, 0, 0, HZ + 1);
  sky.addColorStop(0, CMix(0.12, 0.5, 6 + S.beam * 4));
  sky.addColorStop(1, CMix(0.72, 0.42 + chg * 0.1, 15 + S.beam * 8 - chg * 6));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, HZ + 1);

  const gnd = c.createLinearGradient(0, HZ, 0, h);
  gnd.addColorStop(0, CMix(0.6, 0.48, 13 - chg * 5));
  gnd.addColorStop(1, C2(0.5, 5));
  c.fillStyle = gnd;
  c.fillRect(0, HZ, w, h - HZ);

  // horizon haze — the only thing lighting the plain in the intro
  const hz = c.createRadialGradient(cx, HZ, 0, cx, HZ, R * 0.75);
  hz.addColorStop(0, C1(0.13 + beatE * 0.07 + w2 * 0.06, 44));
  hz.addColorStop(0.5, CMix(0.5, 0.06, 30));
  hz.addColorStop(1, "transparent");
  c.fillStyle = hz;
  c.fillRect(0, 0, w, h);

  // ── LAYER 1 — the foundation grid, always present ────────────────────────
  S.gridPh += (0.0016 + energy * 0.0042) * cfg.speed * fs;
  const frac = S.gridPh - Math.floor(S.gridPh);
  const gFar = new Path2D();
  const gNear = new Path2D();
  for (let k = 0; k <= GLAT; k++) {
    const d = DNEAR * Math.pow(GRATIO, k + 1 - frac);
    if (d > DFAR) continue;
    const s = 1 / d;
    const y = HZ + PY * s;
    const P = d < 1.7 ? gNear : gFar;
    P.moveTo(cx - 1.75 * PX * s, y);
    P.lineTo(cx + 1.75 * PX * s, y);
  }
  const sA = 1 / DNEAR, sB = 1 / DFAR;
  for (let i = -7; i <= 7; i++) {
    const u = i * 0.25;
    gFar.moveTo(cx + u * PX * sA, HZ + PY * sA);
    gFar.lineTo(cx + u * PX * sB, HZ + PY * sB);
  }
  const gA = 0.14 + midV * 0.1 + beatE * 0.12 + hitE * 0.09 + chg * 0.12;
  glow(Math.min(26, 8 + beatE * 8 + chg * 8), C1());
  c.strokeStyle = C1(Math.min(0.42, gA), 50);
  c.lineWidth = 0.8 * TK;
  c.stroke(gFar);
  c.strokeStyle = CMix(0.5, Math.min(0.58, gA * 1.4), 62);
  c.lineWidth = (0.9 + beatE * 1.1) * TK;
  c.stroke(gNear);
  noGlow();

  // ── advance the towers ───────────────────────────────────────────────────
  const fl = freq.length || 1;
  const flow = (0.0016 + energy * 0.0034) * cfg.speed * fs;
  const slide = ak(0.03, fs);
  const cool = dk(0.86, fs);
  for (let i = 0; i < TOWER_N; i++) {
    const t = S.tw[i];
    t.d -= flow;
    if (t.d < DNEAR) {
      t.d = DFAR;
      t.rs = Math.random();
      t.uT = layoutU(t.rs, S.sec);
      t.u = t.uT;
      t.wd = 0.028 + Math.random() * 0.05;
      t.bin = 3 + ((Math.random() * 96) | 0);
      t.hue = Math.random();
      t.hs = 0;
      t.rb = 0.1;
    }
    t.u += (t.uT - t.u) * slide;
    const fv = liveAudio
      ? freq[t.bin % fl] / 255
      : 0.3 + 0.26 * Math.sin(vt * 0.012 + t.ph * 6.2);
    const tgt = Math.min(1.25, (0.1 + fv * 1.05) * (0.45 + energy * 0.75) * (0.65 + I * 0.45));
    t.hs += (tgt - t.hs) * ak(0.1 + beatE * 0.22, fs);
    if (t.rb < 1) t.rb = Math.min(1, t.rb + (0.011 + t.ph * 0.016) * cfg.speed * fs);
    t.lit *= cool;
  }
  if (hit) for (let k = 0; k < 5; k++) S.tw[(Math.random() * TOWER_N) | 0].lit = 1;
  S.tw.sort(byDepth);

  for (let i = 0; i < TOWER_N; i++) {
    const t = S.tw[i];
    const s = 1 / Math.max(0.2, t.d);
    const k = PX * s;
    t.sxL = cx + (t.u - t.wd) * k;
    t.sxR = cx + (t.u + t.wd) * k;
    t.yB = HZ + PY * s;
    t.yT = t.yB - t.hs * w2 * smooth(t.rb) * h * 0.40 * s;
  }

  // ── LAYER 2 — the towers ─────────────────────────────────────────────────
  if (w2 > 0.02) {
    // three depth bands, one gradient + one batched fill each (far → near)
    for (let b = 2; b >= 0; b--) {
      const g = c.createLinearGradient(0, HZ - h * 0.08, 0, h);
      g.addColorStop(0, CMix(0.25 + b * 0.2, (0.44 - b * 0.09) * w2, 34 - b * 7));
      g.addColorStop(1, CMix(0.8 - b * 0.2, (0.52 - b * 0.1) * w2, 9));
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < TOWER_N; i++) {
        const t = S.tw[i];
        if (bandOf(t.d) !== b) continue;
        const hgt = t.yB - t.yT;
        if (hgt < 0.7) continue;
        c.rect(t.sxL, t.yT, t.sxR - t.sxL, hgt);
      }
      c.fill();
    }

    // outlines, roof caps, floor bands, flared windows, drop charge — batched
    const caps = new Path2D();
    const edges = new Path2D();
    const floors = new Path2D();
    const litP = new Path2D();
    const chgP = new Path2D();
    for (let i = 0; i < TOWER_N; i++) {
      const t = S.tw[i];
      const hgt = t.yB - t.yT;
      if (hgt < 1.2) continue;
      caps.moveTo(t.sxL - 1, t.yT);
      caps.lineTo(t.sxR + 1, t.yT);
      edges.moveTo(t.sxL, t.yB);
      edges.lineTo(t.sxL, t.yT);
      edges.moveTo(t.sxR, t.yB);
      edges.lineTo(t.sxR, t.yT);
      if (t.d < 2.3 && hgt > 14) {
        for (let f = 1; f < 7; f++) {
          const y = t.yT + (hgt * f) / 7;
          floors.moveTo(t.sxL + 1, y);
          floors.lineTo(t.sxR - 1, y);
        }
      }
      if (t.lit > 0.06) litP.rect(t.sxL, t.yT, t.sxR - t.sxL, hgt);
      if (chg > 0.05) {
        const p = (chg * 1.7 + t.ph) % 1;
        const y = t.yB - hgt * p;
        chgP.moveTo(t.sxL - 1, y);
        chgP.lineTo(t.sxR + 1, y);
      }
    }

    c.strokeStyle = C2(w2 * (0.1 + trebV * 0.08), 46);
    c.lineWidth = 0.6 * TK;
    c.stroke(floors);

    c.strokeStyle = CMix(0.4, w2 * (0.2 + midV * 0.12), 54);
    c.lineWidth = 0.7 * TK;
    c.stroke(edges);

    // percussive window flare — one batched fill over the lit towers
    c.fillStyle = C1(w2 * (0.1 + hitE * 0.08), 60);
    c.fill(litP);

    glow(Math.min(26, 9 + beatE * 9 + w3 * 6), C1());
    c.strokeStyle = C1(Math.min(0.62, w2 * (0.3 + beatE * 0.3 + hitE * 0.2)), 72);
    c.lineWidth = (1 + beatE * 1.4) * TK;
    c.stroke(caps);
    if (chg > 0.05) {
      c.strokeStyle = C2(Math.min(0.55, chg * 0.55), 70);
      c.lineWidth = (1 + chg * 1.8) * TK;
      c.stroke(chgP);
    }
    noGlow();
  }

  // ── LAYER 3 — bridges + orbiting rings ───────────────────────────────────
  if (w3 > 0.03) {
    const br = new Path2D();
    let nb = 0;
    for (let i = 0; i < TOWER_N - 1 && nb < BRIDGE_MAX; i++) {
      const a = S.tw[i], b2 = S.tw[i + 1];
      if (Math.abs(a.d - b2.d) > 0.55) continue;
      if (a.yB - a.yT < 6 || b2.yB - b2.yT < 6) continue;
      if (Math.abs(b2.sxL - a.sxR) > w * 0.3) continue;
      br.moveTo(a.sxR, a.yT + (a.yB - a.yT) * 0.14);
      br.lineTo(b2.sxL, b2.yT + (b2.yB - b2.yT) * 0.14);
      nb++;
    }
    const rings = new Path2D();
    let nr = 0;
    for (let i = 0; i < TOWER_N && nr < RING_MAX; i++) {
      const t = S.tw[i];
      const hgt = t.yB - t.yT;
      if (hgt < h * 0.09 || t.d > 3.2) continue;
      const mx = (t.sxL + t.sxR) * 0.5;
      const rx = Math.max(2, (t.sxR - t.sxL) * (1.9 + Math.sin(vt * 0.02 + t.ph * 6) * 0.4));
      const ry = rx * 0.3;
      const yy = t.yT + hgt * (0.1 + 0.12 * (0.5 + 0.5 * Math.sin(vt * 0.017 + t.ph * 5)));
      const rot = Math.sin(vt * 0.01 + t.ph * 3) * 0.28;
      rings.moveTo(mx + rx * Math.cos(rot), yy + rx * Math.sin(rot));
      rings.ellipse(mx, yy, rx, ry, rot, 0, TAU);
      nr++;
    }
    glow(Math.min(24, 8 + beatE * 10), C2());
    c.strokeStyle = C2(Math.min(0.5, w3 * (0.28 + trebV * 0.25 + beatE * 0.2)), 68);
    c.lineWidth = (0.8 + beatE * 0.9) * TK;
    c.stroke(br);
    c.strokeStyle = CMix(0.35, Math.min(0.5, w3 * (0.26 + midV * 0.24 + beatE * 0.22)), 70);
    c.lineWidth = (0.9 + beatE * 1.1) * TK;
    c.stroke(rings);
    noGlow();
  }

  // ═════ eruption FX — additive but strictly alpha-capped ══════════════════
  c.globalCompositeOperation = "lighter";

  // tension: light gathers on the plain and contracts toward the beam site
  if (chg > 0.04) {
    const cr = R * (0.5 - chg * 0.34) + 2;
    c.strokeStyle = C1(Math.min(0.4, chg * 0.4), 66);
    c.lineWidth = (1 + chg * 3) * TK;
    glow(Math.min(26, 10 + chg * 14), C1());
    c.beginPath();
    c.ellipse(bx, by, cr, cr * 0.3, 0, 0, TAU);
    c.stroke();
    noGlow();
  }

  // the beam
  if (S.beam > 0.02) {
    const bw = R * (0.02 + S.beam * 0.05) * (1 + bassV * 0.4);
    const bg = c.createLinearGradient(0, by, 0, 0);
    bg.addColorStop(0, C1(S.beam * 0.4, 74));
    bg.addColorStop(0.35, CMix(0.5, S.beam * 0.22, 64));
    bg.addColorStop(1, "transparent");
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(bx - bw, by);
    c.lineTo(bx + bw, by);
    c.lineTo(bx + bw * 0.3, 0);
    c.lineTo(bx - bw * 0.3, 0);
    c.closePath();
    c.fill();
    glow(Math.min(26, 14 + S.beam * 10), C1());
    c.strokeStyle = C1(Math.min(0.5, S.beam * 0.5), 76);
    c.lineWidth = (1.4 + S.beam * 2.4) * TK;
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx, 0);
    c.stroke();
    noGlow();
    S.beam *= dk(0.955, fs);
  }

  // ground shockwave
  if (S.ringA > 0.02) {
    S.ring += 0.022 * cfg.speed * fs;
    S.ringA *= dk(0.955, fs);
    const rr = R * S.ring * 1.5;
    glow(Math.min(24, 12 * S.ringA + 6), C2());
    c.strokeStyle = C2(Math.min(0.45, S.ringA * 0.45), 70);
    c.lineWidth = (1 + S.ringA * 3) * TK;
    c.beginPath();
    c.ellipse(bx, by, rr, rr * 0.3, 0, 0, TAU);
    c.stroke();
    noGlow();
  } else {
    S.ring = 0;
  }

  // shards of the old skyline — three alpha buckets, three batched fills
  if (S.sh.length) {
    for (let i = S.sh.length - 1; i >= 0; i--) {
      const p = S.sh[i];
      p.x += p.vx * fs;
      p.y += p.vy * fs;
      p.vy += h * 0.00035 * fs;
      p.rot += p.vr * fs;
      p.a *= dk(0.968, fs);
      if (p.a < 0.05 || p.y > h + 40) S.sh.splice(i, 1);
    }
    for (let b = 0; b < 3; b++) {
      const lo = b === 0 ? 0.62 : b === 1 ? 0.3 : 0;
      const hi = b === 0 ? 1.01 : b === 1 ? 0.62 : 0.3;
      c.beginPath();
      let any = false;
      for (let i = 0; i < S.sh.length; i++) {
        const p = S.sh[i];
        if (p.a < lo || p.a >= hi) continue;
        const ca = Math.cos(p.rot), sa2 = Math.sin(p.rot);
        const s1 = p.sz;
        c.moveTo(p.x + ca * s1, p.y + sa2 * s1);
        c.lineTo(p.x - sa2 * s1 * 0.7, p.y + ca * s1 * 0.7);
        c.lineTo(p.x - ca * s1 * 0.5, p.y - sa2 * s1 * 0.5);
        c.closePath();
        any = true;
      }
      if (!any) continue;
      c.fillStyle = CMix(0.2 + b * 0.3, 0.1 + (2 - b) * 0.07, 56 + (2 - b) * 8);
      c.fill();
    }
  }

  // blast wash — kept faint; the trail buffer accumulates it
  S.flash *= dk(0.88, fs);
  if (S.flash > 0.03) {
    c.fillStyle = C1(S.flash * 0.07, 72);
    c.fillRect(0, 0, w, h);
  }
  if (beat && w3 > 0.4) {
    c.fillStyle = C2(0.015 + beatE * 0.02, 60);
    c.fillRect(0, 0, w, h);
  }
};
