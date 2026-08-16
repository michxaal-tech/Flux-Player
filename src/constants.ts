import type { FxState, Preset, VisCfg } from "./types";

// Accent colors are CSS vars set from the visualizer palette (see theme.ts),
// so picking a palette re-themes the entire app. Defaults live in styles.css.
export const CYAN = "var(--ac1)";
export const MAG = "var(--ac2)";
export const BG = "#08090D";
export const CARD = "rgba(255,255,255,0.04)";
export const BORDER = "1px solid rgba(255,255,255,0.09)";

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
  speed: 1, vinyl: false, reverb: 0, size: 2.2,
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
  { name: "PHONK", fx: { speed: 0.86, vinyl: true, bass: 6, crackle: 0.3, crush: 0.2, reverb: 0.3 } },
  { name: "KARAOKE", fx: { vocalCut: true, reverb: 0.2, size: 2.4 } },
];

export const VIS_THEMES = [
  "RING", "KALEIDO", "HELIX", "WAVES", "LASERS", "GRID", "ORB", "RIPPLES", "SPIRAL", "FIREFLIES",
  "CITY", "VORTEX", "SCOPE", "AURORA", "DOTGRID", "BARS", "NEBULA", "TUNNEL", "STARFIELD",
  "TIDE", "NOVA", "HALO", "COMETS", "FIREWORKS", "LANTERNS", "JELLY", "CRYSTAL", "BLOOM",
  "ECLIPSE", "GALAXY", "SILK", "LIQUID", "TERMINAL", "GLITCH", "PIXEL", "BRUTAL",
  "VINYL", "THUNDER", "KOI", "CASSETTE", "MARQUEE", "NEONSIGN", "CLOCK",
];

export interface Palette {
  id: string;
  h: [number, number] | null;
  s: number;
}

export const PALETTES: Palette[] = [
  { id: "NEON", h: [187, 317], s: 100 },
  { id: "SUNSET", h: [18, 330], s: 95 },
  { id: "EMBER", h: [8, 44], s: 95 },
  { id: "MATRIX", h: [128, 155], s: 90 },
  { id: "ICE", h: [198, 225], s: 85 },
  { id: "GOLD", h: [44, 58], s: 90 },
  { id: "VAPOR", h: [265, 168], s: 90 },
  { id: "LAVA", h: [0, 28], s: 100 },
  { id: "OCEAN", h: [192, 252], s: 90 },
  { id: "FOREST", h: [92, 152], s: 80 },
  { id: "CANDY", h: [302, 188], s: 95 },
  { id: "ROSE", h: [340, 18], s: 90 },
  { id: "TOXIC", h: [82, 300], s: 100 },
  { id: "GHOST", h: [0, 0], s: 4 },
  { id: "CUSTOM", h: null, s: 100 },
];

export const P_STYLES = ["RISE", "SNOW", "DUST", "EMBERS"];

export const DEFAULT_VIS_CFG: VisCfg = {
  palette: "NEON", h1: 187, h2: 317,
  glow: 0.7, trail: 0.55, particles: 0.35, pStyle: "RISE",
  speed: 1, intensity: 1, zoom: 1, spinV: 0, bgWash: 0.3, thick: 1,
  mirror: false, shake: false, flash: true, autoMode: "off",
};

export const MONO = "'JetBrains Mono', monospace";
export const SANS = "'Space Grotesk', sans-serif";
