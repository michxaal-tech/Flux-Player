// Grabs PNGs of one theme at several points in a track, so a rendering
// complaint can be looked at instead of guessed at.
//
// Usage: npm run build && node scripts/vis-shot.mjs THEME [outDir]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const THEME = (process.argv[2] || "PRISM").toUpperCase();
const OUT = process.argv[3] || "/tmp/vis-shots";
const PORT = 4187;
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
    const gate = t < 3 ? 0.16 : t < 5 ? 0.55 : 1;   // quiet → build → drop
    const lead = t > 3 ? 0.24 * Math.sin(2 * Math.PI * 660 * t) : 0;
    const s = Math.round(Math.max(-1, Math.min(1, (0.2 * Math.sin(2 * Math.PI * 440 * t) + lead + kick * 0.7) * gate)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-shot-")), "test track.wav");
makeTestWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
// phone-shaped, since that's where the report came from
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=test track", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(400);

// pick the theme
await page.click("button[data-themechip]");
await page.waitForSelector("[data-th]");
await page.click(`[data-th="${THEME}"]`);
await page.waitForTimeout(200);

// hide the HUD so the frame is unobstructed
await page.evaluate(() => {
  const cv = document.querySelector("canvas");
  if (cv) cv.click();
});

// LFX=RAINBOW,FIRE,... captures one frame per letter effect, with lyrics loaded
const LFX = (process.env.LFX || "").split(",").filter(Boolean);
if (LFX.length) {
  for (const f of LFX) {
    // Re-inject the lyric relative to the *current* playhead before each shot.
    // Fixed timestamps meant the screenshot regularly landed between lines, or
    // after a style had faded its line out, and caught an empty overlay.
    await page.evaluate((fx) => {
      const st = window.__fluxStore.getState();
      const now = window.__fluxEngine.audio.currentTime;
      const lyrics = [
        { t: Math.max(0, now - 0.5), text: "NEON LIGHTS BURN BRIGHT" },
        { t: now + 8, text: "AND THE NIGHT GOES ON" },
      ];
      // Replace the track objects rather than mutating them: the engine
      // subscribes to getCurrentTrack, so an in-place edit keeps the same
      // object identity and the subscription never fires.
      st.set({
        playlists: st.playlists.map((pl) => ({ ...pl, tracks: pl.tracks.map((tr) => ({ ...tr, lyrics })) })),
        lyricsOn: true, lyricStyle: "DRIFT", lyricFxs: [fx],
      });
    }, f);
    await page.waitForTimeout(700);
    const p = join(OUT, `lfx-${f.toLowerCase().replace(/ /g, "-")}.png`);
    await page.screenshot({ path: p });
    console.log(`saved ${p}`);
  }
  await browser.close();
  preview.kill();
  process.exit(0);
}

// PICKER=1 captures the theme dropdown with a few favourites starred
if (process.env.PICKER) {
  await page.evaluate(() => {
    const st = window.__fluxStore.getState();
    for (const n of ["TIDE", "MONOLITH", "PRISM", "SINGULARITY", "AURORA"]) st.toggleFavTheme(n);
  });
  await page.click("button[data-themechip]");
  await page.waitForTimeout(600);
  const p = join(OUT, "theme-picker.png");
  await page.screenshot({ path: p });
  console.log(`saved ${p}`);
  await browser.close();
  preview.kill();
  process.exit(0);
}

// IMP=SHARDS,MELT,... captures one frame per impact effect
const IMPS = (process.env.IMP || "").split(",").filter(Boolean);
if (IMPS.length) {
  await page.waitForTimeout(3500);
  for (const im of IMPS) {
    await page.evaluate((k) => window.__fluxStore.getState().setVisKey("impacts", [k]), im);
    await page.waitForTimeout(900);
    const p = join(OUT, `imp-${im.toLowerCase()}.png`);
    await page.screenshot({ path: p });
    console.log(`saved ${p}`);
  }
  await browser.close();
  preview.kill();
  process.exit(0);
}

// MODE=FLOOR,ROOM,... captures one frame per 3D projection instead of a timeline
const MODES = (process.env.MODES || "").split(",").filter(Boolean);
if (MODES.length) {
  await page.waitForTimeout(4000); // let the track reach its loud section
  for (const m of MODES) {
    if (!(await page.$("text=3D SPACE"))) await page.click("button:has-text('⚙ TUNE')");
    await page.waitForSelector("text=3D SPACE");
    await page.click(`button[data-3d="${m}"]`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1400);
    const p = join(OUT, `${THEME.toLowerCase()}-3d-${m.toLowerCase()}.png`);
    await page.screenshot({ path: p });
    console.log(`saved ${p}`);
  }
} else {
  for (const [label, waitMs] of [["intro", 1200], ["build", 2600], ["drop", 2600], ["peak", 2000]]) {
    await page.waitForTimeout(waitMs);
    const p = join(OUT, `${THEME.toLowerCase()}-${label}.png`);
    await page.screenshot({ path: p });
    console.log(`saved ${p}`);
  }
}

await browser.close();
preview.kill();
