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
  | { type: "tag"; tag: string };

export type RepeatMode = "off" | "all" | "one";
export type TabId = "player" | "dj" | "fx" | "library" | "me";
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
  speed: number;
  intensity: number;
  zoom: number;
  spinV: number;
  bgWash: number;
  thick: number;
  mirror: boolean;
  shake: boolean;
  flash: boolean;
  /** theme auto-advance every ~16s: off (stay put), cycle (in order), shuffle (random) */
  autoMode: "off" | "cycle" | "shuffle";
  /** force maximum backing resolution, disabling adaptive quality scaling */
  hiRes: boolean;
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
}

export type RecState = "idle" | "rec";

export interface ViewEntry {
  tr: Track;
  plId: string;
  idx: number;
}
