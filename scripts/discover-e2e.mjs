// End-to-end test of the Internet Archive source in DISCOVER, with the network
// stubbed from captured responses so it runs offline and deterministically.
// `scripts/catalogue-check.mjs` is the other half: that one checks the live
// services still answer the way these fixtures say they do.
//
// Discover lives in the Search view now, under the "Catalogues" segment, and
// starts open — there is no BROWSE click to make any more.
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
// Apple serves nothing but 30-second excerpts, which is what the FULL TRACKS
// ONLY filter exists to keep out of the library
const APPLE = JSON.stringify({ results: [
  { trackId: 1, trackName: "Blinding Lights", artistName: "The Weeknd", previewUrl: "https://audio-ssl.itunes.apple.com/x.m4a", primaryGenreName: "Pop" },
  { trackId: 2, trackName: "Save Your Tears", artistName: "The Weeknd", previewUrl: "https://audio-ssl.itunes.apple.com/y.m4a", primaryGenreName: "Pop" },
] });

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
await page.route("**itunes.apple.com/**", (r) => r.fulfill({ contentType: "application/json", body: APPLE }));
await page.route("**/advancedsearch.php*", (r) => r.fulfill({ contentType: "application/json", body: SEARCH }));
await page.route("**/metadata/**", (r) => {
  const id = decodeURIComponent(new URL(r.request().url()).pathname.split("/metadata/")[1] ?? "");
  const m = META[id];
  return m ? r.fulfill({ contentType: "application/json", body: JSON.stringify(m) })
           : r.fulfill({ status: 404, body: "{}" });
});

// The intro plays on a first launch and would sit over everything. Mark it
// seen — but only when nothing is stored yet, so a reload keeps the library
// this test has built rather than resetting it.
await page.addInitScript(() => {
  if (!localStorage.getItem("flux-store")) localStorage.setItem("flux-store", JSON.stringify({ state: { introSeen: true }, version: 3 }));
});
// Views are store-driven; setting the store is the one way in that works on
// every layout (the rail hides its labels when narrow).
const go = async (view) => {
  await page.waitForSelector("nav[aria-label=Main]");
  await page.evaluate((v) => window.__fluxStore.setState({ view: v }), view);
};
// Views and panels slide in, and a click that lands mid-animation is refused
// as "not stable" — so wait for the target, and force it if it won't settle.
const tap = async (sel, timeout = 8000) => {
  const el = page.locator(sel).first();
  await el.waitFor({ timeout });
  await el.click({ timeout: 3000 }).catch(() => el.click({ force: true }));
};

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed++; }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("discover offers the archive source", async () => {
  await go("search");
  await page.waitForSelector("button[data-src='archive']");
});

await step("archive browse lists full-length tracks", async () => {
  await tap("button[data-src='archive']");
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
  await tap("button[data-add]");
  await page.waitForSelector("text=✓ added", { timeout: 20000 });
  if (audioHits < 1) throw new Error("no audio was fetched");
});

await step("it survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  // the Library view opens on a grid of playlists; the tracks are under Songs
  await go("library");
  await tap("button[role=radio]:has-text('Songs')");
  await page.waitForSelector("text=/Grateful Dead|Of A Revolution/", { timeout: 8000 }).catch(() => {});
  const body = await page.innerText("body");
  if (!/Grateful Dead|Of A Revolution/.test(body)) throw new Error("imported track missing after reload");
});

await step("previews are kept out by default", async () => {
  await go("search");
  await page.waitForSelector("button[data-fullonly]");
  const label = await page.innerText("button[data-fullonly]");
  if (!/FULL TRACKS ONLY/.test(label)) throw new Error(`filter is off by default: ${label}`);
  await tap("button[data-src='apple']");
  await page.waitForSelector("text=30-second excerpt", { timeout: 15000 });
  if (await page.$("button[data-add]")) throw new Error("an excerpt was still addable");
});

await step("previews can be shown deliberately", async () => {
  await tap("text=Show them anyway");
  await page.waitForSelector("text=EXCERPT", { timeout: 10000 });
  if (!(await page.$("button[data-add]"))) throw new Error("rows didn't come back");
  const label = await page.innerText("button[data-fullonly]");
  if (!/PREVIEWS SHOWN/.test(label)) throw new Error(`toggle didn't flip: ${label}`);
});

await step("the choice survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await go("search");
  await page.waitForSelector("button[data-fullonly]");
  const label = await page.innerText("button[data-fullonly]");
  if (!/PREVIEWS SHOWN/.test(label)) throw new Error(`not persisted: ${label}`);
});

await step("no script errors", async () => {
  const real = errors.filter((e) => !/failed to load resource|favicon|manifest|sw\.js/i.test(e));
  if (real.length) throw new Error(real.join(" | "));
});

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} step(s) failed\n` : "\ndiscover ok\n");
process.exit(failed ? 1 : 0);
