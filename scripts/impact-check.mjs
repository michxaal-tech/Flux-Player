// Proves the per-beat impact layer is driven by the music rather than a fixed
// cadence. Impact envelopes used to advance a constant amount per frame, so a
// ring took ~0.75s to expand whatever the tempo — which reads as a loop running
// beside the track instead of with it.
//
// Two tracks of identical length at different tempos are analysed, and the
// number of impact retriggers is counted. If impacts follow the beat the counts
// should scale with BPM; if they're on a fixed timer the counts will match.
//
// Usage: npm run build && node scripts/impact-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4191;
const DIR = mkdtempSync(join(tmpdir(), "flux-imp-"));

function makeWav(path, bpm) {
  const rate = 44100, secs = 12, n = rate * secs, ch = 2;
  const dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  const period = 60 / bpm;
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-9 * (t % period));
    const kick = env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t) + (Math.random() * 2 - 1) * 0.3);
    const s = Math.round(Math.max(-1, Math.min(1, 0.18 * Math.sin(2 * Math.PI * 440 * t) + kick * 0.75)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const slow = join(DIR, "slow 80.wav");
const fast = join(DIR, "fast 160.wav");
makeWav(slow, 80);
makeWav(fast, 160);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", [slow, fast]);
await page.waitForSelector("text=slow 80", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(300);

// turn on the impact layer + analyzed sync
await page.click("button:has-text('⚙ TUNE')");
await page.waitForSelector("text=SYNC MODE");
for (const label of ["ANALYZED"]) {
  const t = await page.$(`button:has-text('${label}')`);
  if (t) await t.click();
}
await page.click("button:has-text('RINGS')");
await page.keyboard.press("Escape");

/** Counts impact retriggers over `secs` by watching the live ring buffer. */
const count = (secs) =>
  page.evaluate(
    (s) =>
      new Promise((res) => {
        const L = window.__fluxLive;
        if (!L) return res(null);
        let rings = 0, prev = L.impRings.length, flashes = 0, pf = L.flashVal;
        const t0 = performance.now();
        const tick = () => {
          // a new ring appearing means the impact layer retriggered
          if (L.impRings.length > prev) rings += L.impRings.length - prev;
          prev = L.impRings.length;
          if (L.flashVal > pf + 0.05) flashes++;
          pf = L.flashVal;
          if (performance.now() - t0 < s * 1000) requestAnimationFrame(tick);
          else res({ rings, flashes, bpm: L.bpm });
        };
        requestAnimationFrame(tick);
      }),
    secs
  );

const run = async (name) => {
  await page.evaluate(async (n) => {
    const st = window.__fluxStore.getState();
    for (const pl of st.playlists) {
      const i = pl.tracks.findIndex((t) => t.name.includes(n));
      if (i >= 0) await window.__fluxPlayAt(pl.id, i);
    }
  }, name);
  await page.waitForTimeout(4000); // let analysis finish and the grid lock on
  return count(8);
};

const a = await run("slow 80");
const b = await run("fast 160");
console.log(`80bpm  → detected ${a?.bpm} bpm, ${a?.rings} ring impacts / 8s, ${a?.flashes} flashes`);
console.log(`160bpm → detected ${b?.bpm} bpm, ${b?.rings} ring impacts / 8s, ${b?.flashes} flashes`);

let bad = 0;
if (!a || !b) { console.log("✘ could not read live state"); bad++; }
else {
  const ratio = b.rings / Math.max(1, a.rings);
  console.log(`\nimpact ratio fast/slow = ${ratio.toFixed(2)} (a fixed timer would give ~1.0)`);
  if (ratio < 1.5) { console.log("✘ impacts are NOT tracking tempo"); bad++; }
  else console.log("✔ impacts scale with tempo — they follow the beat, not a timer");
}
if (errors.length) { console.log(`✘ page errors: ${errors[0]}`); bad++; }
process.exitCode = bad ? 1 : 0;

await browser.close();
preview.kill();
