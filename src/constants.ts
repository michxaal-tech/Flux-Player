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

export const VIS_THEMES = [
  "RING", "KALEIDO", "HELIX", "WAVES", "LASERS", "GRID", "ORB", "RIPPLES", "SPIRAL", "FIREFLIES",
  "CITY", "VORTEX", "SCOPE", "AURORA", "DOTGRID", "BARS", "NEBULA", "TUNNEL", "STARFIELD",
  "TIDE", "NOVA", "HALO", "COMETS", "FIREWORKS", "LANTERNS", "JELLY", "CRYSTAL", "BLOOM",
  "ECLIPSE", "GALAXY", "SILK", "LIQUID", "TERMINAL", "GLITCH", "PIXEL", "BRUTAL",
  "VINYL", "THUNDER", "KOI", "CASSETTE",
  "MURMUR", "INKFLOW", "SHATTER", "SERPENT", "BLOOMRAIL", "MAGNETIC", "ORACLE",
  "AURORAFALL", "GRAVITY", "CIRCUITRY",
  "PRISM", "REACTOR", "ORIGAMI", "SANDSTORM", "CATHEDRAL", "BIOLUME", "MECHANISM", "WORMHOLE", "GRAFFITI", "CONSTELLATION", "VHS", "LAVALAMP",
  "SAMURAI", "QUANTUM", "TOPOGRAPH",
  "MARQUEE", "NEONSIGN", "CLOCK",
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
  { id: "MIDNIGHT", h: [230, 285], s: 80 },
  { id: "SAKURA", h: [335, 355], s: 70 },
  { id: "CYBER", h: [300, 180], s: 95 },
  { id: "MINT", h: [158, 195], s: 65 },
  { id: "ROYAL", h: [255, 45], s: 85 },
  { id: "BLOOD", h: [352, 10], s: 92 },
  { id: "SUNRISE", h: [35, 205], s: 90 },
  { id: "COSMOS", h: [272, 205], s: 88 },
  { id: "PEACH", h: [22, 342], s: 82 },
  { id: "ARCTIC", h: [198, 168], s: 55 },
  { id: "VOLT", h: [62, 122], s: 100 },
  { id: "NOIR", h: [222, 222], s: 22 },
  { id: "BOREAL", h: [140, 280], s: 85 },
  { id: "RUST", h: [16, 198], s: 72 },
  { id: "ULTRA", h: [286, 322], s: 100 },
  { id: "HONEY", h: [38, 12], s: 88 },
  { id: "ABYSS", h: [206, 172], s: 78 },
  { id: "CUSTOM", h: null, s: 100 },
];

export const P_STYLES = ["RISE", "SNOW", "DUST", "EMBERS"];

export const DEFAULT_VIS_CFG: VisCfg = {
  palette: "NEON", h1: 187, h2: 317,
  glow: 0.7, trail: 0.55, particles: 0.35, pStyle: "RISE",
  speed: 1, intensity: 1, zoom: 1, spinV: 0, bgWash: 0.3, thick: 1,
  mirror: false, shake: false, flash: true, autoMode: "off", hiRes: false, syncMs: 0,
};

export const MONO = "'JetBrains Mono', monospace";
export const SANS = "'Space Grotesk', sans-serif";
