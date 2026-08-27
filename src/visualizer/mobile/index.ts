/**
 * The mobile-native visualizer set.
 *
 * Thirty-five themes written to a phone's budget rather than shrunk down to it.
 * The rule they all keep is in kit.ts: **never call `glow()`**, which is what
 * lets the engine skip the offscreen buffer, the bloom pass and the blit, and
 * in turn is what pays for drawing at nearly native resolution instead of
 * upscaling a 1200px frame. Sharp and fast came from the same decision.
 *
 * On a phone these are the *only* themes offered. The desktop set is untouched
 * and still the whole picker on web and desktop — this is an addition, not a
 * replacement, and nothing here changes what those platforms draw.
 */
import type { ThemeDraw } from "../themeTypes";

import {
  M_PULSEBARS, M_LADDER, M_RIBS, M_COMB, M_STEPWAVE, M_EMBERBARS, M_PRISMBAR,
} from "./spectrum";
import {
  M_SILKLINE, M_TWINWAVE, M_OSCILLO, M_RIPPLELINE, M_THREAD, M_WAVEDOTS, M_SPINE,
} from "./wave";
import {
  M_HALORING, M_PETALS, M_SUNBURST, M_ORBITDOTS, M_IRIS, M_ECHORINGS, M_LOTUS, M_TUNNELITE,
} from "./radial";
import {
  M_EMBERFALL, M_STARDRIFT, M_BUBBLES, M_SNOWLIGHT, M_SPARKBURST, M_RAINLINE, M_GLOWFLIES,
} from "./particles";
import {
  M_HEXPULSE, M_TRIFOLD, M_GRIDWAVE, M_TILES, M_DIAMONDS, M_SPINBOX, M_KALEIDOLITE, M_FACETS,
} from "./geometry";
import {
  M_HORIZONLITE, M_CITYLITE, M_VINYLITE, M_AURORALITE, M_NEONPATH,
} from "./scenes";

/**
 * Registered under plain names — the "M_" prefix is an internal convention to
 * keep these distinct from the desktop themes in imports, and is not something
 * the user should ever see in the picker.
 */
export const MOBILE_THEME_MAP: Record<string, ThemeDraw> = {
  // spectrum
  PULSEBARS: M_PULSEBARS,
  LADDER: M_LADDER,
  RIBS: M_RIBS,
  COMB: M_COMB,
  STEPWAVE: M_STEPWAVE,
  EMBERBARS: M_EMBERBARS,
  PRISMBAR: M_PRISMBAR,
  // wave
  SILKLINE: M_SILKLINE,
  TWINWAVE: M_TWINWAVE,
  OSCILLO: M_OSCILLO,
  RIPPLELINE: M_RIPPLELINE,
  THREAD: M_THREAD,
  WAVEDOTS: M_WAVEDOTS,
  SPINE: M_SPINE,
  // radial
  HALORING: M_HALORING,
  PETALS: M_PETALS,
  SUNBURST: M_SUNBURST,
  ORBITDOTS: M_ORBITDOTS,
  IRIS: M_IRIS,
  ECHORINGS: M_ECHORINGS,
  LOTUS: M_LOTUS,
  TUNNELITE: M_TUNNELITE,
  // particles
  EMBERFALL: M_EMBERFALL,
  STARDRIFT: M_STARDRIFT,
  BUBBLES: M_BUBBLES,
  SNOWLIGHT: M_SNOWLIGHT,
  SPARKBURST: M_SPARKBURST,
  RAINLINE: M_RAINLINE,
  GLOWFLIES: M_GLOWFLIES,
  // geometry
  HEXPULSE: M_HEXPULSE,
  TRIFOLD: M_TRIFOLD,
  GRIDWAVE: M_GRIDWAVE,
  TILES: M_TILES,
  DIAMONDS: M_DIAMONDS,
  SPINBOX: M_SPINBOX,
  KALEIDOLITE: M_KALEIDOLITE,
  FACETS: M_FACETS,
  // scenes
  HORIZONLITE: M_HORIZONLITE,
  CITYLITE: M_CITYLITE,
  VINYLITE: M_VINYLITE,
  AURORALITE: M_AURORALITE,
  NEONPATH: M_NEONPATH,
};

/** Picker order: grouped by family, so scrolling the list feels deliberate. */
export const MOBILE_THEMES: string[] = Object.keys(MOBILE_THEME_MAP);

/** Membership test used by the engine to decide sharp mode. */
export const MOBILE_THEME_SET = new Set(MOBILE_THEMES);

// Debug handle, companion to `__fluxThemes`: lets the mobile sweep enumerate the
// set rather than carrying its own copy, which would silently skip any theme
// added after the check was written.
if (typeof window !== "undefined") (window as any).__fluxMobileThemes = MOBILE_THEMES;
