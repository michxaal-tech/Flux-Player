import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const OUT = process.argv[2], THEMES = process.argv[3].split(",");
const PORT = 4195;
mkdirSync(OUT, { recursive: true });
const rate = 44100, secs = 10, n = rate * secs, ch = 2, dataSize = n * ch * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate*ch*2, 28); buf.writeUInt16LE(ch*2, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
let off = 44;
for (let i = 0; i < n; i++) {
  const t = i/rate, env = Math.exp(-8*(t%0.5));
  const kick = env*(Math.sin(2*Math.PI*55*t)+0.5*Math.sin(2*Math.PI*110*t));
  const s = Math.round(Math.max(-1,Math.min(1, 0.2*Math.sin(2*Math.PI*440*t)+0.24*Math.sin(2*Math.PI*660*t)+kick*0.7))*32767*0.8);
  buf.writeInt16LE(s, off); off+=2; buf.writeInt16LE(s, off); off+=2;
}
const wav = join(mkdtempSync(join(tmpdir(),"flux-lit-")), "test track.wav");
writeFileSync(wav, buf);
const preview = spawn("npx", ["vite","preview","--port",String(PORT)], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required","--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 520, height: 520 }, deviceScaleFactor: 1.4 });
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=test track", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(500);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(400);
await page.evaluate(() => { const cv = document.querySelector("canvas"); if (cv) cv.click(); });
await page.waitForTimeout(2500);
const cost = {};
for (const th of THEMES) {
  await page.evaluate((t) => window.__fluxStore.getState().set({ visTheme: t }), th);
  for (const lf of ["NORMAL","WAVE"]) {
    await page.evaluate((v) => window.__fluxStore.getState().setVisKey("lightFx", v), lf);
    await page.waitForTimeout(1800);
    cost[`${th}/${lf}`] = await page.evaluate(() => window.__flux.frameMs);
    const f = join(OUT, `${th.toLowerCase()}-${lf.toLowerCase()}.png`);
    await page.screenshot({ path: f });
    console.log("saved", f, cost[`${th}/${lf}`].toFixed(1) + "ms");
  }
}
await browser.close(); preview.kill();
