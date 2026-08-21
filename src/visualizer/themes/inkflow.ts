import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

interface Blob {
  x: number; y: number; vx: number; vy: number;
  /** current radius in px */ r: number;
  /** alpha, 0 = free slot */ a: number;
  /** phase offset into the curl field */ ph: number;
  /** colour tier 0..TIERS-1 */ tr: number;
  /** 1 = this blob also draws a curling filament */ fil: number;
}
interface Bloom { x: number; y: number; a: number; r: number }

const MAX = 300;    // fixed pool — never grows, never allocates after init
const TIERS = 4;

// Pre-rendered soft ink puff. Hundreds of shadowBlur'd arcs would be
// unaffordable; one drawImage per blob is not.
const puffs: HTMLCanvasElement[] = [];
const puffKeys: string[] = [];
function getPuff(i: number, inner: string, mid: string): HTMLCanvasElement {
  const key = inner + "|" + mid;
  let cv = puffs[i];
  if (cv && puffKeys[i] === key) return cv;
  cv = cv ?? document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, inner);
  rg.addColorStop(0.38, mid);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  puffs[i] = cv;
  puffKeys[i] = key;
  return cv;
}

// Ink dropped into still water. Puffs billow out of injection points and
// curling filaments trail off their edges as a turbulence field drags them
// around. In a quiet passage the water is glassy: the ink barely moves, blooms
// enormous and slow, and hangs suspended for many seconds. In a loud passage
// the tank is boiling — tight, fast turbulence rips the plumes into violent
// streaks that churn and dissipate almost immediately. Each beat is a fresh
// drop hitting the surface.
export const INKFLOW: ThemeDraw = ({
  c, w, h, cx, cy, R, fs, vt, beat, beatE, energy, cfg, bassV, midV, I, TK, C1, C2, CMix, glow, noGlow, L,
}) => {
  const S = (L.scratch.inkflow ??= {
    blobs: [] as Blob[],
    blooms: [] as Bloom[],
    head: 0,
    spawnT: 0,
  });

  if (S.blobs.length === 0) {
    for (let i = 0; i < MAX; i++) {
      S.blobs.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, a: 0, ph: 0, tr: 0, fil: 0 });
    }
  }

  const E = energy;
  const blobs: Blob[] = S.blobs;

  // ── energy-driven fluid constants ─────────────────────────────────────────
  // Glassy & suspended when calm; violent, small-scale turbulence when loud.
  const damp = dk(0.9 + E * 0.088, fs);      // 0.90 (ink stalls) → 0.988 (it keeps going)
  const curl = R * (0.0006 + E * 0.0075) * I * fs;
  const fieldK = 0.0035 + E * 0.014;         // large lazy eddies → tight churn
  const grow = R * (0.0022 + E * 0.0032) * cfg.speed * fs;
  const fade = dk(0.9955 - E * 0.021, fs);   // hangs for ~10s → gone in ~1s
  const rCap = R * 0.075;

  const inject = (ix: number, iy: number, n: number, force: number) => {
    for (let k = 0; k < n; k++) {
      const b = blobs[S.head];
      S.head = (S.head + 1) % MAX;
      const a2 = Math.random() * Math.PI * 2;
      const sp = force * (0.15 + Math.random() * 0.85);
      b.x = ix + Math.cos(a2) * R * 0.012;
      b.y = iy + Math.sin(a2) * R * 0.012;
      b.vx = Math.cos(a2) * sp;
      b.vy = Math.sin(a2) * sp;
      b.r = R * (0.008 + Math.random() * 0.014);
      b.a = 0.4 + Math.random() * 0.5;
      b.ph = Math.random() * 6.28;
      b.tr = (Math.random() * TIERS) | 0;
      b.fil = Math.random() < 0.3 ? 1 : 0;
    }
    if (S.blooms.length < 8) S.blooms.push({ x: ix, y: iy, a: 1, r: R * 0.05 });
  };

  // ── injection points ──────────────────────────────────────────────────────
  if (beat) {
    const a2 = Math.random() * Math.PI * 2;
    const rad = R * (0.05 + Math.random() * (0.14 + E * 0.3));
    inject(
      cx + Math.cos(a2) * rad,
      cy + Math.sin(a2) * rad * 0.85,
      Math.round(12 + E * 26 + bassV * 10),
      R * (0.0015 + E * 0.014) * (1 + beatE) * I,
    );
  }
  S.spawnT -= fs;
  if (S.spawnT <= 0) {
    inject(
      cx + (Math.random() - 0.5) * w * 0.7,
      cy + (Math.random() - 0.5) * h * 0.6,
      Math.round(6 + E * 12),
      R * (0.0008 + E * 0.009) * I,
    );
    S.spawnT = Math.round(78 - E * 68);
  }

  // ── blooming cores at the injection points ────────────────────────────────
  for (let i = S.blooms.length - 1; i >= 0; i--) {
    const bl = S.blooms[i];
    bl.r += R * (0.004 + E * 0.012) * cfg.speed * fs;
    bl.a *= dk(0.9 - E * 0.06, fs);
    if (bl.a < 0.03) { S.blooms.splice(i, 1); continue; }
    const g = c.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.r);
    g.addColorStop(0, C1(bl.a * 0.5, 82));
    g.addColorStop(0.4, C2(bl.a * 0.28, 62));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
    c.fill();
  }

  // ── advect the ink ────────────────────────────────────────────────────────
  const drift = R * 0.00025 * (1 - E) * fs;   // slow upward hang when calm
  for (let i = 0; i < MAX; i++) {
    const b = blobs[i];
    if (b.a <= 0.02) continue;
    // cheap curl-ish flow field: a rotating direction sampled from position
    const ang =
      Math.sin(b.x * fieldK + vt * 0.009 + b.ph) * 2.4 +
      Math.cos(b.y * fieldK * 1.27 - vt * 0.012) * 2.4;
    b.vx += Math.cos(ang) * curl;
    b.vy += Math.sin(ang) * curl - drift;
    b.vx *= damp;
    b.vy *= damp;
    b.x += b.vx * cfg.speed * fs;
    b.y += b.vy * cfg.speed * fs;
    if (b.r < rCap) b.r += grow;
    b.a *= fade;
    // recycle anything that wanders far off-frame
    const m = R * 0.3;
    if (b.x < -m || b.x > w + m || b.y < -m || b.y > h + m) b.a = 0;
  }

  // ── draw the puffs (one drawImage each, sprite per colour tier) ───────────
  // quantised so the sprite key is stable across frames and the puffs are
  // only re-rendered when the palette or the mood actually shifts
  const light = Math.round((56 + E * 10 + beatE * 12) / 8) * 8;
  for (let t = 0; t < TIERS; t++) {
    getPuff(t, CMix(t / (TIERS - 1), 0.55, light + 16), CMix(t / (TIERS - 1), 0.22, light));
  }
  for (let i = 0; i < MAX; i++) {
    const b = blobs[i];
    if (b.a <= 0.02) continue;
    c.globalAlpha = Math.min(1, b.a * 0.55);
    const rr = b.r * 1.6;
    c.drawImage(puffs[b.tr], b.x - rr, b.y - rr, rr * 2, rr * 2);
  }
  c.globalAlpha = 1;

  // ── curling filaments, batched into TIERS strokes ─────────────────────────
  const tail = 6 + E * 16;
  glow(Math.min(14, 6 + beatE * 8), C1());
  for (let t = 0; t < TIERS; t++) {
    c.beginPath();
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const b = blobs[i];
      if (b.fil === 0 || b.a <= 0.06 || b.tr !== t) continue;
      const sx = b.x - b.vx * tail, sy = b.y - b.vy * tail;
      // control point kicked sideways so the hair curls instead of running straight
      const px = -b.vy, py = b.vx;
      const swirl = Math.sin(vt * 0.03 + b.ph) * (0.6 + E * 2.4);
      c.moveTo(sx, sy);
      c.quadraticCurveTo(
        (sx + b.x) * 0.5 + px * swirl,
        (sy + b.y) * 0.5 + py * swirl,
        b.x, b.y,
      );
      any = true;
    }
    if (!any) continue;
    c.strokeStyle = CMix(t / (TIERS - 1), 0.16 + E * 0.2 + beatE * 0.18, 68 + midV * 14);
    c.lineWidth = (0.6 + E * 1.4) * TK;
    c.stroke();
  }
  noGlow();
};
