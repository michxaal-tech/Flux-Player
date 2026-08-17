import type { ThemeDraw } from "../themeTypes";

interface Star {
  /** unit vector on the celestial sphere */
  x: number;
  y: number;
  z: number;
  /** intrinsic magnitude, 0..1 */
  m: number;
  hue: number;
  /** twinkle phase */
  ph: number;
  /** flare level, 0..1, set when a figure touches it */
  fl: number;
  // projected, refilled every frame — no allocation
  sx: number;
  sy: number;
  /** front-of-sphere visibility, 0..1 */
  vis: number;
}

interface Figure {
  /** star indices, in drawing order */
  idx: number[];
  /** how many edges are drawn so far (fractional — the head is mid-edge) */
  p: number;
  /** edges per frame */
  sp: number;
  /** lifecycle: 0 drawing, 1 holding, 2 dissolving */
  st: number;
  /** hold countdown / dissolve alpha */
  t: number;
  a: number;
  hue: number;
}

const MAX_STARS = 200;
const MAX_FIGS = 8;
const TAU = Math.PI * 2;

// Pre-rendered star flare. Only the brightest handful get one, and a sprite
// blit keeps shadowBlur out of the 200-star loop entirely.
let flareCv: HTMLCanvasElement | null = null;
let flareKey = "";
function flareSprite(color: string): HTMLCanvasElement {
  if (flareCv && flareKey === color) return flareCv;
  flareKey = color;
  const cv = flareCv ?? document.createElement("canvas");
  cv.width = cv.height = 44;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 44, 44);
  const rg = g.createRadialGradient(22, 22, 0, 22, 22, 22);
  rg.addColorStop(0, "rgba(255,255,255,0.85)");
  rg.addColorStop(0.24, color);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 44, 44);
  // four-point diffraction spikes
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(22, 2); g.lineTo(22, 42);
  g.moveTo(2, 22); g.lineTo(42, 22);
  g.stroke();
  flareCv = cv;
  return cv;
}

// A living star chart. Stars sit on an actual celestial sphere that turns
// slowly about a tilted axis, so the whole field wheels overhead rather than
// sliding flat. Figures assemble themselves out of it: a seed star reaches to
// its nearest neighbours, and the lines draw themselves edge by edge, hold
// while complete, then dissolve so the sky can form something new.
// Quiet passages: a single figure inching itself into existence and lingering
// there. Driving passages: seven at once, each snapping shut in a handful of
// frames, lines whipping across the sky and every touched star flaring.
export const CONSTELLATION: ThemeDraw = ({
  c, w, h, cx, cy, R, beat, beatE, energy, cfg, bassV, midV, trebV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.constellation ??= {
    stars: [] as Star[],
    figs: [] as Figure[],
    /** sphere yaw + slow nod */
    yaw: 0,
    nod: 0,
    spawnT: 0,
  });
  const stars: Star[] = S.stars;
  const figs: Figure[] = S.figs;

  const E = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const E2 = E * E;
  const sp = cfg.speed;

  if (stars.length === 0) {
    for (let i = 0; i < MAX_STARS; i++) {
      // uniform on the sphere
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const s2 = Math.sqrt(Math.max(0, 1 - u * u));
      stars.push({
        x: Math.cos(th) * s2, y: u, z: Math.sin(th) * s2,
        m: Math.pow(Math.random(), 2.1),
        hue: Math.random(),
        ph: Math.random() * TAU,
        fl: 0,
        sx: 0, sy: 0, vis: 0,
      });
    }
  }

  // --- the sphere turns; faster and with more nod when the music drives ---
  S.yaw += (0.0011 + E2 * 0.0075) * sp;
  S.nod += (0.0004 + E * 0.0018) * sp;
  const cy1 = Math.cos(S.yaw), sy1 = Math.sin(S.yaw);
  const tilt = 0.28 + Math.sin(S.nod) * (0.1 + E * 0.22);
  const ct = Math.cos(tilt), st1 = Math.sin(tilt);
  // fit the sphere to the frame without squashing the figures
  const scale = R * (0.62 + E * 0.06) * (1 + beatE * 0.02);

  // --- background sky, painted opaque ---
  c.globalCompositeOperation = "source-over";
  const skyR = Math.max(R * 0.6, Math.sqrt(w * w + h * h) * 0.5);
  const sky = c.createRadialGradient(cx, cy, 0, cx, cy, skyR);
  sky.addColorStop(0, CMix(0.3, 1, 10 + E * 5 + beatE * 2));
  sky.addColorStop(0.55, CMix(0.7, 1, 6 + E * 3));
  sky.addColorStop(1, CMix(1, 1, 2));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // a faint galactic band, tilting with the sphere
  c.save();
  c.translate(cx, cy);
  c.rotate(S.yaw * 0.4 + tilt);
  const band = c.createLinearGradient(0, -skyR * 0.3, 0, skyR * 0.3);
  band.addColorStop(0, "transparent");
  band.addColorStop(0.5, CMix(0.5, 0.07 + E * 0.05, 34));
  band.addColorStop(1, "transparent");
  c.fillStyle = band;
  c.fillRect(-skyR, -skyR * 0.3, skyR * 2, skyR * 0.6);
  c.restore();

  c.globalCompositeOperation = "lighter";

  // --- project every star once ---
  for (let i = 0; i < stars.length; i++) {
    const s2 = stars[i];
    // yaw about the vertical, then tilt the pole toward the viewer
    const x1 = s2.x * cy1 - s2.z * sy1;
    const z1 = s2.x * sy1 + s2.z * cy1;
    const y2 = s2.y * ct - z1 * st1;
    const z2 = s2.y * st1 + z1 * ct;
    s2.sx = cx + x1 * scale;
    s2.sy = cy + y2 * scale * 0.98;
    // the front hemisphere is bright, the back fades out rather than popping
    s2.vis = z2 > 0 ? Math.min(1, z2 * 2.4) : 0;
    if (s2.fl > 0) s2.fl *= 0.9 - E * 0.03;
  }

  // --- figures ---
  const figTarget = E < 0.25 ? 1 : Math.min(MAX_FIGS - 1, 1 + Math.round(E * 6));
  S.spawnT -= 1;
  const wantNew = figs.length < figTarget && (S.spawnT <= 0 || beat);
  if (wantNew && figs.length < MAX_FIGS) {
    // seed on a visible, reasonably bright star
    let seed = -1;
    for (let tries = 0; tries < 20; tries++) {
      const k = (Math.random() * stars.length) | 0;
      if (stars[k].vis > 0.4) { seed = k; break; }
    }
    if (seed >= 0) {
      const idx: number[] = [seed];
      const links = 3 + Math.floor(Math.random() * (3 + E * 4));
      const reach = scale * (0.42 - E * 0.1);
      for (let e = 0; e < links; e++) {
        const from = stars[idx[idx.length - 1]];
        let best = -1;
        let bestD = Infinity;
        for (let k = 0; k < stars.length; k++) {
          const s2 = stars[k];
          if (s2.vis < 0.35) continue;
          let used = false;
          for (let q = 0; q < idx.length; q++) if (idx[q] === k) { used = true; break; }
          if (used) continue;
          const dx = s2.sx - from.sx, dy = s2.sy - from.sy;
          const d = dx * dx + dy * dy;
          // prefer near neighbours but with a little jitter so figures vary
          const score = d * (0.7 + Math.random() * 0.7);
          if (score < bestD && d < reach * reach) { bestD = score; best = k; }
        }
        if (best < 0) break;
        idx.push(best);
      }
      if (idx.length >= 3) {
        figs.push({
          idx,
          p: 0,
          // serene when calm, snapping shut when driving
          sp: (0.012 + E2 * 0.5) * sp * (0.8 + Math.random() * 0.5),
          st: 0,
          t: 0,
          a: 1,
          hue: Math.random(),
        });
      }
      S.spawnT = Math.round(90 - E * 84);
    }
  }

  const lineA = Math.min(0.8, (0.34 + midV * 0.2 + beatE * 0.2) * (0.4 + I * 0.7));
  glow(Math.min(22, (7 + E * 9) * (1 + beatE * 0.8)), C1());
  c.lineCap = "round";
  for (let fi = figs.length - 1; fi >= 0; fi--) {
    const F = figs[fi];
    const edges = F.idx.length - 1;
    if (F.st === 0) {
      F.p += F.sp * (1 + beatE * 1.6);
      if (F.p >= edges) {
        F.p = edges;
        F.st = 1;
        // a complete figure holds a long time when calm, barely at all when loud
        F.t = Math.round(140 - E * 126);
        for (let q = 0; q < F.idx.length; q++) stars[F.idx[q]].fl = 1;
      }
    } else if (F.st === 1) {
      F.t -= 1;
      if (F.t <= 0) F.st = 2;
    } else {
      F.a *= 0.955 - E * 0.03;
      if (F.a < 0.05) { figs.splice(fi, 1); continue; }
    }

    const done = Math.floor(F.p);
    c.strokeStyle = CMix(F.hue, lineA * F.a * (F.st === 1 ? 1 : 0.85), 62 + beatE * 8);
    c.lineWidth = Math.max(0.5, (0.9 + E * 0.9 + beatE * 1.2) * TK);
    c.beginPath();
    for (let e = 0; e < edges; e++) {
      const A = stars[F.idx[e]], B = stars[F.idx[e + 1]];
      if (e < done) {
        c.moveTo(A.sx, A.sy);
        c.lineTo(B.sx, B.sy);
      } else if (e === done) {
        const f = F.p - done;
        c.moveTo(A.sx, A.sy);
        c.lineTo(A.sx + (B.sx - A.sx) * f, A.sy + (B.sy - A.sy) * f);
        break;
      } else break;
    }
    c.stroke();

    // the drawing head: a bright spark running along the line being inked
    if (F.st === 0 && done < edges) {
      const A = stars[F.idx[done]], B = stars[F.idx[done + 1]];
      const f = F.p - done;
      const hx = A.sx + (B.sx - A.sx) * f;
      const hy = A.sy + (B.sy - A.sy) * f;
      c.fillStyle = C2(Math.min(0.7, 0.4 + trebV * 0.25 + beatE * 0.2), 76);
      c.beginPath();
      c.arc(hx, hy, Math.max(1, (1.6 + E * 1.4) * TK), 0, TAU);
      c.fill();
    }
  }
  noGlow();
  c.lineCap = "butt";

  // --- stars: two batched fills, dim field and bright field ---
  const tw = 0.5 + bassV * 0.3;
  for (let band = 0; band < 2; band++) {
    c.beginPath();
    let any = false;
    for (let i = 0; i < stars.length; i++) {
      const s2 = stars[i];
      if (s2.vis <= 0.02) continue;
      const bright = s2.m > 0.55;
      if ((band === 1) !== bright) continue;
      any = true;
      const t2 = 0.6 + Math.abs(Math.sin(s2.ph + S.yaw * 22)) * 0.4;
      const r = Math.max(0.4, (0.5 + s2.m * 1.8) * TK * t2 * (1 + beatE * 0.25));
      c.moveTo(s2.sx + r, s2.sy);
      c.arc(s2.sx, s2.sy, r, 0, TAU);
    }
    if (!any) continue;
    c.fillStyle = band === 1
      ? C1(Math.min(0.7, (0.4 + tw * 0.25 + beatE * 0.15) * (0.4 + I * 0.7)), 72)
      : C2(Math.min(0.4, (0.18 + tw * 0.12) * (0.4 + I * 0.7)), 58);
    c.fill();
  }

  // --- flares on figure stars, sprite blits, hard-capped ---
  const spr = flareSprite(C1(0.9, 76));
  let drawn = 0;
  for (let i = 0; i < stars.length && drawn < 60; i++) {
    const s2 = stars[i];
    if (s2.fl < 0.05 || s2.vis <= 0.05) continue;
    drawn++;
    const r = R * 0.02 * TK * (0.5 + s2.fl * (1.4 + E * 1.2) + beatE * 0.5);
    c.globalAlpha = Math.min(0.8, s2.fl * s2.vis * (0.4 + I * 0.6));
    c.drawImage(spr, s2.sx - r, s2.sy - r, r * 2, r * 2);
  }
  c.globalAlpha = 1;

  // on the beat, a scatter of ordinary stars flares too — more when driving
  if (beat) {
    const n = 1 + Math.floor(E * 14);
    for (let k = 0; k < n; k++) {
      const s2 = stars[(Math.random() * stars.length) | 0];
      if (s2.vis > 0.3) s2.fl = Math.max(s2.fl, 0.5 + E * 0.5);
    }
  }
};
