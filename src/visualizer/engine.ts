// The 60fps render loop: audio analysis, beat/BPM detection, 8D pan drive,
// background edge meters, disc spin, waveform seekbar, and the fullscreen
// visual engine (theme dispatch + particle overlay + mirror/flash/vignette).
import { engine } from "../audio/engine";
import { PALETTES, VIS_THEMES } from "../constants";
import { getCurrentTrack, useStore } from "../store/useStore";
import { shallow } from "zustand/shallow";
import { ac1, ac2 } from "../theme";
import { canvasRefs, live } from "./live";
import { themes } from "./themes";
import type { ThemeCtx } from "./themeTypes";
import { drawLyricOverlay } from "./lyricRenderer";

/** themes that render lyrics themselves — the shared overlay stays out of their way */
const LYRIC_NATIVE_THEMES = new Set(["MARQUEE", "NEONSIGN", "CLOCK"]);

function syncLive(): void {
  const sub = useStore.subscribe;
  sub((s) => s.playing, (v) => { live.playing = v; }, { fireImmediately: true });
  sub((s) => s.fx.speed, (v) => {
    live.speed = v;
    // tempo history is in wall-clock ms — after a speed change those
    // intervals describe the old tempo, so a stale lock would fight the
    // phase gate. Drop it and re-lock at the new speed.
    live.beats.length = 0;
    live.bpm = 0;
  }, { fireImmediately: true });
  sub((s) => s.fx.spin, (v) => { live.spin = v; }, { fireImmediately: true });
  sub((s) => s.fx.spinRate, (v) => { live.spinRate = v; }, { fireImmediately: true });
  sub((s) => s.visOpen, (v) => { live.visOpen = v; }, { fireImmediately: true });
  sub((s) => s.visTheme, (v) => { live.visTheme = v; }, { fireImmediately: true });
  sub((s) => s.visCfg, (v) => { live.cfg = v; }, { fireImmediately: true });
  sub((s) => s.loopA, (v) => { live.loopA = v; }, { fireImmediately: true });
  sub((s) => s.loopB, (v) => { live.loopB = v; }, { fireImmediately: true });
  sub((s) => s.duration, (v) => { live.dur = v; }, { fireImmediately: true });
  sub(
    (s) => [s.progress, s.duration] as const,
    ([p, d]) => { live.prog = d ? p / d : 0; },
    { fireImmediately: true, equalityFn: shallow }
  );
  sub(
    (s) => getCurrentTrack(s),
    (tr) => {
      live.trackName = tr?.name ?? "";
      live.peaks = tr?.peaks ?? null;
      live.lyricLines = tr?.lyrics ?? null;
    },
    { fireImmediately: true }
  );
  sub((s) => s.lyricsOn, (v) => { live.lyricsOn = v; }, { fireImmediately: true });
  sub((s) => s.lyricStyle, (v) => { live.lyricStyle = v; }, { fireImmediately: true });
}

/**
 * Sizes a canvas's backing store, capping the internal long edge at maxEdge.
 * Full-screen canvases on high-DPR displays are otherwise 8-15M pixels per
 * frame, and shadowBlur cost scales with pixels — capping and letting CSS
 * upscale is what keeps the visualizer smooth at full size (the glow hides
 * the upscale entirely).
 */
const snapCv = document.createElement("canvas"); // scratch for resize-preserve

function sizeCanvas(cv: HTMLCanvasElement, maxEdge = Infinity, preserve = false): [number, number] {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = cv.clientWidth, chh = cv.clientHeight;
  let scale = dpr;
  const long = Math.max(cw, chh) * dpr;
  if (long > maxEdge) scale = dpr * (maxEdge / long);
  const W = Math.round(cw * scale), H = Math.round(chh * scale);
  if (cv.width !== W || cv.height !== H) {
    // trail buffers live in the backing store; carry them across adaptive
    // resolution steps so a step never reads as a flash to black
    if (preserve && cv.width > 0 && cv.height > 0 && W > 0 && H > 0) {
      snapCv.width = cv.width;
      snapCv.height = cv.height;
      snapCv.getContext("2d")!.drawImage(cv, 0, 0);
      cv.width = W;
      cv.height = H;
      const c = cv.getContext("2d")!;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(snapCv, 0, 0, W, H);
    } else {
      cv.width = W;
      cv.height = H;
    }
  }
  cv.getContext("2d")!.setTransform(scale, 0, 0, scale, 0, 0);
  return [cw, chh];
}

let started = false;

export function startRenderLoop(): void {
  if (started) return;
  started = true;
  syncLive();

  const freq = new Uint8Array(512);
  const beatFreq = new Uint8Array(512);
  const wave = new Uint8Array(1024);
  let lyricWasActive = false;
  let t = 0;
  let lastFrame = 0;

  // Adaptive resolution: a full-screen high-DPR canvas can be more pixels than
  // a device rasters at 60fps (shadowBlur cost scales with area). Trade
  // backing resolution for frame rate — but only under *real* sustained load.
  //
  // The frame gate below quantizes draw deltas to multiples of the display's
  // refresh interval (16.7ms or 25ms on a 120Hz panel), so judging single
  // frames misreads one dropped tick as jank. Track a smoothed frame time and
  // act only when it stays bad, with a floor that keeps the image sharp.
  const MIN_RES = 0.62;
  let resScale = 1;
  let frameEma = 16.7;
  let lastResChange = 0;

  const draw = () => {
    // cap at ~60fps: animation constants are tuned per-frame, so 120Hz
    // displays (iPad Pro) would otherwise run everything double speed
    const nowMs = performance.now();
    if (nowMs - lastFrame < 14) {
      requestAnimationFrame(draw);
      return;
    }
    const delta = nowMs - lastFrame;
    lastFrame = nowMs;
    t++;

    // ignore giant deltas (tab was hidden — rAF stops, that isn't slowness)
    if (delta < 250) frameEma += (delta - frameEma) * 0.05;
    if (live.cfg.hiRes) {
      // user asked for maximum sharpness — never trade resolution away
      if (resScale !== 1) { resScale = 1; lastResChange = nowMs; }
    } else if (frameEma > 27 && resScale > MIN_RES && nowMs - lastResChange > 1500) {
      resScale = Math.max(MIN_RES, resScale * 0.85); // sustained sub-37fps
      lastResChange = nowMs;
      frameEma = 20; // don't re-trigger before the new scale is measured
    } else if (frameEma < 18.5 && resScale < 1 && nowMs - lastResChange > 6000) {
      resScale = Math.min(1, resScale * 1.12); // steady headroom → sharpen up
      lastResChange = nowMs;
      frameEma = 20;
    }
    const n = engine.nodes;
    const L = live;
    const cfg = L.cfg;
    let bass = 0.08 + Math.sin(t * 0.01) * 0.03, mid = bass * 0.8, treb = bass * 0.5;
    let liveAudio = false, rms = 0, beat = false;

    if (n && L.playing) {
      n.analyser.getByteFrequencyData(freq);
      n.analyser.getByteTimeDomainData(wave);
      bass = 0; for (let i = 0; i < 16; i++) bass += freq[i]; bass /= 4080;
      mid = 0; for (let i = 16; i < 128; i++) mid += freq[i]; mid /= 28560;
      treb = 0; for (let i = 128; i < 380; i++) treb += freq[i]; treb /= 64260;
      for (let i = 0; i < 1024; i += 8) { const d = (wave[i] - 128) / 128; rms += d * d; }
      rms = Math.sqrt(rms / 128);
      liveAudio = true;
      if (L.spin) n.panner.pan.value = Math.sin(t * 0.016 * L.spinRate) * 0.95;
      // ── beat detection ──
      // Onset flux on a dedicated low-smoothing analyser (the visual analyser
      // blurs transients), kick band only (bins 1-12 ≈ 40-520Hz), with an
      // adaptive mean+deviation threshold. Once a tempo is locked, a phase
      // gate welcomes on-grid onsets and resists off-grid ones so beats stop
      // firing "at the wrong parts".
      n.beatAnalyser.getByteFrequencyData(beatFreq);
      let kick = 0;
      for (let i = 1; i <= 12; i++) kick += beatFreq[i];
      kick /= 12 * 255;
      // lagged reference (~2 frames behind) so onsets that ramp over a few
      // frames still register as one strong flux spike
      const flux = Math.max(0, kick - L.prevBass);
      L.prevBass = L.prevBass * 0.5 + kick * 0.5;
      L.fluxAvg = L.fluxAvg * 0.95 + flux * 0.05;
      L.fluxDev = L.fluxDev * 0.95 + Math.abs(flux - L.fluxAvg) * 0.05;
      const now = performance.now();
      // Every timing constant below is wall-clock, but playback speed
      // compresses the music in wall-clock time: at 1.4× a 150bpm track's
      // beats land 285ms apart, inside a refractory tuned for 1×, so every
      // other beat was being swallowed. Divide the windows by speed.
      const sp = Math.max(0.5, Math.min(2, L.speed || 1));
      let thresh = L.fluxAvg + 2.2 * L.fluxDev + 0.008;
      let refractory = 180 / sp;
      const iv = L.bpm ? 60000 / L.bpm : 0;
      if (iv) {
        const phase = ((now - L.lastBeatAt) % iv) / iv;
        const onGrid = phase < 0.18 || phase > 0.82;
        thresh *= onGrid ? 0.65 : 1.6;
        refractory = Math.min(240 / sp, Math.max(140 / sp, iv * 0.4));
      }
      if (flux > thresh && now - L.lastBeatAt > refractory) {
        L.lastBeatAt = now;
        beat = true;
        L.beats.push(now);
        if (L.beats.length > 16) L.beats.shift();
        const ivs: number[] = [];
        // plausible-interval window also scales: 1.5× turns a 180bpm track
        // into 270bpm (222ms), which the fixed 250ms floor rejected outright
        const loI = 250 / sp, hiI = 1200 / sp;
        for (let i = 1; i < L.beats.length; i++) {
          const d = L.beats[i] - L.beats[i - 1];
          if (d > loI && d < hiI) ivs.push(d);
        }
        if (ivs.length >= 4) {
          ivs.sort((a, b) => a - b);
          L.bpm = Math.round(60000 / ivs[Math.floor(ivs.length / 2)]);
        }
      }
    } else {
      for (let i = 0; i < wave.length; i++) wave[i] = 128 + Math.sin(t * 0.02 + i * 0.05) * 5;
      // idle demo pulse so themes still show their beat effects
      if (L.visOpen && t % 75 === 0) beat = true;
    }
    // beat envelope decays faster at high speed too, so back-to-back beats
    // read as separate hits instead of one smeared glow
    L.beatE = beat ? 1 : L.beatE * (L.playing ? Math.pow(0.9, Math.max(0.5, Math.min(2, L.speed || 1))) : 0.9);

    // musical intensity: loudness + how fast beats arrive + brightness, all
    // smoothed over seconds so themes drift between calm and driving motion
    // instead of twitching frame to frame
    {
      const beatRate = L.bpm ? (L.bpm * (L.speed || 1)) / 60 : 0; // beats/sec
      const inst = liveAudio
        ? Math.min(1, rms * 2.2) * 0.45 + Math.min(1, beatRate / 3.4) * 0.35 + Math.min(1, treb * 4.5) * 0.2
        : 0.3;
      L.energy += (inst - L.energy) * 0.012;
    }

    for (const el of canvasRefs.bpm) el.textContent = L.bpm ? `${L.bpm}` : "––";
    if (canvasRefs.level) canvasRefs.level.style.width = `${Math.min(100, rms * 240)}%`;

    // ── ambient background + edge spectrum meters ──
    const bg = canvasRefs.bg;
    if (bg) {
      const [w, h] = sizeCanvas(bg, 1100 * resScale); // soft ambient layer — low res is invisible
      const c = bg.getContext("2d")!;
      c.fillStyle = "rgba(8,9,13,0.3)";
      c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.25, 0, w / 2, h * 0.25, h * (0.5 + bass * 0.3));
      g.addColorStop(0, ac1(0.04 + bass * 0.1));
      g.addColorStop(0.6, ac2(0.02 + bass * 0.05));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const SB = 18;
      for (let i = 0; i < SB; i++) {
        const v = liveAudio ? freq[i * 9] / 255 : 0.08 + 0.07 * Math.sin(t * 0.02 + i * 0.6);
        const bh2 = h / SB;
        const bw2 = 3 + v * 30;
        c.fillStyle = ac1(0.06 + v * 0.3);
        c.fillRect(0, i * bh2 + 2, bw2, bh2 - 4);
        c.fillStyle = ac2(0.06 + v * 0.3);
        c.fillRect(w - bw2, i * bh2 + 2, bw2, bh2 - 4);
      }
    }

    // ── spinning disc ──
    if (canvasRefs.disc) {
      if (L.playing) L.rot += 0.7 * L.speed;
      canvasRefs.disc.style.transform = `rotate(${L.rot}deg) scale(${1 + bass * 0.05})`;
      canvasRefs.disc.style.boxShadow = `0 0 ${30 + bass * 70}px ${ac1(0.15 + bass * 0.4)}`;
    }

    // ── decoded waveform seekbar ──
    const wv = canvasRefs.wave;
    if (wv) {
      const [w, h] = sizeCanvas(wv);
      const c = wv.getContext("2d")!;
      c.clearRect(0, 0, w, h);
      const pk = L.peaks;
      const N = pk ? pk.length : 90;
      const bw = w / N;
      for (let i = 0; i < N; i++) {
        const v = pk ? pk[i] : 0.25 + 0.2 * Math.sin(i * 0.4 + t * 0.03);
        const bh = Math.max(2, v * h * 0.92);
        c.fillStyle = i / N <= L.prog ? ac1() : "rgba(255,255,255,0.16)";
        c.fillRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1.5), bh);
      }
      const { loopA: a, loopB: b, dur } = L;
      if (a !== null && dur > 0) {
        c.fillStyle = ac2(0.9);
        c.fillRect((a / dur) * w - 1, 0, 2, h);
        if (b !== null) {
          c.fillRect((b / dur) * w - 1, 0, 2, h);
          c.fillStyle = ac2(0.12);
          c.fillRect((a / dur) * w, 0, ((b - a) / dur) * w, h);
        }
      }
    }

    // ── fullscreen visual engine ──
    const vc = canvasRefs.vis;
    if (vc && L.visOpen) {
      const [w, h] = sizeCanvas(vc, 1800 * resScale, true);
      const c = vc.getContext("2d")!;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h);

      const pal = PALETTES.find((p) => p.id === cfg.palette) || PALETTES[0];
      const h1 = pal.h ? pal.h[0] : cfg.h1;
      const h2 = pal.h ? pal.h[1] : cfg.h2;
      const sat = pal.s;
      const C1 = (a = 1, l = 62) => `hsla(${h1}, ${sat}%, ${l}%, ${a})`;
      const C2 = (a = 1, l = 62) => `hsla(${h2}, ${sat}%, ${l}%, ${a})`;
      const CMix = (f: number, a = 1, l = 62) => `hsla(${h1 + (h2 - h1) * f}, ${sat}%, ${l}%, ${a})`;
      const GLOW = cfg.glow;
      const TK = cfg.thick;
      const glow = (blur: number, color: string) => { c.shadowBlur = blur * GLOW * 1.6; c.shadowColor = color; };
      const noGlow = () => { c.shadowBlur = 0; };

      const I = cfg.intensity;
      const bassV = Math.min(1, bass * I), midV = Math.min(1, mid * I), trebV = Math.min(1, treb * I);
      L.vt += cfg.speed;
      const vt = L.vt;

      if (beat && cfg.flash) L.flashVal = 0.28;
      if (beat && cfg.shake) L.shakeVal = 7;
      if (L.flashVal > 0) L.flashVal *= 0.86;
      if (L.shakeVal > 0) L.shakeVal *= 0.8;
      if (cfg.autoMode !== "off" && L.playing) {
        L.cycleT++;
        if (L.cycleT > 60 * 16) {
          L.cycleT = 0;
          const cyc = VIS_THEMES.filter((th) => th !== "CLOCK");
          const next =
            cfg.autoMode === "shuffle"
              ? cyc.filter((th) => th !== L.visTheme)[Math.floor(Math.random() * (cyc.length - 1))]
              : cyc[(cyc.indexOf(L.visTheme) + 1) % cyc.length];
          useStore.setState({ visTheme: next });
        }
      } else {
        L.cycleT = 0;
      }

      // trail fade + bg wash
      const fade = 0.06 + (1 - cfg.trail) * 0.34;
      c.fillStyle = `rgba(5,6,10,${fade})`;
      c.fillRect(0, 0, w, h);
      if (cfg.bgWash > 0.01) {
        const wg = c.createLinearGradient(0, 0, w, h);
        wg.addColorStop(0, C1(cfg.bgWash * (0.05 + bassV * 0.05), 40));
        wg.addColorStop(1, C2(cfg.bgWash * (0.05 + bassV * 0.05), 40));
        c.fillStyle = wg;
        c.fillRect(0, 0, w, h);
      }

      const TH = L.visTheme;
      c.save();
      if (L.shakeVal > 0.3) c.translate((Math.random() - 0.5) * L.shakeVal, (Math.random() - 0.5) * L.shakeVal);
      c.translate(cx, cy);
      if (TH !== "CLOCK") c.rotate(cfg.spinV * vt * 0.0018);
      c.scale(cfg.zoom, cfg.zoom);
      c.translate(-cx, -cy);
      c.globalCompositeOperation = "lighter";

      const themeCtx: ThemeCtx = {
        c, w, h, cx, cy, R, t, vt, freq, wave, liveAudio,
        bass, mid, treb, bassV, midV, trebV, beat, beatE: L.beatE, energy: L.energy, cfg, I, TK,
        C1, C2, CMix, glow, noGlow, L, trackName: L.trackName,
      };
      themes[TH]?.(themeCtx);

      // particle overlay w/ styles
      const targetCount = Math.floor(cfg.particles * 150);
      while (L.vparts.length < targetCount)
        L.vparts.push({ x: Math.random(), y: Math.random(), sp: 0.0004 + Math.random() * 0.0012, sz: 0.8 + Math.random() * 2.4, ph: Math.random() * Math.PI * 2 });
      if (L.vparts.length > targetCount) L.vparts.length = targetCount;
      for (const p of L.vparts) {
        const st = cfg.pStyle;
        if (st === "RISE") { p.y -= p.sp * (1 + bassV * 8) * cfg.speed; p.x += Math.sin(vt * 0.01 + p.ph) * 0.0006; }
        if (st === "SNOW") { p.y += p.sp * (0.8 + midV * 3) * cfg.speed; p.x += Math.sin(vt * 0.02 + p.ph) * 0.0012; }
        if (st === "DUST") { p.x += Math.sin(vt * 0.008 + p.ph) * 0.0007; p.y += Math.cos(vt * 0.006 + p.ph * 2) * 0.0005; }
        if (st === "EMBERS") { p.y -= p.sp * (2.2 + bassV * 12) * cfg.speed; p.x += Math.sin(vt * 0.03 + p.ph) * 0.0014; }
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
        if (p.x < -0.02) p.x = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        const tw = st === "EMBERS" ? 0.3 + Math.abs(Math.sin(vt * 0.09 + p.ph)) * 0.7 : 0.4 + Math.sin(vt * 0.05 + p.ph) * 0.3;
        c.fillStyle = CMix((p.ph % 6.28) / 6.28, (0.28 + bassV * 0.5 + L.beatE * 0.3) * tw, st === "EMBERS" ? 60 : 68);
        c.beginPath();
        c.arc(p.x * w, p.y * h, p.sz * (1 + bassV * 1.6 + L.beatE * 0.8) * (st === "SNOW" ? 1.3 : 1) * TK, 0, Math.PI * 2);
        c.fill();
      }

      c.restore();

      // mirror
      if (cfg.mirror) {
        c.save();
        c.globalCompositeOperation = "source-over";
        c.translate(w, 0);
        c.scale(-1, 1);
        c.drawImage(vc, 0, 0, vc.width / 2, vc.height, 0, 0, w / 2, h);
        c.restore();
      }

      // beat flash
      if (L.flashVal > 0.01) {
        c.fillStyle = C1(L.flashVal * 0.3, 80);
        c.fillRect(0, 0, w, h);
      }

      // synced lyrics on their own overlay canvas — cleared per frame so the
      // floating text stays crisp instead of smearing into the trail buffer
      const lc = canvasRefs.lyr;
      const lyricActive = !!(L.lyricsOn && L.lyricLines && !LYRIC_NATIVE_THEMES.has(TH));
      if (lc && (lyricActive || lyricWasActive)) {
        const [lw2, lh2] = sizeCanvas(lc, 1800 * resScale);
        const c2 = lc.getContext("2d")!;
        c2.clearRect(0, 0, lw2, lh2);
        if (lyricActive) {
          drawLyricOverlay({
            c: c2, w: lw2, h: lh2, time: engine.audio.currentTime, beatE: L.beatE, vt, TK,
            C1, C2, CMix, L,
          });
        }
      }
      lyricWasActive = lyricActive;

      // vignette
      const vg = c.createRadialGradient(cx, cy, R * 0.35, cx, cy, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "transparent");
      vg.addColorStop(1, "rgba(0,0,0,0.5)");
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);
    }

    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
