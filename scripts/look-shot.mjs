// One frame per theme, same track position every time, into a folder — so a
// change to how the visualizer is lit can be looked at side by side instead of
// argued about.
//
// Usage: npm run build && node scripts/look-shot.mjs OUT_DIR [THEME,THEME,…]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] || "/tmp/flux-look";
const THEMES = (process.argv[3] || "RING,WAVES,SYNAPSE,NEBULA,CITY,GALAXY,LASERS,TUNNEL,BARS,ORB").split(",");
const PORT = 4199;
mkdirSync(OUT, { recursive: true });

function makeWav(path) {
  const rate = 22050, secs = 60, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-8 * (t % 0.5));
    const kick = env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t));
    const s = (0.2 * Math.sin(2 * Math.PI * 440 * t) + 0.22 * Math.sin(2 * Math.PI * 660 * t) + kick * 0.7) * 0.85;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-look-")), "looktrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=looktrk", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(600);

for (const theme of THEMES) {
  await page.evaluate((th) => {
    const L = window.__flux;
    L.visTheme = th;
    // a middling look: glow up, no impact stack, so the shot is about the
    // theme's own lighting and nothing else
    Object.assign(L.cfg, { glow: 0.85, trail: 0.7, particles: 0.4, quality: "MAX", impacts: [], vis3d: "OFF" });
  }, theme);
  await page.waitForTimeout(2600); // let the trail fill and a few beats land
  await page.screenshot({ path: join(OUT, `${theme}.png`) });
  console.log(`${theme} → ${join(OUT, `${theme}.png`)}`);
}

await browser.close();
preview.kill();
