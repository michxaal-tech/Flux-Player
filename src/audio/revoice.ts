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
import { makeBus, playDrum, playVoice, VOICES, type SynthBus } from "./instruments";
import { STYLES, type Arrangement, type Style } from "./arrange";
import { blobStore, getUrl } from "../store/blobStore";
import { useStore } from "../store/useStore";
import type { Note, TranscribeResult } from "./transcribeWorker";

export type { Note };


let scheduled: { stop: () => void } | null = null;
let bus: SynthBus | null = null;
let busBpm = 0;

/** The engine's AudioContext, or null before playback has started it. */
function ctx(): AudioContext | null {
  return engine.nodes?.ctx ?? null;
}

/**
 * The shared output chain, joined to the master bus *after* the FX rack.
 * Feeding it in earlier would pitch the synth with tape speed and let the
 * vocal-cut filter — which exists to remove the original vocal — chew the
 * parts that replaced it.
 */
function getBus(bpm: number): SynthBus | null {
  const ac = ctx();
  if (!ac) return null;
  // the delay time is tempo-locked, so a tempo change needs a new bus
  if (!bus || Math.abs(busBpm - bpm) > 0.5) {
    bus = makeBus(ac, engine.nodes?.master ?? ac.destination, bpm);
    busBpm = bpm;
    bus.out.gain.value = level;
  }
  return bus;
}

let level = 0;
/** 0..1 — how loud the whole arrangement sits against the track. */
export function setRevoiceLevel(v: number): void {
  level = Math.max(0, Math.min(1, v));
  const ac = ctx();
  if (bus && ac) bus.out.gain.setTargetAtTime(level, ac.currentTime, 0.05);
}

/** Per-part levels, 0..1. */
export interface PartMix {
  lead: number;
  bass: number;
  chords: number;
  drums: number;
}

/** Per-part voice overrides. Empty falls back to the style's own choices. */
export interface PartVoices {
  lead?: string;
  bass?: string;
  chords?: string;
}

/**
 * Schedules an arrangement from `fromSec` in the track, starting at `startAt`
 * on the audio clock.
 *
 * Only a window is scheduled rather than the whole file: a four-minute track
 * would otherwise create tens of thousands of oscillator nodes up front, and
 * the caller re-arms this as playback advances.
 */
export function playArrangement(
  arr: Arrangement, style: Style, mix: PartMix, startAt: number, fromSec: number,
  bpm = 120, voices: PartVoices = {}, windowSec = 30,
): void {
  stopNotes();
  const ac = ctx();
  if (!ac) return;
  const S = STYLES[style];
  // the send delay is tempo-locked, so the bus is built for this track's tempo
  const b = getBus(bpm);
  if (!b) return;
  const nodes: AudioScheduledSourceNode[] = [];

  const schedule = (notes: Note[], voiceName: string, gain: number) => {
    if (gain <= 0.001) return;
    const voice = VOICES[voiceName] ?? VOICES.SUPERSAW;
    for (const n of notes) {
      if (n.end < fromSec) continue;
      const t0 = startAt + (n.start - fromSec);
      if (t0 > ac.currentTime + windowSec) break;
      const t1 = startAt + (n.end - fromSec);
      if (t1 <= ac.currentTime) continue;
      nodes.push(...playVoice(b, voice, n.midi, t0, t1, n.vel, gain));
    }
  };

  schedule(arr.lead, voices.lead || S.lead, mix.lead);
  schedule(arr.bass, voices.bass || S.bass, mix.bass);
  schedule(arr.chords, voices.chords || S.chord, mix.chords);

  if (mix.drums > 0.001) {
    for (const d of arr.drums) {
      if (d.t < fromSec) continue;
      const t0 = startAt + (d.t - fromSec);
      if (t0 > ac.currentTime + windowSec) break;
      if (t0 <= ac.currentTime) continue;
      playDrum(b, d.kind, t0, d.vel, mix.drums);
    }
  }

  scheduled = {
    stop: () => {
      for (const o of nodes) {
        try { o.stop(); } catch { /* already stopped */ }
      }
    },
  };
}

export function stopNotes(): void {
  scheduled?.stop();
  scheduled = null;
}

/** Rebuilds the bus at a new tempo (delay time is tempo-locked). */
export function setArrangementBpm(bpm: number): void {
  if (Math.abs(busBpm - bpm) > 0.5) {
    bus = null;
    busBpm = bpm;
  }
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
  /** the analyser's beat grid and drop times, carried along so the arranger can
   * place drums on the real beats instead of a synthetic click */
  beats: number[];
  drops: number[];
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

  const melody: Melody = { ...result, bpm: anal?.bpm ?? 120, beats: anal?.beats ?? [], drops: anal?.drops ?? [] };
  // the per-frame pitch track is only for a preview strip and is by far the
  // biggest part of the payload, so it is dropped before caching
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
