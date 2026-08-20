// The seek bar: does it scrub, and do the drop markers go where they claim?
//
// Both halves of this are the kind of thing that looks right and is wrong. A
// marker is a thin line on a bar — it is placed correctly or forty pixels off
// and you cannot tell by eye which. And "seeks slightly before the drop" is a
// claim about a number, so it is checked as one: the track is synthesised with
// drops at known times, so where a marker lands is a fact rather than an
// impression.
//
// Usage: npm run build && node scripts/seekbar-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4201;
const BASE = `http://localhost:${PORT}`;
const DROPS = [10, 24, 38];

/** 50s track: a quiet pulse that slams to full for 8s at each drop. */
function makeWav(path) {
  const rate = 22050, secs = 50, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const gate = DROPS.some((d) => t >= d && t < d + 8) ? 1 : 0.14;
    const env = Math.exp(-9 * (t % 0.5));
    const kick = env * (Math.sin(2 * Math.PI * 52 * t) + 0.6 * Math.sin(2 * Math.PI * 104 * t) + (Math.random() * 2 - 1) * 0.3);
    const s = (0.18 * Math.sin(2 * Math.PI * 440 * t) + kick * 0.85) * gate;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.85), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-seek-")), "seektrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 820 } });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=seektrk", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(1000);

// by its own hook, not "the first canvas": the page stacks several — the
// ambient backdrop, the visualizer layers — and the first cut of this measured
// the drag against the wrong one and reported a working bar as broken
const bar = page.locator("canvas[data-seekbar]");
const box = await bar.boundingBox();

console.log("\nscrubbing");
{
  // press a quarter of the way along, drag to three quarters, release
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const afterPress = await page.evaluate(() => window.__flux.prog);
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(160);
  const afterDrag = await page.evaluate(() => window.__flux.prog);
  await page.mouse.up();
  check("pressing seeks", Math.abs(afterPress - 0.25) < 0.06, `landed at ${(afterPress * 100).toFixed(0)}%`);
  // the point of the change: the old bar seeked on press and then ignored the
  // pointer, so this is the assertion that would have failed before
  check("dragging follows the pointer", Math.abs(afterDrag - 0.75) < 0.06, `landed at ${(afterDrag * 100).toFixed(0)}%`);
}

console.log("\ndrop markers");
{
  // the analysis runs off-thread; markers appear when it lands
  await page.waitForSelector('button[title^="drop at"]', { timeout: 30000 }).catch(() => {});
  const marks = page.locator('button[title^="drop at"]');
  const n = await marks.count();
  check("a marker per drop", n === DROPS.length, `${n} markers for ${DROPS.length} drops`);

  if (n) {
    const dur = await page.evaluate(() => window.__flux.dur);
    const positions = [];
    for (let i = 0; i < n; i++) {
      const b = await marks.nth(i).boundingBox();
      positions.push(((b.x + b.width / 2 - box.x) / box.width) * dur);
    }
    // Each marker should sit a little before its drop — the whole point. Both
    // halves matter: on the drop is too late to be useful, and far ahead of it
    // is just a wrong marker.
    const lead = positions.map((p, i) => DROPS[i] - p);
    check(
      "each sits just before its drop",
      lead.every((l) => l > 0.4 && l < 3),
      `leads of ${lead.map((l) => l.toFixed(1)).join(", ")}s`
    );

    await marks.nth(1).click();
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => window.__flux.prog * window.__flux.dur);
    check(
      "clicking one lands in the run-up",
      at > DROPS[1] - 3 && at < DROPS[1],
      `seeked to ${at.toFixed(1)}s for the drop at ${DROPS[1]}s`
    );
  }
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\nseek bar ok\n");
process.exit(failed ? 1 : 0);
