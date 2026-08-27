// Does the embedded-lyric reader actually read the tags people's files carry?
//
// Builds tagged files byte by byte and parses them with the real module. The
// cases are the ones that break naive ID3 parsers, and each is here because it
// is a way a lyric sheet silently comes out empty or as one line of mojibake:
//
//   v2.3 vs v2.4 frame sizes   v2.3 is a plain 32-bit int, v2.4 is syncsafe.
//                              Reading a v2.3 size as syncsafe truncates every
//                              frame over 128 bytes — which is every lyric sheet.
//   UTF-16 terminators         wide encodings end on a *double* null; stopping
//                              at the first zero byte cuts the descriptor wrong
//                              and swallows the lyrics with it.
//   LRC inside USLT            the common real-world shape from taggers, and the
//                              one that gives synced lyrics for free.
//   SYLT                       properly timed, and the timestamps are big-endian
//                              milliseconds after each terminated string.
//   Vorbis / MP4               the FLAC and M4A equivalents.
//
// Usage: node --experimental-strip-types scripts/taglyrics-check.mjs
import { lyricsFromFile, parseLrcText, spreadPlain, looksLikeLrc } from "../src/audio/tagLyrics.ts";

let failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); failed = 1; }
};

// ── builders ────────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const cat = (...parts) => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u32be = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const syncsafe = (v) => new Uint8Array([(v >>> 21) & 0x7f, (v >>> 14) & 0x7f, (v >>> 7) & 0x7f, v & 0x7f]);
const utf16le = (s) => {
  const b = new Uint8Array(2 + s.length * 2);
  b[0] = 0xff; b[1] = 0xfe; // BOM
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[2 + i * 2] = c & 255;
    b[3 + i * 2] = c >> 8;
  }
  return b;
};

/** major: 3 or 4. frames: [id, bodyBytes][] */
function id3(major, frames) {
  const bodies = frames.map(([id, body]) =>
    cat(enc.encode(id), major >= 4 ? syncsafe(body.length) : u32be(body.length), new Uint8Array([0, 0]), body)
  );
  const payload = cat(...bodies);
  return cat(enc.encode("ID3"), new Uint8Array([major, 0, 0]), syncsafe(payload.length), payload, new Uint8Array(64));
}
const uslt = (text, encoding = 3) => {
  const body = encoding === 1
    ? cat(new Uint8Array([1]), enc.encode("eng"), new Uint8Array([0xff, 0xfe, 0, 0]), utf16le(text))
    : cat(new Uint8Array([encoding]), enc.encode("eng"), new Uint8Array([0]), enc.encode(text));
  return ["USLT", body];
};
const sylt = (pairs) => {
  const parts = [new Uint8Array([3]), enc.encode("eng"), new Uint8Array([2, 1]), new Uint8Array([0])];
  for (const [ms, text] of pairs) parts.push(enc.encode(text), new Uint8Array([0]), u32be(ms));
  return ["SYLT", cat(...parts)];
};
const txxx = (key, val) => ["TXXX", cat(new Uint8Array([3]), enc.encode(key), new Uint8Array([0]), enc.encode(val))];

function flac(comments) {
  const vendor = enc.encode("flux-test");
  const items = comments.map((c) => enc.encode(c));
  const le32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
  const vec = cat(le32(vendor.length), vendor, le32(items.length), ...items.flatMap((i) => [le32(i.length), i]));
  const blockLen = vec.length;
  return cat(
    enc.encode("fLaC"),
    new Uint8Array([0x84, (blockLen >> 16) & 255, (blockLen >> 8) & 255, blockLen & 255]),
    vec,
  );
}

function m4a(text) {
  const payload = enc.encode(text);
  const dataBox = cat(u32be(payload.length + 16), enc.encode("data"), u32be(1), u32be(0), payload);
  const atom = cat(u32be(dataBox.length + 8), new Uint8Array([0xa9]), enc.encode("lyr"), dataBox);
  return cat(new Uint8Array(32), atom, new Uint8Array(16));
}

const blobOf = (u8) => new Blob([u8]);
const LRC = "[00:12.50]first line\n[00:18.00]second line\n[00:24.25]third line";
const PROSE = "[Verse]\nsomething bright enough to see\nand the whole room turns\n\n[Chorus]\nhold on";

// ── pure helpers ────────────────────────────────────────────────────────────
console.log("\nlrc parsing");
{
  const l = parseLrcText(LRC);
  check("three lines", l.length === 3, `got ${l.length}`);
  check("first at 12.5s", Math.abs(l[0].t - 12.5) < 0.001, `${l[0]?.t}`);
  check("centiseconds scaled", Math.abs(l[2].t - 24.25) < 0.001, `${l[2]?.t}`);
  const rep = parseLrcText("[00:10.00][00:40.00]chorus");
  check("repeated timestamps both kept", rep.length === 2 && rep[1].t === 40, `${rep.length}`);
  const ms = parseLrcText("[00:05.123]x");
  check("millisecond fraction scaled", Math.abs(ms[0].t - 5.123) < 0.0005, `${ms[0]?.t}`);
  check("looksLikeLrc true for lrc", looksLikeLrc(LRC));
  check("looksLikeLrc false for prose", !looksLikeLrc(PROSE));
}

console.log("\nplain prose placement");
{
  const l = spreadPlain(PROSE, 180);
  check("section markers dropped", l.every((x) => !/^\[/.test(x.text)), JSON.stringify(l.map((x) => x.text)));
  check("three real lines", l.length === 3, `${l.length}`);
  check("starts after a lead-in", l[0].t > 0 && l[0].t <= 6, `${l[0]?.t}`);
  check("stays inside the track", l[l.length - 1].t < 180, `${l[l.length - 1]?.t}`);
}

// ── containers ──────────────────────────────────────────────────────────────
const cases = [
  ["ID3v2.3 USLT with LRC", id3(3, [uslt(LRC)]), true, 3],
  ["ID3v2.4 USLT with LRC", id3(4, [uslt(LRC)]), true, 3],
  ["ID3v2.3 USLT UTF-16", id3(3, [uslt(LRC, 1)]), true, 3],
  ["ID3v2.4 SYLT timed", id3(4, [sylt([[12500, "first line"], [18000, "second line"]])]), true, 2],
  ["ID3 TXXX:LYRICS prose", id3(4, [txxx("LYRICS", PROSE)]), false, 3],
  ["FLAC Vorbis LYRICS", flac([`LYRICS=${LRC}`]), true, 3],
  ["FLAC UNSYNCEDLYRICS prose", flac([`UNSYNCEDLYRICS=${PROSE}`]), false, 3],
  ["M4A ©lyr with LRC", m4a(LRC), true, 3],
];

console.log("\ncontainers");
for (const [name, bytes, wantSynced, wantLines] of cases) {
  const r = await lyricsFromFile(blobOf(bytes), 180);
  if (!r) { check(name, false, "returned null"); continue; }
  const ok = r.lines.length === wantLines && r.synced === wantSynced;
  check(`${name} → ${r.source}`, ok, `${r.lines.length} lines, synced=${r.synced}`);
  if (ok && wantSynced) {
    check(`  ${name}: first timestamp 12.5s`, Math.abs(r.lines[0].t - 12.5) < 0.01, `${r.lines[0].t}`);
  }
}

console.log("\nlong frame (the v2.3 syncsafe trap)");
{
  // >128 bytes, so a v2.3 size misread as syncsafe truncates it
  const long = Array.from({ length: 20 }, (_, i) => `[00:${String(10 + i).padStart(2, "0")}.00]line ${i}`).join("\n");
  const r = await lyricsFromFile(blobOf(id3(3, [uslt(long)])), 180);
  check("v2.3 long USLT kept whole", !!r && r.lines.length === 20, `${r ? r.lines.length : "null"} lines`);
}

console.log("\nno lyrics present");
{
  const r = await lyricsFromFile(blobOf(id3(4, [["TIT2", cat(new Uint8Array([3]), enc.encode("a song"))]])), 180);
  check("returns null rather than inventing", r === null, JSON.stringify(r));
  const r2 = await lyricsFromFile(blobOf(new Uint8Array(2048)), 180);
  check("garbage input returns null", r2 === null);
}

console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed);
