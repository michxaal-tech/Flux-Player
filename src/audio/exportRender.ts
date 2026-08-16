// Offline FX rendering: reproduces the live Web Audio graph in an
// OfflineAudioContext so a whole track can be exported with its FX baked in.
// Note: offline speed always follows pitch (tape behavior) — the live
// non-tape mode relies on HTMLMediaElement time-stretching, which has no
// offline equivalent.
import type { FxState } from "../types";
import { makeCrushCurve, makeImpulse, NOISE_FILLS } from "./engine";

export async function renderWithFx(blob: Blob, fx: FxState): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const rate = 44100;
  const decodeCtx = new OfflineAudioContext(2, 1, rate);
  const srcBuf = await decodeCtx.decodeAudioData(ab);

  const tail = fx.reverb > 0.01 ? fx.size : fx.echoMix > 0.01 ? fx.echoTime * 4 : 0.1;
  const outLen = Math.ceil((srcBuf.duration / fx.speed + tail) * rate);
  const ctx = new OfflineAudioContext(2, outLen, rate);

  const source = ctx.createBufferSource();
  source.buffer = srcBuf;
  source.playbackRate.value = fx.speed;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeCrushCurve(fx.crush);
  const eqLow = ctx.createBiquadFilter(); eqLow.type = "lowshelf"; eqLow.frequency.value = 130; eqLow.gain.value = fx.bass;
  const eqMid = ctx.createBiquadFilter(); eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.Q.value = 0.9; eqMid.gain.value = fx.mid;
  const eqHigh = ctx.createBiquadFilter(); eqHigh.type = "highshelf"; eqHigh.frequency.value = 7500; eqHigh.gain.value = fx.treble;
  const toneLP = ctx.createBiquadFilter(); toneLP.type = "lowpass"; toneLP.frequency.value = fx.tone;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = fx.highpass;

  // independent pitch shift, same worklet as live playback
  let pitchNode: AudioWorkletNode | null = null;
  if ((fx.pitch ?? 0) !== 0 && ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pitch-worklet.js`);
      pitchNode = new AudioWorkletNode(ctx, "flux-pitch", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { pitch: fx.pitch },
      });
    } catch (e) {
      console.warn("offline pitch unavailable:", e);
    }
  }

  const vDry = ctx.createGain(); vDry.gain.value = fx.vocalCut ? 0 : 1;
  const split = ctx.createChannelSplitter(2);
  const gL = ctx.createGain(); gL.gain.value = 1;
  const gR = ctx.createGain(); gR.gain.value = -1;
  const vSum = ctx.createGain(); vSum.gain.value = fx.vocalCut ? 0.9 : 0;
  const post = ctx.createGain();

  const dry = ctx.createGain(); dry.gain.value = 1 - fx.reverb * 0.35;
  const convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(ctx, fx.size);
  const wet = ctx.createGain(); wet.gain.value = fx.reverb;
  const delay = ctx.createDelay(1.5); delay.delayTime.value = fx.echoTime;
  const delayFb = ctx.createGain(); delayFb.gain.value = Math.min(0.85, fx.echoFb);
  const delayMix = ctx.createGain(); delayMix.gain.value = fx.echoMix;

  const master = ctx.createGain(); master.gain.value = fx.boost;
  const panner = ctx.createStereoPanner();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;

  source.connect(shaper); shaper.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
  eqHigh.connect(toneLP); toneLP.connect(hp);
  const postPitch: AudioNode = pitchNode ?? hp;
  if (pitchNode) hp.connect(pitchNode);
  postPitch.connect(vDry); vDry.connect(post);
  postPitch.connect(split); split.connect(gL, 0); split.connect(gR, 1); gL.connect(vSum); gR.connect(vSum); vSum.connect(post);
  post.connect(dry); dry.connect(master);
  post.connect(convolver); convolver.connect(wet); wet.connect(master);
  post.connect(delay); delay.connect(delayMix); delayMix.connect(master);
  delay.connect(delayFb); delayFb.connect(delay);
  master.connect(panner); panner.connect(comp); comp.connect(ctx.destination);

  // vinyl crackle bed
  if (fx.crackle > 0.01) {
    const nb = ctx.createBuffer(1, rate * 2, rate);
    NOISE_FILLS.crackle(nb.getChannelData(0));
    const cSrc = ctx.createBufferSource(); cSrc.buffer = nb; cSrc.loop = true;
    const cLP = ctx.createBiquadFilter(); cLP.type = "lowpass"; cLP.frequency.value = 6000;
    const cGain = ctx.createGain(); cGain.gain.value = fx.crackle * 0.5;
    cSrc.connect(cLP); cLP.connect(cGain); cGain.connect(master);
    cSrc.start();
  }

  // 8D orbit: the live loop runs pan = sin(frame * 0.016 * rate) at ~60fps
  if (fx.spin) {
    const durSec = outLen / rate;
    const pts = Math.max(2, Math.ceil(durSec * 20));
    const curve = new Float32Array(pts);
    for (let i = 0; i < pts; i++) {
      const s = (i / (pts - 1)) * durSec;
      curve[i] = Math.sin(60 * s * 0.016 * fx.spinRate) * 0.95;
    }
    panner.pan.setValueCurveAtTime(curve, 0, durSec);
  }

  source.start();
  return ctx.startRendering();
}
