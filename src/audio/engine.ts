import type { AmbState, FxState } from "../types";

export interface GraphNodes {
  ctx: AudioContext;
  shaper: WaveShaperNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  toneLP: BiquadFilterNode;
  hp: BiquadFilterNode;
  vDry: GainNode;
  vSum: GainNode;
  dry: GainNode;
  convolver: ConvolverNode;
  wet: GainNode;
  delay: DelayNode;
  delayFb: GainNode;
  delayMix: GainNode;
  master: GainNode;
  fader: GainNode;
  panner: StereoPannerNode;
  comp: DynamicsCompressorNode;
  analyser: AnalyserNode;
  streamDest: MediaStreamAudioDestinationNode;
  cGain: GainNode;
  rainG: GainNode;
  fireG: GainNode;
  windG: GainNode;
}

/** Builds a 2s decaying-noise impulse response for the reverb convolver. */
export function makeImpulse(ctx: BaseAudioContext, sec: number): AudioBuffer {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * sec));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  return buf;
}

/** Soft-clip curve for the CRUSH control. */
export function makeCrushCurve(amt: number): Float32Array {
  const k = amt * 40, c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = k === 0 ? x : Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
  }
  return c;
}

type NoiseFill = (d: Float32Array) => void;

export const NOISE_FILLS: Record<"crackle" | "rain" | "fire" | "wind", NoiseFill> = {
  crackle: (d) => {
    for (let i = 0; i < d.length; i++)
      d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.012;
  },
  rain: (d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  fire: (d) => {
    for (let i = 0; i < d.length; i++)
      d[i] = Math.random() < 0.004 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.05;
  },
  wind: (d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last + (Math.random() * 2 - 1) * 0.02;
      last *= 0.997;
      d[i] = last * 3;
    }
  },
};

class AudioEngine {
  audio: HTMLAudioElement = new Audio();
  nodes: GraphNodes | null = null;
  /** Set while a tape brake / spin-up animation owns el.playbackRate. */
  brakeActive = false;

  ensure(): void {
    if (this.nodes) {
      if (this.nodes.ctx.state === "suspended") this.nodes.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    const src = ctx.createMediaElementSource(this.audio);

    const shaper = ctx.createWaveShaper();
    const eqLow = ctx.createBiquadFilter(); eqLow.type = "lowshelf"; eqLow.frequency.value = 130;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.Q.value = 0.9;
    const eqHigh = ctx.createBiquadFilter(); eqHigh.type = "highshelf"; eqHigh.frequency.value = 7500;
    const toneLP = ctx.createBiquadFilter(); toneLP.type = "lowpass"; toneLP.frequency.value = 20000;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 20;

    // vocal cut: dry path vs mid-cancelled (L-R) path
    const vDry = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    const gL = ctx.createGain(); gL.gain.value = 1;
    const gR = ctx.createGain(); gR.gain.value = -1;
    const vSum = ctx.createGain(); vSum.gain.value = 0;
    const post = ctx.createGain();

    const dry = ctx.createGain();
    const convolver = ctx.createConvolver();
    const wet = ctx.createGain(); wet.gain.value = 0;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.28;
    const delayFb = ctx.createGain(); delayFb.gain.value = 0.35;
    const delayMix = ctx.createGain(); delayMix.gain.value = 0;

    const master = ctx.createGain();
    const fader = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
    const streamDest = ctx.createMediaStreamDestination();

    src.connect(shaper); shaper.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
    eqHigh.connect(toneLP); toneLP.connect(hp);
    hp.connect(vDry); vDry.connect(post);
    hp.connect(split); split.connect(gL, 0); split.connect(gR, 1); gL.connect(vSum); gR.connect(vSum); vSum.connect(post);
    post.connect(dry); dry.connect(master);
    post.connect(convolver); convolver.connect(wet); wet.connect(master);
    post.connect(delay); delay.connect(delayMix); delayMix.connect(master);
    delay.connect(delayFb); delayFb.connect(delay);
    master.connect(fader); fader.connect(panner); panner.connect(comp); comp.connect(analyser);
    analyser.connect(ctx.destination); analyser.connect(streamDest);

    const mkNoise = (fill: NoiseFill) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      fill(b.getChannelData(0));
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start();
      return s;
    };

    const cSrc = mkNoise(NOISE_FILLS.crackle);
    const cLP = ctx.createBiquadFilter(); cLP.type = "lowpass"; cLP.frequency.value = 6000;
    const cGain = ctx.createGain(); cGain.gain.value = 0;
    cSrc.connect(cLP); cLP.connect(cGain); cGain.connect(master);

    const rainSrc = mkNoise(NOISE_FILLS.rain);
    const rainBP = ctx.createBiquadFilter(); rainBP.type = "bandpass"; rainBP.frequency.value = 2600; rainBP.Q.value = 0.5;
    const rainG = ctx.createGain(); rainG.gain.value = 0;
    rainSrc.connect(rainBP); rainBP.connect(rainG); rainG.connect(fader);

    const fireSrc = mkNoise(NOISE_FILLS.fire);
    const fireLP = ctx.createBiquadFilter(); fireLP.type = "lowpass"; fireLP.frequency.value = 1100;
    const fireG = ctx.createGain(); fireG.gain.value = 0;
    fireSrc.connect(fireLP); fireLP.connect(fireG); fireG.connect(fader);

    const windSrc = mkNoise(NOISE_FILLS.wind);
    const windLP = ctx.createBiquadFilter(); windLP.type = "lowpass"; windLP.frequency.value = 350;
    const windLFO = ctx.createOscillator(); windLFO.frequency.value = 0.07;
    const windLFOg = ctx.createGain(); windLFOg.gain.value = 160;
    windLFO.connect(windLFOg); windLFOg.connect(windLP.frequency); windLFO.start();
    const windG = ctx.createGain(); windG.gain.value = 0;
    windSrc.connect(windLP); windLP.connect(windG); windG.connect(fader);

    this.nodes = {
      ctx, shaper, eqLow, eqMid, eqHigh, toneLP, hp, vDry, vSum, dry, convolver, wet,
      delay, delayFb, delayMix, master, fader, panner, comp, analyser, streamDest,
      cGain, rainG, fireG, windG,
    };
    this.buildImpulse(2.2);
    this.setCurve(0);
  }

  buildImpulse(sec: number) {
    const n = this.nodes;
    if (!n) return;
    n.convolver.buffer = makeImpulse(n.ctx, sec);
  }

  setCurve(amt: number) {
    const n = this.nodes;
    if (!n) return;
    n.shaper.curve = makeCrushCurve(amt);
  }

  setPreservesPitch(on: boolean) {
    const el = this.audio as any;
    try {
      el.preservesPitch = on;
      el.mozPreservesPitch = on;
      el.webkitPreservesPitch = on;
    } catch { /* older engines */ }
  }

  applyFx(fx: FxState) {
    const el = this.audio;
    if (el && !this.brakeActive) {
      el.playbackRate = fx.speed;
      this.setPreservesPitch(!fx.vinyl);
    }
    const n = this.nodes;
    if (!n) return;
    const t0 = n.ctx.currentTime;
    n.wet.gain.setTargetAtTime(fx.reverb, t0, 0.05);
    n.dry.gain.setTargetAtTime(1 - fx.reverb * 0.35, t0, 0.05);
    n.delayMix.gain.setTargetAtTime(fx.echoMix, t0, 0.05);
    n.delay.delayTime.setTargetAtTime(fx.echoTime, t0, 0.05);
    n.delayFb.gain.setTargetAtTime(Math.min(0.85, fx.echoFb), t0, 0.05);
    n.eqLow.gain.setTargetAtTime(fx.bass, t0, 0.05);
    n.eqMid.gain.setTargetAtTime(fx.mid, t0, 0.05);
    n.eqHigh.gain.setTargetAtTime(fx.treble, t0, 0.05);
    n.toneLP.frequency.setTargetAtTime(fx.tone, t0, 0.05);
    n.hp.frequency.setTargetAtTime(fx.highpass, t0, 0.05);
    n.cGain.gain.setTargetAtTime(fx.crackle * 0.5, t0, 0.05);
    n.vDry.gain.setTargetAtTime(fx.vocalCut ? 0 : 1, t0, 0.03);
    n.vSum.gain.setTargetAtTime(fx.vocalCut ? 0.9 : 0, t0, 0.03);
    n.master.gain.setTargetAtTime(fx.boost, t0, 0.05);
    if (!fx.spin) n.panner.pan.setTargetAtTime(0, t0, 0.1);
    this.setCurve(fx.crush);
  }

  applyAmb(amb: AmbState) {
    const n = this.nodes;
    if (!n) return;
    const t0 = n.ctx.currentTime;
    n.rainG.gain.setTargetAtTime(amb.rain * 0.22, t0, 0.1);
    n.fireG.gain.setTargetAtTime(amb.fire * 0.5, t0, 0.1);
    n.windG.gain.setTargetAtTime(amb.wind * 0.6, t0, 0.1);
  }
}

export const engine = new AudioEngine();
