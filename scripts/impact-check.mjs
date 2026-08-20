// Does a beat impact actually do anything, and does it stay looking at?
//
// An impact is a few lines drawn over the finished frame, and the two ways one
// fails are both invisible in code review: it does nothing at all — a typo in
// the name, a threshold never crossed, state that is never pushed — or it does
// far too much and the frame goes white, which is worse than nothing because
// it takes the theme with it.
//
// So each is measured against the same track with the impact off: it has to
// change the picture, and it has to leave it inside a sane brightness band.
//
// Usage: npm run build && node scripts/impact-check.mjs [--impacts A,B]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4202;
const BASE = `http://localhost:${PORT}`;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const IMPACTS = arg("impacts", "BOUNCE,BLINDS,SHUTTER,WARP,SPECKS,LETTERBOX").split(",");
const THEME = arg("theme", "RING");

/** Steady 2Hz kick, so beats fire constantly and every impact is exercised. */
function makeWav(path) {
  const rate = 22050, secs = 200, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-9 * (t % 0.5));
    const kick = env * (Math.sin(2 * Math.PI * 52 * t) + 0.6 * Math.sin(2 * Math.PI * 104 * t));
    const s = (0.2 * Math.sin(2 * Math.PI * 440 * t) + 0.18 * Math.sin(2 * Math.PI * 880 * t) + kick * 0.8) * 0.85;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-imp-")), "imptrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // Network failures are the sandbox, not the page: this container blocks the
  // web font fetch, and counting that as a page error fails every impact run
  // for a reason that has nothing to do with impacts.
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=imptrk", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(600);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(600);

/**
 * Mean luminance and how much it varies over a couple of seconds. An impact
 * that fires on the beat shows up as variation; one that does nothing leaves
 * the numbers where the bare theme put them.
 */
async function sample(page, impacts) {
  await page.evaluate(({ impacts, theme }) => {
    const L = window.__flux;
    L.visTheme = theme;
    L.cfg.quality = "MAX";
    Object.assign(L.cfg, { impacts, flash: false, shake: false, mirror: false, vis3d: "OFF" });
  }, { impacts, theme: THEME });
  await page.waitForTimeout(1400);
  return page.evaluate(() => new Promise((res) => {
    const src = window.__fluxCanvases.vis;
    const W = 80, H = 56;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d", { willReadFrequently: true });
    const means = [];
    const hots = [];
    const t0 = performance.now();
    const tick = () => {
      c.drawImage(src, 0, 0, W, H);
      const d = c.getImageData(0, 0, W, H).data;
      let sum = 0, hot = 0;
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += v;
        if (v > 140) hot++;
      }
      means.push(sum / (W * H));
      // Sparse bright detail — a burst of thin streaks, a hot rim — barely
      // moves a mean taken over the whole frame, so an impact made of it reads
      // as doing nothing. Counting lit pixels sees it. SPECKS is visibly
      // obvious on screen and scored 40.2 against a baseline of 40.3.
      hots.push(hot / (W * H));
      if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
      else {
        const mean = means.reduce((a, b) => a + b, 0) / means.length;
        const peak = Math.max(...means);
        const swing = peak - Math.min(...means);
        const hot = hots.reduce((a, b) => a + b, 0) / hots.length;
        res({ mean, peak, swing, hot });
      }
    };
    requestAnimationFrame(tick);
  }));
}

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

console.log(`\n${THEME}, each impact against a baseline taken beside it\n`);

for (const im of IMPACTS) {
  // The baseline is re-measured immediately before each impact rather than
  // once up front. A theme's brightness drifts with the track — the same
  // "no impacts" sample came out at 38.1 and at 40.3 minutes apart — which is
  // larger than several of these effects, so a baseline from the start of the
  // run reports whichever way the music happened to go.
  const base = await sample(page, []);
  const got = await sample(page, [im]);
  // "changes the picture" is either a shift in level or a bigger beat-to-beat
  // swing; different impacts do one or the other, and demanding a particular
  // one would fail the effects that are subtle by design
  const moved =
    Math.abs(got.mean - base.mean) > 1.2 ||
    got.swing > base.swing * 1.25 + 1.5 ||
    Math.abs(got.hot - base.hot) > 0.004;
  const sane = got.peak < 232;
  check(
    `${im} does something and stays looking at`,
    moved && sane,
    `mean ${got.mean.toFixed(1)} (was ${base.mean.toFixed(1)}), swing ${got.swing.toFixed(1)}, lit ${(got.hot * 100).toFixed(1)}% (was ${(base.hot * 100).toFixed(1)}%)${!sane ? " — blown out" : !moved ? " — no visible change" : ""}`
  );
}

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\nimpacts ok\n");
process.exit(failed ? 1 : 0);
