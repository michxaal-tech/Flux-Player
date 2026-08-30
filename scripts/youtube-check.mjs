// The YouTube tab, end to end, against a mocked Data API.
//
// No real key and no real API call: both googleapis endpoints are intercepted,
// so this asserts FLUX's behaviour rather than Google's. What matters here is
// that a search result becomes an ordinary FLUX track — the whole point of the
// feature is that YouTube items ride the existing queue rather than living in a
// parallel one.
//
// The iframe player itself is not exercised. It is a cross-origin frame from
// youtube.com, which this sandbox has no route to and which would make the
// check a test of network reachability. What *is* asserted is everything up to
// that boundary, plus that the boundary is disclosed in the UI.
//
// Usage: npm run build && node scripts/youtube-check.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;

const SEARCH = {
  items: [
    {
      id: { videoId: "vid0000001" },
      snippet: {
        title: "Test Song &amp; Friends",
        channelTitle: "Test Channel",
        thumbnails: { medium: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } },
      },
    },
    {
      id: { videoId: "vid0000002" },
      snippet: {
        title: "Blocked Song",
        channelTitle: "Other Channel",
        thumbnails: { medium: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } },
      },
    },
  ],
};
const VIDEOS = {
  items: [
    { id: "vid0000001", contentDetails: { duration: "PT3M25S" }, status: { embeddable: true } },
    { id: "vid0000002", contentDetails: { duration: "PT4M02S" }, status: { embeddable: false } },
  ],
};

const preview = spawn("npx", ["vite", "preview", "--strictPort", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });

let searchCalls = 0;
let sawKeyInUrl = "";
await page.route("**/youtube/v3/search*", (route) => {
  searchCalls++;
  const u = new URL(route.request().url());
  sawKeyInUrl = u.searchParams.get("key") ?? "";
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SEARCH) });
});
await page.route("**/youtube/v3/videos*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VIDEOS) }));
// the IFrame API script and the player frame are unreachable here; stub them
await page.route("**/iframe_api*", (route) =>
  route.fulfill({ status: 200, contentType: "text/javascript", body: "window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();" }));

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); failed = 1; }
};

await page.goto(BASE, { waitUntil: "networkidle" });

await step("the YT tab exists and opens", async () => {
  await page.click("button:has(div:text-is('YT'))");
  await page.waitForSelector("text=▶ YOUTUBE", { timeout: 5000 });
});

await step("the sample-access limitation is disclosed before anything is queued", async () => {
  const txt = await page.innerText("body");
  if (!/visualizer won't react/i.test(txt)) throw new Error("no disclosure of the iframe limitation");
});

await step("search is disabled until a key is entered", async () => {
  const dis = await page.getAttribute("input[data-ytq]", "disabled");
  if (dis === null) throw new Error("search box was enabled with no key");
});

await step("a key can be saved and enables search", async () => {
  await page.fill("input[placeholder='AIza…']", "TEST-KEY-123");
  await page.click("button:has-text('SAVE KEY')");
  await page.waitForSelector("button:has-text('KEY SET')", { timeout: 4000 });
  await page.waitForFunction(() => !document.querySelector("input[data-ytq]")?.disabled, { timeout: 4000 });
});

await step("the key is not written into persisted app state", async () => {
  const dumped = await page.evaluate(() => localStorage.getItem("flux-store") || "");
  if (dumped.includes("TEST-KEY-123")) throw new Error("key leaked into localStorage");
});

await step("searching calls the API with the key and lists results", async () => {
  await page.fill("input[data-ytq]", "test song");
  await page.press("input[data-ytq]", "Enter");
  await page.waitForSelector("text=Test Song & Friends", { timeout: 6000 });
  if (searchCalls !== 1) throw new Error(`${searchCalls} search calls`);
  if (sawKeyInUrl !== "TEST-KEY-123") throw new Error(`key sent was "${sawKeyInUrl}"`);
});

await step("HTML entities in titles are decoded", async () => {
  const txt = await page.innerText("body");
  if (txt.includes("&amp;")) throw new Error("title still HTML-escaped");
});

await step("durations are parsed from ISO-8601", async () => {
  const txt = await page.innerText("body");
  if (!txt.includes("3:25")) throw new Error("PT3M25S not shown as 3:25");
});

await step("a non-embeddable video is marked and its buttons disabled", async () => {
  const txt = await page.innerText("body");
  if (!/embedding disabled/i.test(txt)) throw new Error("not marked");
  const btn = page.locator('[data-ythit="vid0000002"] button:has-text("QUEUE")');
  if (await btn.isEnabled()) throw new Error("queue button was still enabled");
});

await step("queueing adds a real FLUX track to the playlist", async () => {
  await page.locator('[data-ythit="vid0000001"] button:has-text("QUEUE")').click();
  // the store persists lazily, so poll rather than assuming the write landed
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("flux-store") || "{}");
    return (s?.state?.playlists ?? []).flatMap((p) => p.tracks ?? []).some((x) => x.source === "youtube");
  }, { timeout: 8000 });
  const t = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("flux-store") || "{}");
    const all = (s?.state?.playlists ?? []).flatMap((p) => p.tracks ?? []);
    return all.find((x) => x.source === "youtube") ?? null;
  });
  if (!t) throw new Error("no youtube track in any playlist");
  if (t.sourceId !== "vid0000001") throw new Error(`sourceId ${t.sourceId}`);
  if (t.fileId) throw new Error("a youtube track should carry no blob id");
  if (!t.name.includes("Test Song")) throw new Error(`name ${t.name}`);
});

await step("it appears in the ordinary library queue, not a separate one", async () => {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.waitForSelector("text=Test Song", { timeout: 5000 });
});

if (errors.length) {
  console.log(`\n✘ ${errors.length} page errors:`);
  for (const e of [...new Set(errors)].slice(0, 8)) console.log(`   ${e}`);
  failed = 1;
}
await browser.close();
preview.kill();
console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed);
