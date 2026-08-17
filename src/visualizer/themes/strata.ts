import type { ThemeDraw } from "../themeTypes";

// STRATA — built for drop escalation rather than adapted to it.
//
// The scene is a stack of terrain planes seen in perspective. Every drop the
// analyser finds lays down another plane above the last, and it stays for the
// rest of the track, so a song that has dropped six times is literally six
// ridges deep. Each plane reads its own slice of the spectrum, so they never
// move together, and each one's presence follows the energy the engine already
// tracks per unlocked layer — a calm passage flattens the newest strata out
// and the next lift raises them again.

const COLS = 26;   // samples across a plane
const ROWS = 7;    // depth rows per plane
const MAXP = 9;    // hard cap on planes, whatever the drop count

interface State { ph: number[]; drift: number }

export const STRATA: ThemeDraw = (x) => {
  const { c, w, h, cx, cy, R, vt, freq, beatE, energy, dropE, bassV, cfg, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.strata ??= { ph: [], drift: 0 }) as State;
  S.drift += (0.004 + energy * 0.008) * cfg.speed;

  // one base plane always, then one per unlocked drop layer
  const planes = Math.min(MAXP, 1 + L.dropSlots);
  while (S.ph.length < planes) S.ph.push(Math.random() * Math.PI * 2);

  const f = R * 0.95;
  const camY = 0.55 + Math.sin(vt * 0.003) * 0.05;
  const camZ = 0.9 - dropE * 0.25;
  const proj = (wx: number, wy: number, wz: number): [number, number, number] => {
    const rz = wz + camZ;
    if (rz < 0.12) return [0, 0, -1];
    return [cx + (f * wx) / rz, cy - (f * (wy - camY)) / rz, rz];
  };

  const bins = freq.length;
  // far planes first so nearer ones read as in front of them
  for (let p = planes - 1; p >= 0; p--) {
    // slot 0 is the base plane and is always fully present; the rest follow
    // the per-layer energy the engine keeps, so they recede and return
    const amt = p === 0 ? 1 : (L.dropAmts[p - 1] ?? 0);
    if (amt < 0.03) continue;

    const lift = p * 0.42;
    const band = p / Math.max(1, planes - 1);
    // each plane samples a different part of the spectrum, so they ripple
    // independently instead of moving as one sheet
    const b0 = 2 + Math.floor(band * 40);

    for (let r = 0; r < ROWS; r++) {
      const z = 0.6 + r * 0.62;
      const a = amt * (1 - r / (ROWS + 1)) * (0.5 + energy * 0.5);
      if (a < 0.02) continue;
      c.strokeStyle = CMix(band, a * 0.5, 54 + band * 18);
      c.lineWidth = (0.7 + amt * 1.4 + beatE * 0.6) * TK;
      c.beginPath();
      let started = false;
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS;
        const wx = (u - 0.5) * 7.5;
        const bin = Math.min(bins - 1, b0 + Math.floor(Math.abs(u - 0.5) * 2 * 22));
        const spec = ((freq[bin] ?? 0) / 255) ** 1.6;
        const wy =
          lift +
          Math.sin(u * 7 + S.drift * 3 + S.ph[p] + r * 0.4) * 0.13 * amt +
          spec * (0.32 + dropE * 0.3) * amt;
        const [px, py, d] = proj(wx, wy, z);
        if (d < 0) { started = false; continue; }
        if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
      }
      c.stroke();
    }

    // a bright leading edge so each stratum reads as a surface, not as wires
    glow(Math.min(18, 6 + amt * 12), C1());
    c.strokeStyle = C1(amt * (0.4 + bassV * 0.3), 70);
    c.lineWidth = (1 + amt * 1.8) * TK;
    c.beginPath();
    let st = false;
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS;
      const wx = (u - 0.5) * 7.5;
      const bin = Math.min(bins - 1, b0 + Math.floor(Math.abs(u - 0.5) * 2 * 22));
      const spec = ((freq[bin] ?? 0) / 255) ** 1.6;
      const wy = lift + Math.sin(u * 7 + S.drift * 3 + S.ph[p]) * 0.13 * amt + spec * (0.32 + dropE * 0.3) * amt;
      const [px, py, d] = proj(wx, wy, 0.6);
      if (d < 0) { st = false; continue; }
      if (!st) { c.moveTo(px, py); st = true; } else c.lineTo(px, py);
    }
    c.stroke();
    noGlow();
  }

  // haze at the vanishing line, so the far end of the stack dissolves
  const hz = c.createLinearGradient(0, cy - h * 0.2, 0, cy + h * 0.04);
  hz.addColorStop(0, "transparent");
  hz.addColorStop(0.6, C2(0.08 + bassV * 0.07 + dropE * 0.08, 46));
  hz.addColorStop(1, "transparent");
  c.fillStyle = hz;
  c.fillRect(0, cy - h * 0.2, w, h * 0.24);
};
