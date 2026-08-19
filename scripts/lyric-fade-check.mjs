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
// Styles whose whole point is keeping earlier lines on screen — STACK, SCATTER,
// ECHO — are excluded: for them, ink that never reaches zero is the design.
const STYLES = (process.env.STYLES || "DRIFT,POP,KARAOKE,SLIDE").split(",");

function makeTone(path) {
  const rate = 22050, secs = 30, n = rate * secs;
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
    // placeholder text, and an empty line after it so the outgoing one is alone
    const lyrics = [{ t: now + 0.4, text: "ONE TWO THREE" }, { t: now + 2.2, text: "" }];
    s.set({
      playlists: s.playlists.map((pl) => ({ ...pl, tracks: pl.tracks.map((tr) => ({ ...tr, lyrics })) })),
      lyricsOn: true, lyricStyle: st, lyricFxs: [],
    });
  }, style);

  const series = [];
  for (let i = 0; i < 30; i++) {
    // Wall clock, not the playhead: playback is real time, so elapsed wall time
    // between samples is exact, while the playhead the store publishes advances
    // in steps of a few hundred ms and aliased the whole fade into three points.
    series.push({ ...(await sample()), wall: Date.now() });
    await page.waitForTimeout(120);
  }

  // Everything below looks only at frames where an outgoing line exists. A
  // style's live line may have an outro of its own — SLIDE moves its line 80px
  // to the right as it ends — and measuring across that boundary attributes the
  // live animation to the fade. The next line is empty, so in these frames the
  // outgoing line is the only thing drawn.
  const live = Math.max(...series.map((s) => s.ink));
  const fading = series.filter((s) => s.ghosts >= 1 && s.ink > 0);
  check("the line is drawn at all", live > 100, `peak ink ${live}`);
  check("an outgoing line is kept at all", fading.length >= 3,
    `${fading.length} frames of fade — 0 means it was dropped the instant the next line arrived`);
  if (!fading.length) continue;

  // No step: while it is still bright, no single frame may lose most of it.
  const top = Math.max(...fading.map((s) => s.ink));
  let worst = 0;
  for (let i = 1; i < fading.length; i++) {
    if (fading[i - 1].ink < top * 0.35) break; // the tail is alpha cutoff and 8-bit noise
    worst = Math.max(worst, (fading[i - 1].ink - fading[i].ink) / fading[i - 1].ink);
  }
  check("it fades rather than stepping", worst < 0.5, `largest single-frame loss ${(worst * 100).toFixed(0)}%`);

  // It must start dimming *at once*. A smoothstep passes every check above and
  // still reads as popping, because it holds 93% opacity for the first 200ms
  // and then falls off a cliff — the eye sees a line that sits there and then
  // goes. This is the property that was missing, so it is the one asserted.
  // The property that was missing, so the one worth asserting: a smoothstep
  // passes every other check here and still reads as popping, because it holds
  // 93% opacity for 200ms and then falls off a cliff.
  const first = fading[0];
  const at = fading.find((s) => s.wall - first.wall >= 220);
  if (!at) {
    console.log("  – it starts dimming immediately — the fade was over before a second sample landed");
  } else {
    const early = at.ink / first.ink;
    check("it starts dimming immediately", early <= 0.8,
      `${(early * 100).toFixed(0)}% of its opacity still there ${at.wall - first.wall}ms in`);
  }

  // One outgoing line, not a pile of them: each replays the live line at full
  // size, so several at once is a wall of text rather than a fade.
  const most = Math.max(...series.map((s) => s.ghosts));
  check("only one line fades at a time", most <= 1, `${most} at once`);

  // Only opacity changes. The box contracts as dim pixels fall under the
  // threshold — that is what a fading halo does — so the centre is what says
  // whether the text itself moved.
  const cx = fading.map((s) => (s.box[0] + s.box[2]) / 2);
  const cy = fading.map((s) => (s.box[1] + s.box[3]) / 2);
  const dx = Math.max(...cx) - Math.min(...cx);
  const dy = Math.max(...cy) - Math.min(...cy);
  check("it holds its position and size", dx <= 4 && dy <= 4, `centre moved ${dx.toFixed(1)}x${dy.toFixed(1)}px`);

  check("it fades all the way out", series[series.length - 1].ink === 0, `ends at ${series[series.length - 1].ink}`);
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\nlyric fade ok\n");
process.exit(failed ? 1 : 0);
