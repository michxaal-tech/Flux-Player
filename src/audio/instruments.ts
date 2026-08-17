// Synth voices — everything FLUX plays a transcribed part with.
//
// All synthesised, no samples: a sample library would be tens of megabytes to
// download for an app whose whole point is that it works offline from your own
// files. Subtractive synthesis gets close enough for the parts these are used
// for, and costs nothing to ship.
import { makeImpulse } from "./engine";

/** How a voice is generated. Plain subtractive synthesis makes every patch a
 * variation on "filtered saw", which is what made the first set sound same-y
 * and thin; FM and a plucked-string model are genuinely different mechanisms
 * and give the palette actual range. */
export type Engine = "subtractive" | "fm" | "string";

export interface Voice {
  engine?: Engine;
  /** FM: modulator ratio and index */
  fmRatio?: number;
  fmIndex?: number;
  fmDecay?: number;
  /** vibrato depth in cents and rate in Hz — a little movement stops a held
   * note sounding like a test tone */
  vibrato?: number;
  vibratoHz?: number;
  /** filter LFO depth (0..1 of cutoff) and rate, for wobbles */
  wobble?: number;
  wobbleHz?: number;
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

  // ── other synthesis engines ──────────────────────────────────────────
  // FM: a modulator at a fixed ratio driving the carrier's frequency. Metallic
  // and bell-like in a way no amount of filtering a saw will reach.
  "FM BELL": { engine: "fm", fmRatio: 3.5, fmIndex: 620, fmDecay: 0.5, detune: [0], type: "sine", attack: 0.002, decay: 1.1, sustain: 0.04, release: 0.7, cutoffMul: 30, q: 0.6, envAmt: 1, gain: 0.24, send: 0.5 },
  "FM KEYS": { engine: "fm", fmRatio: 2, fmIndex: 260, fmDecay: 0.3, detune: [0], type: "sine", attack: 0.003, decay: 0.7, sustain: 0.16, release: 0.4, cutoffMul: 30, q: 0.6, envAmt: 1, gain: 0.26, send: 0.35 },
  "FM BASS": { engine: "fm", fmRatio: 1, fmIndex: 180, fmDecay: 0.14, detune: [0], type: "sine", attack: 0.004, decay: 0.3, sustain: 0.6, release: 0.16, cutoffMul: 30, q: 0.6, envAmt: 1, gain: 0.34 },

  // Karplus-Strong: a noise burst circulating in a delay tuned to the pitch.
  // This is how a plucked string actually behaves, and it sounds like one.
  "STRING PLUCK": { engine: "string", detune: [0], type: "sine", attack: 0.001, decay: 0.2, sustain: 0.4, release: 0.4, cutoffMul: 30, q: 0.5, envAmt: 1, gain: 0.5, send: 0.4 },
  HARP: { engine: "string", detune: [0], type: "sine", attack: 0.001, decay: 0.3, sustain: 0.5, release: 0.9, cutoffMul: 30, q: 0.5, envAmt: 1, gain: 0.42, send: 0.6 },

  // subtractive, but with movement so they are not static
  WOBBLE: { detune: [-12, 0, 12], type: "sawtooth", attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.12, cutoffMul: 2.4, q: 7, envAmt: 3, gain: 0.19, wobble: 0.8, wobbleHz: 3 },
  CHOIR: { detune: [-9, -4, 4, 9], type: "sawtooth", attack: 0.28, decay: 0.5, sustain: 0.8, release: 0.6, cutoffMul: 3.4, q: 1.2, envAmt: 2.4, gain: 0.06, vibrato: 18, vibratoHz: 5, send: 0.6 },
  BRASS: { detune: [-5, 0, 5], type: "sawtooth", attack: 0.06, decay: 0.3, sustain: 0.75, release: 0.2, cutoffMul: 3, q: 2.5, envAmt: 6, gain: 0.11, vibrato: 10, vibratoHz: 5.5, send: 0.3 },
};

/** Which voices suit which slot, for the per-part pickers. */
export const VOICE_GROUPS = {
  lead: ["SUPERSAW", "PLUCK", "SQUARE LEAD", "BELL", "FM BELL", "FM KEYS", "STRING PLUCK", "HARP", "CHIP", "BRASS", "CHOIR", "ORGAN", "KEYS"],
  bass: ["SUB", "REESE", "FM BASS", "WOBBLE", "SQUARE LEAD", "ORGAN"],
  chords: ["STAB", "PAD", "CHOIR", "KEYS", "FM KEYS", "ORGAN", "HARP", "BRASS"],
} as const;

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
): AudioScheduledSourceNode[] {
  const { ctx } = bus;
  const hz = midiToHz(midi);
  const t0 = Math.max(at, ctx.currentTime);
  const nodes: AudioScheduledSourceNode[] = [];

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

  // ── plucked string (Karplus-Strong) ──────────────────────────────────
  // A short noise burst fed into a delay line one period long, with damping in
  // the feedback path. The delay length *is* the pitch.
  if (voice.engine === "string") {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const burst = ctx.createGain();
    burst.gain.setValueAtTime(1, t0);
    burst.gain.setValueAtTime(0, t0 + 0.012);   // 12ms excitation
    const dl = ctx.createDelay(0.05);
    dl.delayTime.value = 1 / hz;
    const fbg = ctx.createGain();
    // Loop gain must stay below 1 or this grows without bound. Measured by
    // bisection: 0.86 still creeps upward, 0.84 decays cleanly, so the loop
    // carries about 18% more gain than the nominal feedback value — delay
    // interpolation and filter phase conspiring around the loop frequency.
    // 0.82 leaves margin at every pitch while still ringing for about a second.
    fbg.gain.value = 0.82;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = Math.min(9000, hz * 14);
    damp.Q.value = 0.5;                      // no peak; passband gain <= 1
    // and the loop is closed off after the note, so a held string cannot ring
    // on forever once the voice is done
    fbg.gain.setValueAtTime(0.96, t0);
    fbg.gain.setTargetAtTime(0, Math.max(t0, until), Math.max(0.05, voice.release / 2));
    // Hard safety inside the loop: a tanh-shaped clipper cannot pass more than
    // it receives, so even if some pitch lands on a marginal loop gain the
    // string saturates instead of exploding. Numbers like the 39,000 peak this
    // started at must be impossible, not merely unlikely.
    const clamp = ctx.createWaveShaper();
    clamp.curve = softClip();
    clamp.oversample = "2x";

    src.connect(burst);
    burst.connect(dl);
    dl.connect(damp);
    damp.connect(clamp);
    clamp.connect(fbg);
    fbg.connect(dl);
    damp.connect(vca);
    src.start(t0);
    src.stop(t0 + 0.06);
    // the burst source is the only stoppable node here, so it has to be
    // returned or the caller has no way to kill this voice
    nodes.push(src);
    // the string's own decay does the work; the VCA just holds and releases
    vca.gain.cancelScheduledValues(t0);
    vca.gain.setValueAtTime(peak, t0);
    vca.gain.setTargetAtTime(0.0001, Math.max(t0, until), voice.release / 2.5);
    return nodes;
  }

  // ── FM ───────────────────────────────────────────────────────────────
  if (voice.engine === "fm") {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = hz;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = hz * (voice.fmRatio ?? 2);
    const modGain = ctx.createGain();
    // the index falling over time is what gives FM its struck-then-settle
    // character; a constant index just sounds buzzy
    const idx = (voice.fmIndex ?? 300) * vel;
    modGain.gain.setValueAtTime(idx, t0);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.04), t0 + (voice.fmDecay ?? 0.3));
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(vca);
    mod.start(t0);
    mod.stop(stopAt);
    carrier.start(t0);
    carrier.stop(stopAt);
    nodes.push(carrier, mod);
    return nodes;
  }

  // ── subtractive ──────────────────────────────────────────────────────
  // optional vibrato and filter wobble, shared by every oscillator below
  let vibNode: OscillatorNode | null = null;
  let vibAmt: GainNode | null = null;
  if (voice.vibrato) {
    vibNode = ctx.createOscillator();
    vibNode.frequency.value = voice.vibratoHz ?? 5;
    vibAmt = ctx.createGain();
    vibAmt.gain.value = voice.vibrato;
    vibNode.connect(vibAmt);
    vibNode.start(t0);
    vibNode.stop(stopAt);
    nodes.push(vibNode);
  }
  if (voice.wobble) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = voice.wobbleHz ?? 3;
    const amt = ctx.createGain();
    amt.gain.value = base * voice.wobble;
    lfo.connect(amt);
    amt.connect(filt.frequency);
    lfo.start(t0);
    lfo.stop(stopAt);
    nodes.push(lfo);
  }

  for (const cents of voice.detune) {
    const o = ctx.createOscillator();
    o.type = voice.type;
    o.frequency.value = hz;
    o.detune.value = cents;
    o.connect(filt);
    if (vibAmt) vibAmt.connect(o.detune);
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

/** tanh transfer curve, shared by every string voice */
let clipCurve: Float32Array | null = null;
function softClip(): Float32Array {
  if (clipCurve) return clipCurve;
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  clipCurve = c;
  return c;
}

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
