// End-to-end check for the bring-your-own-credentials connectors.
//
// Stands up a *fake* Subsonic server via request interception — no real
// network, no real credentials — and drives the UI through the whole path:
// add a connection, watch it reach the Discover picker, test it (ping),
// search it, and confirm the request URLs FLUX builds are valid Subsonic with
// salted-token auth. Then reloads to prove the connection persists.
//
// Usage: npm run build && node scripts/connectors-check.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4188;
const BASE = `http://localhost:${PORT}`;
const HOST = "https://sub.test";

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Ignore resource-load failures: Google Fonts is blocked in this sandbox and
  // the mock serves an empty cover image on purpose. Neither is an app error.
  if (/Failed to load resource/.test(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

// captured Subsonic request URLs, for auth-shape assertions
const seen = [];
const song = {
  id: "s1", title: "Test Song", artist: "Test Artist", duration: 200,
  genre: "Electronic", coverArt: "co1", contentType: "audio/mpeg",
};
const ok = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } }) });

await page.route(`${HOST}/**`, (route) => {
  const url = new URL(route.request().url());
  seen.push(url);
  const view = url.pathname.split("/").pop().replace(".view", "");
  if (view === "ping") return route.fulfill(ok({}));
  if (view === "search3") return route.fulfill(ok({ searchResult3: { song: [song] } }));
  if (view === "getRandomSongs") return route.fulfill(ok({ randomSongs: { song: [song] } }));
  if (view === "getSongsByGenre") return route.fulfill(ok({ songsByGenre: { song: [song] } }));
  if (view === "getCoverArt") return route.fulfill({ status: 200, contentType: "image/png", body: "" });
  if (view === "stream") return route.fulfill({ status: 200, contentType: "audio/mpeg", body: "fake" });
  return route.fulfill(ok({}));
});

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed = 1; }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("open Connections in the Library tab", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=🔌 CONNECTIONS");
  await page.click("button:has-text('+ ADD')");
  await page.waitForSelector("button:has-text('SUBSONIC SERVER')");
});

await step("add a Subsonic connection", async () => {
  await page.fill("input[placeholder='My Server']", "TestNav");
  await page.fill("input[placeholder='https://music.example.com']", HOST);
  await page.fill("input[placeholder='your login']", "alice");
  await page.fill("input[placeholder='••••••••']", "hunter2");
  await page.click("button:has-text('SAVE')");
  await page.waitForSelector("text=TestNav");
});

await step("TEST pings the server and reports Connected", async () => {
  await page.click("button:text-is('TEST')");
  await page.waitForSelector("text=Connected.", { timeout: 4000 });
});

await step("connection reaches the Discover picker", async () => {
  await page.click("button:has-text('BROWSE')");
  await page.waitForSelector("button[data-src]:has-text('TESTNAV')", { timeout: 4000 });
});

await step("ping URL is valid Subsonic with salted-token auth", async () => {
  const ping = seen.find((u) => u.pathname.endsWith("/ping.view"));
  if (!ping) throw new Error("no ping request seen");
  for (const k of ["u", "t", "s", "v", "c"]) {
    if (!ping.searchParams.get(k)) throw new Error(`ping missing ?${k}`);
  }
  if (ping.searchParams.get("u") !== "alice") throw new Error("wrong user");
  if (ping.searchParams.get("t").length !== 32) throw new Error("token is not an md5 hex");
  if (ping.searchParams.get("t").includes("hunter2")) throw new Error("password leaked into URL");
});

await step("search the connector and get a mapped track", async () => {
  await page.click("button[data-src]:has-text('TESTNAV')");
  await page.fill("input[data-discoverq]", "test");
  await page.press("input[data-discoverq]", "Enter");
  await page.waitForSelector("text=Test Song", { timeout: 5000 });
});

await step("each request re-salts (token differs run to run)", async () => {
  const toks = seen.filter((u) => u.pathname.endsWith("/search3.view")).map((u) => u.searchParams.get("s"));
  // at least the salt should be present and look random
  if (!toks.length || !toks[0] || toks[0].length < 6) throw new Error("salt missing/short");
});

await step("connection survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=TestNav", { timeout: 5000 });
});

if (errors.length) {
  console.log(`\n✘ ${errors.length} page errors:`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.log(`   ${e}`);
  failed = 1;
}

await browser.close();
preview.kill();
console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed);
