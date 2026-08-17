import type { ThemeDraw } from "../themeTypes";

// FISSION — a core wrapped in nested shells, one shell per drop.
//
// Genuinely 3D: each shell is a wireframe sphere whose vertices go through a
// per-shell rotation and a perspective divide, and the wires are depth-shaded
// so the far side of a shell is visibly further away than the near side. Shells
// tumble on different axes, so as they accumulate the interference between them
// is what carries the frame — the more the track has dropped, the more there is
// to interfere.

const MAXS = 8;
const RINGS = 5;    // latitude rings per shell
const SEG = 30;     // segments per ring
const TAU = Math.PI * 2;

interface State { a: number[]; b: number[] }

export const FISSION: ThemeDraw = (x) => {
  const { c, cx, cy, R, freq, beat, beatE, energy, dropE, bassV, trebV, cfg, TK, C1, C2, CMix, glow, noGlow, L } = x;

  const S = (L.scratch.fission ??= { a: [] as number[], b: [] as number[] }) as State;
  const shells = Math.min(MAXS, 1 + L.dropSlots);
  while (S.a.length < shells) { S.a.push(Math.random() * TAU); S.b.push(Math.random() * TAU); }

  const f = R * 1.15;
  const camZ = 3.4;
  const bins = freq.length;

  for (let k = 0; k < shells; k++) {
    const amt = k === 0 ? 1 : (L.dropAmts[k - 1] ?? 0);
    if (amt < 0.03) continue;

    // each shell tumbles on its own pair of axes and at its own rate — that is
    // where the complexity comes from as they stack
    const sgn = k % 2 ? -1 : 1;
    S.a[k] += (0.004 + energy * 0.008 + dropE * 0.012) * sgn * cfg.speed;
    S.b[k] += (0.0026 + energy * 0.005) * (k % 3 ? 1 : -1) * cfg.speed;

    const bin = Math.min(bins - 1, 3 + k * 6);
    const spec = ((freq[bin] ?? 0) / 255) ** 1.4;
    // world radii, sized so the innermost shell still projects wider than the
    // core — otherwise the core simply swallows it
    const rad = 0.72 + k * 0.3 + spec * 0.14 * amt + beatE * 0.04;
    const hue = k / MAXS;

    const ca = Math.cos(S.a[k]), sa = Math.sin(S.a[k]);
    const cb = Math.cos(S.b[k]), sb = Math.sin(S.b[k]);

    c.lineWidth = (0.6 + amt * 1.2 + spec * 1.2) * TK;
    for (let r = 0; r < RINGS; r++) {
      // latitudes, evenly spread but skipping the poles where they collapse
      const lat = (-0.5 + (r + 0.5) / RINGS) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      c.beginPath();
      let started = false;
      for (let i = 0; i <= SEG; i++) {
        const lon = (i / SEG) * TAU;
        // sphere point, then two rotations, then perspective
        let px = Math.cos(lon) * cl * rad;
        let py = sl * rad;
        let pz = Math.sin(lon) * cl * rad;
        // rotate about Y
        const rx = px * ca - pz * sa;
        pz = px * sa + pz * ca;
        px = rx;
        // rotate about X
        const ry = py * cb - pz * sb;
        pz = py * sb + pz * cb;
        py = ry;

        const d = pz + camZ;
        if (d < 0.2) { started = false; continue; }
        const sx = cx + (f * px) / d;
        const sy = cy - (f * py) / d;
        if (!started) { c.moveTo(sx, sy); started = true; } else c.lineTo(sx, sy);
      }
      // depth shading is applied per ring rather than per vertex — cheap, and
      // enough for the shells to read as volumes
      c.strokeStyle = CMix(hue, amt * (0.16 + spec * 0.4) * (0.5 + r / RINGS * 0.5), 56 + spec * 20);
      c.stroke();
    }

    // a meridian, so a shell still reads as a sphere when it is edge-on
    if (amt > 0.3) {
      c.strokeStyle = C2(amt * 0.2, 62);
      c.lineWidth = 0.7 * TK;
      c.beginPath();
      let st = false;
      for (let i = 0; i <= SEG; i++) {
        const lat = (i / SEG) * TAU;
        let px = 0, py = Math.sin(lat) * rad, pz = Math.cos(lat) * rad;
        const rx = px * ca - pz * sa; pz = px * sa + pz * ca; px = rx;
        const ry = py * cb - pz * sb; pz = py * sb + pz * cb; py = ry;
        const d = pz + camZ;
        if (d < 0.2) { st = false; continue; }
        const sx = cx + (f * px) / d, sy = cy - (f * py) / d;
        if (!st) { c.moveTo(sx, sy); st = true; } else c.lineTo(sx, sy);
      }
      c.stroke();
    }
  }

  // the core, always there and always the brightest thing in frame
  const cr = R * (0.03 + bassV * 0.028 + beatE * 0.02 + dropE * 0.02);
  glow(Math.min(16, 6 + bassV * 10), C1());
  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, cr * 3.2);
  cg.addColorStop(0, C1(0.34 + bassV * 0.2, 78));
  cg.addColorStop(0.35, C2(0.13 + trebV * 0.1, 62));
  cg.addColorStop(1, "transparent");
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, cr * 3.2, 0, TAU);
  c.fill();
  noGlow();

  if (beat) for (let k = 0; k < shells; k++) S.a[k] += 0.01 * (k % 2 ? -1 : 1);
};
