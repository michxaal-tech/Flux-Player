// Re-voicing: play a transcribed melody back with a different sound.
//
// This is the second half of the "flip" workflow. transcribeWorker turns audio
// into notes; this turns notes back into audio through a synth you choose, so a
// piano-and-vocal track can come back as an EDM lead playing the same melody.
//
// Also writes a Standard MIDI File, because the most useful thing FLUX can do
// here is hand the notes to a real DAW. The patches below are good enough to
// audition an idea; they are not pretending to compete with a soft synth you
// already own.
import { engine } from "./engine";
import { blobStore, getUrl } from "../store/blobStore";
import { useStore } from "../store/useStore";
import type { Note, TranscribeResult } from "./transcribeWorker";

export type { Note };

/** Synth voices. Each is a small Web Audio graph, not a sample library. */
export const PATCHES = [
  "SUPERSAW", "PLUCK", "SQUARE LEAD", "BELL", "SUB", "ORGAN", "CHIP",
] as const;
export type Patch = (typeof PATCHES)[number];

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface PatchSpec {
  /** oscillators per voice, each an offset in cents */
  detune: number[];
  type: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** filter cutoff as a multiple of the note's own frequency */
  cutoffMul: number;
  q: number;
  /** how far the filter opens over the note's attack */
  envAmt: number;
  gain: number;
  /** add a square an octave below, for weight */
  subOsc?: boolean;
}

const SPECS: Record<Patch, PatchSpec> = {
  // seven detuned saws — the classic wide festival lead
  SUPERSAW: { detune: [-14, -9, -4, 0, 4, 9, 14], type: "sawtooth", attack: 0.012, decay: 0.18, sustain: 0.72, release: 0.22, cutoffMul: 7, q: 3, envAmt: 5, gain: 0.1, subOsc: true },
  PLUCK: { detune: [-6, 0, 6], type: "sawtooth", attack: 0.002, decay: 0.16, sustain: 0.06, release: 0.12, cutoffMul: 9, q: 6, envAmt: 9, gain: 0.2 },
  "SQUARE LEAD": { detune: [-5, 0, 5], type: "square", attack: 0.006, decay: 0.12, sustain: 0.6, release: 0.14, cutoffMul: 6, q: 2, envAmt: 4, gain: 0.14 },
  BELL: { detune: [0, 1200, 1902], type: "sine", attack: 0.004, decay: 0.9, sustain: 0.02, release: 0.5, cutoffMul: 20, q: 0.7, envAmt: 1, gain: 0.22 },
  SUB: { detune: [0, -1200], type: "sine", attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.18, cutoffMul: 4, q: 1, envAmt: 2, gain: 0.32 },
  ORGAN: { detune: [0, 1200, 1902, 2400], type: "sine", attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.1, cutoffMul: 14, q: 0.8, envAmt: 1, gain: 0.13 },
  CHIP: { detune: [0], type: "square", attack: 0.001, decay: 0.05, sustain: 0.5, release: 0.05, cutoffMul: 30, q: 0.5, envAmt: 1, gain: 0.2 },
};

let scheduled: { stop: () => void } | null = null;
let outGain: GainNode | null = null;

/** The engine's AudioContext, or null before playback has started it. */
function ctx(): AudioContext | null {
  return engine.nodes?.ctx ?? null;
}

/**
 * Where the synth joins the graph: straight into the master bus, *after* the FX
 * chain. Feeding it in earlier would pitch the melody with tape speed and let
 * the vocal-cut filter — which exists to remove the original vocal — chew the
 * synth that replaced it.
 */
function output(): GainNode | null {
  const ac = ctx();
  if (!ac) return null;
  if (!outGain) {
    outGain = ac.createGain();
    outGain.gain.value = 0;
    outGain.connect(engine.nodes?.master ?? ac.destination);
  }
  return outGain;
}

/** 0..1 — how loud the re-voiced melody sits against the track. */
export function setRevoiceLevel(v: number): void {
  const g = output();
  const ac = ctx();
  if (!g || !ac) return;
  g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ac.currentTime, 0.05);
}

/** Schedules every note relative to `startAt` (audio-clock seconds). */
export function playNotes(notes: Note[], patch: Patch, startAt: number, fromSec: number): void {
  stopNotes();
  const ac = ctx();
  const out = output();
  if (!ac || !out) return;
  const spec = SPECS[patch] ?? SPECS.SUPERSAW;
  const live: OscillatorNode[] = [];

  for (const n of notes) {
    if (n.end < fromSec) continue;               // already gone by
    const t0 = startAt + (n.start - fromSec);
    if (t0 > ac.currentTime + 30) break;         // schedule a window, not the file
    const t1 = startAt + (n.end - fromSec);
    if (t1 <= ac.currentTime) continue;
    const hz = midiToHz(n.midi);

    const vca = ac.createGain();
    const filt = ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = spec.q;
    const base = Math.min(16000, hz * spec.cutoffMul);
    filt.frequency.setValueAtTime(Math.min(16000, base * spec.envAmt), Math.max(t0, ac.currentTime));
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, base), Math.max(t0, ac.currentTime) + spec.decay + 0.001);

    const peak = spec.gain * n.vel;
    const a = Math.max(t0, ac.currentTime);
    vca.gain.setValueAtTime(0.0001, a);
    vca.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), a + spec.attack);
    vca.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * spec.sustain), a + spec.attack + spec.decay);
    vca.gain.setTargetAtTime(0.0001, Math.max(a, t1), spec.release / 3);

    filt.connect(vca);
    vca.connect(out);

    for (const cents of spec.detune) {
      const o = ac.createOscillator();
      o.type = spec.type;
      o.frequency.value = hz;
      o.detune.value = cents;
      o.connect(filt);
      o.start(a);
      o.stop(t1 + spec.release + 0.05);
      live.push(o);
    }
    if (spec.subOsc) {
      const o = ac.createOscillator();
      o.type = "square";
      o.frequency.value = hz / 2;
      const sg = ac.createGain();
      sg.gain.value = 0.35;
      o.connect(sg);
      sg.connect(filt);
      o.start(a);
      o.stop(t1 + spec.release + 0.05);
      live.push(o);
    }
  }

  scheduled = {
    stop: () => {
      for (const o of live) {
        try { o.stop(); } catch { /* already stopped */ }
      }
    },
  };
}

export function stopNotes(): void {
  scheduled?.stop();
  scheduled = null;
}

// ── Standard MIDI File ───────────────────────────────────────────────────
// Format 0, one track, 480 ticks per quarter. Written by hand because the whole
// file is a few hundred bytes and pulling in a library for it would be silly.

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

/** Serialises notes to a .mid file at the given tempo. */
export function toMidiFile(notes: Note[], bpm: number): Blob {
  const TPQ = 480;
  const secPerTick = 60 / (bpm || 120) / TPQ;

  // note on/off events, sorted by time, then delta-encoded
  const evs: { t: number; on: boolean; midi: number; vel: number }[] = [];
  for (const n of notes) {
    evs.push({ t: n.start, on: true, midi: n.midi, vel: n.vel });
    evs.push({ t: n.end, on: false, midi: n.midi, vel: 0 });
  }
  // note-offs before note-ons at the same instant, so a repeated pitch retriggers
  evs.sort((a, b) => a.t - b.t || (a.on === b.on ? 0 : a.on ? 1 : -1));

  const bytes: number[] = [];
  // tempo meta
  const usPerQuarter = Math.round(60000000 / (bpm || 120));
  bytes.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);

  let prevTick = 0;
  for (const e of evs) {
    const tick = Math.max(0, Math.round(e.t / secPerTick));
    bytes.push(...vlq(Math.max(0, tick - prevTick)));
    prevTick = tick;
    bytes.push(e.on ? 0x90 : 0x80, Math.max(0, Math.min(127, e.midi)), e.on ? Math.max(1, Math.min(127, Math.round(e.vel * 127))) : 0);
  }
  bytes.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const head = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 0xff, TPQ & 0xff,
  ];
  const len = bytes.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...bytes];
  return new Blob([new Uint8Array([...head, ...trk])], { type: "audio/midi" });
}

// ── driving the transcription ────────────────────────────────────────────

const KEY = (fileId: string, src: string) => `melody-${src}-${fileId}`;

export interface Melody extends TranscribeResult {
  bpm: number;
}

/**
 * Transcribes a track (or its separated vocal) to notes.
 *
 * `source` picks what gets analysed: the vocal stem gives the sung melody and
 * is by far the most accurate, since the tracker assumes one voice at a time.
 */
export async function transcribe(
  fileId: string,
  source: "vocals" | "full" | "instrumental",
  opts: { snap: boolean; scale?: number[] },
): Promise<Melody | null> {
  const set = (melodyStatus: string) => useStore.setState({ melodyStatus });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();

  /** decode a stored blob down to mono */
  const decodeMono = async (key: string): Promise<Float32Array | null> => {
    const url = await getUrl(key);
    if (!url) return null;
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    let audio: AudioBuffer;
    try {
      audio = await ac.decodeAudioData(buf.slice(0));
    } catch {
      return null;
    }
    const n = audio.length;
    const out = new Float32Array(n);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const d = audio.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += d[i];
    }
    if (audio.numberOfChannels > 1) for (let i = 0; i < n; i++) out[i] /= audio.numberOfChannels;
    (out as unknown as { rate?: number }).rate = audio.sampleRate;
    return out;
  };

  set("decoding…");
  let mono: Float32Array | null;
  if (source === "vocals") {
    // The separator only stores the instrumental, so the vocal is recovered by
    // subtracting it from the original. Both are renders of the same file at
    // the same rate, so they line up sample for sample — no alignment needed.
    const [full, inst] = await Promise.all([decodeMono(fileId), decodeMono(`inst-${fileId}`)]);
    if (!full || !inst) {
      ac.close();
      set("No separated vocal yet — run MAKE INSTRUMENTAL on the player tab first, then come back.");
      setTimeout(() => set(""), 9000);
      return null;
    }
    const n = Math.min(full.length, inst.length);
    mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = full[i] - inst[i];
  } else {
    mono = await decodeMono(source === "instrumental" ? `inst-${fileId}` : fileId);
  }
  if (!mono) {
    ac.close();
    set(source === "instrumental" ? "No instrumental yet — run MAKE INSTRUMENTAL first." : "Couldn't decode that audio.");
    setTimeout(() => set(""), 7000);
    return null;
  }
  const rate = (mono as unknown as { rate?: number }).rate ?? ac.sampleRate;
  ac.close();

  // reuse the beat grid the visualiser analyser already built, so snapping
  // lines up with the same beats everything else in the app is using
  const { ensureAnalysis } = await import("./analysis");
  const anal = await ensureAnalysis(fileId);

  set("finding the melody… 0%");
  const worker = new Worker(new URL("./transcribeWorker.ts", import.meta.url), { type: "module" });
  const result = await new Promise<TranscribeResult | null>((resolve) => {
    worker.onmessage = (e: MessageEvent<{ type: string; value?: number; result?: TranscribeResult }>) => {
      const d = e.data;
      if (d.type === "progress") set(`finding the melody… ${Math.round((d.value ?? 0) * 100)}%`);
      else if (d.type === "done") resolve(d.result ?? null);
      else resolve(null);
    };
    worker.onerror = () => resolve(null);
    worker.postMessage({ mono: mono.buffer, rate, beats: anal?.beats ?? [], snap: opts.snap, scale: opts.scale }, [mono.buffer]);
  });
  worker.terminate();
  if (!result) {
    set("Transcription failed.");
    setTimeout(() => set(""), 5000);
    return null;
  }

  const melody: Melody = { ...result, bpm: anal?.bpm ?? 120 };
  // the pitch track is only for the preview strip and is by far the biggest
  // part of the payload, so it is dropped before caching
  await blobStore.put(KEY(fileId, source), new Blob([JSON.stringify({ ...melody, track: [] })], { type: "application/json" }));
  set(`✓ ${melody.notes.length} notes`);
  setTimeout(() => set(""), 4000);
  return melody;
}

export async function loadMelody(fileId: string, source: string): Promise<Melody | null> {
  try {
    const b = await blobStore.get(KEY(fileId, source));
    if (!b) return null;
    return JSON.parse(await b.text()) as Melody;
  } catch {
    return null;
  }
}
