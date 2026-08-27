/**
 * Mobile-native visualizers: the geometry family.
 *
 * Grids and lattices are the cheapest way to fill a phone screen with something
 * that reads as designed: the layout is computed once from `w`/`h`, and the
 * per-frame work is one fill or stroke per cell with no allocation.
 */
import type { ThemeDraw } from "../themeTypes";
import { band, bandLog, blob, BUCKETS, bucket, c01, count, polyPath, scratch } from "./kit";
import { dk } from "../rate";

const TAU = Math.PI * 2;

/** A hex grid that lights up cell by cell with the spectrum. */
export const M_HEXPULSE: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, TK, CMix } = x;
  const cols = Math.max(4, Math.round(count(x, 9) / 1.2));
  const rw = w / cols;
  const rh = rw * 0.86;
  const rows = Math.ceil(h / rh) + 1;

  // hoisted: the hexagon's unit corners never change, so the trig runs once for
  // the whole lattice instead of six times per cell
  const S = scratch(x, "m_hexpulse", () => {
    const cs: number[] = [], sn: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI / 6 + (k / 6) * Math.PI * 2;
      cs.push(Math.cos(a));
      sn.push(Math.sin(a));
    }
    return { cs, sn };
  });

  c.lineWidth = 1.4 * TK;
  for (let b = 0; b < BUCKETS; b++) {
    c.strokeStyle = CMix((b + 0.5) / BUCKETS, 0.7, 62);
    c.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols + 1; i++) {
        const f = ((i / cols) + (r / rows)) % 1;
        if (bucket(f) !== b) continue;
        const v = c01(bandLog(x, f) * I);
        if (v < 0.06) continue;
        const px = i * rw + (r % 2 ? rw / 2 : 0);
        const py = r * rh;
        const rr = rw * 0.46 * (0.6 + v * 0.5) * (1 + beatE * 0.15);
        for (let k = 0; k <= 6; k++) {
          const qx = px + S.cs[k] * rr;
          const qy = py + S.sn[k] * rr;
          k === 0 ? c.moveTo(qx, qy) : c.lineTo(qx, qy);
        }
        c.closePath();
      }
    }
    c.stroke();
  }
};

/** Triangles alternating up and down, filled by band energy. */
export const M_TRIFOLD: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, CMix } = x;
  const cols = Math.max(4, count(x, 10));
  const tw = w / cols;
  const th = tw * 1.1;
  const rows = Math.ceil(h / th) + 1;

  // brightness picks the bucket here rather than hue, because the pattern reads
  // as light and dark tiles rather than as a rainbow
  for (let b = 0; b < BUCKETS; b++) {
    const t = (b + 0.5) / BUCKETS;
    c.fillStyle = CMix(t, 0.1 + t * 0.75, 50 + t * 30);
    c.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const f = ((i / cols) * 0.7 + (r / rows) * 0.3) % 1;
        const v = c01(band(x, f) * I * (1 + beatE * 0.3));
        if (bucket(v) !== b) continue;
        const x0 = i * tw;
        const y0 = r * th;
        if ((i + r) % 2 === 0) {
          c.moveTo(x0, y0 + th);
          c.lineTo(x0 + tw / 2, y0);
          c.lineTo(x0 + tw, y0 + th);
        } else {
          c.moveTo(x0, y0);
          c.lineTo(x0 + tw, y0);
          c.lineTo(x0 + tw / 2, y0 + th);
        }
        c.closePath();
      }
    }
    c.fill();
  }
};

/** A wire grid pushed out of plane by the spectrum. */
export const M_GRIDWAVE: ThemeDraw = (x) => {
  const { c, w, h, vt, bassV, beatE, I, TK, CMix } = x;
  const cols = Math.max(6, count(x, 16));
  const rows = Math.max(6, Math.round(cols * (h / w)));
  const cw = w / cols;
  const rh = h / rows;

  // The offsets were computed inside both loops, so every interior point ran
  // `band()` — and its Math.pow — twice a frame. Once into an array instead.
  const off: number[] = [];
  const drive = 0.3 + bassV * 0.5 + beatE * 0.4;
  for (let r = 0; r <= rows; r++) {
    for (let i = 0; i <= cols; i++) {
      const f = ((i / cols) + (r / rows) * 0.5) % 1;
      const v = band(x, f) * I;
      off[r * (cols + 1) + i] =
        Math.sin(vt * 0.02 + i * 0.4 + r * 0.3) * rh * 0.45 * (drive + v * 1.6);
    }
  }

  c.lineWidth = 1.2 * TK;
  for (let r = 0; r <= rows; r++) {
    c.strokeStyle = CMix(r / rows, 0.45, 58);
    c.beginPath();
    for (let i = 0; i <= cols; i++) c.lineTo(i * cw, r * rh + off[r * (cols + 1) + i]);
    c.stroke();
  }
  for (let i = 0; i <= cols; i++) {
    c.strokeStyle = CMix(i / cols, 0.28, 54);
    c.beginPath();
    for (let r = 0; r <= rows; r++) c.lineTo(i * cw, r * rh + off[r * (cols + 1) + i]);
    c.stroke();
  }
};

/** Square tiles that light in place, like an equaliser wall. */
export const M_TILES: ThemeDraw = (x) => {
  const { c, w, h, beatE, I, fs, CMix } = x;
  const cols = Math.max(4, count(x, 12));
  const cw = w / cols;
  const rows = Math.max(4, Math.round(h / cw));
  const rh = h / rows;
  const S = scratch(x, "m_tiles", () => ({ lv: [] as number[] }));
  const n = cols * rows;
  if (S.lv.length !== n) S.lv = new Array(n).fill(0);

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const k = r * cols + i;
      const f = ((i / cols) + (r / rows) * 0.4) % 1;
      const v = c01(bandLog(x, f) * I * (1 + beatE * 0.4));
      // hold-and-fall, so a tile flares and settles rather than strobing
      S.lv[k] = Math.max(S.lv[k] * dk(0.88, fs), v);
      const a = S.lv[k];
      if (a < 0.04) continue;
      c.fillStyle = CMix(f, 0.12 + a * 0.8, 48 + a * 34);
      c.fillRect(i * cw + cw * 0.08, r * rh + rh * 0.08, cw * 0.84, rh * 0.84);
    }
  }
};

/** A diamond lattice, pulsing from the centre outward. */
export const M_DIAMONDS: ThemeDraw = (x) => {
  const { c, w, h, cx, cy, R, beatE, I, TK, CMix } = x;
  const cols = Math.max(4, count(x, 11));
  const cw = w / cols;
  const rows = Math.ceil(h / cw) + 1;

  c.lineWidth = 1.5 * TK;
  for (let b = 0; b < BUCKETS; b++) {
    c.strokeStyle = CMix((b + 0.5) / BUCKETS, 0.6, 62);
    c.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols + 1; i++) {
        const px = i * cw + (r % 2 ? cw / 2 : 0);
        const py = r * cw;
        // distance from centre picks the band, so the pattern radiates
        const d = Math.hypot(px - cx, py - cy) / R;
        if (bucket(d % 1) !== b) continue;
        const v = c01(band(x, Math.min(1, d)) * I);
        const sz = cw * 0.42 * (0.5 + v * 0.8) * (1 + beatE * 0.2);
        c.moveTo(px, py - sz);
        c.lineTo(px + sz, py);
        c.lineTo(px, py + sz);
        c.lineTo(px - sz, py);
        c.closePath();
      }
    }
    c.stroke();
  }
};

/** Nested rotating squares — a simple, very cheap kaleidoscope. */
export const M_SPINBOX: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, bassV, I, TK, CMix, cfg } = x;
  const N = 12;

  c.lineJoin = "round";
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const v = c01(band(x, f) * I);
    const rr = R * (0.06 + f * 0.34) * (1 + bassV * 0.12 + beatE * 0.12);
    c.strokeStyle = CMix(f, 0.3 + v * 0.65, 58 + v * 24);
    c.lineWidth = (1.2 + v * 3.4) * TK;
    polyPath(c, cx, cy, rr, 4, vt * 0.002 * cfg.speed * (i % 2 ? 1 : -1) + f * 1.2);
    c.stroke();
  }
};

/** A radial kaleidoscope built from mirrored spokes and arcs. */
export const M_KALEIDOLITE: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, beatE, I, TK, CMix, cfg } = x;
  const SEG = 8;
  const N = count(x, 22);
  const spin = vt * 0.0016 * cfg.speed;

  c.lineCap = "round";
  for (let s = 0; s < SEG; s++) {
    const a0 = (s / SEG) * TAU + spin;
    for (let i = 0; i < N; i++) {
      const f = i / N;
      const v = c01(bandLog(x, f) * I);
      if (v < 0.05) continue;
      const rr = R * (0.06 + f * 0.34);
      const spread = 0.16 * (0.3 + v);
      c.strokeStyle = CMix(f, 0.35 + v * 0.6, 58 + v * 26);
      c.lineWidth = (1 + v * 3) * TK * (1 + beatE * 0.3);
      c.beginPath();
      c.arc(cx, cy, rr, a0 - spread, a0 + spread);
      c.stroke();
    }
  }
};

/** Concentric polygons whose side count rises with the section. */
export const M_FACETS: ThemeDraw = (x) => {
  const { c, cx, cy, R, vt, section, beatE, I, TK, CMix, cfg } = x;
  const LAYERS = 9;
  const sides = 3 + (section % 6);

  c.lineJoin = "round";
  for (let L = 0; L < LAYERS; L++) {
    const f = L / LAYERS;
    const v = c01(band(x, f) * I);
    const rr = R * (0.05 + f * 0.36) * (1 + v * 0.2 + beatE * 0.1);
    c.strokeStyle = CMix(f, 0.28 + v * 0.66, 56 + v * 26);
    c.lineWidth = (1.2 + v * 3) * TK;
    polyPath(c, cx, cy, rr, sides + L, vt * 0.0014 * cfg.speed * (L % 2 ? 1 : -1));
    c.stroke();
  }
  c.globalCompositeOperation = "lighter";
  blob(x, cx, cy, R * 0.07 * (1 + beatE), 0.3 + beatE * 0.35, 0.5, 80);
  c.globalCompositeOperation = "source-over";
};
