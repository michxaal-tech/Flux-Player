// The deep analysis, end to end, against audio whose beats are known.
//
// scripts/deepbeats-check.mjs tests the tracker against synthetic envelopes.
// This runs the whole path — decode, FFT, onset, tempo, tracking, verification
// — in the real app on real WAV audio, and asks the only question that matters:
// are the beats it reports where the kicks actually are, and is it better than
// the fast pass it costs more than?
//
// A mode that is slower and not measurably better is not worth shipping, so
// that comparison is the test rather than a footnote.
//
// Usage: npm run build && node scripts/deep-analyze-check.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 4203;
const BASE = `http://localhost:${PORT}`;

/**
 * A track with kicks at known times. `drift` accelerates it, which is the case
 * a single-tempo grid cannot represent however well it detects the tempo.
 */
function makeWav(path, { secs = 70, bpm = 120, drift = 0 } = {}) {
  const rate = 44100;
  const n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);

  const beats = [];
  let t = 0.6;
  let gap = 60 / bpm;
  while (t < secs - 1) { beats.push(t); gap *= 1 - drift; t += gap; }

  const samples = new Float32Array(n);
  for (const bt of beats) {
    const start = Math.round(bt * rate);
    // kick: a short pitch-swept sine, which is what an onset detector sees
    for (let i = 0; i < rate * 0.18 && start + i < n; i++) {
      const x = i / rate;
      const env = Math.exp(-26 * x);
      const f = 130 * Math.exp(-24 * x) + 45;
      samples[start + i] += Math.sin(2 * Math.PI * f * x) * env * 0.95;
    }
    // Hat on the off-beat, so there is off-grid energy to be misled by — and
    // high-passed, because plain white noise is not a hi-hat. It carries as
    // much energy below 250Hz as above it, which makes it a kick as far as any
    // low-band detector is concerned, and that is the detector's problem to
    // survive rather than a property of hi-hats.
    const off = Math.round((bt + gap / 2) * rate);
    let prev = 0;
    for (let i = 0; i < rate * 0.03 && off + i < n; i++) {
      const x = i / rate;
      const w = Math.random() * 2 - 1;
      // a difference filter: a crude but real high-pass
      const hp = w - prev;
      prev = w;
      samples[off + i] += hp * Math.exp(-90 * x) * 0.3;
    }
  }
  // a pad, so the track is not only percussion
  for (let i = 0; i < n; i++) {
    const x = i / rate;
    samples[i] += (Math.sin(2 * Math.PI * 220 * x) + Math.sin(2 * Math.PI * 330 * x)) * 0.06;
  }
  let off2 = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767 * 0.9), off2);
    off2 += 2;
  }
  writeFileSync(path, buf);
  return beats;
}

const dir = mkdtempSync(join(tmpdir(), "flux-deep-"));
const steadyPath = join(dir, "steadytrk.wav");
const driftPath = join(dir, "drifttrk.wav");
const steadyBeats = makeWav(steadyPath, { bpm: 128 });
const driftBeats = makeWav(driftPath, { bpm: 120, drift: 0.0016 });

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

await page.goto(BASE, { waitUntil: "networkidle" });

/**
 * Runs an analysis in the page and returns the result.
 *
 * Through the app's own debug handle rather than by importing its modules: the
 * preview server serves a built bundle, and running this against the dev
 * server instead would be testing a different build from the one that ships.
 */
async function analyse(page, file, name, deep) {
  await page.click("button:has(div:text-is('LIBRARY'))");
  await page.setInputFiles("input[type=file]", file);
  await page.waitForSelector(`text=${name}`, { timeout: 10000 });
  await page.click(`span:text-is('${name}')`);
  await page.waitForTimeout(700);
  return page.evaluate(async (deep) => {
    const a = await window.__fluxAnalyse(deep);
    return a && { beats: a.beats, bpm: a.bpm, deep: a.deep ?? null };
  }, deep);
}

/** ms error of each true beat against the nearest reported one. */
function errors(got, want, tol = 0.3) {
  const errs = [];
  for (const t of want) {
    let best = Infinity;
    for (const g of got) {
      const d = Math.abs(g - t);
      if (d < best) best = d;
    }
    if (best <= tol) errs.push(best * 1000);
  }
  errs.sort((a, b) => a - b);
  return {
    matched: errs.length,
    median: errs.length ? errs[errs.length >> 1] : Infinity,
    p90: errs.length ? errs[Math.floor(errs.length * 0.9)] : Infinity,
    worst: errs.length ? errs[errs.length - 1] : Infinity,
  };
}

console.log("\na steady 128bpm track");
{
  const fast = await analyse(page, steadyPath, "steadytrk", false);
  const deep = await analyse(page, steadyPath, "steadytrk", true);
  check("both analyse it", !!fast && !!deep);
  if (fast && deep) {
    const f = errors(fast.beats, steadyBeats);
    const d = errors(deep.beats, steadyBeats);
    console.log(`    fast: ${f.matched}/${steadyBeats.length} beats, median ${f.median.toFixed(1)}ms, worst ${f.worst.toFixed(1)}ms`);
    console.log(`    deep: ${d.matched}/${steadyBeats.length} beats, median ${d.median.toFixed(1)}ms, worst ${d.worst.toFixed(1)}ms`);
    check("deep finds the tempo", Math.abs(deep.bpm - 128) < 2, `${deep.bpm}bpm`);
    check("deep finds nearly every beat", d.matched >= steadyBeats.length * 0.95, `${d.matched}/${steadyBeats.length}`);
    check("deep lands within 25ms typical", d.median < 25, `median ${d.median.toFixed(1)}ms`);
    check("and is at least as tight as the fast pass", d.median <= f.median + 3, `${d.median.toFixed(1)}ms vs ${f.median.toFixed(1)}ms`);
    check(
      "it reports a confidence",
      deep.deep && deep.deep.confidence > 0.6,
      deep.deep
        ? `${Math.round(deep.deep.confidence * 100)}% — agree ${deep.deep.agree}, steady ${deep.deep.steady}, strength ${deep.deep.strength}, found ${deep.deep.found.join("/")}, offset ${deep.deep.offsetMs}ms`
        : "none"
    );
  }
}

console.log("\na track that accelerates — where a single grid cannot win");
{
  const fast = await analyse(page, driftPath, "drifttrk", false);
  const deep = await analyse(page, driftPath, "drifttrk", true);
  if (fast && deep) {
    const f = errors(fast.beats, driftBeats);
    const d = errors(deep.beats, driftBeats);
    console.log(`    fast: ${f.matched}/${driftBeats.length} beats, median ${f.median.toFixed(1)}ms, p90 ${f.p90.toFixed(1)}ms`);
    console.log(`    deep: ${d.matched}/${driftBeats.length} beats, median ${d.median.toFixed(1)}ms, p90 ${d.p90.toFixed(1)}ms`);
    check("deep tracks the whole track", d.matched >= driftBeats.length * 0.9, `${d.matched}/${driftBeats.length}`);
    check("and is clearly better than the fast pass", d.p90 < f.p90 * 0.6, `p90 ${d.p90.toFixed(0)}ms vs ${f.p90.toFixed(0)}ms`);
    check("it notices the tempo moving", !!deep.deep && Math.max(...deep.deep.tempoCurve) - Math.min(...deep.deep.tempoCurve) > 3,
      deep.deep ? `${Math.min(...deep.deep.tempoCurve).toFixed(0)}–${Math.max(...deep.deep.tempoCurve).toFixed(0)}bpm` : "");
  }
}

await browser.close();
preview.kill();
console.log(failed ? `\n${failed} check(s) failed\n` : "\ndeep analysis ok\n");
process.exit(failed ? 1 : 0);
