// The 60fps render loop: audio analysis, beat/BPM detection, 8D pan drive,
// background edge meters, disc spin, waveform seekbar, and the fullscreen
// visual engine (theme dispatch + particle overlay + mirror/flash/vignette).
import { engine } from "../audio/engine";
import { PALETTES, VIS_THEMES } from "../constants";
import { getCurrentTrack, useStore } from "../store/useStore";
import { shallow } from "zustand/shallow";
import { ac1, ac2 } from "../theme";
import { canvasRefs, live } from "./live";
import { themes, TIME_NORMALISED } from "./themes";
import { MOBILE_THEMES, MOBILE_THEME_SET } from "./mobile";
import { ak } from "./rate";
import type { ThemeCtx } from "./themeTypes";
import { drawLyricOverlay } from "./lyricRenderer";
import { dprCap, isMobile, maxEdge, setSharp } from "./device";
import { project3d, type Mode3D } from "./project3d";
import { drawDropLayers, stepDropLayers, MAX_SLOTS } from "./dropLayers";
import { DRIFT_FRAMES, hueRamp, lighting, rampPos, stopsOf } from "../palette";
import { drawSignatureImpacts, impactsNeedHistory, stepImpactHistory, SIGNATURE_IMPACTS } from "./impactFx";
import { bloomFrame } from "./bloom";

const SIG_SET = new Set<string>(SIGNATURE_IMPACTS);

/**
 * Longest edge of the visualizer's backing store, in device pixels.
 *
 * The browser build has to assume a phone or a tablet, where more pixels is
 * how you turn a smooth theme into a slideshow. The desktop shell says so on
 * the way in (see desktop/preload.cjs), and a laptop or desktop GPU can afford
 * a good deal more — so it gets a sharper picture rather than a bigger one.
 * The adaptive quality signal still scales this down if the machine turns out
 * not to keep up, so raising the ceiling cannot cost frames, only sharpness.
 */

// Which themes actually ask for glow, learned the first time each one draws.
const glowThemes: Record<string, boolean> = {};

// Impacts that copy the frame back over itself. Each of these used to pass the
// visible canvas as its own source, which is a read-write hazard the browser
// resolves by silently snapshotting the whole canvas — once per call, and
// SLICE alone makes seven. One shared snapshot below covers all of them.
const SELF_READ = new Set(["CHROMA", "ZOOM", "TILT", "SLICE", "PIXELATE", "TWIST", "SMEAR", "EDGE"]);

// Snapshot the signature impacts read from. They redraw the picture, so
// sampling the canvas they draw into would compound frame over frame.
const impSnapCv = document.createElement("canvas");

// Offscreen buffer the theme renders into when a 3D mode is on. It carries the
// trail, and the projection reads it as a texture — so the perspective is
// applied once per frame instead of compounding into the trail.
const sceneCv = document.createElement("canvas");

// Scene buffer for the player-page backdrop: it carries that layer's trail,
// so the blur can be applied on the way out instead of compounding into it.
const pbgCv = document.createElement("canvas");

// tiny buffer for the PIXELATE impact (downscale, then blit back unsmoothed)
const pixCv = document.createElement("canvas");

// Pre-rasterised vignette, rebuilt only when the canvas size changes.
const vigCv = document.createElement("canvas");

/** Shapes MIXED draws from. Kept out of P_SHAPES' "MIXED"/"DOT" entries so the
 * pool is all *distinct* silhouettes. */
const SHAPE_POOL = ["DOT", "SQUARE", "TRIANGLE", "DIAMOND", "STAR", "RING", "CROSS", "HEX", "SHARD", "PETAL"];

/**
 * Draws one particle. Everything is a path around (x, y) with radius r, so the
 * caller's fillStyle, alpha and shadow all still apply and shapes cost the same
 * as the circles they replace.
 */
function drawParticle(c: CanvasRenderingContext2D, shape: string, x: number, y: number, r: number, rot: number): void {
  if (shape === "DOT") {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    return;
  }
  if (shape === "RING") {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = Math.max(0.6, r * 0.34);
    c.strokeStyle = c.fillStyle as string;
    c.stroke();
    return;
  }
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  switch (shape) {
    case "SQUARE":
      c.rect(-r, -r, r * 2, r * 2);
      break;
    case "BAR":
      c.rect(-r * 1.6, -r * 0.5, r * 3.2, r);
      break;
    case "TRIANGLE":
      c.moveTo(0, -r * 1.2);
      c.lineTo(r * 1.05, r * 0.7);
      c.lineTo(-r * 1.05, r * 0.7);
      c.closePath();
      break;
    case "DIAMOND":
      c.moveTo(0, -r * 1.3);
      c.lineTo(r * 0.85, 0);
      c.lineTo(0, r * 1.3);
      c.lineTo(-r * 0.85, 0);
      c.closePath();
      break;
    case "STAR":
      // 5 points, alternating outer and inner radius
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.35 : r * 0.55;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      break;
    case "CROSS": {
      const t2 = r * 0.36;
      c.rect(-t2, -r * 1.2, t2 * 2, r * 2.4);
      c.rect(-r * 1.2, -t2, r * 2.4, t2 * 2);
      break;
    }
    case "HEX":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * r * 1.12, py = Math.sin(a) * r * 1.12;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      break;
    case "SHARD":
      c.moveTo(0, -r * 1.7);
      c.lineTo(r * 0.5, r * 0.2);
      c.lineTo(0, r * 1.1);
      c.lineTo(-r * 0.42, r * 0.1);
      c.closePath();
      break;
    case "PETAL":
      c.ellipse(0, 0, r * 0.62, r * 1.45, 0, 0, Math.PI * 2);
      break;
    default:
      c.arc(0, 0, r, 0, Math.PI * 2);
  }
  c.fill();
  c.restore();
}

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
  sub((s) => s.playerTheme, (v) => { live.playerTheme = v; }, { fireImmediately: true });
  sub((s) => s.playerBgOn, (v) => { live.playerBgOn = v; }, { fireImmediately: true });
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
  sub((s) => s.analyzedMode, (v) => { live.analOn = v; }, { fireImmediately: true });
  // pull in (or build) the timeline whenever the mode is on and the track changes
  const wantAnalysis = () => {
    const st = useStore.getState();
    const tr = getCurrentTrack(st);
    if (!st.analyzedMode || !tr) { live.anal = null; return; }
    live.anal = null;
    // Both cursors must be rewound. Leaving analHit parked at the previous
    // track's index left it pointing past most of the new track's hits, so with
    // FAST BEATS driving the pulse from hits the new song barely flashed.
    live.analBeat = 0;
    live.analHit = 0;
    import("../audio/analysis").then(({ ensureAnalysis }) =>
      // AUTO DEEP applies from the moment a track starts, so the better timing
      // is there for the first play rather than only after someone asks for it
      ensureAnalysis(tr.fileId, false, useStore.getState().deepAnalyze).then((a) => {
        const now = getCurrentTrack(useStore.getState());
        if (a && now?.fileId === tr.fileId && useStore.getState().analyzedMode) {
          live.anal = a;
          live.analBeat = 0;
          live.analHit = 0;
        }
      })
    );
  };
  sub((s) => s.analyzedMode, wantAnalysis);
  sub((s) => getCurrentTrack(s)?.fileId, wantAnalysis, { fireImmediately: true });
  // The escalation belongs to a song, so every part of it has to be rewound
  // when the song changes. Without this the guessed-drop counter carried over
  // between tracks, so the second track opened with the first one's layers and
  // — once the running total passed the cap — nothing ever unlocked again for
  // the rest of the session. The analysed path recomputes the ordinal from the
  // timeline every frame and so hid the bug entirely.
  sub(
    (s) => getCurrentTrack(s)?.fileId,
    () => {
      live.dropIdx = 0;
      live.dropSlots = 0;
      live.dropAmts = [];
      live.dropBloom = 0;
      live.dropE = 0;
      live.lastDropAt = -9999;
      live.prevBassSlow = 0;
      live.dropHold = 0;
    }
  );
  sub((s) => s.lyricsOn, (v) => { live.lyricsOn = v; }, { fireImmediately: true });
  sub((s) => s.lyricStyle, (v) => { live.lyricStyle = v; }, { fireImmediately: true });
  // a look saved before effects could stack carries a single `lyricFx`; fold it
  // in so it still applies
  sub(
    (s) => [s.lyricFxs, s.lyricFx] as const,
    ([list, one]) => { live.lyricFxs = list?.length ? list : one && one !== "NONE" ? [one] : []; },
    { fireImmediately: true, equalityFn: shallow }
  );
  sub((s) => s.lyricFxMatch, (v) => { live.lyricFxMatch = v; }, { fireImmediately: true });
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
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap());
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
  const prevSpec = new Uint8Array(512); // previous frame, for spectral flux
  const wave = new Uint8Array(1024);
  let lyricWasActive = false;

  // ── A/V sync ────────────────────────────────────────────────────────────
  // An AnalyserNode reports audio at the point it is tapped in the graph,
  // which is BEFORE that audio reaches the speakers. The gap is
  // baseLatency + outputLatency (~95ms on desktop, more with a large playback
  // buffer), and Bluetooth adds 150-250ms that the browser never reports at
  // all. Uncompensated, every flash and pulse fires that far ahead of the
  // sound — which reads as "the visuals are off" even when beat detection is
  // perfectly correct.
  //
  // So analysis is written into a ring buffer and rendered a few frames late,
  // lining the picture up with what the ear actually hears.
  const RING = 40;
  interface Snap {
    freq: Uint8Array; wave: Uint8Array;
    bass: number; mid: number; treb: number; rms: number;
    beat: boolean; live: boolean;
  }
  const ring: Snap[] = Array.from({ length: RING }, () => ({
    freq: new Uint8Array(512), wave: new Uint8Array(1024),
    bass: 0, mid: 0, treb: 0, rms: 0, beat: false, live: false,
  }));
  let ringHead = 0;
  let frameMs = 16.7;
  let t = 0;
  let lastFrame = 0;

  // Adaptive quality.
  //
  // Resolution alone is not enough. Measured on a 1600x900 window, the cost of
  // the heavy themes is dominated by shadowBlur, not by pixel count: WAVES runs
  // 6x faster with glow off and RING 2.4x, while turning particles off changes
  // almost nothing. Trading only resolution left WAVES at 290ms/frame — the
  // machine was drowning in blur radius, and no amount of shrinking the canvas
  // fixed that.
  //
  // So one continuous `quality` signal drives three things: backing resolution,
  // a cap on glow radius, and particle count. It falls fast under load and
  // creeps back slowly, because oscillating is worse than being slightly soft.
  //
  // The frame gate below quantizes draw deltas to multiples of the display's
  // refresh interval (16.7ms, or 25ms on a 120Hz panel), so judging single
  // frames misreads one dropped tick as jank — hence the smoothed frame time.
  const MIN_RES = 0.32;
  // Below this the picture reads as soft rather than merely small — which is
  // a different kind of broken from "fewer sparks", and a worse one. So it is
  // the last thing given up rather than the first; see the ladder in `draw`.
  // On mobile the sharp floor sits a touch lower and, more to the point, it is
  // multiplied by a smaller maxEdge — so "held sharp" is already far fewer
  // pixels than on the laptop path, which is the whole intent.
  const SHARP_RES = typeof window !== "undefined" && (window as any).__fluxDesktop ? 0.62 : isMobile() ? 0.46 : 0.5;
  // Mobile starts soft and lets AUTO creep it up only if the phone can afford
  // it, rather than opening at full cost and being dragged down over the first
  // laggy second. On desktop/web this stays 1 (the governor takes it from there).
  let quality = isMobile() ? 0.5 : 1;
  let resScale = 1;
  let frameEma = 16.7;
  let lastResChange = 0;
  /** when the engine first ran out of things to give up, 0 while it has some */
  let starvedSince = 0;

  // The display's refresh period, learned from the gaps between rAF callbacks.
  // A running minimum, because jitter only ever makes a gap longer: whatever
  // the shortest gap seen is, the panel is at least that fast. It relaxes
  // upward slowly so moving the window to a slower monitor is picked up.
  let rafPeriod = 16.7;
  let lastRaf = 0;

  // Frame-rate governor.
  //
  // The engine draws at the panel's own rate where it can — 120Hz on the
  // machines that have it — and at 60 where it cannot. Which of those applies
  // cannot be measured while it is capped at 60: the gap between frames is
  // 16.7ms whether the frame took 2ms of work or 16, because that is simply
  // what vsync hands out. So it is settled the only honest way available, by
  // trying it and watching whether ticks are actually missed.
  //
  // Timing the work inside draw() would be the obvious alternative and is the
  // wrong one. Canvas commands are queued and rasterised after the callback
  // returns: a profile of the heavy themes put 57% of the time in
  // rasterisation and under 2% in JS, so the JS clock cheerfully reads "1ms,
  // plenty of room" on a frame that takes two hundred.
  let targetPeriod = 16.7;
  let lastRateChange = 0;
  /** how many times the panel rate has been tried and lost, for the backoff */
  let fastFails = 0;
  /** don't try the panel rate again before this timestamp */
  let fastCooldown = 0;

  const draw = () => {
    // The gate has to be derived from the actual refresh period, not fixed.
    // It used to be a flat 14ms, which is fine on a 120Hz panel and quietly
    // awful on a 60Hz one: a tick arriving 13.9ms after the last drawn frame
    // — well within normal jitter — was skipped, and the next one landed 30ms
    // later. That is a dropped frame and a visible hitch, on the machines
    // least able to afford one, caused by the frame limiter rather than by
    // anything being slow. Half a period of slack puts the threshold between
    // "one tick" and "two ticks" at any refresh rate.
    const nowMs = performance.now();
    const raf = nowMs - lastRaf;
    lastRaf = nowMs;
    if (raf > 3 && raf < 60) rafPeriod = raf < rafPeriod ? raf : rafPeriod + (raf - rafPeriod) * 0.01;
    if (nowMs - lastFrame < targetPeriod - rafPeriod * 0.5) {
      requestAnimationFrame(draw);
      return;
    }
    const delta = nowMs - lastFrame;
    lastFrame = nowMs;

    // How much of a 60Hz frame this one covered.
    //
    // Everything that accumulates per frame is multiplied by this, so a thing
    // moves at the same speed whether the panel delivers 60 frames a second
    // or 120. Clamped at both ends: a tab left in the background comes back
    // with a delta of several seconds, and teleporting every particle to
    // where it "should" be is not a smoother result than dropping the time.
    // Test hook: force the frame factor, so the invariant can be checked
    // without the machine having to actually deliver 120fps — 400 frames at
    // fs=1 and 800 at fs=0.5 cover the same logical time and must therefore
    // produce the same amount of motion (scripts/fps-check.mjs). Only the
    // per-frame factor is pinned; the musical clock below stays on real time.
    const fs = ((window as any).__fsPin as number | undefined) ?? Math.min(3, Math.max(0.05, delta / 16.7));
    t += fs;
    live.fs = fs;
    // Frame-rate-independent `t % n === 0`. Stateless: it asks whether the
    // frame just drawn carried `t` across a multiple of n, so it fires once
    // per n 60Hz-equivalent frames however many real frames that took.
    const every = (n: number) => Math.floor(t / n) !== Math.floor((t - fs) / n);

    // ignore giant deltas (tab was hidden — rAF stops, that isn't slowness)
    if (delta < 250) frameEma += (delta - frameEma) * 0.05;
    // `live` directly: L is the local alias and is not bound until later
    live.frameMs = frameEma;
    live.resScale = resScale;
    // `hiRes` was the old MAX SHARPNESS toggle. A config saved before QUALITY
    // existed rehydrates with quality at its "AUTO" default, so the old flag has
    // to stand in — picking a mode by hand clears it.
    const qMode = live.cfg.hiRes && (live.cfg.quality ?? "AUTO") === "AUTO" ? "MAX" : (live.cfg.quality ?? "AUTO");
    if (qMode === "MAX") {
      quality = 1;
    } else if (qMode === "FAST") {
      // a fixed low setting, so a machine that cannot keep up is fixed
      // immediately rather than after twenty seconds of measured decline
      quality = 0.12;
    } else {
      // Proportional, so being 10x over budget is corrected in a few frames
      // rather than a few seconds. Recovery is a slow creep: a machine that
      // just barely copes should settle, not hunt. Measured against whatever
      // the engine is currently aiming at, not a fixed 16.7 — at the panel
      // rate on a 120Hz display, 16.7ms a frame *is* over budget.
      const over = frameEma / targetPeriod;
      if (over > 1.25) quality = Math.max(0, quality - Math.min(0.2, (over - 1) * 0.09));
      else if (over < 1.06) quality = Math.min(1, quality + 0.008);
    }
    live.quality = quality;

    // ── the frame-rate governor ──
    //
    // Only themes that have been converted to time-based motion may run above
    // 60: the rest still accumulate per frame and would simply animate at
    // double speed (see TIME_NORMALISED in themes/index.ts).
    const panel = Math.max(rafPeriod, 1000 / 120);
    // Never chase 120 on a phone. Even a 120Hz Android panel can't sustain a
    // shadowBlur'd canvas at that rate inside the WebView, and the attempt →
    // starve → back-off → retry loop is a worse stutter than simply holding 60.
    const wantFast = !isMobile() && panel < 13 && TIME_NORMALISED.has(live.visTheme) && (live.cfg.hiFps ?? true);
    // Test hook: pin the rate so a theme's motion can be measured at 60 and at
    // the panel rate without the governor moving the goalposts mid-measurement,
    // and without the opt-in list deciding the answer in advance — the whole
    // point is to measure themes that are not on it yet (scripts/fps-check.mjs).
    const pin = (window as any).__fpsPin as number | undefined;
    if (pin) {
      targetPeriod = pin;
    } else if (nowMs - lastRateChange > 1500) {
      const atPanel = targetPeriod < 16.6;
      if (!atPanel && wantFast && nowMs > fastCooldown && frameEma < 17.8) {
        // holding 60 comfortably, so there is room to go and find out
        targetPeriod = panel;
        frameEma = panel;
        lastRateChange = nowMs;
      } else if (atPanel && (!wantFast || frameEma > panel * 1.35)) {
        // ticks are being missed at the panel rate. Back to 60, and wait
        // longer each time before asking again, so a machine that cannot do
        // it does not spend the whole track oscillating between the two.
        targetPeriod = 16.7;
        frameEma = 16.7;
        lastRateChange = nowMs;
        if (wantFast) fastCooldown = nowMs + Math.min(60000, 8000 * ++fastFails);
      }
    }
    live.targetFps = Math.round(1000 / targetPeriod);

    // Resolution is the one term that cannot follow `quality` directly:
    // resizing the backing store costs a frame and drops the trail with it. So
    // it is quantized and rate-limited, while the glow cap and particle count
    // — both free to change — track quality every frame.
    //
    // It is also the last thing given up rather than the first. Shedding glow
    // and particles makes a frame simpler; shedding resolution makes it soft,
    // and a soft picture reads as broken in a way a sparser one never does.
    // So the floor holds at SHARP_RES until the engine has run out of
    // everything else — quality pinned at the bottom and still over budget for
    // a couple of seconds — and only then goes down to the emergency floor.
    if (quality > 0.06 || frameEma < targetPeriod * 1.2) starvedSince = 0;
    else if (!starvedSince) starvedSince = nowMs;
    const resFloor = starvedSince && nowMs - starvedSince > 2000 ? MIN_RES : SHARP_RES;
    // Test hook: pin the backing-store scale so a diagnostic can hold the theme
    // constant and vary only the pixel count.
    const forced = (window as any).__forceRes as number | undefined;
    const wantRes = forced ?? Math.round((resFloor + (1 - resFloor) * quality) / 0.06) * 0.06;
    if (Math.abs(wantRes - resScale) > 0.03 && nowMs - lastResChange > 900) {
      resScale = Math.min(1, Math.max(MIN_RES, wantRes));
      lastResChange = nowMs;
    }
    const n = engine.nodes;
    const L = live;
    const cfg = L.cfg;
    // HUE SPIN turns the whole palette around the colour wheel.
    //
    // A multi-stop palette already slides its sample window along its own
    // stops; this is a different thing, and it applies to every palette
    // including the two-stop ones, whose ramp is otherwise fixed. At 0 — the
    // default — nothing moves and every existing look is exactly what it was.
    const spinDeg = (cfg.hueSpin ?? 0) > 0 ? ((L.vt * (cfg.hueSpin ?? 0)) / DRIFT_FRAMES) * 360 : 0;
    const spun = (st: number[]) => (spinDeg ? st.map((hh) => hh + spinDeg) : st);

    let bass = 0.08 + Math.sin(t * 0.01) * 0.03, mid = bass * 0.8, treb = bass * 0.5;
    let liveAudio = false, rms = 0, beat = false, hit = false;

    // Test hook: drive the audio side from logical time instead of from the
    // analyser.
    //
    // The frame-rate check compares two runs over the same logical span, and
    // those runs take different amounts of wall clock by construction — so any
    // input that advances on the wall clock is different in each of them. Real
    // audio is exactly that: the two runs hear different parts of the track,
    // and the difference lands in the measurement as motion that is not motion.
    // Turning the audio off instead leaves the spectrum-driven themes with
    // nothing to draw, which is not better.
    //
    // A spectrum synthesised from `t` is the same at the same logical instant
    // in both runs, and rich enough that every theme has something to react to.
    if ((window as unknown as Record<string, unknown>).__fluxSpectrum) {
      const ph = t * 0.021;
      let bAcc = 0, mAcc = 0, tAcc = 0;
      for (let i = 0; i < freq.length; i++) {
        const f = i / freq.length;
        const v =
          0.42 +
          0.3 * Math.sin(ph + f * 9) +
          0.2 * Math.sin(ph * 0.37 + f * 23) +
          0.16 * Math.sin(ph * 1.7 - f * 4.5);
        // a downward tilt, so it has the shape of music rather than of noise
        const val = Math.max(0, Math.min(1, v * Math.pow(1 - f, 1.5) * 1.7));
        freq[i] = Math.round(val * 255);
        if (i < 16) bAcc += freq[i];
        else if (i < 128) mAcc += freq[i];
        else if (i < 380) tAcc += freq[i];
      }
      for (let i = 0; i < wave.length; i++) {
        wave[i] = Math.round(128 + Math.sin(ph * 3 + (i / wave.length) * 26) * 90);
      }
      bass = bAcc / 4080;
      mid = mAcc / 28560;
      treb = tAcc / 64260;
      rms = 0.35 + Math.sin(ph * 0.9) * 0.15;
      liveAudio = true;
      // a steady pulse on the logical clock, so the beat layer runs and runs
      // identically in both runs
      beat = every(30);
      hit = every(15);
      L.bpm = 120;
    } else if (n && L.playing) {
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
      const kickFlux = Math.max(0, kick - L.prevBass);
      L.prevBass = L.prevBass * 0.5 + kick * 0.5;
      // Broadband half-wave-rectified spectral flux, the standard onset
      // function: sum only the bins that got louder. The kick band alone
      // misses snares, chord stabs and anything guitar- or piano-led, which
      // is why acoustic tracks used to barely register a beat at all.
      let sf = 0;
      for (let i = 1; i < 96; i++) {
        const d = beatFreq[i] - prevSpec[i];
        if (d > 0) sf += d;
        prevSpec[i] = beatFreq[i];
      }
      sf /= 95 * 255;
      // whichever cue is stronger wins: kicks drive electronic music, the
      // broadband onset carries everything else
      const flux = Math.max(kickFlux, sf * 0.85);
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
    // ── hand this frame's analysis to the delay ring, then read back the
    // frame matching what is leaving the speakers right now. Everything below
    // this point renders the delayed picture, so the beat envelope, the
    // spectrum and the waveform all stay locked to what the ear hears. ──
    {
      const cur = ring[ringHead];
      cur.freq.set(freq);
      cur.wave.set(wave);
      cur.bass = bass; cur.mid = mid; cur.treb = treb; cur.rms = rms;
      cur.beat = beat; cur.live = liveAudio;
      ringHead = (ringHead + 1) % RING;

      if (delta < 250) frameMs += (delta - frameMs) * 0.05;
      const ctx = n?.ctx;
      const autoMs = ctx ? ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 : 0;
      // the offset covers what the browser cannot see: Bluetooth, soundbars,
      // TV pass-through — all of which delay sound but not the screen
      const totalMs = Math.max(0, Math.min(500, autoMs + (cfg.syncMs ?? 0)));
      const back = Math.max(0, Math.min(RING - 2, Math.round(totalMs / Math.max(8, frameMs))));
      L.syncMs = Math.round(totalMs);
      const out = ring[(ringHead - 1 - back + RING * 2) % RING];
      freq.set(out.freq);
      wave.set(out.wave);
      bass = out.bass; mid = out.mid; treb = out.treb; rms = out.rms;
      beat = out.beat;
      liveAudio = out.live;

      // ── analyzed mode ──
      // The timeline was built from the file itself, so it knows exactly where
      // every beat sits. Sample it at the position currently reaching the
      // speakers (media time minus output latency) and the visuals land on the
      // beat instead of chasing it.
      const A = L.anal;
      hit = false;
      if (A && L.playing) {
        const media = engine.audio.currentTime - totalMs / 1000;
        if (media >= 0 && media <= A.duration) {
          const fi = Math.min(A.bass.length - 1, Math.max(0, Math.round(media * A.fps)));
          bass = A.bass[fi]; mid = A.mid[fi]; treb = A.treb[fi]; rms = A.rms[fi];
          liveAudio = true;
          // fire every beat we have crossed since the last frame
          if (L.analBeat > 0 && A.beats[L.analBeat - 1] > media + 0.4) L.analBeat = 0; // seeked back
          beat = false;
          while (L.analBeat < A.beats.length && A.beats[L.analBeat] <= media) {
            L.analBeat++;
            beat = true;
          }
          // percussive hits: several per beat during fills and double-time
          // passages, so the flashing follows the drums rather than the tempo
          if (L.analHit > 0 && (A.hits[L.analHit - 1] ?? 0) > media + 0.4) L.analHit = 0;
          while (L.analHit < A.hits.length && A.hits[L.analHit] <= media) {
            L.analHit++;
            hit = true;
          }
          if (cfg.fastBeats && hit) beat = true; // drive the main pulse from hits too
          L.bpm = A.bpm;

          // Drop envelope: swell into it, decay out of it.
          //
          // The 1.5s of build and 3s of decay below are what a drop gets when
          // nothing better is known, and they are a guess — right for a dance
          // record and wrong for everything else. A deep analysis measures both
          // per drop, so a long build swells for as long as it actually builds
          // and a drop that stops dead stops dead instead of glowing for three
          // seconds over the silence that was the point of it.
          let de = 0;
          const shapes = A.deep?.shapes;
          for (let k = 0; k < A.drops.length; k++) {
            const d = A.drops[k];
            const sh = shapes?.[k];
            const lead = sh?.lead ?? 1.5;
            const decay = sh?.decay ?? 3;
            const dt = media - d;
            if (dt < -lead || dt > decay) continue;
            // strength scales the whole envelope, so a modest lift reads as a
            // modest one rather than as every drop being the biggest
            const amp = sh ? 0.55 + sh.strength * 0.45 : 1;
            de = Math.max(de, (dt < 0 ? ((lead + dt) / lead) * 0.8 : 1 - dt / decay) * amp);
          }
          L.dropE = de;
          if (de > 0.05) L.energy = Math.max(L.energy, 0.55 + de * 0.45);

          // Which drop are we on? The analyser knows the whole timeline, so the
          // renderer can treat the fourth drop as the fourth rather than as
          // "loud again" — that ordinal is what the escalation ladder rides on.
          let di = 0;
          for (const d of A.drops) if (d <= media) di++;
          if (di > L.dropIdx) L.dropNew = true;
          if (di !== L.dropIdx) L.dropIdx = di;

          // section index = how many section marks we have passed
          let sec = 0;
          for (const t2 of A.sections) if (t2 <= media) sec++;
          L.section = sec;
        }
      } else {
        // No timeline: infer drops from the low end.
        //
        // This is worth getting right rather than treating as a rough stand-in,
        // because it is what runs before the analysis lands and on any file that
        // won't analyse. Measured against a track with drops at 8s, 20s and 32s,
        // the version before this one unlocked exactly one layer per track — and
        // that one at t≈0. Two causes: the baseline started at zero, so the first
        // frames of music scored 0.90 against 0.42 for a real drop (and burned the
        // spacing window on the way past); and it compared an absolute difference
        // against a baseline that followed at 1%/frame, which had caught up long
        // before the next drop, scoring it 0.08 — under any threshold that the
        // opening didn't already trip.
        hit = beat;
        const dsec = Math.min(0.1, delta / 1000);
        const media = engine.audio.currentTime;
        // The loudest jump in any track is its first second — silence into
        // music — and it is not a drop. Seeding the floor from that first frame
        // just moved the false positive rather than removing it: the frame is
        // near-silent, so the very next frame reads as an enormous lift. So the
        // floor only starts tracking once there is real signal to track, and
        // nothing unlocks until it has had a few seconds to settle.
        // Two phases. For the first few seconds the floor chases the signal
        // hard so that it is already accurate when detection starts — otherwise
        // the moment detection switches on, whatever the floor happens to be
        // reads as a lift, and the warm-up boundary becomes the false positive
        // that the track opening used to be.
        const settling = media < 6;
        const warm = !settling && L.prevBassSlow > 0;
        if (L.prevBassSlow <= 0 && bass > 0.05) L.prevBassSlow = bass;
        // A floor that drops quickly and rises slowly. Asymmetry is the point:
        // a loud eight bars must not become the new normal before the next drop
        // arrives, while a track that genuinely quietens should be measured
        // against where it now sits.
        if (L.prevBassSlow > 0) {
          const k = settling ? 3 : bass < L.prevBassSlow ? 2.2 : 0.16;
          L.prevBassSlow += (bass - L.prevBassSlow) * Math.min(1, k * dsec);
        }
        // ratio, not difference, so the same passage reads the same whether the
        // master is hot or quiet
        const lift = warm ? bass / Math.max(0.02, L.prevBassSlow) - 1 : 0;
        L.dropE = Math.max(L.dropE * Math.pow(0.35, dsec), Math.min(1, lift * 0.5));
        // a drop sustains; one loud kick over a quiet bar does not. The
        // threshold is set from measurement rather than taste: an unmistakable
        // quiet-to-full transition measures a lift of about 0.7 here, because
        // `bass` is a normalised FFT band and not linear amplitude, while a
        // track that is simply loud throughout sits around 0.2 once the floor
        // has settled.
        L.dropHold = lift > 0.5 ? L.dropHold + dsec : 0;
        if (
          L.dropHold > 0.35 &&
          media - L.lastDropAt > 12 &&
          L.dropSlots < MAX_SLOTS
        ) {
          L.dropIdx++;
          L.dropNew = true;
          L.lastDropAt = media;
          L.dropHold = 0;
        }
        L.section = 0;
      }
    }

    // ── musical clock ──
    // Everything that decays or travels is stepped in *beats*, not frames.
    // Frame-counted envelopes take the same wall-clock time at every tempo, so
    // they drift out of phase with the music and end up reading as a fixed
    // ~1s loop running beside the track rather than with it. `beatStep` is how
    // much of a beat this frame covered, so one unit of envelope = one beat at
    // any BPM and any refresh rate.
    // Under the frame-rate test hook the musical clock runs on logical time
    // too. Leaving it on the wall clock was a confound of its own and a subtle
    // one: the beat *events* fire on the logical clock, so at half the frame
    // factor there is twice as much real time between them for every envelope
    // to decay through — and every beat-driven theme measured about 40% quieter
    // for a reason that had nothing to do with the theme.
    const dtSec = (window as unknown as Record<string, unknown>).__fluxSpectrum
      ? fs / 60
      : Math.min(0.1, delta / 1000); // clamp: tab-switch gaps aren't music
    const bps = L.bpm > 0 ? (L.bpm * (L.speed || 1)) / 60 : 2;
    const beatStep = L.playing ? dtSec * bps : dtSec * 2;
    const decay = (k: number) => Math.exp(-beatStep * k);
    L.flow += beatStep;

    L.hitE = hit ? 1 : L.hitE * decay(9);
    // beat envelope: back-to-back beats read as separate hits instead of one
    // smeared glow, because the decay tightens as the tempo rises
    L.beatE = beat ? 1 : L.beatE * decay(4.5);

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
    // Skipped entirely while the fullscreen visualizer is up: its root is
    // `position: fixed; inset: 0` over an opaque backdrop, so this layer is
    // provably invisible, and it was still clearing and repainting a
    // full-screen canvas every frame underneath it.
    const bg = canvasRefs.bg;
    if (bg && !L.visOpen) {
      const [w, h] = sizeCanvas(bg, 1100 * resScale); // soft ambient layer — low res is invisible
      const c = bg.getContext("2d")!;
      // Cleared, not painted over with a dark wash: this layer sits above the
      // player's blurred backdrop, and a translucent black fill accumulated to
      // solid over a few frames — which blacked out the backdrop everywhere
      // the centre glow didn't reach.
      c.clearRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.25, 0, w / 2, h * 0.25, h * (0.5 + bass * 0.3));
      g.addColorStop(0, ac1(0.05 + bass * 0.12));
      g.addColorStop(0.6, ac2(0.025 + bass * 0.06));
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Edge meters fade out horizontally instead of ending on a hard edge,
      // so they dissolve into whatever is behind them.
      const SB = 18;
      const MAXW = 33;
      const gl = c.createLinearGradient(0, 0, MAXW, 0);
      gl.addColorStop(0, ac1(0.5));
      gl.addColorStop(0.55, ac1(0.22));
      gl.addColorStop(1, ac1(0));
      const gr = c.createLinearGradient(w - MAXW, 0, w, 0);
      gr.addColorStop(0, ac2(0));
      gr.addColorStop(0.45, ac2(0.22));
      gr.addColorStop(1, ac2(0.5));
      for (let i = 0; i < SB; i++) {
        const v = liveAudio ? freq[i * 9] / 255 : 0.08 + 0.07 * Math.sin(t * 0.02 + i * 0.6);
        const bh2 = h / SB;
        const bw2 = 3 + v * 30;
        // soft vertical falloff too, so the column of bars has no hard ends
        c.globalAlpha = (0.35 + v * 0.65) * (0.45 + 0.55 * Math.sin((i + 0.5) / SB * Math.PI));
        c.fillStyle = gl;
        c.fillRect(0, i * bh2 + 2, bw2, bh2 - 4);
        c.fillStyle = gr;
        c.fillRect(w - bw2, i * bh2 + 2, bw2, bh2 - 4);
      }
      c.globalAlpha = 1;
    }

    // ── spinning disc ──
    if (canvasRefs.disc) {
      if (L.playing) L.rot += 0.7 * L.speed * fs;
      canvasRefs.disc.style.transform = `rotate(${L.rot}deg) scale(${1 + bass * 0.05})`;
      canvasRefs.disc.style.boxShadow = `0 0 ${30 + bass * 70}px ${ac1(0.15 + bass * 0.4)}`;
    }

    // ── decoded waveform seekbar ──
    const wv = canvasRefs.wave;
    if (wv && !L.visOpen) {
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

    // ── player-page ambient backdrop ──
    // The same theme engine, rendered tiny and blurred to a haze behind the
    // glass UI. Deliberately ~1/9th the pixels of the fullscreen path.
    //
    // The blur used to be a CSS `filter: blur(40px)` on the element, which is
    // a full-viewport compositor blur redone every frame — on the page the
    // player sits on the whole time, for a layer that is deliberately out of
    // focus. Doing it here instead means the same softness is applied to the
    // 460px backing store rather than to two million device pixels.
    //
    // It needs its own buffer for the same reason the visualizer does: this
    // layer keeps a trail, and blurring it in place would blur the blur, so
    // the picture would dissolve over a few seconds.
    const pb = canvasRefs.pbg;
    if (pb && !L.visOpen && L.playerBgOn) {
      // no preserve-on-resize: this canvas is now only a blit target, rewritten
      // whole every frame, so there is nothing in it worth carrying across
      const [pw, ph] = sizeCanvas(pb, 460);
      if (pbgCv.width !== pb.width || pbgCv.height !== pb.height) {
        pbgCv.width = pb.width;
        pbgCv.height = pb.height;
      }
      const pc = pbgCv.getContext("2d")!;
      // match pb's transform so the theme sees the same CSS-px geometry
      pc.setTransform(pb.width / Math.max(1, pw), 0, 0, pb.width / Math.max(1, pw), 0, 0);
      const ppal = PALETTES.find((p) => p.id === cfg.palette) || PALETTES[0];
      const pRamp = hueRamp(spun(stopsOf(ppal, cfg.h1, cfg.h2)));
      const pPos = rampPos(pRamp, (L.vt / DRIFT_FRAMES) % 1);
      const pLit = lighting(pRamp, pPos, ppal.s, cfg.lightFx ?? "NORMAL");
      const { C1: pC1, C2: pC2, CMix: pCMix } = pLit;
      pc.globalCompositeOperation = "source-over";
      pc.fillStyle = `rgba(5,6,10,${ak(0.22, fs)})`; // trail fade
      pc.fillRect(0, 0, pw, ph);
      // Full-bleed colour wash. Most themes only paint their subject (a flock,
      // an orb, a wave) and leave the rest of the canvas bare, which showed up
      // as big black regions around the edges of the page. This guarantees the
      // whole backdrop carries palette colour; the theme adds the motion.
      const wash = pc.createRadialGradient(pw * 0.5, ph * 0.4, 0, pw * 0.5, ph * 0.4, Math.max(pw, ph) * 0.92);
      wash.addColorStop(0, pC1(0.34, 44));
      wash.addColorStop(0.5, pCMix(0.5, 0.24, 34));
      wash.addColorStop(1, pC2(0.16, 22));
      pc.fillStyle = wash;
      pc.fillRect(0, 0, pw, ph);
      const corner = pc.createLinearGradient(0, 0, pw, ph);
      corner.addColorStop(0, pC2(0.16, 34));
      corner.addColorStop(0.5, "transparent");
      corner.addColorStop(1, pC1(0.16, 34));
      pc.fillStyle = corner;
      pc.fillRect(0, 0, pw, ph);
      pc.save();
      pc.globalCompositeOperation = "lighter";
      const pI = cfg.intensity;
      themes[L.playerTheme]?.({
        c: pc, w: pw, h: ph, cx: pw / 2, cy: ph / 2, R: Math.min(pw, ph),
        t, vt: L.vt, fs, every, freq, wave, liveAudio,
        bass, mid, treb,
        bassV: Math.min(1, bass * pI), midV: Math.min(1, mid * pI), trebV: Math.min(1, treb * pI),
        beat, beatE: L.beatE, energy: L.energy, dropE: L.dropE, hit, hitE: L.hitE, section: L.section, cfg, I: pI, TK: cfg.thick,
        C1: pC1, C2: pC2, CMix: pCMix,
        // This layer is 460px wide and blurred to a haze, so a wide shadow
        // radius buys a softness the blur applies anyway — full price for an
        // invisible effect, on the page the player sits on all the time.
        glow: (blur, color) => { pc.shadowBlur = Math.min(blur * cfg.glow * 1.6, 4); pc.shadowColor = color; },
        noGlow: () => { pc.shadowBlur = 0; },
        L, trackName: L.trackName,
      });
      pc.restore();
      // out to the visible canvas, blurred. The radius is in backing-store
      // pixels, so it is converted from the ~40 CSS px this layer has always
      // been softened by — otherwise a wide window would be sharper than a
      // narrow one.
      const vis = pb.getContext("2d")!;
      vis.setTransform(1, 0, 0, 1, 0, 0);
      vis.globalCompositeOperation = "copy";
      vis.filter = `blur(${Math.max(2, (40 * pb.width) / Math.max(1, pw)).toFixed(1)}px)`;
      vis.drawImage(pbgCv, 0, 0);
      vis.filter = "none";
      vis.globalCompositeOperation = "source-over";
    }

    // ── fullscreen visual engine ──
    const vc = canvasRefs.vis;
    if (vc && L.visOpen) {
      const mode3d = (cfg.vis3d ?? "OFF") as Mode3D;
      const use3d = mode3d !== "OFF";
      // Blooming a frame means rendering it offscreen: the bloom adds the
      // frame to itself, and if that sum landed in the canvas carrying the
      // trail, the next frame would bloom the bloom and the picture would ramp
      // to white in about a second.
      //
      // Themes that light themselves with pre-rendered sprites never call
      // glow() and so never bloom, and making them pay for an offscreen buffer
      // and a blit is pure loss. Which ones those are is only known after a
      // theme has drawn once, so it is remembered per theme and assumed true
      // for one not seen yet — the conservative way round, since the cost of
      // guessing wrong is one blit rather than a white screen.
      // On a phone, a theme saved from the desktop set would still draw even
      // though the picker no longer offers it — so coerce once, here, rather
      // than trusting every entry point to have done it.
      if (isMobile() && !MOBILE_THEME_SET.has(L.visTheme)) {
        useStore.setState({ visTheme: MOBILE_THEMES[0] });
        L.visTheme = MOBILE_THEMES[0];
      }
      // Sharp mode: a mobile-native theme never calls glow(), so it skips the
      // offscreen buffer, the bloom and the blit — which is what buys the
      // resolution back. Set before the canvas is sized, because that is what
      // reads maxEdge()/dprCap().
      //
      // `!use3d` is the load-bearing half. A 3D projection mode forces the
      // offscreen path regardless of what the theme asks for (see `offscreen`
      // just below), so the saving that pays for the pixels is not there — and
      // granting the higher resolution anyway would hand a phone the original
      // problem with more pixels in it. In 3D, mobile keeps the old ceiling.
      setSharp(isMobile() && !use3d && MOBILE_THEME_SET.has(L.visTheme));
      const offscreen = use3d || glowThemes[L.visTheme] !== false;
      // The visible canvas is then only ever a blit target, so it must not carry
      // the trail — preserve-on-resize moves to the scene buffer instead.
      const [w, h] = sizeCanvas(vc, maxEdge() * resScale, !offscreen);
      // The scene buffer mirrors vc's backing store and transform so themes see
      // exactly the geometry they'd see drawing straight to the screen.
      let c = vc.getContext("2d")!;
      if (offscreen) {
        if (sceneCv.width !== vc.width || sceneCv.height !== vc.height) {
          const keep = sceneCv.width > 0 && sceneCv.height > 0;
          if (keep) {
            snapCv.width = sceneCv.width;
            snapCv.height = sceneCv.height;
            snapCv.getContext("2d")!.drawImage(sceneCv, 0, 0);
          }
          sceneCv.width = vc.width;
          sceneCv.height = vc.height;
          const sc0 = sceneCv.getContext("2d")!;
          sc0.setTransform(1, 0, 0, 1, 0, 0);
          if (keep) sc0.drawImage(snapCv, 0, 0, vc.width, vc.height);
        }
        c = sceneCv.getContext("2d")!;
        // vc's transform is CSS-px scaled; match it so w/h mean the same thing
        const k = vc.width / Math.max(1, w);
        c.setTransform(k, 0, 0, k, 0, 0);
      }
      const cx = w / 2, cy = h / 2, R = Math.min(w, h);

      const pal = PALETTES.find((p) => p.id === cfg.palette) || PALETTES[0];
      // A multi-stop palette slides its sample window round the ramp, so the
      // whole spectrum reaches themes that only ever ask for C1 and C2. Two-stop
      // palettes get the identity and are byte-for-byte what they always were.
      const ramp = hueRamp(spun(stopsOf(pal, cfg.h1, cfg.h2)));
      const pos = rampPos(ramp, (L.vt / DRIFT_FRAMES) % 1);
      const h1 = ramp.at(pos(0));
      const h2 = ramp.at(pos(1));
      const sat = pal.s;
      // The light treatment sits between the palette and the theme, so every
      // theme, the particle overlay and the drop layers all pick it up without
      // knowing it exists.
      const lit = lighting(ramp, pos, sat, cfg.lightFx ?? "NORMAL");
      const { C1, C2, CMix } = lit;
      const GLOW = cfg.glow;
      const TK = cfg.thick;
      // Blur radius is the single most expensive thing the visualizer does, and
      // its cost is superlinear in the radius *and* charged per draw call.
      // Measured at 1440x900 with everything turned up, it was 78% of RING's
      // frame and 71% of WAVES' — for eight and twelve strokes respectively.
      //
      // Capping the radius does not help. Capped at 7px instead of 32, RING
      // measured *the same* — the price is the shadow pass itself, one extra
      // layer allocated, drawn and blurred per call, and the radius barely
      // moves it. So this sets no shadow at all.
      //
      // The halo comes from one bloom pass over the finished frame instead
      // (see bloom.ts), which costs the same whatever the theme drew. Themes
      // still ask for the glow they always asked for; the widest radius asked
      // for is what sets the bloom's strength and spread for the frame, so a
      // theme that strokes with glow(36) still gets a bigger halo than one
      // asking for glow(6).
      let glowWant = 0; // the widest radius any draw call asked for this frame
      const glow = (blur: number, _color: string) => {
        const want = blur * GLOW * 1.6;
        if (want > glowWant) glowWant = want;
      };
      const noGlow = () => {};

      const I = cfg.intensity;
      const bassV = Math.min(1, bass * I), midV = Math.min(1, mid * I), trebV = Math.min(1, treb * I);
      L.vt += cfg.speed * fs;
      const vt = L.vt;

      // Effects are draw calls, and the quality signal has to be able to reach
      // them too: capping resolution and blur radius while still drawing seven
      // layers and a stack of frame-redrawing impacts leaves a slow machine
      // slow. Both are trimmed here, worst-first — the signature impacts each
      // redraw the whole picture, so they go before the cheap ones.
      const wantImp = cfg.impacts ?? [];
      const impCap = quality >= 0.85 ? wantImp.length : Math.max(1, Math.round(1 + quality * 7));
      const IMP = new Set(
        wantImp.length <= impCap
          ? wantImp
          : [...wantImp].sort((a, b) => Number(SIG_SET.has(a)) - Number(SIG_SET.has(b))).slice(0, impCap)
      );
      if (beat && (cfg.flash || IMP.has("FLASH"))) L.flashVal = 0.28;
      if (beat && (cfg.shake || IMP.has("SHAKE"))) L.shakeVal = 7;
      if (beat) {
        if (IMP.has("RINGS") && L.impRings.length < 8) L.impRings.push(0);
        if (IMP.has("SCANLINE")) L.impScan = 0;
      }
      if (L.impScan >= 0) L.impScan += 0.055;
      if (L.impScan > 1.2) L.impScan = -1;
      for (let i = L.impRings.length - 1; i >= 0; i--) {
        L.impRings[i] += 0.028;
        if (L.impRings[i] > 1.25) L.impRings.splice(i, 1);
      }
      if (L.flashVal > 0) L.flashVal *= 0.86;
      if (L.shakeVal > 0) L.shakeVal *= 0.8;
      if (cfg.autoMode !== "off" && L.playing) {
        L.cycleT++;
        if (L.cycleT > 60 * 16) {
          L.cycleT = 0;
          // auto-cycle walks whatever set this device is actually offered
          const cyc = (isMobile() ? MOBILE_THEMES : VIS_THEMES).filter((th) => th !== "CLOCK");
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
      // A fade is a fraction of what is on screen removed per frame, so at
      // twice the frame rate an unscaled one removes twice as much per second
      // and the trail comes out half as long.
      const fade = ak(0.06 + (1 - cfg.trail) * 0.34, fs);
      if (use3d) {
        // In 3D the scene is a *texture*, and it has to keep an alpha channel:
        // fading toward opaque black would make every projected layer a solid
        // rectangle, so a stack of them could only sum — which is exactly how
        // the tunnel ended up as a white blob. Fading alpha instead leaves
        // empty space genuinely empty, so layers show through each other.
        c.save();
        c.globalCompositeOperation = "destination-out";
        c.fillStyle = `rgba(0,0,0,${fade})`;
        c.fillRect(0, 0, w, h);
        c.restore();
      } else {
        c.fillStyle = `rgba(5,6,10,${fade})`;
        c.fillRect(0, 0, w, h);
      }
      if (!use3d && cfg.bgWash > 0.01) {
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
      const punch = IMP.has("PUNCH") ? 1 + L.beatE * 0.09 : 1;
      const squeezeY = IMP.has("SQUEEZE") ? 1 - L.beatE * 0.07 : 1;
      c.scale(cfg.zoom * punch, cfg.zoom * punch * squeezeY);
      c.translate(-cx, -cy);
      c.globalCompositeOperation = "lighter";

      const themeCtx: ThemeCtx = {
        c, w, h, cx, cy, R, t, vt, fs, every, freq, wave, liveAudio,
        bass, mid, treb, bassV, midV, trebV, beat, beatE: L.beatE, energy: L.energy,
        dropE: L.dropE, hit, hitE: L.hitE, section: L.section, cfg, I, TK,
        C1, C2, CMix, glow, noGlow, L, trackName: L.trackName,
      };
      themes[TH]?.(themeCtx);

      // particle overlay w/ styles
      const pShapeCfg = cfg.pShape ?? "MIXED";
      // Size spread. Every particle being near-identical is what made drifts
      // read as static; a wide spread gives a foreground/background feel for
      // free, because bigger reads as nearer.
      const spread = cfg.pSize === "UNIFORM" ? 0 : cfg.pSize === "WILD" ? 1 : 0.5;
      const pScale = cfg.pScale ?? 1;
      const targetCount = Math.floor(cfg.particles * 150 * (0.35 + quality * 0.65));
      while (L.vparts.length < targetCount) {
        // `sz` holds the particle's *rank* (0..1), not its radius. Sizes used to
        // be baked in at spawn, so changing the spread did nothing until a
        // particle recycled — and they never do. Keeping the rank and deriving
        // the radius each frame makes both size controls live.
        L.vparts.push({ x: Math.random(), y: Math.random(), sp: 0.0004 + Math.random() * 0.0012, sz: Math.random(), ph: Math.random() * Math.PI * 2 });
      }
      if (L.vparts.length > targetCount) L.vparts.length = targetCount;
      for (const p of L.vparts) {
        const st = cfg.pStyle;
        const sp = cfg.speed;
        // Every drift below is written as a displacement per frame, so rather
        // than scaling twenty-odd cases by hand the step is taken whole and
        // then scaled to the frame's share of a 60Hz tick. Large jumps are
        // left alone: those are respawns, not travel, and dragging a particle
        // a fraction of the way to its new home would just respawn it again
        // next frame.
        const px0 = p.x, py0 = p.y;
        switch (st) {
          case "RISE": p.y -= p.sp * (1 + bassV * 8) * sp; p.x += Math.sin(vt * 0.01 + p.ph) * 0.0006; break;
          case "SNOW": p.y += p.sp * (0.8 + midV * 3) * sp; p.x += Math.sin(vt * 0.02 + p.ph) * 0.0012; break;
          case "DUST": p.x += Math.sin(vt * 0.008 + p.ph) * 0.0007; p.y += Math.cos(vt * 0.006 + p.ph * 2) * 0.0005; break;
          case "EMBERS": p.y -= p.sp * (2.2 + bassV * 12) * sp; p.x += Math.sin(vt * 0.03 + p.ph) * 0.0014; break;
          case "RAIN": p.y += p.sp * (6 + midV * 5) * sp; p.x += 0.0004 * sp; break;
          case "BUBBLES": p.y -= p.sp * (1.4 + midV * 3) * sp; p.x += Math.sin(vt * 0.04 + p.ph) * 0.0016; break;
          case "SPARKS": p.y += Math.sin(p.ph * 3) * p.sp * 4 * sp; p.x += Math.cos(p.ph * 3) * p.sp * 4 * sp * (1 + L.beatE * 3); break;
          case "FIREFLY": p.x += Math.sin(vt * 0.02 + p.ph * 2) * 0.0011; p.y += Math.cos(vt * 0.017 + p.ph * 3) * 0.0009; break;
          case "PETALS": p.y += p.sp * (1.1 + midV * 2) * sp; p.x += Math.sin(vt * 0.012 + p.ph) * 0.0022; break;
          case "STARS": p.y += p.sp * 0.25 * sp; break;
          case "ASH": p.y += p.sp * (0.7 + bassV) * sp; p.x += Math.sin(vt * 0.005 + p.ph) * 0.0016; break;
          case "PLASMA": { const a = vt * 0.01 + p.ph; p.x += Math.cos(a) * 0.0018 * (1 + bassV * 2); p.y += Math.sin(a * 1.3) * 0.0018 * (1 + bassV * 2); break; }
          case "CONFETTI": p.y += p.sp * (2.4 + midV * 3) * sp; p.x += Math.sin(vt * 0.05 + p.ph * 4) * 0.0026; break;
          case "SWARM": { const dx = 0.5 - p.x, dy = 0.5 - p.y; const d = Math.hypot(dx, dy) || 1;
            p.x += (dx / d) * 0.0009 * sp + Math.sin(vt * 0.03 + p.ph) * 0.0014;
            p.y += (dy / d) * 0.0009 * sp + Math.cos(vt * 0.03 + p.ph) * 0.0014; break; }
          case "DRIFT": p.x += 0.0009 * sp * (1 + trebV); p.y += Math.sin(vt * 0.006 + p.ph) * 0.0004; break;
          case "VORTEX": { const dx = p.x - 0.5, dy = p.y - 0.5; const r = Math.hypot(dx, dy) || 0.001;
            const a2 = Math.atan2(dy, dx) + (0.012 + bassV * 0.02) * sp;
            const nr = Math.max(0.02, r - 0.0007 * sp);
            p.x = 0.5 + Math.cos(a2) * nr; p.y = 0.5 + Math.sin(a2) * nr;
            if (nr <= 0.025) { const ang = Math.random() * 6.28; p.x = 0.5 + Math.cos(ang) * 0.62; p.y = 0.5 + Math.sin(ang) * 0.62; }
            break; }
          case "METEOR": p.x -= p.sp * (5 + bassV * 6) * sp; p.y += p.sp * (3.4 + bassV * 4) * sp; break;
          case "POLLEN": p.x += Math.sin(vt * 0.004 + p.ph) * 0.0006; p.y += Math.sin(vt * 0.0032 + p.ph * 1.7) * 0.0006; break;
          case "GLITTER": p.y += p.sp * 0.9 * sp; p.x += Math.sin(vt * 0.11 + p.ph * 5) * 0.0012; break;
          case "STATIC": if (every(7 + Math.floor(p.ph * 97) % 7)) { p.x = Math.random(); p.y = Math.random(); } break;
        }
        if (fs !== 1) {
          const mx = p.x - px0, my = p.y - py0;
          if (Math.abs(mx) < 0.05 && Math.abs(my) < 0.05) { p.x = px0 + mx * fs; p.y = py0 + my * fs; }
        }
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
        if (p.x < -0.02) p.x = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        const fast = st === "EMBERS" || st === "SPARKS" || st === "GLITTER" || st === "STATIC";
        const tw = fast
          ? 0.3 + Math.abs(Math.sin(vt * 0.09 + p.ph)) * 0.7
          : st === "FIREFLY" || st === "STARS"
            ? 0.15 + Math.abs(Math.sin(vt * 0.03 + p.ph * 2)) * 0.85
            : 0.4 + Math.sin(vt * 0.05 + p.ph) * 0.3;
        const big = st === "SNOW" || st === "BUBBLES" || st === "PETALS" ? 1.3 : st === "STARS" ? 0.8 : 1;
        c.fillStyle = CMix((p.ph % 6.28) / 6.28, (0.28 + bassV * 0.5 + L.beatE * 0.3) * tw, fast ? 60 : 68);
        // rank → radius. r^3 keeps most particles small with a few much larger,
        // which reads far more naturally than a flat distribution.
        const rank = p.sz;
        const base = spread === 0 ? 2 : Math.pow(rank, 3) * (spread * 9) + rank * 1.4 + 0.9;
        const pr = base * pScale * (1 + bassV * 1.6 + L.beatE * 0.8) * big * TK;
        const cxp = p.x * w, cyp = p.y * h;
        if (st === "RAIN" || st === "METEOR") {
          // streaks read as motion far better than dots at these speeds
          c.strokeStyle = c.fillStyle;
          c.lineWidth = Math.max(0.6, pr * 0.7);
          c.beginPath();
          c.moveTo(cxp, cyp);
          c.lineTo(cxp - (st === "METEOR" ? pr * 5 : 0), cyp - pr * (st === "METEOR" ? 3.4 : 6));
          c.stroke();
        } else {
          // MIXED gives each particle its own silhouette, chosen from its
          // stable phase so it never changes shape mid-flight
          const shp = pShapeCfg === "MIXED"
            ? SHAPE_POOL[Math.floor(p.ph * 1000) % SHAPE_POOL.length]
            : pShapeCfg;
          drawParticle(c, shp === "DOT" && st === "CONFETTI" ? "BAR" : shp, cxp, cyp, pr, p.ph + vt * 0.01);
        }
      }

      c.restore();

      // ── drop layers ──
      // Every drop the analyser found unlocks one more layer, and unlocked
      // layers stay for the rest of the track — receding when the music calms,
      // returning when it lifts. Drawn here, in the theme's own space and
      // before the 3D pass, so they read as part of the piece rather than as a
      // filter over it, and so a projected scene carries them onto the surface.
      const dropAmt = cfg.dropFx ?? 1;
      if (dropAmt > 0.01) {
        stepDropLayers(L, beatStep, Math.round(MAX_SLOTS * Math.min(1, dropAmt)));
        // the earned layers all stay unlocked; a struggling device just draws
        // fewer of them, so the escalation resumes in full when it recovers
        drawDropLayers(themeCtx, dropAmt, Math.max(2, Math.round(MAX_SLOTS * (0.35 + quality * 0.65))));
      }
      L.dropNew = false;

      // mirror — folds the left half of whatever was just drawn onto the right
      const sceneSrc = offscreen ? sceneCv : vc;
      if (cfg.mirror) {
        c.save();
        c.globalCompositeOperation = "source-over";
        c.translate(w, 0);
        c.scale(-1, 1);
        c.drawImage(sceneSrc, 0, 0, sceneSrc.width / 2, sceneSrc.height, 0, 0, w / 2, h);
        c.restore();
      }

      // ── 3D pass ──
      // The scene is finished; map it onto a perspective surface on the way to
      // the screen. Everything below this point (impacts, flash, lyrics) is
      // screen-space and so runs on the projected result, which is what you
      // want — a beat flash belongs on the camera, not painted onto the plane.
      if (use3d) {
        c = vc.getContext("2d")!;
        project3d({
          c, src: sceneCv, sw: sceneCv.width, sh: sceneCv.height, w, h,
          mode: mode3d, amt: cfg.vis3dAmt ?? 0.5,
          vt, flow: L.flow, bass: bassV, beatE: L.beatE, dropE: L.dropE,
          wash: cfg.bgWash, C1, C2,
        });
      } else if (offscreen) {
        // bloom without 3D: the scene was rendered offscreen purely to keep the
        // bloom out of the trail, so blit it to the screen unchanged
        c = vc.getContext("2d")!;
        c.save();
        c.globalCompositeOperation = "copy";
        c.drawImage(sceneCv, 0, 0, sceneCv.width, sceneCv.height, 0, 0, w, h);
        c.restore();
      }

      // ── bloom ──
      // Where the halo comes from now: one thresholded, blurred copy of the
      // finished frame, added back over itself. It costs the same on a theme
      // that strokes six paths and one that strokes six hundred, which is the
      // whole point — the per-shape shadow it replaces was priced per call.
      //
      // Reads and writes the visible canvas, which is safe only because
      // everything above rewrote it whole this frame; it never carries over.
      //
      // Strength follows the GLOW slider, which is what that slider has always
      // meant, plus however wide a radius the theme actually asked for: a
      // theme that strokes with glow(36) wants a bigger halo than one that
      // asks for glow(6), and that difference used to be carried by the shadow
      // radius. The WAVE light treatment adds its own on top, as before.
      // A theme that never called glow() does not get a halo it never had —
      // the sprite-lit themes (CROWN, SYNAPSE, LEVIATHAN and the rest that
      // blit a pre-rendered falloff) already carry their own light, and
      // blooming them would be both a look they were never given and a cost
      // they were not paying.
      // Sticky: a theme that glows only on the beat would otherwise flip
      // between rendering offscreen and rendering direct, and the trail lives
      // in whichever buffer that is — so it would flicker on every beat.
      glowThemes[TH] = glowThemes[TH] || glowWant > 0.01;
      // Test hook: the mobile set is defined by never asking for glow, and a
      // theme that quietly starts asking would lose the whole saving without
      // looking any different. This is what the sweep asserts on.
      (window as any).__fluxGlowed = !!glowThemes[TH];
      if (offscreen && (glowWant > 0.01 || lit.bloom > 0)) {
        const asked = Math.min(1, glowWant / 34);
        // The halo is still the first thing to go on a machine that cannot
        // keep up — the same bargain the old glow cap made, one step further
        // along: rather than tightening the radius, the pass stops entirely
        // below a third of full quality and fades back in above it.
        const qGate = quality <= 0.3 ? 0 : Math.min(1, (quality - 0.3) / 0.25);
        const strength = Math.min(1.25, (0.2 + GLOW * 0.75) * (0.45 + asked * 0.75) + lit.bloom * 0.03) * qGate;
        bloomFrame(c, vc, w, h, {
          strength,
          spread: Math.min(0.9, 0.3 + asked * 0.45),
          knee: 0.5,
        });
      }

      // ── the frame the impacts copy from ──
      // Eight of the impacts work by drawing the frame back over itself offset,
      // scaled or rotated. Passing the visible canvas as its own source is a
      // read-write hazard, and the browser resolves it by snapshotting the
      // whole canvas — per call, not per frame. With a full stack up that was
      // fifteen-plus full-frame copies every frame, and the impact layer
      // measured at a third of the frame on every theme tested.
      //
      // One snapshot here serves all of them, including the signature set that
      // already worked this way. The visible difference is that a copy no
      // longer includes the impacts drawn before it, so they layer instead of
      // compounding — which is also what keeps a deep stack from ramping the
      // picture toward white.
      let wantSig = false;
      for (const k of IMP) if (SIG_SET.has(k)) { wantSig = true; break; }
      let wantSnap = wantSig;
      if (!wantSnap) for (const k of IMP) if (SELF_READ.has(k)) { wantSnap = true; break; }
      const snap = impSnapCv;
      if (wantSnap) {
        if (snap.width !== vc.width || snap.height !== vc.height) {
          snap.width = vc.width;
          snap.height = vc.height;
        }
        const ic = snap.getContext("2d")!;
        ic.setTransform(1, 0, 0, 1, 0, 0);
        ic.globalCompositeOperation = "copy";
        ic.drawImage(vc, 0, 0);
        ic.globalCompositeOperation = "source-over";
      }

      // ── per-beat impact layer ──
      if (IMP.has("CHROMA") && L.beatE > 0.04) {
        // split the frame into colour-fringed copies, like a hard camera cut
        const off = L.beatE * Math.min(14, R * 0.02);
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.4 * L.beatE;
        c.drawImage(snap, -off, 0, w, h);
        c.drawImage(snap, off, 0, w, h);
        c.restore();
      }
      if (IMP.has("BLOOM") && L.beatE > 0.02) {
        const bg2 = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.25 + L.beatE * 0.55));
        bg2.addColorStop(0, C1(L.beatE * 0.34, 82));
        bg2.addColorStop(0.5, C2(L.beatE * 0.16, 70));
        bg2.addColorStop(1, "transparent");
        c.fillStyle = bg2;
        c.fillRect(0, 0, w, h);
      }
      if (IMP.has("RINGS")) {
        c.save();
        c.globalCompositeOperation = "lighter";
        for (const rr of L.impRings) {
          const a = Math.max(0, 1 - rr) ** 2;
          c.strokeStyle = C2(a * 0.55, 74);
          c.lineWidth = (1.5 + a * 3.5) * TK;
          c.beginPath();
          c.arc(cx, cy, rr * R * 0.78, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
      if (IMP.has("SCANLINE") && L.impScan >= 0 && L.impScan <= 1) {
        const y = L.impScan * h;
        const sg = c.createLinearGradient(0, y - h * 0.05, 0, y + h * 0.05);
        sg.addColorStop(0, "transparent");
        sg.addColorStop(0.5, C1(0.32, 84));
        sg.addColorStop(1, "transparent");
        c.fillStyle = sg;
        c.fillRect(0, y - h * 0.05, w, h * 0.1);
      }
      if (IMP.has("STROBE") && beat) {
        c.fillStyle = `rgba(255,255,255,0.16)`;
        c.fillRect(0, 0, w, h);
      }
      if (IMP.has("INVERT") && L.beatE > 0.55) {
        c.save();
        c.globalCompositeOperation = "difference";
        c.fillStyle = C1((L.beatE - 0.55) * 0.9, 70);
        c.fillRect(0, 0, w, h);
        c.restore();
      }
      if (IMP.has("VIGNETTE")) {
        const vg = c.createRadialGradient(cx, cy, R * (0.42 - L.beatE * 0.1), cx, cy, R * 0.82);
        vg.addColorStop(0, "transparent");
        vg.addColorStop(1, `rgba(0,0,0,${0.38 + L.beatE * 0.22})`);
        c.fillStyle = vg;
        c.fillRect(0, 0, w, h);
      }

      // ── extended impact set ──
      // All screen-space and all driven by beatE, so they layer with each other
      // and with the theme without any of them knowing about the rest.
      const BE = L.beatE;
      if (IMP.has("ZOOM") && BE > 0.02) {
        // a hard punch-in copy over the top, like a camera slam
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.3 * BE;
        const z = 1 + BE * 0.16;
        c.drawImage(snap, 0, 0, snap.width, snap.height, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
        c.restore();
      }
      if (IMP.has("TILT") && BE > 0.02) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.26 * BE;
        c.translate(cx, cy);
        c.rotate(BE * 0.05 * (L.beats.length % 2 ? 1 : -1));
        c.drawImage(snap, 0, 0, snap.width, snap.height, -cx, -cy, w, h);
        c.restore();
      }
      if (IMP.has("SLICE") && BE > 0.25) {
        // horizontal bands shoved sideways, like a torn signal
        c.save();
        const bands = 7;
        for (let i = 0; i < bands; i++) {
          const by = (i / bands) * h;
          const bh = h / bands;
          const off = (Math.random() - 0.5) * BE * R * 0.12;
          c.drawImage(snap, 0, (by / h) * snap.height, snap.width, (bh / h) * snap.height, off, by, w, bh);
        }
        c.restore();
      }
      if (IMP.has("PIXELATE") && BE > 0.15) {
        // downscale and blit back with smoothing off — cheap true pixelation
        const px = Math.max(8, Math.round(80 / (0.3 + BE)));
        pixCv.width = px;
        pixCv.height = Math.max(4, Math.round(px * (h / w)));
        const pc = pixCv.getContext("2d")!;
        pc.clearRect(0, 0, pixCv.width, pixCv.height);
        pc.drawImage(snap, 0, 0, pixCv.width, pixCv.height);
        c.save();
        c.imageSmoothingEnabled = false;
        c.globalAlpha = Math.min(1, BE * 1.4);
        c.drawImage(pixCv, 0, 0, pixCv.width, pixCv.height, 0, 0, w, h);
        c.restore();
      }
      if (IMP.has("FLARE") && BE > 0.05) {
        // anamorphic streak across the centre
        const fg = c.createLinearGradient(0, cy, w, cy);
        fg.addColorStop(0, "transparent");
        fg.addColorStop(0.5, C1(BE * 0.4, 78));
        fg.addColorStop(1, "transparent");
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = fg;
        c.fillRect(0, cy - h * 0.012 * (1 + BE), w, h * 0.024 * (1 + BE));
        c.restore();
      }
      if (IMP.has("BARS")) {
        // letterbox bars that snap in on the beat
        const bh = h * 0.09 * BE;
        if (bh > 0.5) {
          c.fillStyle = "rgba(0,0,0,0.85)";
          c.fillRect(0, 0, w, bh);
          c.fillRect(0, h - bh, w, bh);
        }
      }
      if (IMP.has("TWIST") && BE > 0.03) {
        // concentric rings each rotated a little more — a swirl without a shader
        c.save();
        c.globalCompositeOperation = "lighter";
        for (let i = 1; i <= 3; i++) {
          const k = i / 3;
          c.save();
          c.globalAlpha = 0.16 * BE * (1 - k * 0.4);
          c.translate(cx, cy);
          c.rotate(BE * 0.28 * k);
          c.scale(1 - k * 0.12, 1 - k * 0.12);
          c.drawImage(snap, 0, 0, snap.width, snap.height, -cx, -cy, w, h);
          c.restore();
        }
        c.restore();
      }
      if (IMP.has("SHOCK") && beat) L.impShock.push(0);
      if (L.impShock.length) {
        c.save();
        c.globalCompositeOperation = "lighter";
        for (let i = L.impShock.length - 1; i >= 0; i--) {
          L.impShock[i] += beatStep * 0.6;
          const rr = L.impShock[i];
          if (rr > 1.1) { L.impShock.splice(i, 1); continue; }
          // a thin, fast ring — reads as a pressure wave rather than a halo
          const a = (1 - rr) ** 3;
          c.strokeStyle = C1(a * 0.8, 80);
          c.lineWidth = (1 + a * 2.5) * TK;
          c.beginPath();
          c.arc(cx, cy, rr * R * 1.1, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
      if (IMP.has("SPOTLIGHT")) {
        // everything outside a moving pool of light is dimmed
        const sx = cx + Math.cos(vt * 0.013) * w * 0.22;
        const sy = cy + Math.sin(vt * 0.017) * h * 0.16;
        const sg = c.createRadialGradient(sx, sy, 0, sx, sy, R * (0.34 + BE * 0.12));
        sg.addColorStop(0, "rgba(0,0,0,0)");
        sg.addColorStop(1, `rgba(0,0,0,${0.55 - BE * 0.15})`);
        c.fillStyle = sg;
        c.fillRect(0, 0, w, h);
      }
      if (IMP.has("SMEAR") && BE > 0.04) {
        // directional motion blur, faked with a few offset copies
        c.save();
        c.globalCompositeOperation = "lighter";
        const dir = Math.cos(vt * 0.01), dy2 = Math.sin(vt * 0.01);
        for (let i = 1; i <= 3; i++) {
          c.globalAlpha = 0.14 * BE / i;
          c.drawImage(snap, 0, 0, snap.width, snap.height, dir * i * BE * 16, dy2 * i * BE * 16, w, h);
        }
        c.restore();
      }
      if (IMP.has("GRAIN")) {
        // film grain that thickens on the beat, drawn as a sparse dot field
        const n = Math.round(140 * (0.3 + BE));
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = `rgba(255,255,255,${0.05 + BE * 0.06})`;
        for (let i = 0; i < n; i++) {
          c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
        }
        c.restore();
      }
      if (IMP.has("EDGE") && BE > 0.02) {
        // difference of two slightly-scaled copies leaves the outlines glowing
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.3 * BE;
        const e = 1 + 0.012 + BE * 0.01;
        c.drawImage(snap, 0, 0, snap.width, snap.height, (w - w * e) / 2, (h - h * e) / 2, w * e, h * e);
        c.restore();
      }

      if (IMP.has("BOUNCE") && BE > 0.02) {
        // The frame drops and comes back, like the camera took the hit. A
        // rebound rather than a fall: the offset overshoots once on the way
        // back, which is the difference between a bounce and a slide.
        // A hard doubled image that lurches down and settles, rather than the
        // frame itself moving. Moving it was tried: this canvas *is* the trail
        // buffer, so painting over it to displace the picture throws the trail
        // away — it worked, and took the mean brightness from 40 to 7.
        //
        // The offset overshoots once on the way back, which is the difference
        // between a bounce and a slide, and the copy is drawn strongly enough
        // to read as a second image rather than as a smear.
        const off = h * 0.055 * BE * (1 - Math.sin(BE * Math.PI * 1.7) * 0.55);
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.62 * BE;
        c.drawImage(snap, 0, 0, snap.width, snap.height, 0, off, w, h);
        c.restore();
      }
      if (IMP.has("BLINDS") && BE > 0.06) {
        // Alternate slats slide opposite ways, so the picture reads as louvred
        // rather than merely torn — the alternation is the whole effect.
        const slats = 14;
        const sh2 = h / slats;
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.3 * BE;
        for (let i = 0; i < slats; i++) {
          const dir = i % 2 ? 1 : -1;
          const sy = i * sh2;
          c.drawImage(
            snap,
            0, (sy / h) * snap.height, snap.width, (sh2 / h) * snap.height,
            dir * BE * w * 0.05, sy, w, sh2
          );
        }
        c.restore();
      }
      if (IMP.has("SHUTTER") && BE > 0.06) {
        // A hard bar crossing the frame, as if something passed the lens. It
        // is drawn opaque and thin rather than translucent and wide: a soft
        // one reads as a glow, and the point is the interruption.
        // Swept across the whole decay of the beat rather than the top third
        // of it. At the original threshold the bar was on screen for about
        // three frames — long enough to register as a flicker, not long enough
        // to read as something crossing the lens.
        const p2 = 1 - (BE - 0.06) / 0.94;
        const barH = h * 0.19;
        const y2 = -barH + p2 * (h + barH * 2);
        c.save();
        c.fillStyle = "rgba(3,4,7,0.92)";
        c.fillRect(0, y2, w, barH);
        c.fillStyle = C1(0.5 * BE, 80);
        c.fillRect(0, y2 + barH, w, 1.5 * TK);
        c.fillRect(0, y2 - 1.5 * TK, w, 1.5 * TK);
        c.restore();
      }
      if (IMP.has("WARP") && BE > 0.04) {
        // Fisheye pulse, built from concentric rings of the frame drawn at
        // increasing scale. A true lens warp needs a per-pixel pass; six
        // clipped annuli give the same read for the price of six draws.
        const rings = 6;
        c.save();
        c.globalCompositeOperation = "lighter";
        for (let i = rings; i >= 1; i--) {
          const f = i / rings;
          const z = 1 + BE * 0.22 * (1 - f * f);
          c.save();
          c.beginPath();
          c.arc(cx, cy, R * 0.62 * f, 0, Math.PI * 2);
          c.clip();
          c.globalAlpha = 0.2 * BE;
          c.drawImage(snap, 0, 0, snap.width, snap.height, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
          c.restore();
        }
        c.restore();
      }
      if (IMP.has("SPECKS") && beat) L.impSpecks.push(0);
      if (IMP.has("SPECKS")) {
        for (let i = L.impSpecks.length - 1; i >= 0; i--) {
          const a2 = (L.impSpecks[i] += beatStep * 0.7);
          if (a2 >= 1) { L.impSpecks.splice(i, 1); continue; }
          const fade = 1 - a2;
          c.save();
          c.globalCompositeOperation = "lighter";
          // deterministic scatter, so a speck keeps its direction across frames
          for (let k = 0; k < 110; k++) {
            const ang = k * 2.3999632 + i;
            const sp = 0.35 + ((k * 37) % 100) / 140;
            const d2 = a2 * R * 0.95 * sp;
            // streaks along their own direction rather than dots: at two
            // pixels a speck is invisible against a lit theme, which is how
            // the first version came out measuring as no change at all
            const len = (2.5 + fade * 7) * TK;
            c.strokeStyle = CMix((k % 7) / 7, fade * 0.85, 86);
            c.lineWidth = 1.8 * TK;
            c.beginPath();
            c.moveTo(cx + Math.cos(ang) * d2, cy + Math.sin(ang) * d2);
            c.lineTo(cx + Math.cos(ang) * (d2 + len), cy + Math.sin(ang) * (d2 + len));
            c.stroke();
          }
          c.restore();
        }
      }
      if (IMP.has("LETTERBOX")) {
        // Cinematic bars that snap in on the beat and ease back out. Opaque,
        // because the whole point of a letterbox is that it is not the picture.
        const barH = h * (0.035 + BE * 0.07);
        c.save();
        c.fillStyle = "rgba(3,4,7,0.95)";
        c.fillRect(0, 0, w, barH);
        c.fillRect(0, h - barH, w, barH);
        c.fillStyle = C1(0.16 + BE * 0.4, 76);
        c.fillRect(0, barH, w, 1.2 * TK);
        c.fillRect(0, h - barH - 1.2 * TK, w, 1.2 * TK);
        c.restore();
      }

      // ── signature impacts ──
      // The ones with real machinery behind them (displacement fields, a frame
      // history, dot screens) live in impactFx.ts.
      if (wantSig) {
        const ictx = {
          c, src: snap, sw: snap.width, sh: snap.height, w, h, R, TK,
          beatE: L.beatE, hitE: L.hitE, beat, flow: L.flow, t,
          C1, C2, CMix,
        };
        if (impactsNeedHistory(IMP)) stepImpactHistory(ictx);
        drawSignatureImpacts(ictx, IMP);
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
        const [lw2, lh2] = sizeCanvas(lc, maxEdge() * resScale);
        const c2 = lc.getContext("2d")!;
        c2.clearRect(0, 0, lw2, lh2);
        if (lyricActive) {
          drawLyricOverlay({
            c: c2, w: lw2, h: lh2, time: engine.audio.currentTime, beatE: L.beatE, vt, TK,
            C1, C2, CMix, freq, h1, h2, sat, L,
          });
        }
      }
      lyricWasActive = lyricActive;

      // ── highlight ceiling ──
      //
      // Stationary bright things go blinding, and it is the trail buffer that
      // does it. Each frame keeps (1 - fade) of the last one and adds the new
      // one on top, so anything that does not move converges to roughly 1/fade
      // times its per-frame brightness — about 4.7x at the default TRAILS. That
      // is why it is always the *centre*: the centre is where themes put the
      // thing that sits still. Every theme with a core glow hits it, so it is
      // handled once here rather than by retuning eighty themes.
      //
      // This was first tried as a blurred mask multiplied back over the frame,
      // and that is the wrong shape for the job: knocking a peak down by a
      // proportion can push it *below* its own surroundings, which turned a
      // white core into a dark hole with the glare still around it. A ceiling
      // cannot do that. `darken` is a per-channel minimum, so everything above
      // the cap comes down to the cap, everything below is untouched, and the
      // ordering of the picture is preserved by construction. It is also a
      // single fill — no buffer, no blur, cheaper than what it replaced.
      c.save();
      c.globalCompositeOperation = "darken";
      c.fillStyle = "rgb(188,188,188)";
      c.fillRect(0, 0, w, h);
      c.restore();

      // Vignette. Identical every frame for a given size, and a full-screen
      // radial gradient is one of the more expensive fills there is when the
      // canvas is not GPU-accelerated — so rasterise it once at quarter size
      // and blit it, which is both cheaper and indistinguishable after the
      // upscale (it has no detail to lose).
      const vw = Math.max(2, Math.round(w / 4)), vh = Math.max(2, Math.round(h / 4));
      if (vigCv.width !== vw || vigCv.height !== vh) {
        vigCv.width = vw;
        vigCv.height = vh;
        const vgc = vigCv.getContext("2d")!;
        const g2 = vgc.createRadialGradient(vw / 2, vh / 2, (Math.min(vw, vh)) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
        g2.addColorStop(0, "transparent");
        g2.addColorStop(1, "rgba(0,0,0,0.5)");
        vgc.clearRect(0, 0, vw, vh);
        vgc.fillStyle = g2;
        vgc.fillRect(0, 0, vw, vh);
      }
      c.drawImage(vigCv, 0, 0, vw, vh, 0, 0, w, h);
    }

    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
