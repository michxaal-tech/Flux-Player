// What do the lyrics actually cost on a phone?
//
// Renders the visualiser on the mobile profile with a full screen of lyrics and
// measures median frame time in three configurations:
//
//   off        no lyrics at all — the floor
//   row        lyrics with no letter effect, drawn one fillText per row
//   perchar    lyrics with a letter effect, drawn one fillText per character
//
// The per-character path measures and draws every glyph separately, and a
// shadowBlur'd fillText is one of the most expensive things a 2D canvas can do,
// so this is where a lyric line can quietly cost more than the whole theme
// behind it. The check fails if the per-character path is more than PERCHAR_MAX
// times the cost of the row path — that ratio, not an absolute millisecond
// figure, is the thing that ports across machines.
//
// Usage: npm run build && node scripts/lyric-perf-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4191;
const BASE = `http://localhost:${PORT}`;
const THEME = "PULSEBARS";   // a mobile-native theme; on a phone the engine
                             // coerces anything else to one anyway, so naming a
                             // desktop theme here measured something that was not
                             // actually being drawn
const PERCHAR_MAX = 2.2;     // per-char may cost more than row, but not 3x more

function makeWav(path) {
  const rate = 44100, secs = 8, n = rate * secs, ch = 2, dataSize = n * ch * 2;
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
const wav = join(mkdtempSync(join(tmpdir(), "flux-lyr-")), "t.wav");
makeWav(wav);

// Real-length lines, so the per-character path walks a realistic glyph count
// rather than one short word.
const LINES = Array.from({ length: 60 }, (_, i) => ({
  t: i * 1.2,
  text: i % 2 ? "and the whole room turns to look at us" : "SOMETHING BRIGHT ENOUGH TO SEE FROM HERE",
}));

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });

async function run(mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.addInitScript(() => { window.__fluxMobile = true; });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", wav);
  await page.waitForSelector("text=t", { timeout: 8000 });
  await page.click("button:has(div:text-is('PLAYER'))");
  await page.waitForTimeout(400);
  await page.click("button:has-text('◉ VISUALS')");
  await page.waitForTimeout(500);

  await page.evaluate(({ theme, mode, lines }) => {
    const L = window.__flux;
    L.visTheme = theme;
    Object.assign(L.cfg, { glow: 1, trail: 0.82, particles: 1, quality: "AUTO", vis3d: "OFF" });
    L.lyricsOn = mode !== "off";
    L.lyricLines = mode === "off" ? null : lines;
    // WAVE is a letter effect, so it arms the per-character path
    L.lyricFxs = mode === "perchar" ? ["WAVE"] : [];
    L.lyricFxMatch = mode === "perchar";
  }, { theme: THEME, mode, lines: LINES });

  await page.waitForTimeout(2200); // let the governor settle

  const stat = await page.evaluate(() => new Promise((res) => {
    const out = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      if (now - last > 2) out.push(now - last);
      last = now;
      if (now - t0 < 3500) requestAnimationFrame(tick);
      else {
        const a = out.slice(5).sort((x, y) => x - y);
        const lc = window.__fluxCanvases.lyr;
        res({
          med: +a[a.length >> 1].toFixed(1),
          p90: +a[Math.floor(a.length * 0.9)].toFixed(1),
          fps: Math.round(1000 / a[a.length >> 1]),
          lw: lc?.width ?? 0, lh: lc?.height ?? 0,
        });
      }
    };
    requestAnimationFrame(tick);
  }));
  await page.close();
  return stat;
}

const off = await run("off");
const row = await run("row");
const perchar = await run("perchar");
await browser.close();
preview.kill();

console.log(`\ntheme ${THEME}, mobile profile, phone viewport 390x844 @dpr3\n`);
console.log(`mode       med     p90     fps    lyric canvas`);
console.log(`off        ${off.med}    ${off.p90}    ${off.fps}    ${off.lw}x${off.lh}`);
console.log(`row        ${row.med}    ${row.p90}    ${row.fps}    ${row.lw}x${row.lh}`);
console.log(`perchar    ${perchar.med}    ${perchar.p90}    ${perchar.fps}    ${perchar.lw}x${perchar.lh}`);

const ratio = perchar.med / row.med;
console.log(`\nper-char / row cost ratio: ${ratio.toFixed(2)}x  (max ${PERCHAR_MAX})`);

let bad = 0;
if (perchar.fps < 30) { console.log(`✘ per-character lyrics render below 30fps (${perchar.fps})`); bad = 1; }
if (ratio > PERCHAR_MAX) { console.log(`✘ per-character path costs ${ratio.toFixed(2)}x the row path`); bad = 1; }
console.log(bad ? "\nFAILED" : "\nOK");
process.exit(bad);
