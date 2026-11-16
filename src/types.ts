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
  /** which online catalogue it came from (see catalogue.ts); absent means a
   * local file */
  source?: string;
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
  /** remote artwork URL from the catalogue it came from (local files carry
   * theirs inside the audio — see flux/art.ts) */
  art?: string;
  /** synced lyrics, sorted by time. `words` is present only when the source
   * carried real per-word timing (enhanced LRC, word-level transcription) */
  lyrics?: LyricLineData[];
  /** false when the lyrics are untimed prose spread evenly — shown as static
   * text rather than pretending to follow the song */
  lyricsTimed?: boolean;
  /** seconds to shift this track's lyrics by (positive = later), for a source
   * that runs early or late against this particular recording */
  lyricOffset?: number;
}

export interface LyricWord {
  /** start, seconds */
  t: number;
  /** end, seconds (optional — the next word's start otherwise) */
  e?: number;
  text: string;
}

export interface LyricLineData {
  t: number;
  text: string;
  /** line end when the source knows it */
  e?: number;
  words?: LyricWord[];
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
export type ViewId = "listen" | "library" | "search" | "sound" | "studio" | "settings";
/** @deprecated legacy tab ids, still accepted from the AI "ui" action */
export type TabId = "player" | "visuals" | "dj" | "fx" | "library" | "yt" | "me";
export type SortBy = "added" | "name" | "plays";

export interface AmbState {
  rain: number;
  fire: number;
  wind: number;
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
