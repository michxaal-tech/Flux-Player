import type { FxState, Preset } from "./types";

// The instrument panels (FX rack, deck, sources, settings) were written against
// these names. They now resolve to the design tokens in styles/tokens.css, so
// those panels follow the live accent and the panel surface without each one
// being rewritten. CYAN/MAG kept their names for that reason only: they are
// the primary and secondary accent, whatever colour that currently is.
export const CYAN = "var(--accent)";
export const MAG = "var(--accent-2)";
export const BG = "var(--panel-bg)";
export const CARD = "var(--panel-card)";
export const BORDER = "1px solid var(--panel-line)";

export const TAGS = ["HYPE", "CHILL", "FOCUS", "SAD", "WORKOUT", "NIGHT"];

export const LEVELS = [
  { min: 0, name: "SHOWER SINGER" },
  { min: 5, name: "BEDROOM LISTENER" },
  { min: 15, name: "CRATE DIGGER" },
  { min: 30, name: "SELECTOR" },
  { min: 60, name: "RESIDENT DJ" },
  { min: 120, name: "SOUND ARCHITECT" },
  { min: 240, name: "FLUX LEGEND" },
];

export const DEFAULT_FX: FxState = {
  speed: 1, vinyl: false, pitch: 0, reverb: 0, size: 2.2,
  echoMix: 0, echoTime: 0.28, echoFb: 0.35,
  bass: 0, mid: 0, treble: 0, spin: false, spinRate: 0.55,
  crackle: 0, crush: 0, tone: 20000, highpass: 20,
  vocalCut: false, boost: 1,
};

export const PRESETS: Preset[] = [
  { name: "CLEAN", fx: {} },
  { name: "SLOWED+REVERB", fx: { speed: 0.8, vinyl: true, reverb: 0.5, size: 3.2, bass: 3 } },
  { name: "NIGHTCORE", fx: { speed: 1.27, vinyl: true, treble: 2, reverb: 0.12 } },
  { name: "8D", fx: { spin: true, spinRate: 0.55, reverb: 0.25, size: 2.6 } },
  { name: "VINYL '72", fx: { crackle: 0.55, tone: 6500, bass: 2, treble: -3, speed: 0.99, vinyl: true } },
  { name: "HALL", fx: { reverb: 0.65, size: 4.4, echoMix: 0.12, echoTime: 0.21 } },
  { name: "BASS CANNON", fx: { bass: 9, crush: 0.3, reverb: 0.08, boost: 1.25 } },
  { name: "UNDERWATER", fx: { tone: 750, reverb: 0.4, size: 3.5, speed: 0.92, vinyl: true } },
  { name: "DIAL TONE", fx: { tone: 3400, highpass: 350, bass: -10, treble: -6, crush: 0.4 } },
  // Memphis phonk: slowed tape + pitched-down, heavy saturated bass, dark
  // rolled-off top, slapback echo, dusty crackle
  { name: "PHONK", fx: { speed: 0.82, vinyl: true, pitch: -2, bass: 7, mid: -1.5, treble: -4, crackle: 0.45, crush: 0.45, reverb: 0.32, size: 3.2, echoMix: 0.18, echoTime: 0.32, echoFb: 0.42, tone: 5600, highpass: 34, boost: 1.15 } },
  { name: "KARAOKE", fx: { vocalCut: true, reverb: 0.2, size: 2.4 } },
];

export const MONO = "var(--font-mono)";
export const SANS = "var(--font-ui)";
