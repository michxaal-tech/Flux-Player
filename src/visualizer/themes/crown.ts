import type { ThemeDraw } from "../themeTypes";

// CROWN — a ring of spectrum spikes standing on a floor, seen from just above.
// Built for drop escalation: every drop rings the composition with another,
// wider tier of spikes, each turning at its own rate and reading its own part
// of the spectrum. Nothing is ever taken away, so the last chorus is a full
// crown and the intro is a single circle.
//
// The perspective is a squash rather than a full camera — the tiers have to
// stay concentric and legible as they multiply, which a yawing camera would
// fight.

const MAXT = 8;               // hard cap on tiers
const SQUASH = 0.4;           // vertical foreshortening of the floor
const TAU = Math.PI * 2;

interface State { rot: number[]; }

export const CROWN: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, freq, beat, beatE, energy, dropE, bassV, trebV, cfg, TK, C1, C2, CMix, L } = x;

  const S = (L.scratch.crown ??= { rot: [] as number[] }) as State;
  const tiers = Math.min(MAXT, 1 + L.dropSlots);
  while (S.rot.length < tiers) S.rot.push(Math.random() * TAU);

  const bins = freq.length;
  const cyv = cy + R * 0.1;

  // floor rings, one per tier, drawn first so the spikes stand on them
  for (let k = 0; k < tiers; k++) {
    const amt = k === 0 ? 1 : (L.dropAmts[k - 1] ?? 0);
    if (amt < 0.03) continue;
    const rr = R * (0.24 + k * 0.1);
    c.strokeStyle = CMix(k / MAXT, amt * 0.2, 50);
    c.lineWidth = 0.7 * TK;
    c.beginPath();
    c.ellipse(cx, cyv, rr, rr * SQUASH, 0, 0, TAU);
    c.stroke();
  }

  // spikes, outer tiers first so inner ones sit in front of them
  for (let k = tiers - 1; k >= 0; k--) {
    const amt = k === 0 ? 1 : (L.dropAmts[k - 1] ?? 0);
    if (amt < 0.03) continue;

    S.rot[k] += (0.0018 + energy * 0.004) * (k % 2 ? -1 : 1) * cfg.speed;
    const rr = R * (0.24 + k * 0.1);
    const n = 20 + k * 6;
    // each tier reads a different octave of the spectrum
    const b0 = 2 + k * 7;
    const span = 20 + k * 4;
    const hue = k / MAXT;

    // Geometry is computed once and drawn in two passes: a single wide, dim
    // path per tier for the bloom, then the bright cores. A shadow-blurred
    // stroke per spike looks the same and costs ten times the frame — with
    // eight tiers of up to sixty spikes that is the difference between 45ms
    // and 430ms.
    const geo: { bx: number; by: number; len: number; spec: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + S.rot[k];
      const m = Math.min(i, n - 1 - i) / (n / 2);
      const bin = Math.min(bins - 1, b0 + Math.floor(m * span));
      const spec = ((freq[bin] ?? 0) / 255) ** 1.4;
      geo.push({
        bx: cx + Math.cos(a) * rr,
        by: cyv + Math.sin(a) * rr * SQUASH,
        len: R * (0.03 + spec * (0.2 + dropE * 0.16)) * amt * (0.6 + cfg.intensity * 0.4),
        spec,
      });
    }

    c.strokeStyle = CMix(hue, amt * 0.1, 60);
    c.lineWidth = (3 + beatE * 2) * TK;
    c.beginPath();
    for (const g of geo) { c.moveTo(g.bx, g.by); c.lineTo(g.bx, g.by - g.len); }
    c.stroke();

    for (const g of geo) {
      c.strokeStyle = CMix(hue, amt * (0.3 + g.spec * 0.6), 56 + g.spec * 22);
      c.lineWidth = (0.9 + g.spec * 2 + beatE * 0.8) * TK;
      c.beginPath();
      c.moveTo(g.bx, g.by);
      c.lineTo(g.bx, g.by - g.len);
      c.stroke();
    }

    // tips catch the light on the loud bins — one batched path, one colour
    c.fillStyle = C1(amt * 0.45, 76);
    c.beginPath();
    for (const g of geo) {
      if (g.spec <= 0.45) continue;
      const tr = (0.8 + g.spec * 1.8) * TK;
      c.moveTo(g.bx + tr, g.by - g.len);
      c.arc(g.bx, g.by - g.len, tr, 0, TAU);
    }
    c.fill();
  }

  // a core that swells with the low end, so the middle is never empty
  const core = R * (0.035 + bassV * 0.035 + beatE * 0.02);
  const cg = c.createRadialGradient(cx, cyv, 0, cx, cyv, core * 3.4);
  cg.addColorStop(0, C1(0.18 + bassV * 0.12, 74));
  cg.addColorStop(0.4, C2(0.09 + trebV * 0.07, 60));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cyv, core * 3.4, 0, TAU);
  c.fill();

  if (beat) for (let k = 0; k < tiers; k++) S.rot[k] += 0.006 * (k % 2 ? -1 : 1);
};
