// End-to-end coverage for scrubbing by touch, which had none.
//
// What this does prove: a touch drag along the seekbar seeks continuously and
// lands where the finger is lifted, and a tap seeks to the tapped point, on a
// touch-enabled mobile context.
//
// What it does NOT prove, stated because it was written expecting to: it does
// not reproduce the Android snap-back bug. There, a `touchstart` scrub is
// followed by synthesised `mousedown`/`mouseup` at the position the finger
// first landed, and with a mouse path and a touch path registered side by side
// that phantom press re-ran the scrub and seeked back to the start of the drag.
// Chromium's CDP touch emulation does not emit those compatibility events, so
// this check passed against the buggy dual-path code as readily as against the
// single pointer path that replaced it. It is a regression guard for touch
// scrubbing in general, not evidence about that specific fault.
//
// Usage: npm run build && node scripts/scrub-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices } from "playwright";

const PORT = 4194;
const BASE = `http://localhost:${PORT}`;

function makeWav(path) {
  const rate = 44100, secs = 30, n = rate * secs, ch = 2, dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.round(0.25 * Math.sin(2 * Math.PI * 440 * (i / rate)) * 32767);
    buf.writeInt16LE(s, off); off += 2; buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}
const wav = join(mkdtempSync(join(tmpdir(), "flux-scrub-")), "t.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });

// A real Android profile: touch enabled, so compatibility mouse events fire.
const ctx = await browser.newContext({ ...devices["Pixel 5"], hasTouch: true, isMobile: true });
const page = await ctx.newPage();

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed = 1; }
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=t", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForSelector("[data-seekbar]", { timeout: 8000 });
await page.waitForFunction(() => (window.__flux?.duration ?? 0) > 1 || true, { timeout: 3000 }).catch(() => {});
await page.waitForTimeout(1200);

// `__flux.prog` is the render loop's own 0..1 position — the same hook the
// mouse-driven seekbar check reads. The app plays through Web Audio, so there
// is no <audio> element to ask.
const frac = () => page.evaluate(() => window.__flux.prog);

await step("touch-drag the seekbar to ~75% and it stays there", async () => {
  const box = await page.locator("canvas[data-seekbar]").boundingBox();
  if (!box) throw new Error("no seekbar");
  const y = box.y + box.height / 2;
  const startX = box.x + box.width * 0.1;
  const endX = box.x + box.width * 0.75;

  // CDP touch emulation. Note this does *not* emit the compatibility mouse
  // events a real Android WebView sends after a touch sequence — see the header.
  const cdp = await page.context().newCDPSession(page);
  const pt = (type, x) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y }],
  });
  await pt("touchStart", startX);
  for (let i = 1; i <= 6; i++) await pt("touchMove", startX + ((endX - startX) * i) / 6);
  await pt("touchEnd", endX);

  await page.waitForTimeout(600);
  const after = await frac();
  if (typeof after !== "number") throw new Error("no progress hook");

  if (after < 0.6) throw new Error(`snapped back to ${(after * 100).toFixed(0)}% instead of ~75%`);
  if (after > 0.92) throw new Error(`overshot to ${(after * 100).toFixed(0)}%`);
});

await step("a plain tap seeks to where it was tapped", async () => {
  const box = await page.locator("canvas[data-seekbar]").boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + box.width * 0.3;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  const after = await frac();
  if (Math.abs(after - 0.3) > 0.12) throw new Error(`tapped 30%, landed ${(after * 100).toFixed(0)}%`);
});

await browser.close();
preview.kill();
console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed);
