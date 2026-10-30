// Artwork and the colour it gives the interface.
//
// Most of a local library carries its cover inside the audio file (ID3 APIC,
// FLAC PICTURE, MP4 covr), and the catalogues hand one over with every result.
// Both are found here. A track with none still gets a sleeve: a generated one,
// stable for that track, so the interface never shows an empty grey square and
// colour always has somewhere to come from.
//
// The palette is five colours, dark to light — ground, deep, mid, bright, spark
// — the same shape every stage mode reads, so "follow the artwork" works for
// all of them.
import { blobStore } from "../store/blobStore";
import { id3Frames, id3Text, splitTerminated } from "../audio/tagLyrics";
import type { Track } from "../types";

export interface Art {
  /** image URL, or null for a generated sleeve */
  url: string | null;
  /** five colours, dark → light */
  palette: [string, string, string, string, string];
  /** interface accent: vivid, readable on dark */
  accent: string;
  /** a second accent, for gradients and secondary marks */
  accent2: string;
  /** stable seed for the generated sleeve */
  seed: number;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── colour maths ───────────────────────────────────────────────────────────
export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Build the five-step palette from a lead hue and an optional second hue. */
export function paletteFromHues(h: number, s: number, h2 = h + 28, s2 = s): Art["palette"] {
  // yellow-greens read as acid at full saturation; ease them back
  const acid = h > 55 && h < 150 ? 0.72 : 1;
  const sat = Math.max(18, Math.min(92, s)) * acid;
  s2 *= h2 % 360 > 55 && h2 % 360 < 150 ? 0.72 : 1;
  return [
    hsl(h, Math.min(sat, 38), 5),
    hsl(h, Math.min(sat, 62), 17),
    hsl(h, sat, 42),
    hsl(h2, Math.max(30, Math.min(95, s2)), 64),
    hsl(h2, Math.min(40, s2), 91),
  ];
}

function finish(url: string | null, seed: number, h: number, s: number, h2: number, s2: number): Art {
  const palette = paletteFromHues(h, s, h2, s2);
  const lowSat = s < 14;
  return {
    url, seed, palette,
    // greyscale art gets a warm paper accent rather than a muddy grey
    accent: lowSat ? "#f0e6d6" : hsl(h, Math.max(62, Math.min(92, s + 10)) * (h % 360 > 55 && h % 360 < 150 ? 0.78 : 1), 63),
    accent2: lowSat ? "#a59c8e" : hsl(h2, Math.max(55, Math.min(90, s2)), 70),
  };
}

/** A generated sleeve's colours, from the track identity alone. */
export function generatedArt(key: string): Art {
  const seed = hashStr(key);
  // hues chosen from a curated wheel rather than uniformly, so generated
  // sleeves skew toward the warm/teal/rose families Flux is built around
  const wheel = [8, 18, 28, 42, 160, 175, 190, 205, 330, 345, 355, 95];
  const h = wheel[seed % wheel.length] + ((seed >> 8) % 14) - 7;
  const h2 = h + [24, -32, 150, 40][(seed >> 12) % 4];
  return finish(null, seed, h, 70 + ((seed >> 16) % 20), h2, 60 + ((seed >> 20) % 25));
}

/** Extract the lead and secondary hue from an image. */
async function artFromImage(url: string, seed: number): Promise<Art | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const W = 40;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = W;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(img, 0, 0, W, W);
  let data: Uint8ClampedArray;
  try {
    data = c.getImageData(0, 0, W, W).data;
  } catch {
    // a cross-origin image without CORS taints the canvas: keep the picture,
    // take the colour from the identity instead
    const g = generatedArt(String(seed));
    return { ...g, url };
  }
  // hue histogram, weighted toward saturated mid-lightness pixels — the colour
  // a person would name when describing the cover
  const bins = new Float32Array(36);
  const satAcc = new Float32Array(36);
  let greyW = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const wl = 1 - Math.abs(l - 52) / 52;
    const w = Math.pow(s / 100, 1.4) * Math.max(0, wl);
    total++;
    if (s < 12 || l < 6 || l > 96) { greyW++; continue; }
    const b = Math.floor(h / 10) % 36;
    bins[b] += w;
    satAcc[b] += s * w;
  }
  // smooth the histogram so a hue split across two bins still wins
  const sm = new Float32Array(36);
  for (let i = 0; i < 36; i++) sm[i] = bins[(i + 35) % 36] * 0.5 + bins[i] + bins[(i + 1) % 36] * 0.5;
  let b1 = 0;
  for (let i = 1; i < 36; i++) if (sm[i] > sm[b1]) b1 = i;
  let b2 = -1;
  for (let i = 0; i < 36; i++) {
    const d = Math.min(Math.abs(i - b1), 36 - Math.abs(i - b1));
    if (d < 4) continue;
    if (b2 < 0 || sm[i] > sm[b2]) b2 = i;
  }
  const mostlyGrey = greyW / Math.max(1, total) > 0.85 || sm[b1] < 0.5;
  const s1 = bins[b1] > 0 ? satAcc[b1] / bins[b1] : 0;
  if (mostlyGrey) return finish(url, seed, b1 * 10 + 5, 8, b1 * 10 + 5, 6);
  const h1 = b1 * 10 + 5;
  const useSecond = b2 >= 0 && sm[b2] > sm[b1] * 0.25;
  const h2 = useSecond ? b2 * 10 + 5 : h1 + 26;
  const s2 = useSecond && bins[b2] > 0 ? satAcc[b2] / bins[b2] : s1;
  return finish(url, seed, h1, s1, h2, s2);
}

// ── embedded cover extraction ──────────────────────────────────────────────
function mimeOf(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x52 && b[8] === 0x57) return "image/webp";
  return "image/jpeg";
}

function picFromId3(head: Uint8Array): Uint8Array | null {
  for (const f of id3Frames(head)) {
    if (f.id === "APIC") {
      const enc = f.body[0];
      let p = 1;
      [, p] = splitTerminated(f.body, p, 0); // mime, latin-1
      p += 1; // picture type
      [, p] = splitTerminated(f.body, p, enc); // description
      if (p < f.body.length - 64) return f.body.subarray(p);
    } else if (f.id === "PIC") {
      const enc = f.body[0];
      let p = 5; // encoding + 3-byte format + type
      [, p] = splitTerminated(f.body, p, enc);
      void id3Text;
      if (p < f.body.length - 64) return f.body.subarray(p);
    }
  }
  return null;
}

function picFromFlac(b: Uint8Array): Uint8Array | null {
  if (!(b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43)) return null;
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  let p = 4;
  for (let guard = 0; guard < 64 && p + 4 <= b.length; guard++) {
    const last = (b[p] & 0x80) !== 0;
    const type = b[p] & 0x7f;
    const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    p += 4;
    if (type === 6) {
      let q = p + 4;
      q += 4 + u32(q); // mime
      q += 4 + u32(q); // description
      q += 16; // width, height, depth, colours
      const n = u32(q);
      q += 4;
      if (q + n <= b.length && n > 64) return b.subarray(q, q + n);
    }
    p += len;
    if (last) break;
  }
  return null;
}

function picFromMp4(b: Uint8Array): Uint8Array | null {
  const limit = Math.min(b.length - 24, 8 << 20);
  for (let i = 4; i < limit; i++) {
    // 'covr' followed by its 'data' box
    if (b[i] === 0x63 && b[i + 1] === 0x6f && b[i + 2] === 0x76 && b[i + 3] === 0x72 &&
        b[i + 8] === 0x64 && b[i + 9] === 0x61 && b[i + 10] === 0x74 && b[i + 11] === 0x61) {
      const size = ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]) >>> 0;
      const start = i + 4 + 16;
      const end = Math.min(b.length, i + 4 + size);
      if (end - start > 64) return b.subarray(start, end);
    }
  }
  return null;
}

async function embeddedCover(fileId: string): Promise<string | null> {
  const blob = await blobStore.get(fileId).catch(() => null);
  if (!blob) return null;
  const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 6 << 20)).arrayBuffer());
  const pic = picFromId3(head) ?? picFromFlac(head) ?? picFromMp4(head);
  if (!pic) return null;
  return URL.createObjectURL(new Blob([pic.slice()], { type: mimeOf(pic) }));
}

// ── cache + lookup ─────────────────────────────────────────────────────────
const cache = new Map<string, Art>();
const pending = new Map<string, Promise<Art>>();
const listeners = new Set<() => void>();
export const onArt = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export const artKey = (tr: Track) => tr.fileId || tr.sourceId || tr.id;

/** The art already known for a track, or its generated sleeve while loading. */
/** Flux's own colours, for when nothing is playing. */
const HOUSE: Art = {
  url: null, seed: 7, accent: "#ff7a3d", accent2: "#ffb36b",
  palette: ["#0d0907", "#3a1208", "#c2361a", "#ff7a3d", "#ffe2b8"],
};

export function artNow(tr: Track | null | undefined): Art {
  if (!tr) return HOUSE;
  return cache.get(artKey(tr)) ?? generatedArt(tr.name + (tr.artist ?? ""));
}

export function hasArt(tr: Track): boolean { return cache.has(artKey(tr)); }

export function loadArt(tr: Track): Promise<Art> {
  const key = artKey(tr);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const seed = hashStr(tr.name + (tr.artist ?? ""));
  const job = (async () => {
    let url: string | null = null;
    try {
      const { loadCover } = await import("../ai/covers");
      const svg = await loadCover("track", tr.id);
      if (svg) url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch { /* AI layer optional */ }
    if (!url && tr.fileId) url = await embeddedCover(tr.fileId).catch(() => null);
    if (!url && tr.art) url = tr.art;
    if (!url && tr.source === "youtube" && tr.sourceId) url = `https://i.ytimg.com/vi/${tr.sourceId}/hqdefault.jpg`;
    const art = (url ? await artFromImage(url, seed) : null) ?? { ...generatedArt(tr.name + (tr.artist ?? "")), url: null };
    cache.set(key, art);
    pending.delete(key);
    listeners.forEach((f) => f());
    return art;
  })();
  pending.set(key, job);
  return job;
}

/** Forget all art so the next lookups re-read it (e.g. after an AI cover). */
export function dropAllArt(): void {
  cache.clear();
  listeners.forEach((f) => f());
}
