// End-to-end test of the Internet Archive source in DISCOVER, with the network
// stubbed from captured responses so it runs offline and deterministically.
// `scripts/catalogue-check.mjs` is the other half: that one checks the live
// services still answer the way these fixtures say they do.
//
// Usage: npm run build && node scripts/discover-e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4183;
const BASE = `http://localhost:${PORT}`;
const SEARCH = readFileSync("scripts/fixtures/archive-search.json", "utf8");
const META = JSON.parse(readFileSync("scripts/fixtures/archive-metadata.json", "utf8"));
// nothing decodes the audio during import, so any body of a plausible size does
const CLIP = Buffer.alloc(60000, 3);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

// Routes match most-recently-registered first, so specific ones go last.
await page.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.fulfill({ status: 404, body: "" })));
let audioHits = 0;
await page.route("**us.archive.org/**", (r) => { audioHits++; return r.fulfill({ contentType: "audio/mpeg", body: CLIP }); });
await page.route("**/advancedsearch.php*", (r) => r.fulfill({ contentType: "application/json", body: SEARCH }));
await page.route("**/metadata/**", (r) => {
  const id = decodeURIComponent(new URL(r.request().url()).pathname.split("/metadata/")[1] ?? "");
  const m = META[id];
  return m ? r.fulfill({ contentType: "application/json", body: JSON.stringify(m) })
           : r.fulfill({ status: 404, body: "{}" });
});

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed++; }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("discover offers the archive source", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.click("button:has-text('BROWSE')");
  await page.waitForSelector("button[data-src='archive']");
});

await step("archive browse lists full-length tracks", async () => {
  await page.click("button[data-src='archive']");
  await page.waitForSelector("text=Grateful Dead", { timeout: 15000 });
  const body = await page.innerText("body");
  if (/\bpreview\b/.test(body.split("Grateful Dead")[1]?.slice(0, 200) ?? "")) {
    throw new Error("archive rows should not be marked as previews");
  }
  // real lengths, not the 0:00 an unparsed duration would show
  if (!/[1-9]\d?:[0-5]\d/.test(body)) throw new Error("no run times on the rows");
});

await step("the blurb states what the archive is and isn't", async () => {
  const body = await page.innerText("body");
  if (!/not chart pop/i.test(body)) throw new Error("the trade-off isn't stated");
});

await step("a track imports into the library", async () => {
  await page.click("button[data-add]");
  await page.waitForSelector("text=✓ added", { timeout: 20000 });
  if (audioHits < 1) throw new Error("no audio was fetched");
});

await step("it survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  const body = await page.innerText("body");
  if (!/Grateful Dead|Of A Revolution/.test(body)) throw new Error("imported track missing after reload");
});

await step("no script errors", async () => {
  const real = errors.filter((e) => !/failed to load resource|favicon|manifest|sw\.js/i.test(e));
  if (real.length) throw new Error(real.join(" | "));
});

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} step(s) failed\n` : "\ndiscover ok\n");
process.exit(failed ? 1 : 0);
