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
  "ASCENSION", "LEVIATHAN", "CATHODE", "CITADEL", "SYNAPSE",
  "VOXEL", "TESSERACT",
  "MONOLITH", "ORRERY", "CANYON", "GYROSCOPE", "SINGULARITY",
  "STRATA", "CROWN", "CASCADE", "FISSION", "PARALLAX",
  "HORIZON", "RUPTURE", "WARPGATE", "INFERNO", "MAELSTROM",
];

/** Staged themes: instead of one look reacting to volume, these build in layers.
 * New elements arrive as the arrangement fills out (a second instrument, vocals),
 * and a detected drop triggers a one-off set-piece. They lean on the offline
 * analysis (dropE / section / hitE), so they're at their best in ANALYZED mode.
 * The picker marks them with STAGED_MARK. */
export const STAGED_THEMES = new Set([
  "ASCENSION", "LEVIATHAN", "CATHODE", "CITADEL", "SYNAPSE",
  "MONOLITH", "ORRERY", "CANYON", "GYROSCOPE", "SINGULARITY",
  "STRATA", "CROWN", "CASCADE", "FISSION", "PARALLAX",
]);

export const STAGED_MARK = "◈";

export interface Palette {
  id: string;
  /** Hue stops. Two stops is a plain A→B ramp; three or more make a cycle the
   * whole app walks through (see palette.ts). null means CUSTOM, which takes
   * the user's own pair. */
  h: number[] | null;
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

  // Multi-stop palettes. Everything above is a two-colour ramp; these cycle
  // through their whole stop list, so a theme that only draws two colours still
  // moves through the entire spectrum over about half a minute.
  { id: "RAINBOW", h: [0, 45, 108, 172, 248, 302], s: 92 },
  { id: "PRISM", h: [190, 232, 284, 330, 22], s: 96 },
  { id: "PLASMA", h: [268, 306, 344, 24, 56], s: 100 },
  { id: "MIAMI", h: [328, 354, 28, 186], s: 95 },
  { id: "OPAL", h: [172, 206, 258, 302, 334], s: 56 },
  { id: "TIEDYE", h: [282, 322, 12, 48, 148], s: 88 },
  { id: "BOREALIS", h: [148, 174, 202, 262], s: 86 },
  { id: "REEF", h: [178, 198, 32, 342], s: 88 },
  { id: "SLICK", h: [228, 276, 324, 24, 88, 168], s: 64 },
  { id: "CITRUS", h: [58, 36, 12, 96], s: 90 },

  // Three-stop palettes. Two colours can only ever be a gradient; three is the
  // smallest number that reads as a *scheme*, and being cyclic they rotate
  // through all three rather than sitting on a single blend.
  { id: "RGB", h: [0, 120, 240], s: 100 },
  { id: "TRIAD", h: [186, 306, 66], s: 92 },
  { id: "DUSK", h: [268, 328, 22], s: 84 },
  { id: "LAGOON", h: [168, 196, 262], s: 80 },
  { id: "FORGE", h: [10, 40, 318], s: 94 },
  { id: "POISON", h: [88, 152, 286], s: 90 },
  { id: "CORAL", h: [348, 18, 192], s: 86 },
  { id: "IRIS", h: [232, 284, 172], s: 76 },

  { id: "BRUISE", h: [280, 340], s: 78 },
  { id: "SAGE", h: [96, 172], s: 55 },
  { id: "COPPER", h: [24, 200], s: 76 },
  { id: "ORCHID", h: [292, 200], s: 82 },
  { id: "MAGMA", h: [352, 40], s: 98 },
  { id: "STEEL", h: [206, 240], s: 38 },

  { id: "CUSTOM", h: null, s: 100 },
];

/** Themes that read well as a soft, blurred backdrop behind the player UI.
 * A curated subset of VIS_THEMES — busy/high-contrast ones fight the glass. */
export const PLAYER_THEMES = [
  "AURORA", "NEBULA", "GALAXY", "TIDE", "SILK", "LIQUID", "BLOOM", "HALO",
  "ORB", "RIPPLES", "FIREFLIES", "LANTERNS", "JELLY", "COMETS", "STARFIELD",
  "NOVA", "ECLIPSE", "SPIRAL", "HELIX", "WAVES", "KALEIDO", "VORTEX", "TUNNEL",
  "INKFLOW", "MURMUR", "BIOLUME", "AURORAFALL", "LAVALAMP", "CONSTELLATION",
  "WORMHOLE", "HORIZON",
];

export const P_STYLES = [
  "RISE", "SNOW", "DUST", "EMBERS", "RAIN", "BUBBLES", "SPARKS", "FIREFLY",
  "PETALS", "STARS", "ASH", "PLASMA", "CONFETTI", "SWARM", "DRIFT", "VORTEX",
  "METEOR", "POLLEN", "GLITTER", "STATIC",
];

/** Per-beat impact effects, layered over whatever the theme drew. Stack freely. */
export const IMPACTS = [
  "FLASH", "SHAKE", "MIRROR", "PUNCH", "CHROMA", "BLOOM", "STROBE",
  "RINGS", "SCANLINE", "INVERT", "SQUEEZE", "VIGNETTE",
  "ZOOM", "TILT", "SLICE", "PIXELATE", "FLARE", "BARS", "TWIST",
  "SHOCK", "SPOTLIGHT", "SMEAR", "GRAIN", "EDGE",
  // signature set — see visualizer/impactFx.ts
  "MELT", "RIPPLE", "GHOST", "DATAMOSH", "HALFTONE",
  "PRISM", "CRT", "STAMP", "SHARDS", "BREATH",
  "BOUNCE", "BLINDS", "SHUTTER", "WARP", "SPECKS", "LETTERBOX",
];

/**
 * Everything introduced by the most recent change, badged NEW in the pickers.
 *
 * Clear this and refill it with the next batch — the badge is meant to say
 * "new since you last looked", so leaving old entries in makes it meaningless.
 */
export const NEW_ITEMS = new Set<string>([
  "STRATA", "CROWN", "CASCADE", "FISSION", "PARALLAX",
  "RAINBOW", "PRISM", "PLASMA", "MIAMI", "OPAL", "TIEDYE", "BOREALIS", "REEF", "SLICK", "CITRUS",
  "WAVE", "WAVE GLOW", "AUTO", "MAX", "FAST",
  "HORIZON", "RUPTURE", "WARPGATE", "INFERNO", "MAELSTROM",
  "BOUNCE", "BLINDS", "SHUTTER", "WARP", "SPECKS", "LETTERBOX", "HUE SPIN",
  "RGB", "TRIAD", "DUSK", "LAGOON", "FORGE", "POISON", "CORAL", "IRIS",
  "BRUISE", "SAGE", "COPPER", "ORCHID", "MAGMA", "STEEL",
]);

/** Particle silhouettes. MIXED assigns one per particle, so a single drift can
 * carry several shapes at once. */
export const P_SHAPES = [
  "MIXED", "DOT", "SQUARE", "TRIANGLE", "DIAMOND", "STAR", "RING",
  "CROSS", "HEX", "SHARD", "PETAL", "BAR",
];

/** Size spread presets: how much particle sizes vary within one drift. */
export const P_SIZES = ["UNIFORM", "VARIED", "WILD"];

/** Rendering quality: adapt to the device, or pin it high or low by hand. */
export const QUALITY_MODES = ["AUTO", "MAX", "FAST"];

export const DEFAULT_VIS_CFG: VisCfg = {
  palette: "NEON", h1: 187, h2: 317,
  glow: 0.7, trail: 0.55, particles: 0.35, pStyle: "RISE", pShape: "MIXED", pSize: "VARIED", pScale: 1,
  speed: 1, intensity: 1, zoom: 1, spinV: 0, bgWash: 0.3, thick: 1,
  mirror: false, shake: false, flash: true, impacts: [], autoMode: "off", hiRes: false, quality: "AUTO", hiFps: true, hueSpin: 0, fastBeats: true, syncMs: 0,
  vis3d: "OFF", vis3dAmt: 0.5, dropFx: 1, lightFx: "NORMAL",
};

export const MONO = "'JetBrains Mono', monospace";
export const SANS = "'Space Grotesk', sans-serif";
