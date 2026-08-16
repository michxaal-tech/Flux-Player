// Generates the PWA icon PNGs (192, 512, maskable-512) with zero dependencies:
// raw RGBA pixels → zlib deflate → hand-assembled PNG chunks.
// Art: FLUX PRO vinyl disc, cyan→magenta gradient label on #08090D.
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
const CYAN = [0x53, 0xe9, 0xff];
const MAG = [0xff, 0x4e, 0xcd];
const BG = [0x08, 0x09, 0x0d];

function drawIcon(size, discScale) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const discR = size * discScale;
  const labelR = discR * 0.42;
  const holeR = discR * 0.11;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let col;
      if (r > discR) {
        // background with faint radial glow around the disc
        const glow = Math.max(0, 1 - (r - discR) / (size * 0.18)) * 0.25;
        col = [lerp(BG[0], CYAN[0], glow * 0.4), lerp(BG[1], CYAN[1], glow * 0.4), lerp(BG[2], CYAN[2], glow * 0.4)];
      } else if (r <= holeR) {
        col = BG;
      } else if (r <= labelR) {
        // conic cyan↔magenta label
        const f = (Math.sin(ang * 2) + 1) / 2;
        col = [lerp(CYAN[0], MAG[0], f), lerp(CYAN[1], MAG[1], f), lerp(CYAN[2], MAG[2], f)];
      } else {
        // vinyl grooves
        const groove = Math.floor((discR - r) / (size * 0.012)) % 2;
        const base = groove ? 0x1c : 0x14;
        // top-left sheen
        const sheen = Math.max(0, 1 - Math.hypot(dx + discR * 0.35, dy + discR * 0.35) / (discR * 1.1)) * 22;
        col = [base + sheen, base + 2 + sheen, base + 8 + sheen];
      }
      // anti-alias disc edge against bg
      if (r > discR - 1 && r <= discR + 1) {
        const f = (r - (discR - 1)) / 2;
        col = [lerp(col[0], BG[0], f * 0.6), lerp(col[1], BG[1], f * 0.6), lerp(col[2], BG[2], f * 0.6)];
      }
      const i = (y * size + x) * 4;
      px[i] = Math.min(255, Math.round(col[0]));
      px[i + 1] = Math.min(255, Math.round(col[1]));
      px[i + 2] = Math.min(255, Math.round(col[2]));
      px[i + 3] = 255;
    }
  }
  return px;
}

for (const [file, size, scale] of [
  ["icon-192.png", 192, 0.44],
  ["icon-512.png", 512, 0.44],
  ["icon-maskable-512.png", 512, 0.34], // art inside the 80% safe zone
]) {
  writeFileSync(join(outDir, file), encodePng(size, drawIcon(size, scale)));
  console.log(`wrote ${file}`);
}
