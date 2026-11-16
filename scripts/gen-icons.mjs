// Generates the PWA icon PNGs (192, 512, maskable-512) with zero dependencies:
// raw RGBA pixels → zlib deflate → hand-assembled PNG chunks.
// Art: the Flux mark — a ring crossed by an ember waveform, on warm ink.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, f) => a + (b - a) * f;
const INK = [0x0f, 0x0d, 0x0b];
const PAPER = [0xf4, 0xee, 0xe4];
const EMBER = [0xff, 0x7a, 0x3d];

// The Flux mark: a ring (a record seen edge-on) crossed by a waveform. Drawn
// by distance to each shape, so the edges are anti-aliased without a renderer.
function wave(u) {
  // the mark's path, normalised to the ring's radius: two arches, rising out
  return Math.sin(u * Math.PI * 1.55 + 0.35) * 0.42 * (1 - Math.abs(u) * 0.15);
}

function drawIcon(size, markScale) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * markScale;
  const ringW = R * 0.17;
  const waveW = R * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / R, dy = (y + 0.5 - c) / R;
      let col = [...INK];
      // a faint ember glow behind the mark
      const g = Math.max(0, 1 - Math.hypot(dx, dy) / 1.9) * 0.14;
      col = col.map((v, k) => lerp(v, EMBER[k], g));
      // ring
      const dRing = Math.abs(Math.hypot(dx, dy) - 1) * R - ringW / 2;
      const aRing = Math.max(0, Math.min(1, 0.5 - dRing));
      col = col.map((v, k) => lerp(v, PAPER[k], aRing));
      // wave: distance to the curve, sampled
      if (Math.abs(dx) < 1.15) {
        let best = 1e9;
        for (let s = -1.15; s <= 1.15; s += 0.01) {
          const d = Math.hypot(dx - s, dy + wave(s));
          if (d < best) best = d;
        }
        const aWave = Math.max(0, Math.min(1, 0.5 - (best * R - waveW / 2)));
        col = col.map((v, k) => lerp(v, EMBER[k], aWave));
      }
      const i = (y * size + x) * 4;
      px[i] = Math.round(col[0]);
      px[i + 1] = Math.round(col[1]);
      px[i + 2] = Math.round(col[2]);
      px[i + 3] = 255;
    }
  }
  return px;
}

for (const [file, size, scale] of [
  ["icon-192.png", 192, 0.3],
  ["icon-512.png", 512, 0.3],
  ["icon-maskable-512.png", 512, 0.24], // art inside the 80% safe zone
]) {
  writeFileSync(join(outDir, file), encodePng(size, drawIcon(size, scale)));
  console.log(`wrote ${file}`);
}

// Desktop icon (Windows + macOS): 1024px, the mark on a rounded tile with
// transparent corners, inset the way macOS app icons are.
{
  const size = 1024, px = drawIcon(size, 0.25);
  const inset = size * 0.1, r = size * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const qx = Math.max(inset + r - x, x - (size - inset - r), 0);
    const qy = Math.max(inset + r - y, y - (size - inset - r), 0);
    const outside = x < inset || y < inset || x > size - inset || y > size - inset;
    const d = Math.hypot(qx, qy) - r;
    const a = outside ? 0 : Math.max(0, Math.min(1, 0.5 - d));
    px[(y * size + x) * 4 + 3] = Math.round(a * 255);
  }
  writeFileSync(join(outDir, "..", "..", "desktop", "build", "icon.png"), encodePng(size, px));
  console.log("wrote desktop/build/icon.png");
}
