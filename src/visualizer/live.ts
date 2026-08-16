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
  prog: number; // 0..1
  dur: number;
  loopA: number | null;
  loopB: number | null;
  // engine-owned scratch state
  rot: number;
  vt: number;
  tunnel: { z: number; rot: number }[];
  stars: { x: number; y: number; z: number }[];
  vparts: { x: number; y: number; sp: number; sz: number; ph: number }[];
  specHist: number[][];
  ripples: { r: number; a: number }[];
  flies: { x: number; y: number; vx: number; vy: number; ph: number }[];
  vort: { a: number; r: number; sp: number }[];
  cityH: number[];
  shakeVal: number;
  beatAvg: number;
  beatCool: number;
  beats: number[];
  bpm: number;
  flashVal: number;
  cycleT: number;
}

export const live: LiveState = {
  playing: false, speed: 1, spin: false, spinRate: 0.55, visOpen: false, visTheme: "RING",
  cfg: { ...DEFAULT_VIS_CFG }, trackName: "", peaks: null, prog: 0, dur: 0, loopA: null, loopB: null,
  rot: 0, vt: 0, tunnel: [], stars: [], vparts: [], specHist: [], ripples: [],
  flies: [], vort: [], cityH: [], shakeVal: 0,
  beatAvg: 0, beatCool: 0, beats: [], bpm: 0, flashVal: 0, cycleT: 0,
};

/** DOM targets the render loop draws into. Components register/unregister these on mount. */
export const canvasRefs = {
  bg: null as HTMLCanvasElement | null,
  wave: null as HTMLCanvasElement | null,
  vis: null as HTMLCanvasElement | null,
  disc: null as HTMLDivElement | null,
  bpm: new Set<HTMLElement>(),
  level: null as HTMLDivElement | null,
};
