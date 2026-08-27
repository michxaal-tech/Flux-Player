// The embedded-lyric path, end to end in a real browser.
//
// The unit check (taglyrics-check.mjs) proves the parser reads the bytes. This
// proves the app does something with it: a file carrying an ID3 USLT lyric
// sheet is imported, and the lyrics arrive on the track without the user
// asking and without any network lookup — which is the whole point for a song
// no lyric database has ever heard.
//
// The audio is a real WAV with an ID3 tag prepended. FLUX decodes with the
// browser's own decoder, which skips a leading ID3 chunk, so one file is both
// playable and tagged.
//
// Usage: npm run build && node scripts/taglyrics-e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4198;
const BASE = `http://localhost:${PORT}`;
const LRC = "[00:03.00]first line here\n[00:07.50]second line here\n[00:12.00]third line here";

const enc = new TextEncoder();
const cat = (...ps) => {
  const n = ps.reduce((s, p) => s + p.length, 0);
  const o = new Uint8Array(n);
  let k = 0;
  for (const p of ps) { o.set(p, k); k += p.length; }
  return o;
};
const u32be = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const syncsafe = (v) => new Uint8Array([(v >>> 21) & 0x7f, (v >>> 14) & 0x7f, (v >>> 7) & 0x7f, v & 0x7f]);

function id3WithLyrics(text) {
  const body = cat(new Uint8Array([3]), enc.encode("eng"), new Uint8Array([0]), enc.encode(text));
  const frame = cat(enc.encode("USLT"), u32be(body.length), new Uint8Array([0, 0]), body);
  return cat(enc.encode("ID3"), new Uint8Array([3, 0, 0]), syncsafe(frame.length), frame);
}

function wavBytes(secs = 16) {
  const rate = 44100, n = rate * secs, ch = 2, ds = n * ch * 2;
  const b = Buffer.alloc(44 + ds);
  b.write("RIFF", 0); b.writeUInt32LE(36 + ds, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(ds, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = Math.round(0.25 * Math.sin(2 * Math.PI * 440 * t) * 32767);
    b.writeInt16LE(v, o); o += 2; b.writeInt16LE(v, o); o += 2;
  }
  return new Uint8Array(b);
}

const dir = mkdtempSync(join(tmpdir(), "flux-tag-"));
const tagged = join(dir, "tagged song.wav");
const plain = join(dir, "plain song.wav");
writeFileSync(tagged, Buffer.from(cat(id3WithLyrics(LRC), wavBytes())));
writeFileSync(plain, Buffer.from(wavBytes()));

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

// Any lyric lookup would be a network call; there must not be one.
let lookups = 0;
await page.route("**/lrclib.net/**", (r) => { lookups++; r.abort(); });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed = 1; }
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", tagged);
await page.waitForSelector("text=tagged song", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(1500);

const lyricsOf = () => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("flux-store") || "{}");
  const pls = s?.state?.playlists ?? [];
  const all = pls.flatMap((p) => p.tracks ?? []);
  const t = all.find((x) => (x.name || "").includes("tagged"));
  return t?.lyrics ?? null;
});

await step("embedded lyrics land on the track automatically", async () => {
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("flux-store") || "{}");
    const all = (s?.state?.playlists ?? []).flatMap((p) => p.tracks ?? []);
    return !!all.find((x) => (x.name || "").includes("tagged"))?.lyrics?.length;
  }, { timeout: 15000 });
  const ly = await lyricsOf();
  if (!ly || ly.length !== 3) throw new Error(`got ${ly ? ly.length : "none"} lines`);
});

await step("the timestamps are the file's, not estimated", async () => {
  const ly = await lyricsOf();
  const want = [3, 7.5, 12];
  ly.forEach((l, i) => {
    if (Math.abs(l.t - want[i]) > 0.05) throw new Error(`line ${i} at ${l.t}s, expected ${want[i]}s`);
  });
});

await step("the words are the file's", async () => {
  const ly = await lyricsOf();
  if (!ly[0].text.includes("first line here")) throw new Error(JSON.stringify(ly[0]));
});

await step("no lyric lookup was made", async () => {
  if (lookups > 0) throw new Error(`${lookups} network lookups`);
});

await step("an untagged file does not gain invented lyrics", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", plain);
  await page.waitForSelector("text=plain song", { timeout: 8000 });
  await page.waitForTimeout(1200);
  const ly = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("flux-store") || "{}");
    const all = (s?.state?.playlists ?? []).flatMap((p) => p.tracks ?? []);
    return all.find((x) => (x.name || "").includes("plain"))?.lyrics ?? null;
  });
  if (ly && ly.length) throw new Error(`invented ${ly.length} lines`);
});

if (errors.length) {
  console.log(`\n✘ ${errors.length} page errors:`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.log(`   ${e}`);
  failed = 1;
}
await browser.close();
preview.kill();
console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed);
