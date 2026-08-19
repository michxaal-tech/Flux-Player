// Does an outgoing lyric line fade, or does it get replaced by something?
//
// Three attempts at this failed the same way, and none of them looked wrong in
// a screenshot: a still frame of a dim line is a dim line whether it faded there
// or was swapped in. What separates the two is continuity across the handover
// and whether anything but opacity changed — both measurable, neither visible
// one frame at a time.
//
// The next lyric line is deliberately empty, so once the switch happens the
// outgoing line is the only thing on the lyric canvas and can be measured alone.
//
// Usage: npm run build && node scripts/lyric-fade-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;
// Every style, because "recheck them all" is the only way to find the ones that
// take their own path through the renderer — WAVE and KARAOKE bypass the shared
// block renderer, SCATTER/STACK/CASCADE draw their own history, and each of
// those was broken in its own way while the shared path measured fine.
const ALL = [
  "WAVE", "RIPPLE", "TIDE", "FLOAT", "SWELL", "PENDULUM", "SPIRAL", "SHIMMER",
  "TWINKLE", "DRIFT", "GLIDE", "BREATHE", "LEAN", "ORBIT", "ZOOM", "REVEAL",
  "SPOTLIGHT", "KARAOKE", "CASCADE", "STILL",
];
const STYLES = (process.env.STYLES || ALL.join(",")).split(",");
// styles that keep earlier lines on screen on purpose: ink that never reaches
// zero is the design there, not a stuck line
// nothing persists any more: every style hands over the same way
const PERSIST = new Set([]);
// centred styles use the shorter crossfade (see CENTRED_GHOST_SECS)
// every style crossfades at one anchor now, so they all use the short fade
const CENTRED = new Set(ALL);

function makeTone(path) {
  // Long enough to outlast the whole walk. At 30s the track ran out partway
  // through and every style after that was measured against stopped playback,
  // which reads as "the line never faded" for reasons that have nothing to do
  // with the renderer.
  const rate = 22050, secs = 400, n = rate * secs;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    b.writeInt16LE(Math.round(0.3 * Math.sin(2 * Math.PI * 220 * t) * 32767), o);
    o += 2;
  }
  writeFileSync(path, b);
}

const tone = join(mkdtempSync(join(tmpdir(), "lyrfade-")), "tone.wav");
makeTone(tone);

// There is no layout check any more, and that is the point: every line is drawn
// at the same anchor, so a line can no longer arrive on top of the one still
// fading at some other position. What used to be a tuning problem — a scatter
// that placed consecutive lines close together — is now impossible by
// construction, and what remains is the crossfade, which the per-style checks
// below measure directly.

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", tone);
await page.waitForSelector("text=tone", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(800);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

/** Ink and bounding box of the lyric canvas alone, plus whether the renderer
 * currently holds an outgoing line. Both in one call, so they describe the same
 * frame — sampling them separately let the phase drift between them. */
const sample = () => page.evaluate(() => {
  const target = window.__fluxCanvases?.lyr;
  if (!target) return { ink: -1, box: null, ghosts: -1 };
  const s = document.createElement("canvas");
  s.width = 250; s.height = 200;
  const sc = s.getContext("2d", { willReadFrequently: true });
  sc.drawImage(target, 0, 0, 250, 200);
  const d = sc.getImageData(0, 0, 250, 200).data;
  let ink = 0, x0 = 9e9, y0 = 9e9, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (l > 12) {
      ink += l;
      const px = (i / 4) % 250, py = (i / 4 / 250) | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
  }
  const L = window.__flux, G = L?.scratch?.lyrGhosts;
  const t0 = G?.items?.[0]?.t0;
  return {
    ink: Math.round(ink / 1000),
    box: x1 < 0 ? null : [x0, y0, x1, y1],
    ghosts: G?.items?.length ?? 0,
    // seconds since this line left, from the same clock the renderer fades on —
    // sample index is not a usable stand-in, since media time advances
    // unevenly between samples
    age: t0 == null ? -1 : L.prog * (L.dur || 0) - t0,
  };
});

for (const style of STYLES) {
  console.log(`\n${style}`);
  await page.evaluate((st) => {
    const s = window.__fluxStore.getState();
    const now = window.__fluxEngine.audio.currentTime;
    // Two real consecutive lines. The earlier version of this check made the
    // second line empty so the first could be measured alone — which meant it
    // never once measured what actually happens when one line follows another,
    // and that is precisely where every fault has been: two different texts
    // printed on top of each other at the same anchor.
    const lyrics = [
      { t: now + 0.6, text: "ALPHA BRAVO CHARLIE" },
      { t: now + 3.0, text: "DELTA ECHO FOXTROT" },
      { t: now + 5.4, text: "GOLF HOTEL INDIA" },
    ];
    s.set({
      playlists: s.playlists.map((pl) => ({ ...pl, tracks: pl.tracks.map((tr) => ({ ...tr, lyrics })) })),
      lyricsOn: true, lyricStyle: st, lyricFxs: [],
    });
  }, style);

  const series = [];
  for (let i = 0; i < 46; i++) {
    series.push({ ...(await sample()), wall: Date.now() });
    await page.waitForTimeout(120);
  }

  const inks = series.map((s) => s.ink);
  const lit = inks.filter((v) => v > 0).sort((a, b) => a - b);
  const typical = lit.length ? lit[Math.floor(lit.length / 2)] : 0;
  const peak = Math.max(...inks);
  check("a line is drawn at all", typical > 80, `typical ink ${typical}`);
  if (!typical) continue;

  // Two lines at once shows up as roughly double the ink of one. This is the
  // check that the empty-second-line fixture could never make.
  check("never two lines at once", peak <= typical * 1.5,
    `peak ${peak} against a typical line's ${typical}`);

  // And the screen genuinely clears between them: a line that merely dims to a
  // ghost still sits under the next one.
  const gaps = series.filter((s) => s.ink < typical * 0.06).length;
  check("the screen clears between lines", gaps >= 1,
    gaps ? `${gaps} clear frames` : "never empty — a line is still up when the next arrives");

  // The line that is up holds still and holds its size: no drifting or shrinking
  // away, which is what reads as being replaced rather than fading.
  const boxes = series.filter((s) => s.box && s.ink > typical * 0.5);
  if (boxes.length > 2) {
    const cy = boxes.map((s) => (s.box[1] + s.box[3]) / 2);
    const dy = Math.max(...cy) - Math.min(...cy);
    check("the line holds its place while it is up", dy <= 6, `centre moved ${dy.toFixed(1)}px`);
  }
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\nlyric fade ok\n");
process.exit(failed ? 1 : 0);
