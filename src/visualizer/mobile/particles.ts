/**
 * Mobile-native visualizers: the particle family.
 *
 * All of these blit the same cached sprite, and all of them quantise the colour
 * they ask for. That second part matters more than it looks: the sprite cache
 * is keyed by colour string, so a continuously varying colour rebuilds a canvas
 * per particle and ends up slower than the `shadowBlur` the sprite replaced.
 */
import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";
import { blob, c01, count, scratch } from "./kit";

interface P {
  x: number; y: number; vx: number; vy: number; r: number; a: number; f: number;
}

/** Embers rising from the bottom edge, pushed by the low end. */
export const M_EMBERFALL: ThemeDraw = (x) => {
  const { c, w, h, bassV, beatE, fs, cfg } = x;
  const want = count(x, 90);
  const S = scratch(x, "m_emberfall", () => ({ ps: [] as P[] }));

  while (S.ps.length < want) {
    S.ps.push({
      x: Math.random() * w, y: h + Math.random() * h * 0.2,
      vx: (Math.random() - 0.5) * 0.4, vy: -(0.5 + Math.random() * 1.4),
      r: 2 + Math.random() * 6, a: 0.4 + Math.random() * 0.6, f: Math.random(),
    });
  }
  if (S.ps.length > want) S.ps.length = want;

  c.globalCompositeOperation = "lighter";
  const lift = 1 + bassV * 1.6 + beatE * 0.8;
  for (const p of S.ps) {
    p.y += p.vy * lift * cfg.speed * fs;
    p.x += p.vx * cfg.speed * fs;
    p.a *= dk(0.995, fs);
    if (p.y < -20 || p.a < 0.05) {
      p.x = Math.random() * w; p.y = h + 10;
      p.a = 0.4 + Math.random() * 0.6;
      p.vy = -(0.5 + Math.random() * 1.4);
    }
    blob(x, p.x, p.y, p.r * (1 + beatE * 0.5), p.a * 0.6, p.f, 66);
  }
  c.globalCompositeOperation = "source-over";
};

/** A starfield drifting past, accelerating with the music. */
export const M_STARDRIFT: ThemeDraw = (x) => {
  const { c, w, h, cx, cy, energy, beatE, fs, cfg, TK, CMix } = x;
  const want = count(x, 110);
  const S = scratch(x, "m_stardrift", () => ({ ps: [] as { x: number; y: number; z: number; f: number }[] }));

  while (S.ps.length < want) {
    S.ps.push({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), f: Math.random() });
  }
  if (S.ps.length > want) S.ps.length = want;

  const sp = (0.003 + energy * 0.016) * (1 + beatE * 2.2) * cfg.speed;
  c.lineCap = "round";
  for (const p of S.ps) {
    const pz = p.z;
    p.z -= sp * fs;
    if (p.z <= 0.02) {
      p.x = (Math.random() - 0.5) * 2; p.y = (Math.random() - 0.5) * 2; p.z = 1;
      continue;
    }
    const sx = cx + (p.x / p.z) * cx * 0.85;
    const sy = cy + (p.y / p.z) * cy * 0.85;
    if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;
    const px = cx + (p.x / pz) * cx * 0.85;
    const py = cy + (p.y / pz) * cy * 0.85;
    const b = 1 - p.z;
    c.strokeStyle = CMix(p.f, 0.35 + b * 0.65, 62 + b * 24);
    c.lineWidth = (0.6 + b * 2.2) * TK;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(sx, sy);
    c.stroke();
  }
};

/** Slow bubbles rising and wobbling. */
export const M_BUBBLES: ThemeDraw = (x) => {
  const { c, w, h, vt, midV, beatE, fs, cfg, TK, CMix } = x;
  const want = count(x, 46);
  const S = scratch(x, "m_bubbles", () => ({ ps: [] as P[] }));

  while (S.ps.length < want) {
    S.ps.push({
      x: Math.random() * w, y: h + Math.random() * h,
      vx: 0, vy: -(0.2 + Math.random() * 0.7),
      r: 5 + Math.random() * 26, a: 0.3 + Math.random() * 0.5, f: Math.random(),
    });
  }
  if (S.ps.length > want) S.ps.length = want;

  c.lineWidth = 1.6 * TK;
  for (const p of S.ps) {
    p.y += p.vy * (1 + midV * 0.8 + beatE * 0.6) * cfg.speed * fs;
    const wob = Math.sin(vt * 0.02 + p.f * 9) * 0.6;
    p.x += wob * cfg.speed * fs;
    if (p.y < -p.r * 2) { p.y = h + p.r; p.x = Math.random() * w; }
    c.strokeStyle = CMix(p.f, p.a * 0.8, 70);
    c.beginPath();
    c.arc(p.x, p.y, p.r * (1 + beatE * 0.2), 0, Math.PI * 2);
    c.stroke();
    // a small highlight, which is what makes a circle read as a bubble
    c.fillStyle = CMix(p.f, p.a * 0.5, 92);
    c.beginPath();
    c.arc(p.x - p.r * 0.32, p.y - p.r * 0.32, Math.max(1, p.r * 0.16), 0, Math.PI * 2);
    c.fill();
  }
};

/** Soft motes falling like lit snow. */
export const M_SNOWLIGHT: ThemeDraw = (x) => {
  const { c, w, h, vt, trebV, beatE, fs, cfg } = x;
  const want = count(x, 100);
  const S = scratch(x, "m_snowlight", () => ({ ps: [] as P[] }));

  while (S.ps.length < want) {
    S.ps.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: 0, vy: 0.3 + Math.random() * 1.1,
      r: 1.5 + Math.random() * 4, a: 0.3 + Math.random() * 0.6, f: Math.random(),
    });
  }
  if (S.ps.length > want) S.ps.length = want;

  c.globalCompositeOperation = "lighter";
  for (const p of S.ps) {
    p.y += p.vy * (1 + trebV * 0.8) * cfg.speed * fs;
    p.x += Math.sin(vt * 0.01 + p.f * 8) * 0.5 * cfg.speed * fs;
    if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
    blob(x, p.x, p.y, p.r * (1 + beatE * 0.4), p.a * 0.55, p.f, 74);
  }
  c.globalCompositeOperation = "source-over";
};

/** Bursts of sparks thrown on every beat. */
export const M_SPARKBURST: ThemeDraw = (x) => {
  const { c, cx, cy, R, beat, beatE, energy, fs, cfg } = x;
  const S = scratch(x, "m_sparkburst", () => ({ ps: [] as P[] }));

  if (beat) {
    const n = count(x, 14 + Math.round(energy * 26));
    for (let i = 0; i < n && S.ps.length < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = R * (0.004 + Math.random() * 0.014) * (0.6 + energy);
      S.ps.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 5, a: 0.7 + Math.random() * 0.3, f: Math.random(),
      });
    }
  }

  c.globalCompositeOperation = "lighter";
  for (let i = S.ps.length - 1; i >= 0; i--) {
    const p = S.ps[i];
    p.x += p.vx * cfg.speed * fs;
    p.y += p.vy * cfg.speed * fs;
    p.vy += R * 0.00012 * fs;
    p.a *= dk(0.955, fs);
    if (p.a < 0.05) { S.ps.splice(i, 1); continue; }
    blob(x, p.x, p.y, p.r * (1 + beatE * 0.4), p.a * 0.7, p.f, 76);
  }
  c.globalCompositeOperation = "source-over";
};

/** Vertical rain streaks, faster and denser as the track drives. */
export const M_RAINLINE: ThemeDraw = (x) => {
  const { c, w, h, energy, beatE, fs, cfg, TK, CMix } = x;
  const want = count(x, 80);
  const S = scratch(x, "m_rainline", () => ({ ps: [] as P[] }));

  while (S.ps.length < want) {
    S.ps.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: 0, vy: 4 + Math.random() * 10,
      r: 6 + Math.random() * 26, a: 0.25 + Math.random() * 0.6, f: Math.random(),
    });
  }
  if (S.ps.length > want) S.ps.length = want;

  c.lineCap = "round";
  const sp = 1 + energy * 1.6 + beatE * 0.8;
  for (const p of S.ps) {
    p.y += p.vy * sp * cfg.speed * fs;
    if (p.y - p.r > h) { p.y = -p.r; p.x = Math.random() * w; }
    c.strokeStyle = CMix(p.f, p.a, 66);
    c.lineWidth = (1 + p.a * 2) * TK;
    c.beginPath();
    c.moveTo(p.x, p.y - p.r);
    c.lineTo(p.x, p.y);
    c.stroke();
  }
};

/** Fireflies wandering, brightening on transients. */
export const M_GLOWFLIES: ThemeDraw = (x) => {
  const { c, w, h, vt, hitE, beatE, fs, cfg } = x;
  const want = count(x, 60);
  const S = scratch(x, "m_glowflies", () => ({ ps: [] as P[] }));

  while (S.ps.length < want) {
    S.ps.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.5) * 0.7,
      r: 2.5 + Math.random() * 5, a: 0.3 + Math.random() * 0.6, f: Math.random(),
    });
  }
  if (S.ps.length > want) S.ps.length = want;

  c.globalCompositeOperation = "lighter";
  for (const p of S.ps) {
    // a cheap wander: steer by a sine of position and time rather than by any
    // real flow field
    p.vx += Math.sin(vt * 0.008 + p.f * 11) * 0.02 * fs;
    p.vy += Math.cos(vt * 0.009 + p.f * 7) * 0.02 * fs;
    p.vx *= dk(0.97, fs);
    p.vy *= dk(0.97, fs);
    p.x += p.vx * cfg.speed * fs;
    p.y += p.vy * cfg.speed * fs;
    if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
    if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
    const pulse = 0.5 + 0.5 * Math.sin(vt * 0.03 + p.f * 13);
    blob(x, p.x, p.y, p.r * (1 + hitE * 0.8 + beatE * 0.4), c01(p.a * (0.35 + pulse * 0.65)), p.f, 78);
  }
  c.globalCompositeOperation = "source-over";
};
