// Self-contained end-to-end smoke test: builds nothing, expects `npm run build`
// to have been run. Spawns `vite preview`, drives the app in headless Chromium,
// and checks import → playback → FX → DJ → visualizer → recorder → export → persistence.
//
// Usage: npm run build && node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

// 6s stereo test WAV: 440Hz tone + 120bpm kick so BPM/beat detection has material.
function makeTestWav(path) {
  const rate = 44100, secs = 6, n = rate * secs, ch = 2;
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
    // broadband kick like a real drum: fundamental + harmonics + noise click
    const beat =
      env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t) + (Math.random() * 2 - 1) * 0.25);
    const tone = 0.2 * Math.sin(2 * Math.PI * 440 * t);
    const s = Math.round(Math.max(-1, Math.min(1, tone + beat * 0.7)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-")), "test-track.wav");
makeTestWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe =
  process.env.CHROMIUM_PATH ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    console.log(`✘ ${name}: ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("app renders header + tabs", async () => {
  await page.waitForSelector("text=FLUX", { timeout: 5000 });
  for (const t of ["PLAYER", "DJ", "FX", "LIBRARY", "ME"]) await page.waitForSelector(`text=${t}`);
});

await step("import audio file via library", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("button:has-text('LOAD INTO')");
  await page.setInputFiles("input[type=file]", wav);
  await page.waitForSelector("text=test track", { timeout: 5000 });
});

await step("auto-play started, progress advancing", async () => {
  await page.click("button:has(div:text-is('PLAYER'))");
  await page.waitForFunction(() => !document.body.innerText.includes("NO SIGNAL"), { timeout: 5000 });
  await page.waitForTimeout(1500);
  const text = await page.innerText("body");
  if (!/0:0[1-9]/.test(text)) throw new Error("progress not advancing");
});

await step("FX rack: apply SLOWED+REVERB preset", async () => {
  await page.click("button:has(div:text-is('FX'))");
  await page.waitForSelector("text=TIME & PITCH");
  await page.click("button:has-text('SLOWED+REVERB')");
  await page.waitForSelector("text=0.80×");
});

await step("DJ tab renders cues + performance fx", async () => {
  await page.click("button:has(div:text-is('DJ'))");
  await page.waitForSelector("text=HOT CUES");
  await page.waitForSelector("text=TAPE BRAKE");
  await page.waitForSelector("text=LIVE BPM");
});

await step("visualizer opens, theme dropdown works, tune panel works", async () => {
  await page.click("button:has-text('◉ VISUALS')");
  await page.click("button:has-text('◉ RING')"); // theme picker dropdown
  await page.waitForSelector("div:text-is('KALEIDO')");
  // options added in the latest change carry a NEW badge in the pickers
  const newCell = await page.$('[data-th="MONOLITH"]');
  if (!newCell || !(await newCell.innerText()).includes("NEW")) throw new Error("NEW badge missing on a newly added theme");
  await page.click("div:text-is('TUNNEL')");
  await page.waitForSelector("button:has-text('◉ TUNNEL')");
  await page.click("button:has-text('⚙ TUNE')");
  await page.waitForSelector("text=COLOR PALETTE");
  await page.click("button:has-text('VAPOR')");
  // Escape peels one layer at a time: first the tune panel, then the overlay.
  // It used to close both at once, so a stray Escape while tuning dumped you
  // back to the player.
  await page.keyboard.press("Escape");
  await page.waitForSelector("text=COLOR PALETTE", { state: "detached" });
  if (!(await page.$("button[data-themechip]"))) throw new Error("Escape closed the whole visualizer, not just the panel");
  await page.keyboard.press("Escape");
  await page.waitForSelector("button[data-themechip]", { state: "detached" });
});

await step("3D projection applies to any theme", async () => {
  await page.click("button:has-text('◉ VISUALS')");
  await page.click("button:has-text('⚙ TUNE')");
  // the tune panel is grouped now — 3D lives behind its own tab
  await page.click('button[data-ptab="3D"]');
  await page.waitForSelector("text=3D SPACE");
  await page.click('button[data-3d="FLOOR"]');
  await page.waitForSelector("text=DEPTH"); // amount slider appears once on
  await page.click('button[data-3d="OFF"]');
  // letter effects are a second, independent dimension from the lyric styles
  await page.click('button[data-ptab="LYRICS"]');
  await page.waitForSelector("text=LETTER FX");
  await page.click('button[data-lfx="RAINBOW WAVE"]');
  await page.waitForSelector('button[data-lfx="NONE-COLOR"]');
  await page.waitForSelector("input[data-lfxmatch]");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForSelector("button[data-themechip]", { state: "detached" });
});

await step("Me tab: recorder saves a take", async () => {
  await page.click("button:has(div:text-is('ME'))");
  await page.click("button:has-text('START RECORDING')");
  await page.waitForTimeout(1500);
  await page.click("button:has-text('STOP & SAVE TAKE')");
  await page.waitForSelector("text=flux-take-1", { timeout: 5000 });
});

await step("offline export: WAV take appears", async () => {
  await page.click("button:has-text('EXPORT WAV')");
  await page.waitForSelector("text=[FLUX].wav", { timeout: 30000 });
});

await step("shortcuts panel via ?", async () => {
  await page.keyboard.press("Shift+Slash");
  await page.waitForSelector("text=KEYBOARD SHORTCUTS");
  await page.keyboard.press("Escape");
});

await step("state persists across reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=test track", { timeout: 5000 });
  await page.click("button:has(div:text-is('ME'))");
  await page.waitForSelector("text=flux-take-1");
});

await step("track playable from persisted blob after reload", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.click("span:has-text('test track')");
  await page.click("button:has(div:text-is('PLAYER'))");
  await page.waitForTimeout(1500);
  const text = await page.innerText("body");
  if (!/0:0[1-9]/.test(text)) throw new Error("no progress after reload");
});

const realErrors = errors.filter((e) => !e.includes("favicon") && !e.includes("Failed to load resource"));
if (realErrors.length) {
  console.log("✘ console/page errors:", realErrors.join(" | "));
  process.exitCode = 1;
} else {
  console.log("✔ no console errors");
}

await browser.close();
preview.kill();
process.exit();
