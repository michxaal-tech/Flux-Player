// Does a theme move at the same speed at 120fps as at 60?
//
// Unlocking the frame rate is easy; the trap is that almost every theme
// accumulates its motion per frame — `p.x += p.vx` once a frame travels twice
// as far per second when frames arrive twice as often. That does not look
// smoother, it looks fast-forwarded, and it is invisible in a screenshot
// because any single frame looks perfectly correct.
//
// The obvious test — run it at 60, run it at 120, compare — does not work on a
// machine that cannot reach 120. The first cut of this did exactly that and
// reported every theme as correct, because both runs came out at 68fps on a
// software rasteriser and the ratio was 1 by construction.
//
// So it tests the invariant instead of the frame rate. 400 frames with the
// frame factor pinned to 1, and 800 with it pinned to 0.5, cover the same
// amount of logical time; a theme whose motion is a function of time covers
// the same distance in both, and one still counting frames covers twice as far
// in the second. Motion is measured as summed absolute pixel change, which is
// a property of the path rather than of how finely it was sampled.
//
// The track is a slow spectral sweep with no transients, and the beat effects
// are off, so what is measured is the theme's own motion rather than its
// reaction to a kick drum landing at a different point in the two runs. It
// started out as a single steady tone, which was worse than useless for the
// spectrum-driven themes: with an unchanging spectrum a spectrogram has
// nothing to draw, so WAVES measured almost no motion and the ratio was
// whatever the leftover noise happened to be.
// Usage: npm run build && node scripts/fps-check.mjs [--themes A,B] [--frames 400]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
// logical frames per run — enough to average over particle respawns
const FRAMES = Number(arg("frames", 400));
// Above this ratio the theme is treated as running fast rather than smooth.
// Not 1.0: sampling twice as often genuinely catches detail a 60Hz sample
// aliases over, and particle themes respawn at random, so some spread is
// honest. Double speed lands at ~2.0 and is nowhere near this.
const TOL = Number(arg("tol", 1.45));

function makeWav(path) {
  const rate = 22050, secs = 400, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // A 2s sweep from 150Hz to 3kHz: continuous, so no onset ever fires and no
    // beat effects go off, but the spectrum keeps moving so the themes that
    // draw the spectrum have something to draw. Short enough that both runs
    // average over several full sweeps rather than catching different halves
    // of one.
    const ph = (t % 2) / 2;
    const f = 150 * Math.pow(20, ph);
    // integrate the frequency so the phase is continuous across the sweep
    const acc = (150 * (Math.pow(20, ph) - 1)) / Math.log(20);
    const s = (0.5 * Math.sin(2 * Math.PI * acc) + 0.24 * Math.sin(2 * Math.PI * f * 0.5 * t)) * 0.8;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-fps-")), "fpstrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
// vsync off, so requestAnimationFrame is handed out as fast as the page can
// take it. The engine's own gate then decides the rate, which is the thing
// under test.
const browser = await chromium.launch({
  executablePath: exe,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--no-sandbox",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});

const THEMES = (arg("themes", "") || "").split(",").filter(Boolean);

const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=fpstrk", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(600);

const all = THEMES.length ? THEMES : await page.evaluate(() => Object.keys(window.__fluxThemes ?? {}));
if (!all.length) {
  console.error("no themes to test — the page exposes none and none were named");
  await browser.close();
  preview.kill();
  process.exit(1);
}

/**
 * Total motion over `frames` engine frames at a pinned frame factor.
 *
 * Motion is summed absolute pixel change between consecutive frames, read back
 * at a small fixed size — the question is how much moved, not how detailed it
 * was, and a full-resolution readback every frame would itself become the
 * bottleneck and change what it is measuring.
 */
async function motionOver(page, theme, fsPin, frames) {
  await page.evaluate(({ theme, fsPin }) => {
    const L = window.__flux;
    L.visTheme = theme;
    // Draw on every rAF tick: the gate must never skip one, or the frame
    // count and the logical time drift apart.
    window.__fpsPin = 1;
    window.__fsPin = fsPin;
    L.cfg.quality = "MAX";
    // the theme's own motion is what is under test, not the beat layer
    // Particles are the engine's own layer, not the theme's, and they respawn
    // at random — that randomness is per-frame noise, so twice the frames is
    // twice as much of it, which reads as motion that is not there.
    Object.assign(L.cfg, { impacts: [], flash: false, shake: false, mirror: false, vis3d: "OFF", particles: 0 });
  }, { theme, fsPin });
  await page.waitForTimeout(1500); // let trails and particle counts settle
  return page.evaluate((frames) => new Promise((res) => {
    const src = window.__fluxCanvases.vis;
    const W = 96, H = 64;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d", { willReadFrequently: true });
    let prev = null, sum = 0, n = 0;
    const tick = () => {
      c.drawImage(src, 0, 0, W, H);
      const d = c.getImageData(0, 0, W, H).data;
      if (prev) {
        let s = 0;
        for (let i = 0; i < d.length; i += 4) {
          // Only changes big enough to be something moving. Redrawing the same
          // shape a fraction of a pixel over shifts its antialiased edge by a
          // few levels, and that shimmer does not telescope the way motion
          // does — sample twice as often and you get twice as much of it, so
          // counting it makes every theme look like it runs fast.
          const dv = Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
          if (dv > 24) s += dv;
        }
        sum += s;
      }
      prev = d.slice();
      if (++n < frames) requestAnimationFrame(tick);
      else res(sum / (W * H * 3));
    };
    requestAnimationFrame(tick);
  }), frames);
}

let failed = 0;
const rows = [];
console.log(`\nmotion over the same logical time, split into ${FRAMES} frames and into ${FRAMES * 2}\n`);
console.log("theme".padEnd(14) + "fs=1".padStart(12) + "fs=0.5".padStart(12) + "  ratio");

for (const theme of all) {
  const one = await motionOver(page, theme, 1, FRAMES);
  const half = await motionOver(page, theme, 0.5, FRAMES * 2);
  // A theme that measured no motion is not a theme that passed. The first cut
  // of this scored a ratio of 1.00 for WAVES and called it correct, when what
  // had actually happened was that making `t` a float broke its `t % 3 === 0`
  // spawn test and it had stopped animating entirely.
  const dead = one < 8;
  const ratio = dead ? 0 : half / one;
  // Two-sided. Running slow is as wrong as running fast, and the first cut of
  // this only bounded the top — so WAVES, which had gone to a fifth speed,
  // scored 0.21 and was reported as correct.
  const ok = !dead && ratio <= TOL && ratio >= 1 / TOL;
  if (!ok) failed++;
  rows.push({ theme, ratio, ok, dead });
  console.log(
    theme.padEnd(14) +
    one.toFixed(1).padStart(12) +
    half.toFixed(1).padStart(12) +
    (dead ? "     — barely moves at all" : `  ${ratio.toFixed(2)} ${ok ? "\u2713" : ratio > 1 ? "\u2717 runs fast" : "\u2717 runs slow"}`)
  );
}

console.log(`\n${all.length - failed}/${all.length} frame-rate independent`);
if (failed) {
  console.log("\nnot yet safe above 60fps:");
  console.log("  " + rows.filter((r) => !r.ok).map((r) => r.theme).join(" "));
}

await browser.close();
preview.kill();
process.exit(failed ? 1 : 0);
