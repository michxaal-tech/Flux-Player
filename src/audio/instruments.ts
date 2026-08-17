// Synth voices — everything FLUX plays a transcribed part with.
//
// All synthesised, no samples: a sample library would be tens of megabytes to
// download for an app whose whole point is that it works offline from your own
// files. Subtractive synthesis gets close enough for the parts these are used
// for, and costs nothing to ship.
import { makeImpulse } from "./engine";

export interface Voice {
  /** oscillator offsets in cents; one oscillator per entry */
  detune: number[];
  type: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** filter cutoff as a multiple of the note's frequency */
  cutoffMul: number;
  q: number;
  /** how far above the cutoff the filter starts, before closing */
  envAmt: number;
  gain: number;
  /** square an octave down, for weight */
  sub?: boolean;
  /** send level into the shared delay/reverb bus */
  send?: number;
}

export const VOICES: Record<string, Voice> = {
  // seven detuned saws — the festival lead
  SUPERSAW: { detune: [-14, -9, -4, 0, 4, 9, 14], type: "sawtooth", attack: 0.012, decay: 0.18, sustain: 0.72, release: 0.22, cutoffMul: 7, q: 3, envAmt: 5, gain: 0.085, sub: true, send: 0.35 },
  PLUCK: { detune: [-6, 0, 6], type: "sawtooth", attack: 0.002, decay: 0.16, sustain: 0.06, release: 0.12, cutoffMul: 9, q: 6, envAmt: 9, gain: 0.17, send: 0.45 },
  "SQUARE LEAD": { detune: [-5, 0, 5], type: "square", attack: 0.006, decay: 0.12, sustain: 0.6, release: 0.14, cutoffMul: 6, q: 2, envAmt: 4, gain: 0.12, send: 0.3 },
  BELL: { detune: [0, 1200, 1902], type: "sine", attack: 0.004, decay: 0.9, sustain: 0.02, release: 0.5, cutoffMul: 20, q: 0.7, envAmt: 1, gain: 0.2, send: 0.5 },
  SUB: { detune: [0, -1200], type: "sine", attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.18, cutoffMul: 4, q: 1, envAmt: 2, gain: 0.3 },
  ORGAN: { detune: [0, 1200, 1902, 2400], type: "sine", attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.1, cutoffMul: 14, q: 0.8, envAmt: 1, gain: 0.1, send: 0.25 },
  CHIP: { detune: [0], type: "square", attack: 0.001, decay: 0.05, sustain: 0.5, release: 0.05, cutoffMul: 30, q: 0.5, envAmt: 1, gain: 0.17 },
  // parts other than the lead
  REESE: { detune: [-18, 0, 18], type: "sawtooth", attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.12, cutoffMul: 3, q: 4, envAmt: 3, gain: 0.2 },
  PAD: { detune: [-8, -3, 3, 8], type: "sawtooth", attack: 0.35, decay: 0.6, sustain: 0.7, release: 0.7, cutoffMul: 4, q: 1.4, envAmt: 3, gain: 0.055, send: 0.6 },
  STAB: { detune: [-7, 0, 7], type: "sawtooth", attack: 0.004, decay: 0.22, sustain: 0.1, release: 0.18, cutoffMul: 8, q: 5, envAmt: 7, gain: 0.09, send: 0.4 },
  KEYS: { detune: [0, 1200], type: "triangle", attack: 0.005, decay: 0.5, sustain: 0.25, release: 0.3, cutoffMul: 12, q: 1, envAmt: 2, gain: 0.11, send: 0.35 },
};

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The shared output chain: a dry bus plus a delay/reverb send, so parts sit in
 * one space instead of each sounding like it was pasted on separately. */
export interface SynthBus {
  ctx: AudioContext;
  dry: GainNode;
  send: GainNode;
  out: GainNode;
}

export function makeBus(ctx: AudioContext, dest: AudioNode, bpm: number): SynthBus {
  const out = ctx.createGain();
  out.gain.value = 1;

  // Four parts playing at once sum past full scale — measured at 1.43 peak with
  // lead, bass, chords and drums together, which clips audibly. A limiter on
  // the bus is the correct place to solve that: trimming each voice instead
  // would make a single part playing alone far too quiet.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  // 1ms attack: a kick transient walks straight through anything slower, which
  // is what left the bus peaking above full scale even with the limiter in
  limiter.attack.value = 0.001;
  limiter.release.value = 0.16;
  // trim after the limiter, since compression alone still leaves the summed
  // transients close to the ceiling
  const trim = ctx.createGain();
  trim.gain.value = 0.72;
  out.connect(limiter);
  limiter.connect(trim);
  trim.connect(dest);

  const dry = ctx.createGain();
  dry.connect(out);

  // send bus: a dotted-eighth delay locked to the tempo, into a plate
  const send = ctx.createGain();
  send.gain.value = 1;
  const delay = ctx.createDelay(2);
  delay.delayTime.value = Math.min(1.5, (60 / (bpm || 120)) * 0.75);
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 3200;
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;

  send.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(conv);
  send.connect(conv);
  conv.connect(wet);
  damp.connect(wet);
  wet.connect(out);

  return { ctx, dry, send, out };
}

/** Schedules one synth note. Returns the oscillators so they can be killed. */
export function playVoice(
  bus: SynthBus, voice: Voice, midi: number, at: number, until: number, vel: number, gainMul = 1,
): OscillatorNode[] {
  const { ctx } = bus;
  const hz = midiToHz(midi);
  const t0 = Math.max(at, ctx.currentTime);
  const nodes: OscillatorNode[] = [];

  const vca = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = voice.q;
  const base = Math.min(16000, hz * voice.cutoffMul);
  filt.frequency.setValueAtTime(Math.min(16000, base * voice.envAmt), t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(80, base), t0 + voice.decay + 0.001);

  const peak = Math.max(0.0002, voice.gain * vel * gainMul);
  vca.gain.setValueAtTime(0.0001, t0);
  vca.gain.exponentialRampToValueAtTime(peak, t0 + voice.attack);
  vca.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * voice.sustain), t0 + voice.attack + voice.decay);
  vca.gain.setTargetAtTime(0.0001, Math.max(t0, until), voice.release / 3);

  filt.connect(vca);
  vca.connect(bus.dry);
  if (voice.send) {
    const s = ctx.createGain();
    s.gain.value = voice.send;
    vca.connect(s);
    s.connect(bus.send);
  }

  const stopAt = until + voice.release + 0.06;
  for (const cents of voice.detune) {
    const o = ctx.createOscillator();
    o.type = voice.type;
    o.frequency.value = hz;
    o.detune.value = cents;
    o.connect(filt);
    o.start(t0);
    o.stop(stopAt);
    nodes.push(o);
  }
  if (voice.sub) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = hz / 2;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    o.connect(g);
    g.connect(filt);
    o.start(t0);
    o.stop(stopAt);
    nodes.push(o);
  }
  return nodes;
}

// ── drums ────────────────────────────────────────────────────────────────
// Classic synthesised drum voices: a kick is a sine whose pitch drops fast, a
// snare is noise plus a body tone, a hat is high-passed noise. Cheap, and they
// sit correctly in a mix without any samples.

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 0.5);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

export type DrumKind = "kick" | "snare" | "hat" | "openhat" | "clap";

export function playDrum(bus: SynthBus, kind: DrumKind, at: number, vel: number, gainMul = 1): void {
  const { ctx } = bus;
  const t0 = Math.max(at, ctx.currentTime);
  const g = ctx.createGain();
  g.connect(bus.dry);

  if (kind === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    // the pitch drop is what makes it read as a kick rather than a low blip
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(44, t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.7 * vel * gainMul, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.36);
    return;
  }

  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filt = ctx.createBiquadFilter();

  if (kind === "snare" || kind === "clap") {
    filt.type = "bandpass";
    filt.frequency.value = kind === "clap" ? 1500 : 1900;
    filt.Q.value = kind === "clap" ? 1.1 : 0.8;
    const dur = kind === "clap" ? 0.16 : 0.19;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5 * vel * gainMul, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (kind === "snare") {
      // a short body tone under the noise, or it sounds like a hiss
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(190, t0);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.28 * vel * gainMul, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      o.connect(og);
      og.connect(bus.dry);
      o.start(t0);
      o.stop(t0 + 0.13);
    }
    src.connect(filt);
    filt.connect(g);
    // snares carry the room, so they go to the send too
    const s = ctx.createGain();
    s.gain.value = 0.3;
    g.connect(s);
    s.connect(bus.send);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return;
  }

  // hats
  filt.type = "highpass";
  filt.frequency.value = 7200;
  const dur = kind === "openhat" ? 0.26 : 0.055;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.24 * vel * gainMul, t0 + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}
