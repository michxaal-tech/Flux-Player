// Visual QA for the visualizer: renders every requested theme, in every 3D
// projection mode, against real audio and checks the frame is actually usable.
//
// The three ways a theme fails in practice, all of which have shipped before:
//   - white-out: a bright palette pushes lightness to 100 and the screen blows out
//   - black-out: the theme draws almost nothing, so it reads as broken
//   - stall: it draws something lovely at 6fps on a phone
// Each is measured here rather than eyeballed.
//
// Usage: npm run build && node scripts/vis-check.mjs [--themes A,B] [--modes OFF,FLOOR]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4183;
const BASE = `http://localhost:${PORT}`;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",") : dflt;
};
const THEMES = arg("themes", ["ASCENSION", "LEVIATHAN", "CATHODE", "CITADEL", "SYNAPSE", "VOXEL", "TESSERACT"]);
const MODES = arg("modes", ["OFF", "FLOOR", "ROOM", "SPIN", "DEPTH"]);
// bright palettes are where white-out shows up, so test against the worst case
const PALETTE = process.env.PALETTE || "VOLT";

// 8s track with a quiet intro, a build and a loud drop, so staged themes
// actually reach their later layers and the drop set-piece fires.
function makeTestWav(path) {
  const rate = 44100, secs = 8, n = rate * secs, ch = 2;
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
    // arrangement: sparse intro → mid enters → full drop at 4s
    const gate = t < 2 ? 0.18 : t < 4 ? 0.5 : 1;
    const lead = t > 2 ? 0.22 * Math.sin(2 * Math.PI * 660 * t) : 0;
    const tone = 0.2 * Math.sin(2 * Math.PI * 440 * t);
    const s = Math.round(Math.max(-1, Math.min(1, (tone + lead + kick * 0.7) * gate)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-vis-")), "test track.wav");
makeTestWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=test track", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(800);

// open the visualizer and pin a bright palette
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(400);
await page.click("button:has-text('⚙ TUNE')");
await page.waitForSelector("text=COLOR PALETTE");
await page.click(`button:has-text('${PALETTE}')`);

/** Reads the visualizer canvas and reports its luminance distribution. */
const sample = () =>
  page.evaluate(() => {
    const cvs = [...document.querySelectorAll("canvas")];
    // the visualizer canvas is the largest one on screen
    const cv = cvs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv) return null;
    const s = document.createElement("canvas");
    s.width = 160; s.height = 120;
    const sc = s.getContext("2d", { willReadFrequently: true });
    sc.drawImage(cv, 0, 0, 160, 120);
    const d = sc.getImageData(0, 0, 160, 120).data;
    let sum = 0, black = 0, white = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l; n++;
      if (l < 8) black++;
      if (l > 248) white++;
    }
    return { mean: sum / n / 255, black: black / n, white: white / n };
  });

/** Frame time over ~1.2s of real rendering, as the median of rAF deltas. */
const perf = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const ds = [];
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          ds.push(now - last);
          last = now;
          if (ds.length < 72) requestAnimationFrame(tick);
          else { ds.sort((a, b) => a - b); res(ds[ds.length >> 1]); }
        };
        requestAnimationFrame(tick);
      })
  );

// The TUNE panel and the theme dropdown overlap each other, so open/close is
// driven explicitly rather than inferred — a stale panel silently swallowed
// every later click when this was implicit.
const openTune = async () => {
  if (await page.$("text=3D SPACE")) return;
  await page.click("button:has-text('⚙ TUNE')");
  await page.waitForSelector("text=3D SPACE", { timeout: 5000 });
};
const closeTune = async () => {
  if (!(await page.$("text=3D SPACE"))) return;
  await page.keyboard.press("Escape");
  await page.waitForSelector("text=3D SPACE", { state: "detached", timeout: 5000 });
};

const setMode = async (m) => {
  await openTune();
  await page.click(`button[data-3d="${m}"]`);
  await page.waitForTimeout(120);
};

const setTheme = async (t) => {
  await closeTune();
  if (!(await page.$("[data-th]"))) await page.click("button[data-themechip]");
  await page.waitForSelector("[data-th]", { timeout: 5000 });
  const cell = await page.$(`[data-th="${t}"]`);
  if (!cell) throw new Error(`theme ${t} is not registered in VIS_THEMES`);
  await cell.click();
  await page.waitForTimeout(120);
};

let fails = 0;
console.log(`palette=${PALETTE}  themes=${THEMES.length}  modes=${MODES.join("/")}\n`);

for (const t of THEMES) {
  await setTheme(t);
  const row = [];
  // Absolute frame time is meaningless here — CI has no GPU, so everything is
  // software-rasterised and slow. What matters is what a 3D mode COSTS on top
  // of drawing the same theme flat, which is device-independent.
  let baseFt = null;
  for (const m of MODES) {
    await setMode(m);
    await page.waitForTimeout(900); // let trails and staged layers settle
    const s = await sample();
    const ft = await perf();
    const bad = [];
    if (!s) bad.push("no canvas");
    else {
      if (s.white > 0.06) bad.push(`WHITE-OUT ${(s.white * 100).toFixed(1)}%`);
      if (s.black > 0.94) bad.push(`BLANK ${(s.black * 100).toFixed(1)}% black`);
      if (s.mean < 0.006) bad.push(`DARK mean=${s.mean.toFixed(4)}`);
    }
    if (m === "OFF") baseFt = ft;
    // a projection may cost up to ~55% over flat; past that it's a real stall
    if (baseFt && m !== "OFF" && ft > baseFt * 1.55 + 3)
      bad.push(`COSTLY ${ft.toFixed(1)}ms vs ${baseFt.toFixed(1)}ms flat`);
    if (s && m === "SPIN" && s.black > 0.7) bad.push(`panel too small (${(s.black * 100).toFixed(0)}% black)`);
    if (bad.length) fails++;
    row.push(
      `${m.padEnd(5)} mean=${s ? s.mean.toFixed(3) : "--"} blk=${s ? (s.black * 100).toFixed(0).padStart(2) : "--"}% ` +
      `wht=${s ? (s.white * 100).toFixed(1).padStart(4) : "--"}% ${ft.toFixed(1)}ms ${bad.length ? "✘ " + bad.join(", ") : "✔"}`
    );
  }
  console.log(`${t}\n  ${row.join("\n  ")}`);
}

if (errors.length) {
  console.log(`\n✘ ${errors.length} page errors:`);
  for (const e of [...new Set(errors)].slice(0, 8)) console.log(`   ${e}`);
  fails += errors.length;
}
console.log(`\n${fails === 0 ? "✔ all clear" : `✘ ${fails} problems`}`);
process.exitCode = fails === 0 ? 0 : 1;

await browser.close();
preview.kill();
