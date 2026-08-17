// Contact sheet for the drop-layer system: one frame per theme per depth, so
// the escalation can be looked at rather than described.
//
// Usage: npm run build && node scripts/layer-shot.mjs [outDir]
//   THEMES=STRATA,CROWN,...   which themes to walk (default: the escalation set)
//   DEPTHS=0,1,3,5,7          how many layers to force at each shot
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] || "/tmp/layer-shots";
const THEMES = (process.env.THEMES || "STRATA,CROWN,CASCADE,FISSION,PARALLAX").split(",").filter(Boolean);
const DEPTHS = (process.env.DEPTHS || "0,2,4,7").split(",").map(Number);
const PORT = 4191;
mkdirSync(OUT, { recursive: true });

function makeTestWav(path) {
  const rate = 44100, secs = 10, n = rate * secs, ch = 2;
  const dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-8 * (t % 0.5));
    const kick = env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t) + (Math.random() * 2 - 1) * 0.25);
    const lead = 0.24 * Math.sin(2 * Math.PI * 660 * t);
    const s = Math.round(Math.max(-1, Math.min(1, 0.2 * Math.sin(2 * Math.PI * 440 * t) + lead + kick * 0.7)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-layer-")), "test track.wav");
makeTestWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 1.5 });
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=test track", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(400);
await page.evaluate(() => { const cv = document.querySelector("canvas"); if (cv) cv.click(); });

// full escalation range, and a long trail so the layers are legible in a still
await page.evaluate(() => {
  const st = window.__fluxStore.getState();
  st.setVisKey("dropFx", 1);
  st.setVisKey("particles", 0.12);
});
await page.waitForTimeout(2500);   // let the meter settle on the loud part

for (const th of THEMES) {
  // set it on the store rather than through the picker: the list is long
  // enough that the new themes need scrolling, and the menu covers the frame
  await page.evaluate((t) => window.__fluxStore.getState().set({ visTheme: t }), th);
  await page.waitForTimeout(300);
  for (const d of DEPTHS) {
    // poke the live state directly — the same thing the PREVIEW DEPTH buttons
    // do, without needing the panel open and covering the frame
    await page.evaluate((n) => {
      window.__flux.dropSlots = n;
      window.__flux.dropAmts = new Array(n).fill(1);
      window.__flux.dropIdx = n;
    }, d);
    await page.waitForTimeout(1500);
    const p = join(OUT, `${th.toLowerCase()}-${String(d).padStart(2, "0")}.png`);
    await page.screenshot({ path: p });
    console.log(`saved ${p}`);
  }
}

await browser.close();
preview.kill();
