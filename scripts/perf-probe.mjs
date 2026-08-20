// Where does a frame actually go?
//
// "It lags on high effects" is not something a screenshot test can see, and
// guessing has been wrong here before — resolution was blamed for a long time
// when the real cost was blur radius. So this measures: pin the quality signal
// so nothing adapts underneath the measurement, run each theme with everything
// turned up, then turn one knob off at a time and see what the frame time does.
//
// Usage: npm run build && node scripts/perf-probe.mjs [--themes A,B] [--secs 4]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4198;
const BASE = `http://localhost:${PORT}`;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const THEMES = arg("themes", "RING,WAVES,CROWN,SYNAPSE,FIREWORKS,CITY,NEBULA,LEVIATHAN,ASCENSION,GALAXY").split(",");
const SECS = Number(arg("secs", 4));
const PAGE = arg("page", "vis");

function makeWav(path) {
  const rate = 22050, secs = 90, n = rate * secs;
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

const wav = join(mkdtempSync(join(tmpdir(), "flux-perf-")), "perftrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
// A fresh page per cell. The first cut of this reused one page and walked the
// knobs in order; every row came out monotonically increasing, because drop
// layers keep unlocking as the track runs and each one is more drawing. That
// reads as "turning particles off made it slower", which is nonsense — the
// measurement was of elapsed track time, not of the knob.
async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", wav);
  await page.waitForSelector("text=perftrk", { timeout: 8000 });
  await page.click("button:has(div:text-is('PLAYER'))");
  await page.waitForTimeout(600);
  // --page player measures the ordinary player screen instead: its ambient
  // backdrop renders a full theme every frame too, and that is the screen the
  // app actually sits on.
  if (PAGE !== "player") {
    await page.click("button:has-text('◉ VISUALS')");
    await page.waitForTimeout(600);
  }
  return page;
}

// The render loop reads `live`, and store subscriptions only write into it when
// the store changes — so setting fields directly here sticks, and the settings
// UI never has to be driven for a measurement.
const HIGH = {
  glow: 1, trail: 0.82, particles: 1, pScale: 1.2, speed: 1, intensity: 1.4,
  thick: 1.5, mirror: false, shake: true, flash: true,
  impacts: ["RINGS", "SHOCK", "SCANLINE", "CHROMA", "ZOOM", "STROBE", "SHAKE", "FLASH"],
  quality: "MAX", vis3d: "OFF", lightFx: "NORMAL", dropFx: 1,
  _lyricsOn: false, _lyricLines: null,
};

/** median frame time over SECS seconds of real rendering */
async function measure(page, secs) {
  await page.evaluate((s) => new Promise((res) => {
    const out = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      if (now - last > 2) out.push(now - last);
      last = now;
      if (now - t0 < s * 1000) requestAnimationFrame(tick);
      else { window.__perf = out; res(); }
    };
    requestAnimationFrame(tick);
  }), secs);
  return page.evaluate(() => {
    const a = window.__perf.slice(5).sort((x, y) => x - y);
    return { med: +a[a.length >> 1].toFixed(1), p90: +a[Math.floor(a.length * 0.9)].toFixed(1), n: a.length };
  });
}

async function setup(page, theme, patch) {
  await page.evaluate(({ theme, base, patch, page: which }) => {
    const L = window.__flux;
    if (which === "player") L.playerTheme = theme;
    else L.visTheme = theme;
    // keys prefixed with _ are render-loop state rather than visual config —
    // lyrics live there, and they are drawn every frame like everything else
    const cfg = {}, direct = {};
    for (const [k, v] of Object.entries({ ...base, ...patch })) {
      if (k[0] === "_") direct[k.slice(1)] = v;
      else cfg[k] = v;
    }
    Object.assign(L.cfg, cfg);
    Object.assign(L, direct);
  }, { theme, base: HIGH, patch, page: PAGE });
  await page.waitForTimeout(1200); // let trails/particles reach steady state
}

// A full screen of lyrics: two lines of real length, so the per-character path
// is exercised the way it is on an actual song rather than on one short word.
const LINES = Array.from({ length: 40 }, (_, i) => ({
  t: i * 2,
  text: i % 2 ? "and the whole room turns to look at us" : "SOMETHING BRIGHT ENOUGH TO SEE FROM HERE",
}));

const ALL = [
  ["all up", {}],
  ["glow 0", { glow: 0 }],
  ["no impacts", { impacts: [], shake: false, flash: false }],
  ["no particles", { particles: 0 }],
  ["no drops", { dropFx: 0 }],
  ["no trail", { trail: 0 }],
  ["lyrics on", { _lyricsOn: true, _lyricLines: LINES, _lyricStyle: "WAVE", _lyricFxs: [] }],
  ["lyrics+fx", { _lyricsOn: true, _lyricLines: LINES, _lyricStyle: "WAVE", _lyricFxs: ["NEON PULSE"] }],
];
const only = arg("knobs", "");
const KNOBS = only ? ALL.filter(([n]) => only.split(",").includes(n)) : ALL;

console.log(`\n1440x900, ${PAGE} page, QUALITY=MAX, ${SECS}s per cell — median frame ms (p90)\n`);
const head = KNOBS.map(([n]) => n.padStart(12)).join("");
console.log("theme".padEnd(12) + head);

const rows = [];
for (const theme of THEMES) {
  const cells = [];
  for (const [, patch] of KNOBS) {
    // One retry: the harness opens a page per cell, and an occasional one
    // comes up wedged. Retrying a cell is honest — retrying a *measurement*
    // would not be, so the timing itself is never re-rolled.
    let cell = null;
    for (let attempt = 0; attempt < 2 && !cell; attempt++) {
      let page = null;
      try {
        page = await freshPage();
        await setup(page, theme, patch);
        cell = await measure(page, SECS);
      } catch (e) {
        console.log(`  (retrying ${theme}: ${String(e).split("\n")[0]})`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
    if (!cell) throw new Error(`could not measure ${theme}`);
    cells.push(cell);
  }
  rows.push([theme, cells]);
  console.log(theme.padEnd(12) + cells.map((c) => `${c.med}(${c.p90})`.padStart(12)).join(""));
}

console.log("\nshare of the frame each knob accounts for, vs 'all up'\n");
console.log("theme".padEnd(12) + KNOBS.slice(1).map(([n]) => n.padStart(12)).join(""));
for (const [theme, cells] of rows) {
  const base = cells[0].med;
  console.log(theme.padEnd(12) + cells.slice(1).map((c) =>
    `${Math.round(((base - c.med) / base) * 100)}%`.padStart(12)).join(""));
}

await browser.close();
preview.kill();
