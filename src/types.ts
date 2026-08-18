export interface FxState {
  speed: number;
  vinyl: boolean;
  /** independent pitch shift in semitones (0 = off), separate from speed/tape */
  pitch: number;
  reverb: number;
  size: number;
  echoMix: number;
  echoTime: number;
  echoFb: number;
  bass: number;
  mid: number;
  treble: number;
  spin: boolean;
  spinRate: number;
  crackle: number;
  crush: number;
  tone: number;
  highpass: number;
  vocalCut: boolean;
  boost: number;
}

export interface Preset {
  name: string;
  fx: Partial<FxState>;
}

export interface Track {
  id: string;
  /** Key of the audio blob in persistent storage. Copies of a track share one fileId. */
  fileId: string;
  name: string;
  /** performer, from the source's metadata or parsed out of the filename */
  artist?: string;
  /** where the track came from; absent means a local file */
  source?: "audius";
  sourceId?: string;
  plays: number;
  fav: boolean;
  tags: string[];
  note: string;
  addedAt: number;
  lastPlayedAt: number;
  fxPin?: FxState;
  peaks?: number[];
  /** an on-device AI instrumental exists as blob `inst-<fileId>` */
  hasInst?: boolean;
  /** synced lyrics (LRC), sorted by time */
  lyrics?: { t: number; text: string }[];
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

export type ViewMode =
  | { type: "pl"; id: string }
  | { type: "fav" }
  | { type: "recent" }
  | { type: "tag"; tag: string }
  | { type: "artist"; artist: string };

export type RepeatMode = "off" | "all" | "one";
export type TabId = "player" | "visuals" | "dj" | "fx" | "library" | "me";
export type SortBy = "added" | "name" | "plays";

export interface AmbState {
  rain: number;
  fire: number;
  wind: number;
}

export interface VisCfg {
  palette: string;
  h1: number;
  h2: number;
  glow: number;
  trail: number;
  particles: number;
  pStyle: string;
  /** particle silhouette (see P_SHAPES); MIXED varies it per particle */
  pShape: string;
  /** how widely particle sizes vary within one drift (see P_SIZES) */
  pSize: string;
  /** overall particle size multiplier */
  pScale: number;
  speed: number;
  intensity: number;
  zoom: number;
  spinV: number;
  bgWash: number;
  thick: number;
  mirror: boolean;
  shake: boolean;
  flash: boolean;
  /** additional per-beat impact effects, by name (see IMPACTS) */
  impacts: string[];
  /** theme auto-advance every ~16s: off (stay put), cycle (in order), shuffle (random) */
  autoMode: "off" | "cycle" | "shuffle";
  /** force maximum backing resolution, disabling adaptive quality scaling.
   * Superseded by `quality`; kept so saved looks and presets still load. */
  hiRes: boolean;
  /** AUTO adapts to the measured frame time, MAX pins full quality, FAST pins a
   * low one for machines that cannot keep up (see engine.ts) */
  quality: string;
  /** flash on every percussive hit, not just the tempo grid (analyzed mode) */
  fastBeats: boolean;
  /** 3D projection applied to whatever the theme drew: OFF renders it flat,
   * the rest map it onto a perspective surface (see project3d.ts) */
  vis3d: string;
  /** 0..1 — how aggressive the 3D perspective is */
  vis3dAmt: number;
  /** how the palette becomes actual colour (see palette.ts LIGHT_FX):
   * NORMAL is the plain mapping, WAVE is the WAVES theme's glowing translucent
   * treatment applied to whatever theme is running */
  lightFx: string;
  /** 0..1 — drop escalation strength. 0 disables it; higher also allows more
   * of the theme's layer set to be unlocked (see dropLayers.ts) */
  dropFx: number;
  /** extra A/V sync offset in ms on top of the measured output latency —
   * raise it for Bluetooth headphones, which delay sound but not the screen */
  syncMs: number;
}

export interface Stats {
  plays: number;
  seconds: number;
}

/** A recorder take or an offline FX export. Blob lives in persistent storage under `take-<id>`. */
export interface Take {
  id: string;
  name: string;
  secs: number;
  /** audio session take (default) or an exported visualizer video */
  kind?: "audio" | "video";
}

export type RecState = "idle" | "rec";

export interface ViewEntry {
  tr: Track;
  plId: string;
  idx: number;
}
