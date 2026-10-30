// End-to-end smoke test for the built app. Spawns `vite preview`, drives the
// interface in headless Chromium, and checks import → playback → navigation →
// Sound (FX, deck) → stage + modes → Studio looks and presets → lyrics →
// recorder/export → migration of older saves → persistence.
//
// Usage: npm run build && node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

// 6s stereo test WAV: 440Hz tone + 120bpm kick
function makeTestWav(path) {
  const rate = 44100, secs = 6, n = rate * secs, ch = 2;
  const dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-8 * (t % 0.5));
    const beat = env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t) + (Math.random() * 2 - 1) * 0.25);
    const s = Math.round(Math.max(-1, Math.min(1, 0.2 * Math.sin(2 * Math.PI * 440 * t) + beat * 0.7)) * 32767 * 0.8);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-")), "Test Artist - test track.wav");
makeTestWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    console.log(`✘ ${name}: ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};
const S = (fn, arg) => page.evaluate(fn, arg);
const nav = (label) => page.evaluate((l) => document.querySelector(`nav button[aria-label=${l}]`).click(), label);

// ── migration: an install from the 85-theme era opens on the matching mode ──
await page.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("flux-store", JSON.stringify({
    version: 2,
    state: {
      visTheme: "ORRERY", visCfg: { palette: "OCEAN", h1: 192, h2: 252, intensity: 1.3, speed: 0.8, syncMs: 120 },
      visPresets: [{ name: "My old look", look: { theme: "LIQUID", cfg: { palette: "EMBER" } } }],
      tab: "library", volume: 0.6,
    },
  }));
});
await page.goto(BASE, { waitUntil: "load" });

await step("intro plays and hands off to the interface", async () => {
  await page.waitForSelector("text=Music, made visible", { timeout: 5000 });
  await page.waitForSelector("nav[aria-label=Main]", { timeout: 8000 });
});

await step("old saves migrate: theme → mode, palette, offset, presets, view", async () => {
  const s = await S(() => {
    const st = window.__fluxStore.getState();
    return { mode: st.look.style.mode, src: st.look.color.source, sync: st.syncMs, presets: st.lookPresets.map((p) => [p.name, p.look.style.mode]), view: st.view, vol: st.volume };
  });
  if (s.mode !== "orbit") throw new Error(`mode ${s.mode}`);
  // OCEAN's lead hue (192°) is closest to Lagoon
  if (s.src !== "lagoon") throw new Error(`palette ${s.src}`);
  if (s.sync !== 120) throw new Error(`syncMs ${s.sync}`);
  if (s.presets[0]?.[0] !== "My old look" || s.presets[0]?.[1] !== "ink") throw new Error(JSON.stringify(s.presets));
  if (s.view !== "library" || s.vol !== 0.6) throw new Error(`${s.view} ${s.vol}`);
});

await step("import audio file via Add music", async () => {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Add music')")]);
  await chooser.setFiles(wav);
  await page.waitForSelector("text=test track", { timeout: 5000 });
});

await step("auto-play started, clock advancing", async () => {
  await page.waitForFunction(() => window.__fluxClock.media() > 0.5, null, { timeout: 8000 });
});

await step("artist split from the file name", async () => {
  const a = await S(() => window.__fluxStore.getState().playlists[0].tracks[0].artist ?? window.__fluxStore.getState().playlists[0].tracks[0].name);
  if (!/Test Artist/.test(a)) throw new Error(a);
});

await step("navigation: every view mounts", async () => {
  for (const [l, text] of [["Listen", "Lyrics"], ["Library", "Library"], ["Search", "Online"], ["Sound", "Sound"], ["Studio", "Make it yours"]]) {
    await nav(l);
    await page.waitForSelector(`text=${text}`, { timeout: 5000 });
  }
  await page.evaluate(() => window.__fluxStore.setState({ view: "settings" }));
  await page.waitForSelector("text=Analyse tracks for exact beats");
});

await step("Sound: FX preset applies to the audio graph", async () => {
  await nav("Sound");
  await page.click("button:has-text('SLOWED+REVERB')");
  const fx = await S(() => window.__fluxStore.getState().fx);
  if (Math.abs(fx.speed - 0.8) > 0.001) throw new Error(`speed ${fx.speed}`);
  await page.click("button:has-text('CLEAN')");
});

await step("Sound: deck renders cues", async () => {
  await page.click("button[role=radio]:has-text('Deck')");
  await page.waitForSelector("text=HOT CUES", { timeout: 5000 });
});

await step("stage opens, modes switch, Escape leaves", async () => {
  await page.keyboard.press("v");
  await page.waitForSelector("[role=dialog][aria-label=Stage]");
  await page.click("button[aria-label='Next mode']");
  await page.waitForFunction(() => window.__fluxStore.getState().look.style.mode === "signal");
  await page.waitForFunction(() => window.__fluxStage.mode === "signal");
  const err = await S(() => window.__fluxStage.error);
  if (err) throw new Error(err);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog][aria-label=Stage]", { state: "detached" });
});

await step("every mode renders without error", async () => {
  for (const m of ["veil", "ink", "caustic", "orbit", "signal", "ridge", "words"]) {
    await S((m) => window.__fluxStore.getState().setLook("style", { mode: m }), m);
    await page.waitForFunction((m) => window.__fluxStage.mode === m, m, { timeout: 5000 });
    await page.waitForTimeout(150);
  }
  const err = await S(() => window.__fluxStage.error);
  if (err) throw new Error(err);
});

await step("Studio: apply, save, rename, duplicate and delete a look", async () => {
  await nav("Studio");
  await page.click("button[aria-label='Apply look: Pool Light']");
  await page.waitForFunction(() => window.__fluxStore.getState().look.style.mode === "caustic");
  await S(() => window.__fluxStore.getState().setLook("motion", { speed: 1.4 }));
  await page.click("button:has-text('Save as look')");
  await page.fill("input[aria-label='Look name']", "Smoke look");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Smoke look");
  const id = await S(() => window.__fluxStore.getState().lookPresets.find((p) => p.name === "Smoke look").id);
  await S((id) => window.__fluxStore.getState().renameLookPreset(id, "Renamed look"), id);
  await page.waitForSelector("text=Renamed look");
  await S((id) => { const s = window.__fluxStore.getState(); s.duplicateLookPreset(s.lookPresets.find((p) => p.id === id)); }, id);
  await page.waitForSelector("text=Renamed look copy");
  await S((id) => window.__fluxStore.getState().deleteLookPreset(id), id);
  await page.waitForSelector("text=Renamed look copy");
  const n = await S(() => window.__fluxStore.getState().lookPresets.length);
  if (n !== 2) throw new Error(`${n} presets`);
});

await step("Studio: section resets restore defaults", async () => {
  await page.click("button[role=radio]:has-text('Motion')");
  await page.click("button[aria-label='Reset scene motion']");
  const sp = await S(() => window.__fluxStore.getState().look.motion.speed);
  if (sp !== 1) throw new Error(`speed ${sp}`);
});

await step("lyrics: word-timed lines render and follow the clock", async () => {
  await S(() => {
    const st = window.__fluxStore.getState();
    const lrc = "[00:00.50]<00:00.50>one <00:01.00>two <00:01.50>three\n[00:03.00]<00:03.00>four <00:03.50>five";
    st.updateTrack(st.playlists[0].tracks[0].id, { lyrics: window.__fluxLyrics.parseLrc(lrc), lyricsTimed: true });
    window.__fluxStore.setState({ view: "listen", listenPane: "lyrics" });
    window.__fluxEngine.audio.currentTime = 3.6;
  });
  await page.waitForFunction(() => document.querySelector(".lyric-line[data-state=active]")?.textContent?.includes("five"), null, { timeout: 5000 });
  const words = await page.$$eval(".lyric-word", (els) => els.length);
  if (words !== 5) throw new Error(`${words} word spans`);
});

await step("Settings: recorder saves a take", async () => {
  await page.evaluate(() => window.__fluxStore.setState({ view: "settings" }));
  await page.click("button:has-text('START RECORDING')");
  await page.waitForTimeout(1500);
  await page.click("button:has-text('STOP & SAVE TAKE')");
  await page.waitForSelector("text=flux-take-1", { timeout: 5000 });
});

await step("offline export: WAV take appears", async () => {
  await page.click("button:has-text('EXPORT WAV')");
  await page.waitForSelector("text=[FLUX].wav", { timeout: 30000 });
});

await step("shortcuts panel via ?", async () => {
  await page.keyboard.press("Shift+Slash");
  await page.waitForSelector("text=KEYBOARD SHORTCUTS");
  await page.keyboard.press("Escape");
});

await step("state persists across reload", async () => {
  await page.waitForTimeout(1800); // persistence is debounced
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("nav[aria-label=Main]", { timeout: 8000 });
  const s = await S(() => {
    const st = window.__fluxStore.getState();
    return { n: st.playlists[0].tracks.length, presets: st.lookPresets.length, takes: st.takes.length, lyrics: st.playlists[0].tracks[0]?.lyrics?.length };
  });
  // presets: the migrated one plus the renamed one (its copy was deleted)
  if (s.n !== 1 || s.presets !== 2 || s.takes < 1 || s.lyrics !== 2) throw new Error(JSON.stringify(s));
});

await step("track playable from persisted blob after reload", async () => {
  await S(() => window.__fluxStore.setState({ view: "listen" }));
  await page.click("button[aria-label=Play]");
  await page.waitForFunction(() => window.__fluxClock.media() > 0.5, null, { timeout: 8000 });
});

const realErrors = errors.filter((e) => !e.includes("favicon") && !e.includes("Failed to load resource"));
if (realErrors.length) {
  console.log("\nPage errors:");
  for (const e of realErrors) console.log("  " + e);
  process.exitCode = 1;
}
await browser.close();
preview.kill();
console.log(process.exitCode ? "\nSMOKE FAILED" : "\nSMOKE OK");
