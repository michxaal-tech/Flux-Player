// Does the mobile profile actually cut the visualiser's cost?
//
// Simulates a phone — small viewport, devicePixelRatio 3 — and renders a heavy
// theme twice: once on the laptop/browser profile (__fluxMobile = false) and
// once on the mobile profile (__fluxMobile = true, what the Android WebView
// gets). Reports the visualiser's backing-store pixel count and median frame
// time for each. The mobile profile has to draw meaningfully fewer pixels and
// cost no more per frame, or it isn't doing its job.
//
// Usage: npm run build && node scripts/mobile-perf-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4190;
const BASE = `http://localhost:${PORT}`;
const THEME = "INFERNO"; // drop-set-piece, shadowBlur + lighter — a heavy one

function makeWav(path) {
  const rate = 44100, secs = 6, n = rate * secs, ch = 2, dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = Math.exp(-8 * (t % 0.5));
    const beat = env * (Math.sin(2 * Math.PI * 55 * t) + 0.4 * Math.sin(2 * Math.PI * 110 * t));
    const s = Math.round(Math.max(-1, Math.min(1, 0.2 * Math.sin(2 * Math.PI * 440 * t) + beat * 0.7)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2; buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}
const wav = join(mkdtempSync(join(tmpdir(), "flux-mob-")), "t.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });

async function run(mobile) {
  // phone-shaped, high-DPR — the exact case that was falling into the laptop path
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.addInitScript((m) => { window.__fluxMobile = m; }, mobile);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", wav);
  await page.waitForSelector("text=t", { timeout: 8000 });
  await page.click("button:has(div:text-is('PLAYER'))");
  await page.waitForTimeout(400);
  await page.click("button:has-text('◉ VISUALS')");
  await page.waitForTimeout(500);
  await page.evaluate((th) => {
    const L = window.__flux;
    L.visTheme = th;
    Object.assign(L.cfg, { glow: 1, trail: 0.82, particles: 1, quality: "AUTO", hiFps: true, vis3d: "OFF" });
  }, THEME);
  await page.waitForTimeout(2500); // let the governor settle

  const stat = await page.evaluate(() => new Promise((res) => {
    const out = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      if (now - last > 2) out.push(now - last);
      last = now;
      if (now - t0 < 3000) requestAnimationFrame(tick);
      else {
        const a = out.slice(5).sort((x, y) => x - y);
        const vis = window.__fluxCanvases.vis;
        res({
          med: +a[a.length >> 1].toFixed(1),
          p90: +a[Math.floor(a.length * 0.9)].toFixed(1),
          w: vis?.width ?? 0, h: vis?.height ?? 0,
          fps: Math.round(window.__flux.targetFps),
          dpr: window.devicePixelRatio,
        });
      }
    };
    requestAnimationFrame(tick);
  }));
  await page.close();
  return stat;
}

const desktop = await run(false);
const mobile = await run(true);
await browser.close();
preview.kill();

const px = (s) => (s.w * s.h / 1e6).toFixed(2) + "Mpx";
console.log(`\ntheme ${THEME}, phone viewport 390x844 @dpr${desktop.dpr}\n`);
console.log(`profile    backing        pixels    targetFps   med    p90`);
console.log(`browser    ${desktop.w}x${desktop.h}     ${px(desktop)}     ${desktop.fps}       ${desktop.med}   ${desktop.p90}`);
console.log(`mobile     ${mobile.w}x${mobile.h}     ${px(mobile)}     ${mobile.fps}       ${mobile.med}   ${mobile.p90}`);

const pxCut = 1 - (mobile.w * mobile.h) / (desktop.w * desktop.h);
console.log(`\npixel reduction: ${(pxCut * 100).toFixed(0)}%`);

let bad = 0;
if (!(pxCut > 0.15)) { console.log("✘ mobile profile did not meaningfully cut pixels"); bad = 1; }
if (mobile.fps > 60) { console.log("✘ mobile still targeting >60fps"); bad = 1; }
if (mobile.med > desktop.med + 1.5) { console.log("✘ mobile frame time not improved"); bad = 1; }
console.log(bad ? "\nFAILED" : "\nOK — mobile profile is lighter");
process.exit(bad);
