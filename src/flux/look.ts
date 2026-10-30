// The look: everything that decides what the stage draws and how the interface
// presents itself. Split into concepts a person can reason about — style,
// colour, movement, intensity, lyrics, interface — rather than one flat bag of
// knobs, because those are the questions people actually ask ("calmer",
// "warmer", "bigger words"), and each maps to exactly one group here.

/** Visual style: which stage mode runs, plus that mode's own two dials. */
export interface StyleCfg {
  mode: string;
  /** 0..1, mode-specific (density, detail, layers…) — named by the mode */
  a: number;
  b: number;
}

export interface ColorCfg {
  /** "artwork" follows the playing track's sleeve; otherwise a palette id */
  source: string;
  /** colour temperature shift, -1 (cool) .. 1 (warm) */
  warmth: number;
  /** saturation multiplier 0..1.4 */
  vivid: number;
}

export interface MotionCfg {
  /** scene drift speed, 0.2..2 */
  speed: number;
  /** how much the scene breathes on its own when the music is quiet, 0..1 */
  drift: number;
}

export interface IntensityCfg {
  /** overall reactivity to the music, 0..1.5 */
  react: number;
  /** "auto" follows tempo when the beat is trustworthy and energy otherwise;
   * "beat" insists on the grid (still gated by confidence); "energy" never
   * snaps to beats at all */
  rhythm: "auto" | "beat" | "energy";
  /** brightness accents on strong beats/transients, 0..1 */
  accents: number;
  /** film grain + vignette amount, 0..1 */
  texture: number;
}

/** A complete visual look — what a preset stores. */
export interface Look {
  style: StyleCfg;
  color: ColorCfg;
  motion: MotionCfg;
  intensity: IntensityCfg;
}

export interface LyricPrefs {
  show: boolean;
  /** type scale, 0.8..1.4 */
  size: number;
  align: "left" | "center";
  /** how an active word/line is marked */
  highlight: "fill" | "glow" | "lift";
  /** darken the stage behind lyric lines so they read over any mode, 0..1 */
  scrim: number;
  /** extra lyric-only offset in ms (positive = lyrics later) */
  offsetMs: number;
}

export interface UiPrefs {
  theme: "ink" | "paper" | "night";
  /** "artwork" or a fixed hex */
  accent: string;
  /** interface motion: full choreography, calmer/shorter, or minimal */
  motion: "full" | "calm" | "minimal";
  /** how visible the live stage is behind the interface, 0..1 */
  backdrop: number;
}

export type Quality = "auto" | "high" | "balanced" | "saver";

export interface Palette {
  id: string;
  name: string;
  /** ground, deep, mid, bright, spark — dark to light, the order every mode reads */
  c: [string, string, string, string, string];
}

export const PALETTES: Palette[] = [
  { id: "ember", name: "Ember", c: ["#0d0907", "#3a1208", "#c2361a", "#ff7a3d", "#ffe2b8"] },
  { id: "tide", name: "Tide", c: ["#05100f", "#0b3a3b", "#1c8a84", "#5fe0c8", "#e6fff6"] },
  { id: "bloom", name: "Bloom", c: ["#120809", "#4a1424", "#c8466a", "#ff9fae", "#fff0e6"] },
  { id: "moss", name: "Moss", c: ["#080b06", "#1d2e10", "#5d8a1e", "#c8f04a", "#f6ffd8"] },
  { id: "glacier", name: "Glacier", c: ["#060a10", "#0f2440", "#3c78b8", "#9fd4ff", "#f2fbff"] },
  { id: "dusk", name: "Dusk", c: ["#0a0810", "#26193d", "#7a3f7a", "#ff9a6b", "#ffe9cf"] },
  { id: "solar", name: "Solar", c: ["#0e0a03", "#3d2500", "#d98a00", "#ffd23f", "#fffbe0"] },
  { id: "mono", name: "Paper", c: ["#0b0b0b", "#222222", "#6b6b6b", "#d9d6cf", "#ffffff"] },
  { id: "signal", name: "Signal", c: ["#0a0a0c", "#1a2a6c", "#e6372b", "#f4c430", "#f5f1e6"] },
  { id: "lagoon", name: "Lagoon", c: ["#030b10", "#063247", "#0f7d8c", "#f2b8a0", "#fff4ec"] },
];

export const paletteById = (id: string): Palette | undefined => PALETTES.find((p) => p.id === id);

export const DEFAULT_LOOK: Look = {
  style: { mode: "veil", a: 0.55, b: 0.5 },
  color: { source: "artwork", warmth: 0, vivid: 1 },
  motion: { speed: 1, drift: 0.6 },
  intensity: { react: 1, rhythm: "auto", accents: 0.6, texture: 0.45 },
};

export const DEFAULT_LYRICS: LyricPrefs = {
  show: true, size: 1, align: "left", highlight: "fill", scrim: 0.55, offsetMs: 0,
};

export const DEFAULT_UI: UiPrefs = { theme: "ink", accent: "artwork", motion: "full", backdrop: 0.7 };

export interface LookPreset {
  id: string;
  name: string;
  /** one short line under the name */
  note?: string;
  look: Look;
  /** built in — can be duplicated but not renamed or deleted */
  builtin?: boolean;
}

const L = (mode: string, a: number, b: number, source: string, extra: Partial<{ speed: number; drift: number; react: number; rhythm: IntensityCfg["rhythm"]; accents: number; texture: number; warmth: number; vivid: number }> = {}): Look => ({
  style: { mode, a, b },
  color: { source, warmth: extra.warmth ?? 0, vivid: extra.vivid ?? 1 },
  motion: { speed: extra.speed ?? 1, drift: extra.drift ?? 0.6 },
  intensity: { react: extra.react ?? 1, rhythm: extra.rhythm ?? "auto", accents: extra.accents ?? 0.6, texture: extra.texture ?? 0.45 },
});

/** Curated starting points — each one a genuinely different composition, not
 * the same mode in different paint. */
export const BUILTIN_PRESETS: LookPreset[] = [
  { id: "p-veil", name: "Northern Hush", note: "Slow curtains of light", builtin: true, look: L("veil", 0.55, 0.5, "artwork") },
  { id: "p-ink", name: "Marbled", note: "Ink folding through water", builtin: true, look: L("ink", 0.5, 0.55, "ember", { speed: 0.9 }) },
  { id: "p-caustic", name: "Pool Light", note: "Refracted light on a floor", builtin: true, look: L("caustic", 0.5, 0.45, "tide") },
  { id: "p-orbit", name: "Clockwork", note: "Orbits that tick on the beat", builtin: true, look: L("orbit", 0.6, 0.5, "mono", { accents: 0.75 }) },
  { id: "p-signal", name: "Poster", note: "Swiss rhythm, bar by bar", builtin: true, look: L("signal", 0.5, 0.5, "signal", { texture: 0.6 }) },
  { id: "p-ridge", name: "Night Ridge", note: "Sound as receding hills", builtin: true, look: L("ridge", 0.55, 0.5, "dusk", { speed: 0.8 }) },
  { id: "p-words", name: "Loud Type", note: "The lyrics, set huge", builtin: true, look: L("words", 0.5, 0.5, "solar", { accents: 0.7 }) },
  { id: "p-still", name: "Still Water", note: "Barely moving — for reading", builtin: true, look: L("caustic", 0.3, 0.3, "glacier", { speed: 0.45, react: 0.45, accents: 0.2, texture: 0.3, rhythm: "energy" }) },
  { id: "p-rave", name: "Afterhours", note: "Everything turned up", builtin: true, look: L("ink", 0.85, 0.8, "bloom", { speed: 1.5, react: 1.4, accents: 1, texture: 0.55 }) },
];

const clamp = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
};

/** Validate an untrusted look (saved, migrated, AI-made) against the schema. */
export function sanitizeLook(raw: unknown, modes: string[]): Look {
  const r = (raw ?? {}) as Partial<Look>;
  const d = DEFAULT_LOOK;
  const st = (r.style ?? {}) as Partial<StyleCfg>;
  const co = (r.color ?? {}) as Partial<ColorCfg>;
  const mo = (r.motion ?? {}) as Partial<MotionCfg>;
  const it = (r.intensity ?? {}) as Partial<IntensityCfg>;
  return {
    style: {
      mode: typeof st.mode === "string" && modes.includes(st.mode) ? st.mode : d.style.mode,
      a: clamp(st.a, 0, 1, d.style.a),
      b: clamp(st.b, 0, 1, d.style.b),
    },
    color: {
      source: typeof co.source === "string" && (co.source === "artwork" || paletteById(co.source)) ? co.source : d.color.source,
      warmth: clamp(co.warmth, -1, 1, 0),
      vivid: clamp(co.vivid, 0, 1.4, 1),
    },
    motion: { speed: clamp(mo.speed, 0.2, 2, 1), drift: clamp(mo.drift, 0, 1, 0.6) },
    intensity: {
      react: clamp(it.react, 0, 1.5, 1),
      rhythm: it.rhythm === "beat" || it.rhythm === "energy" ? it.rhythm : "auto",
      accents: clamp(it.accents, 0, 1, 0.6),
      texture: clamp(it.texture, 0, 1, 0.45),
    },
  };
}

// ── migration from the 85-theme visualizer ─────────────────────────────────
// Old saves carry a theme name and a hue-pair palette. Each old theme is sent to
// the new mode whose composition is closest to it, and the palette to the new
// palette nearest its first hue, so an upgrade lands somewhere familiar rather
// than on the defaults.
const THEME_TO_MODE: Record<string, string> = {};
const group = (mode: string, names: string) => names.split(" ").forEach((n) => (THEME_TO_MODE[n] = mode));
group("veil", "AURORA AURORAFALL SILK WAVES BOREALIS HALO NEBULA BLOOM CATHEDRAL ASCENSION");
group("ink", "LIQUID INKFLOW LAVALAMP JELLY MURMUR KOI SERPENT TIDE MAELSTROM SANDSTORM SMEAR");
group("caustic", "RIPPLES PRISM CRYSTAL BIOLUME FIREFLIES LANTERNS ORB NOVA ECLIPSE");
group("orbit", "ORRERY RING GYROSCOPE GALAXY SPIRAL VORTEX CLOCK HELIX MECHANISM CROWN SINGULARITY WORMHOLE STARFIELD COMETS QUANTUM VINYL");
group("signal", "BARS GRID DOTGRID BRUTAL PIXEL GLITCH TERMINAL CIRCUITRY KALEIDO MONOLITH VOXEL TESSERACT STRATA CASCADE CITY CASSETTE VHS GRAFFITI");
group("ridge", "HORIZON CANYON TOPOGRAPH SCOPE PARALLAX THUNDER TUNNEL WARPGATE INFERNO RUPTURE CITADEL LEVIATHAN");
group("words", "MARQUEE NEONSIGN");

export function modeForOldTheme(theme: string | undefined): string {
  return (theme && THEME_TO_MODE[theme]) || DEFAULT_LOOK.style.mode;
}

const PAL_HUE: Record<string, number> = {
  ember: 12, tide: 172, bloom: 345, moss: 85, glacier: 208, dusk: 290, solar: 45, lagoon: 190, signal: 5,
};

export function paletteForOldHue(h: number | undefined, sat?: number): string {
  if (sat !== undefined && sat < 25) return "mono";
  if (h === undefined) return "artwork";
  let best = "ember", bd = 999;
  for (const [id, ph] of Object.entries(PAL_HUE)) {
    const d = Math.min(Math.abs(ph - h), 360 - Math.abs(ph - h));
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
