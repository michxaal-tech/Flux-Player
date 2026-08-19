// Does the drop escalation actually escalate?
//
// This exists because the whole feature was silently dead and every other test
// passed. The layer table was complete, the themes drew, nothing errored — but
// across a track with three unmistakable drops exactly one layer ever unlocked,
// and that one at t≈0 from the track starting. Nothing in a screenshot or a
// smoke test can see that, so it needs a test that watches the counter over a
// whole track.
//
// Tracks are synthesised with drops at known times, so "landed on the drop" is
// checkable rather than a matter of opinion.
//
// Usage: npm run build && node scripts/drop-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4196;
const BASE = `http://localhost:${PORT}`;
const DROPS = [8, 20, 32];

/** 45s mono WAV: a quiet pulse, lifting to full for 8s at each drop. */
function makeWav(path, drops) {
  const rate = 22050, secs = 45, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const gate = drops === "flat" ? 1 : drops.some((d) => t >= d && t < d + 8) ? 1 : 0.14;
    const env = Math.exp(-9 * (t % 0.5));
    const kick = env * (Math.sin(2 * Math.PI * 52 * t) + 0.6 * Math.sin(2 * Math.PI * 104 * t) + (Math.random() * 2 - 1) * 0.3);
    const s = (0.18 * Math.sin(2 * Math.PI * 440 * t) + kick * 0.85) * gate;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.85), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const dir = mkdtempSync(join(tmpdir(), "drop-check-"));
// distinctive names: page text is matched by substring, and "second" also
// appears in the Spotify panel's "30-second preview clips" copy, which is what
// a plain text= click found instead of the track row
const staged = join(dir, "stagedtrk.wav");
const flat = join(dir, "flattrk.wav");
const second = join(dir, "betatrk.wav");
makeWav(staged, DROPS);
makeWav(flat, "flat");
makeWav(second, DROPS);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

/** Plays a file to the end, recording when each layer unlocked (media time). */
async function play(page, file, name, { analyzed, fresh = true } = {}) {
  if (fresh) {
    await page.click("button:has(div:text-is('LIBRARY'))");
    await page.setInputFiles("input[type=file]", file);
    await page.waitForSelector(`text=${name}`, { timeout: 8000 });
    await page.click("button:has(div:text-is('PLAYER'))");
    await page.waitForTimeout(500);
  }
  if (!(await page.$("button[data-themechip]"))) await page.click("button:has-text('◉ VISUALS')");
  if (analyzed === false) {
    await page.click("button:has-text('⚙ TUNE')");
    await page.click('button[data-ptab="BEAT"]');
    await page.waitForSelector("text=SYNC MODE");
    // the default is on, so one press turns it off
    if (await page.$("button:has-text('ANALYZED')")) await page.click("button:has-text('ANALYZED')");
    await page.keyboard.press("Escape");
  } else {
    await page.waitForTimeout(3000); // let the timeline land
  }
  await page.evaluate(() => {
    window.__unlocks = [];
    let last = 0;
    const tick = () => {
      const L = window.__flux;
      if (L) {
        if (L.dropSlots > last) {
          last = L.dropSlots;
          window.__unlocks.push(+(L.prog * (L.dur || 0)).toFixed(1));
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(44000);
  return page.evaluate(() => window.__unlocks);
}

console.log("\nANALYZED on (the default) — the exact timeline");
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const at = await play(page, staged, "stagedtrk", { analyzed: true });
  check("one layer per drop", at.length === DROPS.length, `unlocked at ${JSON.stringify(at)}s for drops at ${JSON.stringify(DROPS)}s`);
  const near = at.every((u, i) => DROPS[i] !== undefined && Math.abs(u - DROPS[i]) <= 2.5);
  check("each lands on its drop (±2.5s)", at.length > 0 && near);
  await page.close();
}

console.log("\nANALYZED off — the fallback detector");
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const at = await play(page, staged, "stagedtrk", { analyzed: false });
  check("layers do unlock", at.length >= 1, `unlocked at ${JSON.stringify(at)}s`);
  // the original bug: the loudest jump in any track is silence into music, and
  // it was the only thing that ever fired
  check("nothing fires on the track opening", at.every((u) => u > 4), `earliest ${at[0] ?? "none"}s`);
  await page.close();
}

console.log("\nA track that is simply loud throughout");
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const at = await play(page, flat, "flattrk", { analyzed: false });
  check("no drops invented", at.length === 0, at.length ? `unlocked at ${JSON.stringify(at)}s` : "none, correctly");
  await page.close();
}

console.log("\nThe escalation belongs to the song");
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await play(page, staged, "stagedtrk", { analyzed: true });
  const before = await page.evaluate(() => window.__flux.dropSlots);
  // the overlay covers the tab bar, so it has to come down before the next
  // track can be loaded through the UI
  while (await page.$("button[data-themechip]")) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  // switching tracks must rewind it; it used to carry over, and once the
  // running total passed the cap nothing unlocked again all session
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", second);
  await page.waitForSelector("text=betatrk", { timeout: 8000 });
  // importing a file doesn't start it — the track has to actually change for
  // the reset to be under test at all
  await page.click("span:text-is('betatrk')");
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ slots: window.__flux.dropSlots, idx: window.__flux.dropIdx }));
  check("previous track's layers don't carry over", after.slots === 0 && after.idx === 0,
    `${before} layers before, then slots=${after.slots} idx=${after.idx}`);
  await page.close();
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\ndrops ok\n");
process.exit(failed ? 1 : 0);
