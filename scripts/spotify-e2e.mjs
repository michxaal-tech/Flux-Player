// End-to-end test of the Spotify link import, with the network stubbed so it
// runs offline and deterministically. `scripts/spotify-check.mjs` is the other
// half: that one checks the live service still behaves the way this one
// pretends it does.
//
// Usage: npm run build && node scripts/spotify-e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4181;
const BASE = `http://localhost:${PORT}`;
const FIXTURE = readFileSync("scripts/fixtures/spotify-embed-playlist.html", "utf8");
// the importer only needs a body big enough to be real audio; nothing decodes
// it until the track is played
const CLIP = Buffer.alloc(40000, 7);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

// Routes match most-recently-registered first, so the specific ones go last.
// The catch-all comes first and stands in for the whole outside world, so a
// failed lyric lookup can't be mistaken for a failure of the thing under test.
await page.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.fulfill({ status: 404, body: "" })));
let clipHits = 0;
let appleHits = 0;
await page.route("**/itunes.apple.com/**", async (r) => {
  appleHits++;
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) });
});
await page.route("**p.scdn.co/**", async (r) => {
  clipHits++;
  await r.fulfill({ contentType: "audio/mpeg", body: CLIP });
});
await page.route("**r.jina.ai/**", (r) => r.fulfill({ contentType: "text/html", body: FIXTURE }));

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed++; }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("spotify panel says no setup is needed", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=SPOTIFY IMPORT");
  await page.waitForSelector("text=NO SETUP NEEDED");
});

await step("reads a playlist link with no account", async () => {
  await page.fill("input[placeholder*='paste a song']", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
  await page.click("button:has-text('READ')");
  await page.waitForSelector("text=Animal", { timeout: 15000 });
  for (const t of ["stupid song", "Earrings", "petal"]) await page.waitForSelector(`text=${t}`);
});

await step("rows show where each track will come from", async () => {
  const body = await page.innerText("body");
  // three of the four fixture rows carry a preview clip; the fourth has none
  // and falls through to a catalogue search
  const previews = (body.match(/\b30s\b/g) ?? []).length;
  if (previews !== 3) throw new Error(`expected 3 rows marked 30s, saw ${previews}`);
  if (!body.includes("SEARCH")) throw new Error("the row with no clip should say SEARCH");
});

await step("imports the audio and builds the playlist", async () => {
  await page.click("button:has-text('IMPORT PLAYLIST')");
  await page.waitForSelector("text=✓ Created", { timeout: 30000 });
  const status = await page.innerText("text=✓ Created");
  if (!/3 tracks/.test(status)) throw new Error(`expected 3 tracks imported, got: ${status}`);
  if (!/3 as 30s previews/.test(status)) throw new Error(`previews not counted: ${status}`);
});

await step("the tracks are really in the library", async () => {
  await page.click("button:has-text('TOP HITS')"); // the playlist it just made
  await page.waitForSelector("text=Animal (preview)", { timeout: 5000 });
  if (clipHits !== 3) throw new Error(`expected 3 clip fetches, saw ${clipHits}`);
  if (appleHits < 1) throw new Error("the clip-less track should have fallen back to a catalogue search");
});

await step("it survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=Animal (preview)", { timeout: 8000 });
});

await step("no script errors", async () => {
  // "failed to load resource" is the catch-all route above refusing the
  // outside world (lyric lookups and the like), which is the point of it
  const real = errors.filter((e) => !/failed to load resource|favicon|manifest|sw\.js/i.test(e));
  if (real.length) throw new Error(real.join(" | "));
});

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} step(s) failed\n` : "\nspotify import ok\n");
process.exit(failed ? 1 : 0);
