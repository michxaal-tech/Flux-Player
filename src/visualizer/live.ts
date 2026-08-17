import type { VisCfg } from "../types";
import { DEFAULT_VIS_CFG } from "../constants";

/**
 * Mutable per-frame state read by the render loop. Mirrors of store values are
 * synced via store subscriptions (see engine.ts) so the rAF loop never touches React.
 */
export interface LiveState {
  // mirrored from store
  playing: boolean;
  speed: number;
  spin: boolean;
  spinRate: number;
  visOpen: boolean;
  visTheme: string;
  cfg: VisCfg;
  trackName: string;
  peaks: number[] | null;
  lyricLines: { t: number; text: string }[] | null;
  lyricsOn: boolean;
  lyricStyle: string;
  /** per-letter lyric effect (see lyricFx.ts), independent of lyricStyle */
  lyricFx: string;
  /** re-hue the fixed-colour letter effects onto the active palette */
  lyricFxMatch: boolean;
  prog: number; // 0..1
  dur: number;
  loopA: number | null;
  loopB: number | null;
  // engine-owned scratch state
  rot: number;
  vt: number;
  tunnel: { z: number; rot: number; hot: boolean }[];
  stars: { x: number; y: number; z: number }[];
  vparts: { x: number; y: number; sp: number; sz: number; ph: number }[];
  specHist: { v: number[]; hot: boolean }[];
  ripples: { r: number; a: number }[];
  flies: { x: number; y: number; vx: number; vy: number; ph: number }[];
  vort: { a: number; r: number; sp: number }[];
  cityH: number[];
  shakeVal: number;
  beatAvg: number;
  /** previous frame's bass level, for onset (flux) detection */
  prevBass: number;
  /** running average of positive bass flux */
  fluxAvg: number;
  /** running mean absolute deviation of the flux, for the adaptive threshold */
  fluxDev: number;
  /** timestamp of the last detected beat (refractory period is time-based,
   * so detection behaves the same at 17fps and 120fps) */
  lastBeatAt: number;
  beats: number[];
  bpm: number;
  flashVal: number;
  cycleT: number;
  /** Beat punch envelope: jumps to 1 on every detected beat, decays ~10%/frame. */
  beatE: number;
  /**
   * Musical intensity, 0 (sparse/slow passage) → 1 (dense/fast passage),
   * smoothed over seconds from loudness, beat rate and brightness. Themes use
   * it to move differently through a song's calm and driving sections.
   */
  energy: number;
  playerTheme: string;
  playerBgOn: boolean;
  /** pre-computed timeline for the playing track (analyzed mode) */
  anal: import("../audio/analysis").Analysis | null;
  analOn: boolean;
  /** index of the next beat in anal.beats */
  analBeat: number;
  dropE: number;
  /** slow-following bass baseline, for approximating drops without analysis */
  prevBassSlow: number;
  hitE: number;
  section: number;
  /** index of the next entry in anal.hits */
  analHit: number;
  /** expanding beat rings (IMPACTS "RINGS"), 0..1.25 each */
  impRings: number[];
  /** expanding SHOCK rings, 0..1 each */
  impShock: number[];
  /** sweeping scanline position (IMPACTS "SCANLINE"), -1 when idle */
  impScan: number;
  /** total A/V compensation currently applied, ms (measured + user offset) */
  syncMs: number;
  /** Musical time, in beats. Advances with the detected tempo rather than with
   * frames, so anything driven by it stays in phase at any BPM or refresh rate. */
  flow: number;
  /** how many drops of the analysed timeline have gone by (see dropFx.ts) */
  dropIdx: number;
  /** frame index of the last approximated drop, for rate limiting */
  lastDropAt: number;
  /** true on the single frame a new drop lands */
  dropNew: boolean;
  /** escalation tier: how many drop effects have been unlocked so far */
  dropTier: number;
  /** one-shot detonation envelope, 1 on the drop frame */
  dropBang: number;
  /** expanding drop shockwaves, 0..1 each */
  dropRings: number[];
  /** frame-shatter tiles, spawned at the top of the ladder */
  dropTiles: { x: number; y: number; vx: number; vy: number; rot: number; a: number }[];
  /** Per-theme scratch buckets keyed by theme; new themes park their state here. */
  scratch: Record<string, any>;
}

export const live: LiveState = {
  playing: false, speed: 1, spin: false, spinRate: 0.55, visOpen: false, visTheme: "RING",
  cfg: { ...DEFAULT_VIS_CFG }, trackName: "", peaks: null, lyricLines: null, lyricsOn: true, lyricStyle: "FADE", lyricFx: "NONE", lyricFxMatch: true,
  prog: 0, dur: 0, loopA: null, loopB: null,
  rot: 0, vt: 0, tunnel: [], stars: [], vparts: [], specHist: [], ripples: [],
  flies: [], vort: [], cityH: [], shakeVal: 0,
  beatAvg: 0, prevBass: 0, fluxAvg: 0, fluxDev: 0, lastBeatAt: 0, beats: [], bpm: 0, flashVal: 0, cycleT: 0,
  beatE: 0, energy: 0.35, anal: null, analOn: false, analBeat: 0, dropE: 0, prevBassSlow: 0, hitE: 0, section: 0, analHit: 0, impRings: [], impScan: -1, impShock: [], syncMs: 0, playerTheme: "AURORA", playerBgOn: true, scratch: {},
  flow: 0, lastDropAt: -9999, dropIdx: 0, dropNew: false, dropTier: 0, dropBang: 0, dropRings: [], dropTiles: [],
};

// Debug handle: inspect the render-loop state from the console (window.__flux).
if (typeof window !== "undefined") (window as any).__flux = live;

/** DOM targets the render loop draws into. Components register/unregister these on mount. */
export const canvasRefs = {
  bg: null as HTMLCanvasElement | null,
  wave: null as HTMLCanvasElement | null,
  vis: null as HTMLCanvasElement | null,
  /** low-res ambient theme behind the player page (CSS-blurred) */
  pbg: null as HTMLCanvasElement | null,
  /** crisp overlay above the vis canvas (lyrics) — cleared every frame */
  lyr: null as HTMLCanvasElement | null,
  disc: null as HTMLDivElement | null,
  bpm: new Set<HTMLElement>(),
  level: null as HTMLDivElement | null,
};
