// Synchronisation check: plays real audio through the built app and measures
// whether beats and lyrics land where they should on the shared clock.
//
// Usage: npm run build && npm run sync
//
// Generates a 40s, 120bpm track whose kicks are at known times (every 0.5s
// from 8s to 32s, nothing before 8s) and a beatless track (noise bursts at
// random times), then checks:
//   1. beats fire on the kicks — every onBeat's audible time against the
//      nearest kick, median and 90th-percentile error;
//   2. no beats are reported in the beatless intro or for the beatless track
//      (confidence stays below the lock threshold);
//   3. seeking never fires a burst of the beats in between;
//   4. pause stops beats and the clock; resume continues on the same grid;
//   5. at 1.25× playback, beats still land on the kicks (media time);
//   6. a track change and repeat-one bump the clock epoch and restart cleanly;
//   7. the active lyric line matches the clock after seeks.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4183;
const dir = mkdtempSync(join(tmpdir(), "flux-sync-"));

function wav(path, secs, fill) {
  const rate = 44100, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, fill(i / rate))) * 32767 * 0.85);
    buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4);
  }
  writeFileSync(path, buf);
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const KICKS = [];
for (let t = 8; t < 32 - 1e-9; t += 0.5) KICKS.push(+t.toFixed(3));
const beatTrack = join(dir, "Sync Test - Kicks 120.wav");
wav(beatTrack, 40, (t) => {
  let s = Math.sin(2 * Math.PI * 220 * t) * 0.04;
  if (t >= 8 && t < 32) {
    const tb = t % 0.5;
    s += Math.exp(-tb * 18) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-tb * 30)) * tb) * 0.8;
    const th = (t + 0.25) % 0.5;
    s += Math.exp(-th * 60) * rnd() * 0.15;
  }
  return s;
});
const bursts = Array.from({ length: 40 }, () => 2 + Math.random() * 26).sort((a, b) => a - b);
const freeTrack = join(dir, "Sync Test - No Pulse.wav");
wav(freeTrack, 30, (t) => {
  let s = Math.sin(2 * Math.PI * 180 * t + Math.sin(t * 0.7) * 3) * 0.08;
  for (const b of bursts) { const d = t - b; if (d >= 0 && d < 0.3) s += Math.exp(-d * 12) * rnd() * 0.5; }
  return s;
});

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
await page.addInitScript(() => {
  // skip the intro, and keep the stage off: this measures timing, not pixels
  localStorage.setItem("flux-store", JSON.stringify({ state: { introSeen: true, ui: { theme: "ink", accent: "artwork", motion: "minimal", backdrop: 0 } }, version: 3 }));
});
await page.goto(`http://localhost:${PORT}`, { waitUntil: "load" });

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { failed++; process.exitCode = 1; }
};

await page.waitForSelector("button:has-text('Add music')");
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Add music')")]);
await chooser.setFiles([beatTrack, freeTrack]);

// wait for the analysis timeline to land for track 1
await page.waitForFunction(() => window.__fluxSig?.tempoSource === "analysis", null, { timeout: 30000 });
await page.evaluate(() => { window.__fluxEngine.audio.currentTime = 0; });

/** Record onBeat events (audible time) and other samples for `ms`. */
const record = (ms) => page.evaluate((ms) => new Promise((resolve) => {
  const beats = [], epochs = new Set(), confs = [];
  const t0 = performance.now();
  const loop = () => {
    const s = window.__fluxSig;
    if (s.onBeat) beats.push(+s.t.toFixed(4));
    epochs.add(window.__fluxClock.epoch);
    confs.push(s.confidence);
    if (performance.now() - t0 < ms) requestAnimationFrame(loop);
    else resolve({ beats, epochs: [...epochs], conf: confs.reduce((a, b) => a + b, 0) / confs.length, t: s.t });
  };
  requestAnimationFrame(loop);
}), ms);
const nearest = (t) => KICKS.reduce((b, k) => (Math.abs(k - t) < Math.abs(b - t) ? k : b), KICKS[0]);
const errStats = (beats) => {
  const errs = beats.map((t) => Math.abs(t - nearest(t)) * 1000).sort((a, b) => a - b);
  return { n: errs.length, med: errs[errs.length >> 1] ?? NaN, p90: errs[Math.floor(errs.length * 0.9)] ?? NaN };
};

// 1+2. intro (no kicks) then the groove
{
  const r = await record(7000);
  const intro = r.beats.filter((t) => t < 7.6);
  check("no beats reported in the beatless intro", intro.length === 0, `${intro.length} reported`);
  await page.evaluate(() => { window.__fluxEngine.audio.currentTime = 10; });
  const g = await record(6000);
  const st = errStats(g.beats.filter((t) => t > 10.2));
  // expected ≈ 11 beats in 6s; allow frame-quantised detection
  check("beats fire on the kicks", st.n >= 9 && st.med < 25 && st.p90 < 45, `${st.n} beats, median ${st.med.toFixed(1)}ms, p90 ${st.p90.toFixed(1)}ms`);
  check("beat confidence is high on a steady pulse", g.conf > 0.7, `mean ${g.conf.toFixed(2)}`);
}

// 3. seeking fires no burst
{
  const before = await page.evaluate(() => window.__fluxClock.epoch);
  const r = await page.evaluate(() => new Promise((resolve) => {
    window.__fluxEngine.audio.currentTime = 25.1;
    const fired = [];
    let n = 0;
    const loop = () => {
      if (window.__fluxSig.onBeat) fired.push(+window.__fluxSig.t.toFixed(3));
      if (++n < 12) requestAnimationFrame(loop); else resolve(fired);
    };
    requestAnimationFrame(loop);
  }));
  const after = await page.evaluate(() => window.__fluxClock.epoch);
  check("seek bumps the clock epoch", after > before);
  check("seek fires no burst of skipped beats", r.length <= 1, `${r.length} beats in the first frames after a 15s jump`);
  const g = await record(2500);
  const st = errStats(g.beats);
  check("beats resume on the grid after a seek", st.n >= 3 && st.p90 < 45, `${st.n} beats, p90 ${st.p90.toFixed(1)}ms`);
}

// 4. pause / resume
{
  await page.evaluate(() => { window.__fluxEngine.audio.currentTime = 14; });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__fluxEngine.audio.pause());
  const t1 = await page.evaluate(() => window.__fluxClock.audible());
  const p = await record(1500);
  const t2 = await page.evaluate(() => window.__fluxClock.audible());
  check("paused: no beats and the clock holds still", p.beats.length === 0 && Math.abs(t2 - t1) < 0.02, `${p.beats.length} beats, clock moved ${((t2 - t1) * 1000).toFixed(1)}ms`);
  await page.evaluate(() => window.__fluxEngine.audio.play());
  const r = await record(3000);
  const st = errStats(r.beats);
  check("resume continues on the same grid", st.n >= 4 && st.p90 < 45, `${st.n} beats, p90 ${st.p90.toFixed(1)}ms`);
}

// 5. playback rate
{
  await page.evaluate(() => { window.__fluxStore.getState().setFxKey("speed", 1.25); window.__fluxEngine.audio.currentTime = 12; });
  await page.waitForTimeout(400);
  const r = await record(4000);
  const st = errStats(r.beats);
  const wall = r.beats.length > 1 ? (4 / r.beats.length) : 0;
  check("at 1.25× beats still land on the kicks", st.n >= 7 && st.p90 < 50, `${st.n} beats in 4s wall (expect ≈10), p90 ${st.p90.toFixed(1)}ms`);
  void wall;
  await page.evaluate(() => window.__fluxStore.getState().setFxKey("speed", 1));
}

// 7. lyrics follow the clock after seeks
{
  await page.evaluate(() => {
    const st = window.__fluxStore.getState();
    const lrc = "[00:09.00]First line\n[00:12.00]Second line\n[00:15.00]Third line\n[00:24.00]Fourth line";
    st.updateTrack(st.playlists[0].tracks[0].id, { lyrics: window.__fluxLyrics.parseLrc(lrc), lyricsTimed: true });
    window.__fluxStore.setState({ view: "listen", listenPane: "lyrics" });
  });
  for (const [t, want] of [[12.6, "Second line"], [9.4, "First line"], [24.5, "Fourth line"]]) {
    await page.evaluate((t) => { window.__fluxEngine.audio.currentTime = t; }, t);
    await page.waitForTimeout(700);
    const got = await page.evaluate(() => document.querySelector(".lyric-line[data-state=active]")?.textContent?.trim() ?? "");
    check(`lyric at ${t}s is “${want}”`, got === want, got ? `showing “${got}”` : "no active line");
  }
  await page.evaluate(() => { window.__fluxEngine.audio.currentTime = 20; });
  await page.waitForTimeout(700);
  const gap = await page.evaluate(() => document.querySelector(".lyric-gap")?.getAttribute("data-show"));
  check("instrumental gap (15s→24s) shows the countdown", gap === "1");
}

// 6. track change + repeat one
{
  const e0 = await page.evaluate(() => window.__fluxClock.epoch);
  await page.evaluate(() => window.__fluxPlayAt(window.__fluxStore.getState().playPl, 1));
  await page.waitForFunction(() => window.__fluxStore.getState().current === 1);
  await page.waitForTimeout(600);
  const e1 = await page.evaluate(() => window.__fluxClock.epoch);
  check("track change bumps the clock epoch", e1 > e0);
  await page.waitForFunction(() => window.__fluxSig.tempoSource === "analysis", null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { window.__fluxEngine.audio.currentTime = 4; });
  const r = await record(8000);
  const conf = await page.evaluate(() => window.__fluxSig.confidence);
  check("beatless track: confidence stays below the lock threshold", conf < 0.45 && r.conf < 0.45, `confidence ${conf.toFixed(2)} (mean ${r.conf.toFixed(2)})`);
  await page.evaluate(() => { window.__fluxStore.setState({ repeat: "one" }); window.__fluxEngine.audio.currentTime = 29.4; });
  const e2 = await page.evaluate(() => window.__fluxClock.epoch);
  await page.waitForTimeout(1800);
  const s = await page.evaluate(() => ({ cur: window.__fluxStore.getState().current, t: window.__fluxClock.media(), e: window.__fluxClock.epoch }));
  check("repeat-one restarts the same track on a new epoch", s.cur === 1 && s.t < 2 && s.e > e2, `track ${s.cur}, at ${s.t.toFixed(2)}s`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall sync checks passed");
await browser.close();
preview.kill();
