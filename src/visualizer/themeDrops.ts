// Bespoke drop effects, written for one theme each.
//
// The shared layer library gives every theme a fitting set, but a set is still
// a *selection* — two themes drawing embers are drawing the same embers. What a
// theme really wants is additions that only make sense inside its own world:
// window lights belong to a skyline and nothing else, rungs belong to a tunnel,
// a dust lane belongs to a nebula.
//
// So a theme can claim its own. `THEME_DROPS[name]` is a single function taking
// the unlock slot, and it draws that slot's addition in that theme's terms.
// Themes without an entry still use the curated library from dropLayers.ts —
// this is filled in theme by theme rather than all at once, because a shallow
// one-off per theme would be worse than the library it replaced.
import type { LayerCtx } from "./dropLayers";
import { light } from "./light";

const TAU = Math.PI * 2;
const hash01 = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Draws the addition earned at `slot`. */
export type ThemeDrop = (x: LayerCtx) => void;

export const THEME_DROPS: Record<string, ThemeDrop> = {
  // ── RING — everything here belongs to a ring ────────────────────────────
  RING: (x) => {
    const { c, cx, cy, R, vt, amt, slot, beatE, bassV, TK, C1, C2, CMix } = x;
    const rr = R * 0.34;
    switch (slot) {
      case 0: {                                   // a counter-rotating outer ring
        c.save();
        c.translate(cx, cy);
        c.rotate(-vt * 0.004);
        c.strokeStyle = C2(amt * 0.4, 66);
        c.lineWidth = (1 + amt * 1.6) * TK;
        c.setLineDash([R * 0.05, R * 0.03]);
        c.beginPath();
        c.arc(0, 0, rr * 1.5 * (1 + beatE * 0.03), 0, TAU);
        c.stroke();
        c.setLineDash([]);
        c.restore();
        break;
      }
      case 1: {                                   // satellites riding the ring
        for (let i = 0; i < 6; i++) {
          const a = vt * 0.006 + (i / 6) * TAU;
          light(c, C1(1, 76), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * 0.012, amt * 0.5);
        }
        break;
      }
      case 2: {                                   // ticks around the rim
        c.strokeStyle = CMix(0.5, amt * 0.45, 70);
        c.lineWidth = 1.1 * TK;
        c.beginPath();
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * TAU + vt * 0.001;
          const len = R * (i % 4 === 0 ? 0.05 : 0.025) * (1 + bassV * 0.5);
          c.moveTo(cx + Math.cos(a) * rr * 1.16, cy + Math.sin(a) * rr * 1.16);
          c.lineTo(cx + Math.cos(a) * (rr * 1.16 + len), cy + Math.sin(a) * (rr * 1.16 + len));
        }
        c.stroke();
        break;
      }
      case 3: {                                   // an inner ring mirroring it
        c.strokeStyle = C1(amt * 0.35, 68);
        c.lineWidth = (0.8 + amt) * TK;
        c.beginPath();
        c.arc(cx, cy, rr * (0.52 - beatE * 0.02), 0, TAU);
        c.stroke();
        break;
      }
      case 4: {                                   // chords across the circle
        c.strokeStyle = C2(amt * 0.22, 64);
        c.lineWidth = 0.8 * TK;
        c.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + vt * 0.0016;
          const b = a + 2.1 + Math.sin(vt * 0.004 + i) * 0.5;
          c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          c.lineTo(cx + Math.cos(b) * rr, cy + Math.sin(b) * rr);
        }
        c.stroke();
        break;
      }
      case 5: {                                   // a bright arc sweeping the rim
        const a0 = vt * 0.01;
        const g = c.createLinearGradient(cx - rr, cy, cx + rr, cy);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.5, C1(amt * 0.7, 80));
        g.addColorStop(1, "transparent");
        c.strokeStyle = g;
        c.lineWidth = (2 + amt * 3) * TK;
        c.beginPath();
        c.arc(cx, cy, rr * 1.32, a0, a0 + 1.1);
        c.stroke();
        break;
      }
      default: {                                  // segments breaking away
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + vt * 0.003;
          const off = rr * (0.35 + 0.25 * Math.sin(vt * 0.01 + i * 1.7));
          c.strokeStyle = CMix(i / 7, amt * 0.5, 72);
          c.lineWidth = (1.4 + amt * 1.6) * TK;
          c.beginPath();
          c.arc(cx, cy, rr + off, a, a + 0.34);
          c.stroke();
        }
      }
    }
  },

  // ── CITY — everything here belongs to a skyline ─────────────────────────
  CITY: (x) => {
    const { c, w, h, R, vt, t, amt, slot, beat, beatE, C1, C2, CMix, TK, L } = x;
    const sky = h * 0.52;
    switch (slot) {
      case 0: {                                   // windows coming on in the towers
        c.fillStyle = C1(amt * 0.5, 82);
        for (let i = 0; i < 60; i++) {
          const gx = hash01(i) * w;
          const gy = sky + hash01(i + 40) * (h - sky) * 0.9;
          if (((t / 30 + i) | 0) % 7 === 0) continue;   // some are dark
          c.fillRect(gx, gy, 2 * TK, 3 * TK);
        }
        break;
      }
      case 1: {                                   // aircraft warning lights
        for (let i = 0; i < 5; i++) {
          const bx = (0.12 + hash01(i + 3) * 0.76) * w;
          const by = sky - hash01(i + 8) * h * 0.1;
          const blink = 0.5 + 0.5 * Math.sin(vt * 0.06 + i * 2);
          light(c, C2(1, 62), bx, by, R * 0.012, amt * 0.55 * blink);
        }
        break;
      }
      case 2: {                                   // rain over the skyline
        const S = (L.scratch.cdRain ??= [] as { x: number; y: number; sp: number }[]) as { x: number; y: number; sp: number }[];
        while (S.length < 70) S.push({ x: Math.random(), y: Math.random(), sp: 0.01 + Math.random() * 0.02 });
        c.strokeStyle = C1(amt * 0.22, 72);
        c.lineWidth = 0.8 * TK;
        c.beginPath();
        for (const p of S) {
          p.y += p.sp;
          if (p.y > 1) { p.y = 0; p.x = Math.random(); }
          c.moveTo(p.x * w, p.y * h);
          c.lineTo(p.x * w - 2, p.y * h - h * 0.03);
        }
        c.stroke();
        break;
      }
      case 3: {                                   // a searchlight raking the sky
        const a = Math.sin(vt * 0.004) * 0.7 - Math.PI / 2;
        const ox = w * 0.5, oy = h * 1.02;
        const g = c.createLinearGradient(ox, oy, ox + Math.cos(a) * h, oy + Math.sin(a) * h);
        g.addColorStop(0, C1(amt * 0.3, 74));
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(ox + Math.cos(a - 0.05) * h * 1.3, oy + Math.sin(a - 0.05) * h * 1.3);
        c.lineTo(ox + Math.cos(a + 0.05) * h * 1.3, oy + Math.sin(a + 0.05) * h * 1.3);
        c.closePath();
        c.fill();
        break;
      }
      case 4: {                                   // wet ground reflecting it all
        const g = c.createLinearGradient(0, h * 0.9, 0, h);
        g.addColorStop(0, "transparent");
        g.addColorStop(1, C2(amt * 0.3, 52));
        c.fillStyle = g;
        c.fillRect(0, h * 0.9, w, h * 0.1);
        break;
      }
      case 5: {                                   // a further skyline behind
        c.fillStyle = CMix(0.5, amt * 0.16, 38);
        for (let i = 0; i < 22; i++) {
          const bw = w / 22;
          const bh = h * (0.06 + hash01(i + 77) * 0.14);
          c.fillRect(i * bw, sky - bh, bw * 0.86, bh);
        }
        break;
      }
      default: {                                  // fireworks over the city
        const S = (L.scratch.cdFw ??= [] as { x: number; y: number; a: number; hue: number }[]) as { x: number; y: number; a: number; hue: number }[];
        if (beat && S.length < 4) S.push({ x: 0.2 + Math.random() * 0.6, y: 0.1 + Math.random() * 0.25, a: 1, hue: Math.random() });
        for (let i = S.length - 1; i >= 0; i--) {
          const p = S[i];
          p.a -= 0.02;
          if (p.a <= 0) { S.splice(i, 1); continue; }
          const rr = R * 0.14 * (1 - p.a) + R * 0.02;
          c.strokeStyle = CMix(p.hue, amt * p.a * 0.7, 76);
          c.lineWidth = 1.1 * TK;
          c.beginPath();
          for (let k = 0; k < 14; k++) {
            const a2 = (k / 14) * TAU;
            c.moveTo(p.x * w, p.y * h);
            c.lineTo(p.x * w + Math.cos(a2) * rr, p.y * h + Math.sin(a2) * rr);
          }
          c.stroke();
        }
        void beatE;
      }
    }
  },

  // ── TUNNEL — everything here belongs to a corridor ──────────────────────
  TUNNEL: (x) => {
    const { c, w, h, cx, cy, R, vt, amt, slot, beatE, bassV, C1, C2, CMix, TK, L } = x;
    const ring = (z: number) => R * 0.09 / Math.max(0.06, z);   // z in (0,1]
    switch (slot) {
      case 0: {                                   // rungs joining the rings
        c.strokeStyle = C2(amt * 0.3, 60);
        c.lineWidth = 0.8 * TK;
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + vt * 0.002;
          c.moveTo(cx + Math.cos(a) * ring(1), cy + Math.sin(a) * ring(1));
          c.lineTo(cx + Math.cos(a) * ring(0.12), cy + Math.sin(a) * ring(0.12));
        }
        c.stroke();
        break;
      }
      case 1: {                                   // lights running up the wall
        for (let k = 0; k < 10; k++) {
          const z = ((vt * 0.004 + k / 10) % 1 + 1) % 1;
          const a = (k / 10) * TAU;
          const rr = ring(0.08 + z * 0.92);
          light(c, C1(1, 78), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * 0.01 * (1 - z + 0.3), amt * 0.4 * (1 - z));
        }
        break;
      }
      case 2: {                                   // side branches opening off it
        c.strokeStyle = CMix(0.4, amt * 0.28, 62);
        c.lineWidth = 1 * TK;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * TAU + vt * 0.001;
          const z = 0.45 + 0.2 * Math.sin(vt * 0.005 + k);
          const rr = ring(z);
          c.beginPath();
          c.ellipse(cx + Math.cos(a) * rr * 1.3, cy + Math.sin(a) * rr * 1.3, rr * 0.34, rr * 0.2, a, 0, TAU);
          c.stroke();
        }
        break;
      }
      case 3: {                                   // a gate ring turning in place
        const rr = ring(0.42) * (1 + beatE * 0.05);
        c.save();
        c.translate(cx, cy);
        c.rotate(vt * 0.006);
        c.strokeStyle = C1(amt * 0.55, 74);
        c.lineWidth = (1.6 + amt * 2) * TK;
        c.beginPath();
        for (let k = 0; k < 8; k++) c.arc(0, 0, rr, (k / 8) * TAU, (k / 8) * TAU + 0.5);
        c.stroke();
        c.restore();
        break;
      }
      case 4: {                                   // sparks streaming past camera
        const S = (L.scratch.tnSpark ??= [] as { a: number; z: number; sp: number }[]) as { a: number; z: number; sp: number }[];
        while (S.length < 40) S.push({ a: Math.random() * TAU, z: Math.random(), sp: 0.006 + Math.random() * 0.012 });
        c.strokeStyle = C1(amt * 0.4, 78);
        c.lineWidth = 1 * TK;
        c.beginPath();
        for (const p of S) {
          p.z -= p.sp * (1 + bassV);
          if (p.z < 0.06) p.z = 1;
          const r1 = ring(p.z), r2 = ring(Math.min(1, p.z + 0.06));
          c.moveTo(cx + Math.cos(p.a) * r1, cy + Math.sin(p.a) * r1);
          c.lineTo(cx + Math.cos(p.a) * r2, cy + Math.sin(p.a) * r2);
        }
        c.stroke();
        break;
      }
      case 5: {                                   // panelling on the wall
        c.strokeStyle = C2(amt * 0.16, 54);
        c.lineWidth = 0.7 * TK;
        c.beginPath();
        for (let z = 0.15; z < 1; z += 0.14) {
          const rr = ring(z);
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * TAU + z;
            c.moveTo(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92);
            c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
        }
        c.stroke();
        break;
      }
      default: {                                  // the light at the end
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.16 + beatE * 0.03));
        g.addColorStop(0, C1(amt * 0.3, 76));
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(cx - R * 0.2, cy - R * 0.2, R * 0.4, R * 0.4);
        void w; void h;
      }
    }
  },

  // ── THUNDER — everything here belongs to a storm ────────────────────────
  THUNDER: (x) => {
    const { c, w, h, R, vt, amt, slot, beat, beatE, hitE, C1, C2, CMix, TK, L } = x;
    switch (slot) {
      case 0: {                                   // the rain thickens
        const S = (L.scratch.thRain ??= [] as { x: number; y: number; sp: number }[]) as { x: number; y: number; sp: number }[];
        while (S.length < 90) S.push({ x: Math.random(), y: Math.random(), sp: 0.016 + Math.random() * 0.024 });
        c.strokeStyle = C1(amt * 0.24, 74);
        c.lineWidth = 0.9 * TK;
        c.beginPath();
        for (const p of S) {
          p.y += p.sp;
          if (p.y > 1) { p.y = -0.05; p.x = Math.random(); }
          c.moveTo(p.x * w, p.y * h);
          c.lineTo(p.x * w - w * 0.012, p.y * h - h * 0.05);
        }
        c.stroke();
        break;
      }
      case 1: {                                   // cloud flashes far off
        const f = Math.max(0, Math.sin(vt * 0.013) ** 8);
        const g = c.createRadialGradient(w * 0.2, h * 0.18, 0, w * 0.2, h * 0.18, R * 0.5);
        g.addColorStop(0, C2(amt * f * 0.3, 70));
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h * 0.5);
        break;
      }
      case 2: {                                   // a forked bolt on the hits
        const S = (L.scratch.thBolt ??= { life: 0, seed: 0 }) as { life: number; seed: number };
        if (hitE > 0.7 && S.life <= 0) { S.life = 1; S.seed = Math.random() * 999; }
        S.life -= 0.08;
        if (S.life > 0) {
          c.strokeStyle = C1(amt * S.life, 88);
          c.lineWidth = (1.4 + S.life * 2) * TK;
          const draw = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
            c.beginPath();
            c.moveTo(x0, y0);
            for (let i = 1; i <= 8; i++) {
              const t2 = i / 8;
              c.lineTo(x0 + (x1 - x0) * t2 + (hash01(seed + i) - 0.5) * w * 0.07, y0 + (y1 - y0) * t2);
            }
            c.stroke();
          };
          const bx = 0.2 + hash01(S.seed) * 0.6;
          draw(bx * w, 0, (bx + (hash01(S.seed + 1) - 0.5) * 0.2) * w, h * 0.78, S.seed);
          draw(bx * w, h * 0.34, (bx + 0.16) * w, h * 0.62, S.seed + 20);
        }
        break;
      }
      case 3: {                                   // the ground lights up under it
        const g = c.createLinearGradient(0, h, 0, h * 0.7);
        g.addColorStop(0, C1(amt * (0.2 + hitE * 0.4), 66));
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(0, h * 0.7, w, h * 0.3);
        break;
      }
      case 4: {                                   // wind takes the rain sideways
        c.strokeStyle = C2(amt * 0.18, 62);
        c.lineWidth = 0.8 * TK;
        c.beginPath();
        for (let i = 0; i < 26; i++) {
          const y = hash01(i) * h;
          const off = ((vt * 0.02 + hash01(i + 5)) % 1) * w;
          c.moveTo(off, y);
          c.lineTo(off + w * 0.09, y + h * 0.012);
        }
        c.stroke();
        break;
      }
      case 5: {                                   // a second cell on the far side
        const f = Math.max(0, Math.sin(vt * 0.009 + 2) ** 8);
        const g = c.createRadialGradient(w * 0.84, h * 0.24, 0, w * 0.84, h * 0.24, R * 0.44);
        g.addColorStop(0, CMix(0.6, amt * f * 0.28, 68));
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(w * 0.4, 0, w * 0.6, h * 0.6);
        break;
      }
      default: {                                  // sheet lightning across the sky
        if (beat) (L.scratch.thSheet as { v: number } | undefined ?? (L.scratch.thSheet = { v: 0 })).v = 1;
        const S = (L.scratch.thSheet ??= { v: 0 }) as { v: number };
        S.v *= 0.86;
        if (S.v > 0.02) {
          const g = c.createLinearGradient(0, 0, 0, h * 0.6);
          g.addColorStop(0, C1(amt * S.v * 0.24, 84));
          g.addColorStop(1, "transparent");
          c.fillStyle = g;
          c.fillRect(0, 0, w, h * 0.6);
        }
        void beatE;
      }
    }
  },
};
