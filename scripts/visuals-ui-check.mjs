// The visualizer overlay's chrome: can you reach every theme, and move through
// the track?
//
// Both of these are things a screenshot shows as fine. The theme menu had no
// height limit at all, so with ninety themes the end of the list was off the
// bottom of the screen with nothing to scroll — which looks exactly like a menu
// that simply ends there. So the test asks the questions directly: is the list
// scrollable, does scrolling reach the last theme, and does dragging the
// timeline move playback.
//
// Usage: npm run build && node scripts/visuals-ui-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4204;
const BASE = `http://localhost:${PORT}`;

function makeWav(path) {
  const rate = 22050, secs = 120, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-9 * (t % 0.5));
    const kick = env * Math.sin(2 * Math.PI * 55 * t);
    const s = (0.25 * Math.sin(2 * Math.PI * 440 * t) + kick * 0.7) * 0.85;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), off);
    off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-ui-")), "uitrk.wav");
makeWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
// A laptop window, which is where the menu ran off the bottom
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=uitrk", { timeout: 8000 });
// start it from the library list, where the track rows are
await page.click("span:text-is('uitrk')");
await page.waitForTimeout(500);
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(800);
await page.click("button:has-text('◉ VISUALS')");
await page.waitForTimeout(700);

console.log("\nthe theme menu");
{
  await page.click("button[data-themechip]");
  await page.waitForTimeout(400);
  const scroller = page.locator("[data-themescroll]");
  const box = await scroller.boundingBox();

  const m = await scroller.evaluate((el) => ({
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
    cols: getComputedStyle(el).gridTemplateColumns.split(" ").length,
  }));
  check("it fits on the screen", box.y + box.height <= 720, `bottom at ${Math.round(box.y + box.height)}px of 720`);
  check("five across at this width", m.cols === 5, `${m.cols} columns`);
  // Not "does it scroll": after the cells were compacted all ninety themes fit
  // in 430px here, so there is nothing to scroll and asserting otherwise fails
  // on a menu that is working perfectly. What matters is that every theme can
  // be reached, which is checked below at this height and again at one where
  // the list genuinely does overflow.
  console.log(`    ${m.scrollH}px of themes in ${m.clientH}px of menu`);

  // the real question: can the last theme in the list be reached and picked?
  const last = page.locator("[data-th]").last();
  const name = await last.getAttribute("data-th");
  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const lastBox = await last.boundingBox();
  check("the last theme can be scrolled to", !!lastBox && lastBox.y > 0 && lastBox.y < 720, `${name} at y=${lastBox ? Math.round(lastBox.y) : "off screen"}`);
  await last.click();
  await page.waitForTimeout(400);
  const picked = await page.evaluate(() => window.__flux.visTheme);
  check("and picked", picked === name, `${picked}`);

  // the menu is translucent: the visuals behind it have to come through
  await page.click("button[data-themechip]");
  await page.waitForTimeout(400);
  const alpha = await page.locator("[data-themescroll]").evaluate((el) => {
    const bg = getComputedStyle(el.parentElement).backgroundColor;
    const m2 = bg.match(/rgba?\(([^)]+)\)/);
    const parts = m2 ? m2[1].split(",").map((s) => parseFloat(s)) : [];
    return parts.length === 4 ? parts[3] : 1;
  });
  check("the menu is translucent", alpha < 0.8, `background alpha ${alpha}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

console.log("\nthe same menu in a short window, where it has to scroll");
{
  await page.setViewportSize({ width: 1280, height: 470 });
  await page.waitForTimeout(400);
  if (!(await page.$("button[data-themechip]"))) {
    await page.click("button:has-text('◉ VISUALS')");
    await page.waitForTimeout(600);
  }
  await page.click("button[data-themechip]");
  await page.waitForTimeout(400);
  const scroller = page.locator("[data-themescroll]");
  const m = await scroller.evaluate((el) => ({ scrollH: el.scrollHeight, clientH: el.clientHeight }));
  const box = await scroller.boundingBox();
  check("the menu still fits the window", box.y + box.height <= 470, `bottom at ${Math.round(box.y + box.height)}px of 470`);
  check("and the list overflows", m.scrollH > m.clientH + 20, `${m.scrollH}px in ${m.clientH}px`);

  const last = page.locator("[data-th]").last();
  const name = await last.getAttribute("data-th");
  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const lastBox = await last.boundingBox();
  check("the last theme is still reachable", !!lastBox && lastBox.y > 0 && lastBox.y < 470, `${name} at y=${lastBox ? Math.round(lastBox.y) : "off screen"}`);
  await last.click();
  await page.waitForTimeout(400);
  check("and picking it works", (await page.evaluate(() => window.__flux.visTheme)) === name);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
}

console.log("\nthe timeline");
{
  if (!(await page.$("button[data-themechip]"))) {
    await page.click("button:has-text('◉ VISUALS')");
    await page.waitForTimeout(600);
  }
  // the overlay's own bar: the slim one above the transport
  const bar = page.locator("div").filter({ has: page.locator("div") }).nth(0);
  void bar;
  const handle = await page.evaluate(() => {
    // find the scrub track by its cursor, which nothing else on the overlay uses
    const all = [...document.querySelectorAll("div")];
    const el = all.find((d) => getComputedStyle(d).cursor === "ew-resize" && d.getBoundingClientRect().width > 200);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  check("the overlay has a timeline", !!handle, handle ? `${Math.round(handle.w)}px wide` : "not found");

  if (handle) {
    await page.mouse.move(handle.x + handle.w * 0.2, handle.y + handle.h / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const pressed = await page.evaluate(() => window.__flux.prog);
    await page.mouse.move(handle.x + handle.w * 0.7, handle.y + handle.h / 2, { steps: 10 });
    await page.waitForTimeout(180);
    const dragged = await page.evaluate(() => window.__flux.prog);
    await page.mouse.up();
    check("pressing it seeks", Math.abs(pressed - 0.2) < 0.07, `landed at ${(pressed * 100).toFixed(0)}%`);
    check("and it scrubs with the pointer", Math.abs(dragged - 0.7) < 0.07, `landed at ${(dragged * 100).toFixed(0)}%`);
  }
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\nvisuals ui ok\n");
process.exit(failed ? 1 : 0);
