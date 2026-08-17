// Proves the melody transcriber recovers notes it was given.
//
// A synthetic melody with known pitches goes in; the notes that come out are
// compared against it. Pitch tracking is exactly the kind of code that looks
// plausible while being an octave off, so "it produced some notes" is not a
// pass — the actual MIDI numbers have to match.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4197;

// C4 D4 E4 G4 A4 G4 E4 C4, two beats each at 120bpm
const MELODY = [60, 62, 64, 67, 69, 67, 64, 60];
const NOTE_SEC = 0.5;

function makeMelodyWav(path) {
  const rate = 44100, ch = 2;
  const n = Math.round(rate * MELODY.length * NOTE_SEC);
  const dataSize = n * ch * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const idx = Math.min(MELODY.length - 1, Math.floor(t / NOTE_SEC));
    const hz = 440 * Math.pow(2, (MELODY[idx] - 69) / 12);
    const local = t - idx * NOTE_SEC;
    // short fade at each end so note boundaries are clean, and harmonics so it
    // is a plausible voice rather than a pure tone the tracker can cheat on
    const env = Math.min(1, local * 30) * Math.min(1, (NOTE_SEC - local) * 30);
    const v =
      env * (Math.sin(2 * Math.PI * hz * t) * 0.6 +
             Math.sin(2 * Math.PI * hz * 2 * t) * 0.25 +
             Math.sin(2 * Math.PI * hz * 3 * t) * 0.12);
    const s = Math.round(Math.max(-1, Math.min(1, v)) * 32767 * 0.7);
    buf.writeInt16LE(s, off); off += 2;
    buf.writeInt16LE(s, off); off += 2;
  }
  writeFileSync(path, buf);
}

const wav = join(mkdtempSync(join(tmpdir(), "flux-rv-")), "melody test.wav");
makeMelodyWav(wav);

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // the sandbox has no outbound network, so the lyrics auto-search always fails
  // here; that is the environment, not the code under test
  if (m.type() === "error" && !/ERR_CONNECTION_RESET|Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.click("button:has(div:text-is('LIBRARY'))");
await page.setInputFiles("input[type=file]", wav);
await page.waitForSelector("text=melody test", { timeout: 8000 });
await page.click("button:has(div:text-is('PLAYER'))");
await page.waitForTimeout(1200);

let bad = 0;

// transcribe the full mix (no separation needed for a single synthetic voice)
const got = await page.evaluate(async () => {
  const st = window.__fluxStore.getState();
  const tr = st.playlists.flatMap((p) => p.tracks).find((t) => t.name.includes("melody test"));
  if (!tr) return { error: "track not found" };
  const m = await window.__fluxRevoice.transcribe(tr.fileId, "full", { snap: false });
  if (!m) return { error: "transcribe returned null" };
  return { notes: m.notes.map((n) => ({ midi: n.midi, start: +n.start.toFixed(3), dur: +(n.end - n.start).toFixed(3) })), bpm: m.bpm };
});

if (got.error) {
  console.log(`✘ ${got.error}`);
  bad++;
} else {
  const expect = [60, 62, 64, 67, 69, 67, 64, 60];
  // keep only notes long enough to be one of the eight (drops tracking crumbs)
  const solid = got.notes.filter((n) => n.dur > 0.2);
  console.log(`expected: ${expect.join(" ")}`);
  console.log(`got:      ${solid.map((n) => n.midi).join(" ")}   (${got.notes.length} raw, ${solid.length} solid)`);

  if (solid.length !== expect.length) {
    console.log(`✘ wrong note count: ${solid.length} vs ${expect.length}`);
    bad++;
  }
  let wrong = 0, octave = 0;
  for (let i = 0; i < Math.min(solid.length, expect.length); i++) {
    if (solid[i].midi === expect[i]) continue;
    wrong++;
    if (Math.abs(solid[i].midi - expect[i]) % 12 === 0) octave++;
  }
  if (wrong) {
    console.log(`✘ ${wrong} wrong pitches (${octave} of them octave errors)`);
    bad++;
  } else {
    console.log("✔ every pitch recovered exactly");
  }
  // timing: each note starts on its half-second boundary
  const drift = solid.map((n, i) => Math.abs(n.start - i * 0.5));
  const worst = Math.max(...drift);
  console.log(`worst onset drift: ${(worst * 1000).toFixed(0)}ms`);
  if (worst > 0.09) { console.log("✘ onsets drifted more than 90ms"); bad++; }
  else console.log("✔ onsets land on the note boundaries");
}

// the MIDI file must be a real SMF, not just bytes
const midiOk = await page.evaluate(async () => {
  const st = window.__fluxStore.getState();
  const tr = st.playlists.flatMap((p) => p.tracks).find((t) => t.name.includes("melody test"));
  const m = await window.__fluxRevoice.loadMelody(tr.fileId, "full");
  if (!m) return "no cached melody";
  const blob = window.__fluxRevoice.toMidiFile(m.notes, m.bpm);
  const b = new Uint8Array(await blob.arrayBuffer());
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const trk = String.fromCharCode(b[14], b[15], b[16], b[17]);
  return { tag, trk, bytes: b.length };
});
if (typeof midiOk === "string" || midiOk.tag !== "MThd" || midiOk.trk !== "MTrk") {
  console.log(`✘ MIDI file malformed: ${JSON.stringify(midiOk)}`);
  bad++;
} else {
  console.log(`✔ MIDI file well-formed (${midiOk.bytes} bytes, MThd + MTrk)`);
}

// ── the arrangement ──────────────────────────────────────────────────────
// Notes on paper are not sound. This taps the master output while the
// arrangement plays and checks audio actually comes out, and that the drums
// land on the analysed beats rather than on a synthetic click.
const arrCheck = await page.evaluate(async () => {
  const st = window.__fluxStore.getState();
  const tr = st.playlists.flatMap((p) => p.tracks).find((t) => t.name.includes("melody test"));
  const m = await window.__fluxRevoice.loadMelody(tr.fileId, "full");
  if (!m) return { error: "no melody" };
  const A = window.__fluxArrange.arrange(m.notes, m.beats, m.drops, "EDM", { drums: true, bass: true, chords: true });
  const eng = window.__fluxEngine;
  const ctx = eng?.nodes?.ctx;
  if (!ctx) return { error: "no audio context" };
  if (ctx.state === "suspended") await ctx.resume();

  // measure the synth bus in isolation by muting the track itself
  const prevVol = st.volume;
  st.set({ volume: 0 });
  window.__fluxRevoice.setRevoiceLevel(1);

  const tap = ctx.createAnalyser();
  tap.fftSize = 2048;
  eng.nodes.master.connect(tap);
  const buf = new Float32Array(tap.fftSize);

  window.__fluxRevoice.playArrangement(A, "EDM", { lead: 1, bass: 1, chords: 1, drums: 1 }, ctx.currentTime + 0.05, 0, m.bpm);

  let peak = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 2200) {
    tap.getFloatTimeDomainData(buf);
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    await new Promise((r) => setTimeout(r, 30));
  }
  window.__fluxRevoice.stopNotes();
  window.__fluxRevoice.setRevoiceLevel(0);
  st.set({ volume: prevVol });

  // how close each drum hit sits to a real analysed beat
  let worstOff = 0;
  const kicks = A.drums.filter((d) => d.kind === "kick").slice(0, 20);
  for (const k of kicks) {
    let best = Infinity;
    for (const b of m.beats) best = Math.min(best, Math.abs(b - k.t));
    worstOff = Math.max(worstOff, best);
  }
  return {
    peak, key: A.key, drums: A.drums.length, bass: A.bass.length, chords: A.chords.length,
    kicks: kicks.length, worstOff,
  };
});

if (arrCheck.error) {
  console.log(`✘ arrangement: ${arrCheck.error}`);
  bad++;
} else {
  console.log(`\narrangement: ${arrCheck.drums} drum hits, ${arrCheck.bass} bass, ${arrCheck.chords} chord notes`);
  if (!arrCheck.drums || !arrCheck.bass || !arrCheck.chords) { console.log("✘ a part came out empty"); bad++; }
  else console.log("✔ every part built");
  console.log(`peak output from the synth bus: ${arrCheck.peak.toFixed(4)}`);
  if (arrCheck.peak < 0.01) { console.log("✘ the arrangement made no sound"); bad++; }
  else if (arrCheck.peak > 0.99) { console.log("✘ the arrangement is clipping"); bad++; }
  else console.log("✔ audible and not clipping");
  console.log(`worst kick-to-beat offset: ${(arrCheck.worstOff * 1000).toFixed(1)}ms`);
  if (arrCheck.worstOff > 0.002) { console.log("✘ drums are not on the analysed beats"); bad++; }
  else console.log("✔ drums land on the analysed beat grid");
}

// ── REIMAGINE must actually silence the original ─────────────────────────
// The whole complaint that drove this was the original still playing under the
// synth, so it is asserted rather than assumed.
const duckCheck = await page.evaluate(async () => {
  const st = window.__fluxStore.getState();
  const el = window.__fluxEngine.audio;
  st.set({ volume: 0.8, revoiceDuck: 1 });
  await new Promise((r) => setTimeout(r, 120));
  const layered = el.volume;
  st.set({ revoiceDuck: 0 });
  await new Promise((r) => setTimeout(r, 120));
  const replaced = el.volume;
  st.set({ revoiceDuck: 1 });
  return { layered, replaced };
});
console.log(`\noriginal level — layer: ${duckCheck.layered.toFixed(2)}, reimagine: ${duckCheck.replaced.toFixed(2)}`);
if (duckCheck.layered < 0.5) { console.log("✘ layering does not pass the original through"); bad++; }
else if (duckCheck.replaced > 0.001) { console.log("✘ REIMAGINE leaves the original audible"); bad++; }
else console.log("✔ REIMAGINE silences the original, LAYER passes it through");

// ── every voice must actually produce sound ──────────────────────────────
// FM and the string model are different synthesis paths; a wrong connection in
// either would leave a patch silent while everything still looked fine.
const voiceCheck = await page.evaluate(async () => {
  const eng = window.__fluxEngine;
  const ctx = eng?.nodes?.ctx;
  if (!ctx) return { error: "no ctx" };
  if (ctx.state === "suspended") await ctx.resume();
  const names = Object.keys(window.__fluxInstruments.VOICES);
  const out = {};
  for (const name of names) {
    const tap = ctx.createAnalyser();
    tap.fftSize = 2048;
    const sink = ctx.createGain();
    sink.gain.value = 0;             // measured, not heard
    const bus = window.__fluxInstruments.makeBus(ctx, sink, 120);
    sink.connect(ctx.destination);
    bus.out.connect(tap);
    const buf = new Float32Array(tap.fftSize);
    window.__fluxInstruments.playVoice(bus, window.__fluxInstruments.VOICES[name], 64, ctx.currentTime + 0.02, ctx.currentTime + 0.5, 1, 1);
    let peak = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 420) {
      tap.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      await new Promise((r) => setTimeout(r, 25));
    }
    out[name] = +peak.toFixed(4);
  }
  return out;
});
if (voiceCheck.error) { console.log(`✘ voices: ${voiceCheck.error}`); bad++; }
else {
  const silent = Object.entries(voiceCheck).filter(([, p]) => p < 0.005).map(([n]) => n);
  const names = Object.keys(voiceCheck);
  console.log(`\n${names.length} voices tested:`);
  for (const [n, p] of Object.entries(voiceCheck).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${n.padEnd(14)} ${p}`);
  }
  if (silent.length) { console.log(`✘ silent voices: ${silent.join(", ")}`); bad++; }
  else console.log("✔ every voice produces sound");
  // a voice far above the others is a runaway, not a loud patch
  const hot = Object.entries(voiceCheck).filter(([, p]) => p > 2).map(([n, p]) => `${n} (${p})`);
  if (hot.length) { console.log(`✘ runaway gain: ${hot.join(", ")}`); bad++; }
  else console.log("✔ no voice runs away");
}

if (errors.length) {
  console.log(`✘ page errors: ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
  bad++;
}
console.log(`\n${bad === 0 ? "✔ all clear" : `✘ ${bad} problems`}`);
process.exitCode = bad ? 1 : 0;

await browser.close();
preview.kill();
