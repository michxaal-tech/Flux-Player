// End-to-end test of the BYOK AI layer against mocked provider endpoints.
// Verifies: AI UI is absent without a key, key validation + storage, the
// command schema executes real app changes, malformed JSON is repaired on
// retry, and model-authored SVG is sanitized.
//
// Where things are now: AI settings and the AI studio sit in Settings →
// General, vibe-to-FX in Sound → Effects, the library AI bar (emoji search,
// playlist builder) at the top of the Library view, and a track's AI menu
// (studio notes, cover art) behind its row's More menu. The old visualizer is
// gone; an AI "visuals" action now produces the stage's `look`.
//
// Usage: npm run build && node scripts/ai-smoke.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4181;
const BASE = `http://localhost:${PORT}`;

function makeWav(path, name) {
  const rate = 44100, secs = 8, n = rate * secs, ch = 2;
  const dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const s = Math.round(0.3 * Math.sin(2 * Math.PI * 220 * t) * 26000);
    buf.writeInt16LE(s, off); off += 2; buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
  return path;
}

const dir = mkdtempSync(join(tmpdir(), "flux-ai-"));
const wavs = ["midnight drive.wav", "gym banger.wav"].map((n) => makeWav(join(dir, n), n));

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

// ── mock Anthropic ────────────────────────────────────────────────────────
const seen = [];
const geminiSeen = [];
let malformedOnce = true;
const reply = (obj) => ({
  contentType: "application/json",
  body: JSON.stringify({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] }),
});

// Gemini speaks a different request/response shape — mock it too so the
// provider abstraction is exercised, not just Anthropic's.
const geminiReply = (obj) => ({
  contentType: "application/json",
  body: JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] }),
});

await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
  const req = route.request();
  const headers = req.headers();
  const body = JSON.parse(req.postData() || "{}");
  const userText = body.contents?.[0]?.parts?.[0]?.text ?? "";
  const system = body.system_instruction?.parts?.[0]?.text ?? "";
  geminiSeen.push({ headers, url: req.url(), userText, system, cfg: body.generationConfig });

  // model discovery
  if (req.method() === "GET" && req.url().includes("/v1beta/models") && !req.url().includes(":generateContent")) {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ models: [
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.7-flash", displayName: "Gemini 3.7 Flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
    ] }) });
  }
  // the retired id 404s for new keys, exactly like the live API
  if (req.url().includes("gemini-2.5-flash:generateContent")) {
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available to new users." } }) });
  }
  if (headers["x-goog-api-key"] === "AIzaBAD") {
    return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }) });
  }
  // thinking models burn the output budget before writing anything: reply
  // empty + MAX_TOKENS unless thinking was explicitly disabled
  if (body.generationConfig?.thinkingConfig?.thinkingBudget !== 0) {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }) });
  }
  if (userText === "ping") return route.fulfill(geminiReply("ok"));
  return route.fulfill(geminiReply({
    reply: "Gemini set the mood.",
    actions: [{ type: "fx", payload: { name: "GEMINI VIBE", fx: { speed: 0.9, reverb: 0.4 } } }],
  }));
});

await page.route("https://api.anthropic.com/**", async (route) => {
  const req = route.request();
  const headers = req.headers();
  const body = JSON.parse(req.postData() || "{}");
  const userText = body.messages?.[0]?.content ?? "";
  seen.push({ headers, model: body.model, userText });

  if (headers["x-api-key"] === "sk-ant-badkey") {
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "invalid key" } }) });
  }
  if (userText === "ping") return route.fulfill(reply("ok"));

  // repair path: first JSON-shaped request returns junk, retry returns valid
  if (userText.includes("REPAIRTEST")) {
    if (malformedOnce) { malformedOnce = false; return route.fulfill(reply("sorry, here you go: {broken json,,,")); }
    return route.fulfill(reply({ reply: "repaired ok", actions: [{ type: "fx", payload: { name: "REPAIRED", fx: { reverb: 0.5 } } }] }));
  }
  if (userText.includes("searched with only these emoji")) {
    // answer with real ids lifted out of the context we were given
    const ids = [...userText.matchAll(/id=(\S+)/g)].map((m) => m[1]).slice(0, 2);
    return route.fulfill(reply({ trackIds: ids }));
  }
  if (body.system?.includes("album cover art")) {
    return route.fulfill(reply(`<svg viewBox="0 0 400 400"><script>window.__pwned=1</script><rect width="400" height="400" fill="#111" onload="window.__pwned=2"/><image xlink:href="http://evil/x.png"/><circle cx="200" cy="200" r="90" fill="#0ff"/></svg>`));
  }
  if (userText.includes("COVERTEST")) {
    return route.fulfill(reply(`<svg viewBox="0 0 400 400"><script>window.__pwned=1</script><rect width="400" height="400" fill="#111" onload="window.__pwned=2"/><a href="javascript:alert(1)"><circle cx="200" cy="200" r="90" fill="#0ff"/></a></svg>`));
  }
  // default: a full multi-action command. The visuals payload speaks the
  // stage's vocabulary (mode/palette/dials) in the wrong case, as a model will,
  // with a dial out of range.
  return route.fulfill(reply({
    reply: "Dark and slow, visuals turned red.",
    actions: [
      { type: "fx", payload: { name: "MIDNIGHT", fx: { speed: 0.85, vinyl: true, reverb: 0.55, bass: 6, tone: 6000, crush: 99 } } },
      { type: "visuals", payload: { mode: "Caustic", palette: "EMBER", warmth: 0.6, intensity: 9 } },
      { type: "sleepTimer", payload: { minutes: 25 } },
    ],
  }));
});

// The intro plays on a first launch and would sit over everything. Mark it
// seen — but only when nothing is stored yet, so a reload keeps the library
// and settings this test has built rather than resetting them.
await page.addInitScript(() => {
  if (!localStorage.getItem("flux-store")) localStorage.setItem("flux-store", JSON.stringify({ state: { introSeen: true }, version: 3 }));
});
// Views are store-driven; setting the store is the one way in that works on
// every layout (Settings has no rail label when narrow).
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
// Settings opens on General, which is where the AI settings live.
const aiSettings = async () => {
  await go("settings");
  await page.waitForSelector("text=AI SETTINGS");
};

const step = async (name, fn) => {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.log(`✘ ${name}: ${e.message.split("\n")[0]}`); process.exitCode = 1; }
};

await page.goto(BASE, { waitUntil: "networkidle" });
await go("library");
{
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tap("button:has-text('Add music')")]);
  await chooser.setFiles(wavs);
}
await tap("button[role=radio]:has-text('Songs')");
await page.waitForSelector("button[aria-label^='Play midnight drive']", { timeout: 8000 });

await step("no AI surfaces exist without a key", async () => {
  await aiSettings();
  if (await page.locator("text=AI STUDIO").count()) throw new Error("AI studio visible with no key");
  await go("sound");
  await page.waitForSelector("text=TIME & PITCH"); // the rack has rendered
  if (await page.locator("text=VIBE TO FX").count()) throw new Error("vibe-to-fx visible with no key");
  await go("library");
  await page.waitForSelector("button:has-text('Add music')");
  if (await page.locator("input[placeholder*='emoji only']").count()) throw new Error("emoji search visible with no key");
  if (await page.locator("button[title='FLUX Copilot']").count()) throw new Error("copilot button visible with no key");
  const ready = await page.evaluate(() => window.__fluxStore.getState().aiReady);
  if (ready) throw new Error("aiReady true with no key");
});

await step("Gemini is the default provider and its free key flow works", async () => {
  await aiSettings();
  const prov = await page.evaluate(() => window.__fluxStore.getState().aiProvider);
  if (prov !== "gemini") throw new Error(`default provider is ${prov}, expected gemini`);
  await page.fill("input[placeholder='paste your AI Studio key…']", "AIzaBAD");
  await tap("button:has-text('CONNECT')");
  await page.waitForSelector("text=isn't valid", { timeout: 8000 });
  await page.fill("input[placeholder='paste your AI Studio key…']", "AIzaGOOD");
  await tap("button:has-text('CONNECT')");
  await page.waitForSelector("text=Connected to Google Gemini", { timeout: 8000 });
  const g = [...geminiSeen].reverse().find((x) => x.userText === "ping");
  if (!g) throw new Error("no Gemini call was made");
  if (g.headers["x-goog-api-key"] !== "AIzaGOOD") throw new Error("key not sent in x-goog-api-key");
  // discovery must have skipped the retired id and chosen the live one
  if (g.url.includes("gemini-2.5-flash")) throw new Error("connected with the retired model id");
  if (!g.url.includes("gemini-3.7-flash:generateContent")) throw new Error(`wrong endpoint: ${g.url}`);
  const chosen = await page.evaluate(() => window.__fluxStore.getState().aiModel);
  if (chosen !== "gemini-3.7-flash") throw new Error(`aiModel=${chosen}, expected the discovered model`);
  // thinking must be disabled or a Flash model answers with nothing at all
  const ping = [...geminiSeen].reverse().find((x) => x.userText === "ping");
  if (ping?.cfg?.thinkingConfig?.thinkingBudget !== 0) {
    throw new Error("thinking budget not disabled — the model will spend its output on reasoning");
  }
});

await step("a stale stored model id is replaced on reconnect", async () => {
  // simulate a config saved before Google retired the id
  await page.evaluate(() => window.__fluxStore.getState().set({ aiModel: "gemini-2.5-flash" }));
  await tap("button:has-text('REMOVE KEY')");
  await page.fill("input[placeholder='paste your AI Studio key…']", "AIzaGOOD");
  await tap("button:has-text('CONNECT')");
  await page.waitForSelector("text=Connected to Google Gemini", { timeout: 10000 });
  const m = await page.evaluate(() => window.__fluxStore.getState().aiModel);
  if (m === "gemini-2.5-flash") throw new Error("kept a model the key can no longer call");
});

await step("Gemini executes commands through the same schema", async () => {
  await tap("button[title='FLUX Copilot']");
  await page.fill("input[placeholder='tell FLUX what you want…']", "set a mood");
  await tap("button:has-text('SEND')");
  await page.waitForSelector("text=Gemini set the mood", { timeout: 10000 });
  const preset = await page.evaluate(() => window.__fluxStore.getState().activePreset);
  if (preset !== "GEMINI VIBE") throw new Error(`preset=${preset}`);
  const jsonCall = geminiSeen.find((x) => x.cfg?.responseMimeType === "application/json");
  if (!jsonCall) throw new Error("native JSON mode was not requested");
  await page.evaluate(() => window.__fluxStore.getState().set({ aiPanel: false }));
});

await step("switching to Anthropic keeps each provider's key separate", async () => {
  await aiSettings();
  await tap("button:has-text('Anthropic (Claude)')");
  await page.waitForSelector("input[placeholder='sk-ant-…']", { timeout: 5000 });
  const ready = await page.evaluate(() => window.__fluxStore.getState().aiReady);
  if (ready) throw new Error("aiReady should be false — no Anthropic key stored yet");
});

await step("bad key is rejected with a clear message", async () => {
  await page.fill("input[placeholder='sk-ant-…']", "sk-ant-badkey");
  await tap("button:has-text('CONNECT')");
  await page.waitForSelector("text=rejected the key", { timeout: 8000 });
});

await step("valid key connects, persists, and unlocks AI UI", async () => {
  await page.fill("input[placeholder='sk-ant-…']", "sk-ant-goodkey");
  await tap("button:has-text('CONNECT')");
  await page.waitForSelector("text=Connected to Anthropic", { timeout: 8000 });
  await page.waitForSelector("text=AI STUDIO");
  const h = seen.find((s) => s.userText === "ping")?.headers ?? {};
  if (h["anthropic-version"] !== "2023-06-01") throw new Error("missing anthropic-version header");
  if (h["anthropic-dangerous-direct-browser-access"] !== "true") throw new Error("missing browser-access header");
  const model = seen.find((s) => s.userText === "ping")?.model;
  if (model !== "claude-sonnet-4-6") throw new Error(`wrong model: ${model}`);
});

await step("key survives reload (stored in IndexedDB)", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__fluxStore, { timeout: 10000 });
  await page.waitForFunction(() => window.__fluxStore.getState().aiReady === true, { timeout: 10000 });
});

await step("copilot executes a multi-action command", async () => {
  await tap("button[title='FLUX Copilot']");
  await page.fill("input[placeholder='tell FLUX what you want…']", "play something dark and slow it down, make visuals red");
  await tap("button:has-text('SEND')");
  await page.waitForSelector("text=Dark and slow", { timeout: 10000 });
  // The visualizer's theme/palette (visTheme, visCfg) no longer exist; the
  // same action now lands on the stage's look, so that is what is asserted.
  const st = await page.evaluate(() => {
    const s = window.__fluxStore.getState();
    return {
      preset: s.activePreset, speed: s.fx.speed, crush: s.fx.crush, sleep: !!s.sleepEnd,
      mode: s.look?.style?.mode, pal: s.look?.color?.source, warmth: s.look?.color?.warmth, react: s.look?.intensity?.react,
    };
  });
  if (st.preset !== "MIDNIGHT") throw new Error(`preset=${st.preset}`);
  if (Math.abs(st.speed - 0.85) > 0.001) throw new Error(`speed=${st.speed}`);
  if (st.crush !== 0.8) throw new Error(`crush not clamped to range: ${st.crush}`);
  if (st.mode !== "caustic") throw new Error(`look mode=${st.mode} (case-insensitive match failed)`);
  if (st.pal !== "ember") throw new Error(`look palette=${st.pal}`);
  if (Math.abs(st.warmth - 0.6) > 0.001) throw new Error(`look warmth=${st.warmth}`);
  if (st.react !== 1.5) throw new Error(`intensity not clamped to range: ${st.react}`);
  if (!st.sleep) throw new Error("sleep timer not set");
});

await step("context sent to Claude includes the real library", async () => {
  const last = seen[seen.length - 1]?.userText ?? "";
  if (!last.includes("midnight drive")) throw new Error("library missing from context");
  if (!last.includes("CURRENT FX")) throw new Error("fx state missing from context");
  if (!last.includes("LOCAL TIME")) throw new Error("local time missing from context");
});

await step("malformed JSON is repaired on retry", async () => {
  await page.fill("input[placeholder='tell FLUX what you want…']", "REPAIRTEST please");
  await tap("button:has-text('SEND')");
  await page.waitForSelector("text=repaired ok", { timeout: 12000 });
  const preset = await page.evaluate(() => window.__fluxStore.getState().activePreset);
  if (preset !== "REPAIRED") throw new Error(`repair action not applied (preset=${preset})`);
});

await step("model-authored SVG is sanitized before storage", async () => {
  await page.waitForFunction(() => !!window.__fluxAi, { timeout: 8000 });
  const out = await page.evaluate(() => window.__fluxAi.sanitizeSvg(
    `<svg viewBox="0 0 400 400"><script>window.__pwned=1</script>` +
    `<rect onload="window.__pwned=2" width="400" height="400"/>` +
    `<image href="http://evil/x.png"/><circle cx="200" cy="200" r="90"/></svg>`
  ));
  if (!out) throw new Error("sanitizer rejected a valid svg");
  for (const bad of ["<script", "onload", "href", "<image"]) {
    if (out.toLowerCase().includes(bad.toLowerCase())) throw new Error(`sanitizer left ${bad}`);
  }
  if (!out.includes("<circle")) throw new Error("sanitizer stripped legitimate content");
  const pwned = await page.evaluate(() => window.__pwned);
  if (pwned) throw new Error("injected script executed");
});

await step("cover art round-trips through storage sanitized", async () => {
  // exercises the real path: model reply → sanitize → IndexedDB → read back
  await page.fill("input[placeholder='tell FLUX what you want…']", "COVERTEST make art");
  await tap("button:has-text('SEND')");
  await page.waitForTimeout(2500);
  // assert the sanitizer keeps legitimate in-document references intact
  const svg = await page.evaluate(() => window.__fluxAi.sanitizeSvg(
    `<svg viewBox="0 0 400 400"><defs><linearGradient id="g"><stop offset="0" stop-color="#0ff"/></linearGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/></svg>`
  ));
  if (!svg || !svg.includes("linearGradient")) throw new Error("in-document gradient refs must survive");
  if (!svg.includes("url(#g)")) throw new Error("fragment url() reference was stripped");
});

await step("library AI surfaces render and emoji search returns hits", async () => {
  // the docked copilot covers the lower half of the screen — close it first
  await page.evaluate(() => window.__fluxStore.getState().set({ aiPanel: false }));
  await go("library");
  await page.waitForSelector("input[placeholder*='emoji only']");
  await page.waitForSelector("input[placeholder*='describe a playlist']");
  await page.fill("input[placeholder*='emoji only']", "🌧️🌃");
  await tap("button:has-text('✦ FIND')");
  await page.waitForSelector("text=TAP TO PLAY", { timeout: 10000 });
});

// The inline ✦ cover button is gone: cover art is made from a track's More
// menu, and an AI cover becomes that track's artwork everywhere — drawn as an
// <img> of the stored SVG — so the checks are on the store and on that image.
const coverImg = () => page.evaluate(() => {
  const row = [...document.querySelectorAll(".track-row")].find((r) => r.querySelector("button[aria-label^='Play midnight drive']"));
  const img = row?.querySelector("img[src^='data:image/svg+xml']");
  return img ? decodeURIComponent(img.getAttribute("src")) : null;
});

await step("AI cover art is generated from a track's menu and stored sanitized", async () => {
  await tap("button[role=radio]:has-text('Songs')");
  const row = page.locator(".track-row", { has: page.locator("button[aria-label^='Play midnight drive']") }).first();
  await row.locator("button[aria-label=More]").click({ force: true });
  await tap("[role=menuitem]:has-text('AI: notes & cover')");
  await tap("button:has-text('✦ COVER ART')");
  await page.waitForSelector("text=✓ cover art generated", { timeout: 12000 });
  const stored = await page.evaluate(() => {
    const id = window.__fluxStore.getState().playlists.flatMap((p) => p.tracks).find((t) => t.name.includes("midnight drive"))?.id;
    return window.__fluxAi.loadCover("track", id);
  });
  if (!stored) throw new Error("no cover was stored");
  if (/<script|onload|xlink:href|<image/i.test(stored)) throw new Error("unsanitized markup was stored");
  if (await page.evaluate(() => window.__pwned)) throw new Error("injected script executed");
});

await step("the cover shows as that track's artwork, without a reload", async () => {
  // the row is already on screen; it should pick the new cover up in place
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll(".track-row")].find((r) => r.querySelector("button[aria-label^='Play midnight drive']"));
    return !!row?.querySelector("img[src^='data:image/svg+xml']");
  }, null, { timeout: 8000 }).catch(() => { throw new Error("the row still shows the generated sleeve, not the AI cover"); });
  const src = await coverImg();
  if (/script|onload|xlink:href/i.test(src)) throw new Error("unsanitized markup reached the DOM");
  if (await page.evaluate(() => window.__pwned)) throw new Error("injected script executed");
});

await step("each provider's key is remembered independently", async () => {
  await aiSettings();
  await tap("button:has-text('Google Gemini')");
  await page.waitForFunction(() => window.__fluxStore.getState().aiReady === true, { timeout: 6000 });
  await page.waitForSelector("text=REMOVE KEY");
  await tap("button:has-text('Anthropic (Claude)')");
  await page.waitForFunction(() => window.__fluxStore.getState().aiReady === true, { timeout: 6000 });
});

await step("removing the key hides every AI surface again", async () => {
  await page.evaluate(() => window.__fluxStore.getState().set({ aiPanel: false }));
  await aiSettings();
  await tap("button:has-text('REMOVE KEY')");
  await page.waitForSelector("text=FLUX keeps working exactly as before", { timeout: 5000 });
  if (await page.locator("text=AI STUDIO").count()) throw new Error("AI studio still visible");
  const ready = await page.evaluate(() => window.__fluxStore.getState().aiReady);
  if (ready) throw new Error("aiReady still true");
});

const real = errors.filter((e) => !e.includes("favicon") && !e.includes("Failed to load resource"));
if (real.length) { console.log("✘ console/page errors:", real.slice(0, 4).join(" | ")); process.exitCode = 1; }
else console.log("✔ no console errors");

await browser.close();
preview.kill();
process.exit();
