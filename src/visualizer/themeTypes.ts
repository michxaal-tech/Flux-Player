import type { LiveState } from "./live";
import type { VisCfg } from "../types";

/** Everything a theme needs to draw one frame. */
export interface ThemeCtx {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** min(w, h) */
  R: number;
  /** global frame counter */
  t: number;
  /** engine time advanced by cfg.speed each frame */
  vt: number;
  freq: Uint8Array;
  wave: Uint8Array;
  liveAudio: boolean;
  bass: number;
  mid: number;
  treb: number;
  /** intensity-scaled bands */
  bassV: number;
  midV: number;
  trebV: number;
  beat: boolean;
  /**
   * Beat punch envelope: 1 on the beat frame, decaying to 0 over ~10 frames.
   * Multiply sizes/glow/speeds by (1 + beatE * k) for dramatic hits.
   */
  beatE: number;
  /**
   * Musical intensity, 0 (sparse/slow passage) → 1 (dense/fast passage),
   * smoothed over seconds. Branch on it to move differently in a song's calm
   * sections versus its driving ones.
   */
  energy: number;
  /**
   * Drop envelope, 0..1. In ANALYZED mode this rises in the ~1.5s *before* a
   * detected drop and decays over ~3s after it, so a theme can build tension
   * and then detonate on the hit. Without analysis it approximates from a
   * sudden sustained jump in low-end energy.
   */
  dropE: number;
  /**
   * Fires on every significant onset, not just the tempo grid — drum fills and
   * double-time passages produce several of these per beat.
   */
  hit: boolean;
  /** decaying envelope for `hit`, same shape as beatE but faster */
  hitE: number;
  /** broad section index; increments when the arrangement changes character */
  section: number;
  cfg: VisCfg;
  /** cfg.intensity */
  I: number;
  /** cfg.thick */
  TK: number;
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
  CMix: (f: number, a?: number, l?: number) => string;
  glow: (blur: number, color: string) => void;
  noGlow: () => void;
  L: LiveState;
  trackName: string;
}

export type ThemeDraw = (x: ThemeCtx) => void;
