import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { lazyJsonStorage } from "./lazyStorage";
import type {
  AmbState, FxState, Playlist, Preset, RecState, RepeatMode, SortBy, Stats,
  Take, Track, ViewId, ViewMode,
} from "../types";
import { DEFAULT_FX } from "../constants";
import {
  BUILTIN_PRESETS, DEFAULT_LOOK, DEFAULT_LYRICS, DEFAULT_UI, PALETTES as LOOK_PALETTES,
  modeForOldTheme, paletteForOldHue, sanitizeLook,
  type Look, type LookPreset, type LyricPrefs, type Quality, type UiPrefs,
} from "../flux/look";
import { MODE_IDS } from "../stage/modeIds";
import { uid } from "../utils";
import { DEFAULT_PROVIDER } from "../ai/providers";

export interface ChatMsg {
  role: "user" | "ai";
  text: string;
  /** what the executor actually did, shown under the reply */
  notes?: string[];
}

export interface StoreState {
  // library
  playlists: Playlist[];
  viewMode: ViewMode;
  search: string;
  sortBy: SortBy;
  // transport
  playPl: string;
  current: number;
  playing: boolean;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  smooth: boolean;
  loopA: number | null;
  loopB: number | null;
  cues: (number | null)[];
  sleepEnd: number | null;
  // fx
  fx: FxState;
  amb: AmbState;
  activePreset: string;
  userPresets: Preset[];
  // stage + look
  /** the immersive full-screen stage is open */
  stage: boolean;
  look: Look;
  /** the user's own saved looks (built-ins live in flux/look.ts) */
  lookPresets: LookPreset[];
  /** which preset the current look came from, cleared when it's edited */
  lookFrom: string;
  lyricPrefs: LyricPrefs;
  ui: UiPrefs;
  quality: Quality;
  /** extra A/V offset in ms on top of measured output latency — for Bluetooth
   * and TV pass-through, which delay sound but not the screen */
  syncMs: number;
  /** first-run intro has played */
  introSeen: boolean;
  // recorder / exports
  recState: RecState;
  recTime: number;
  /** visualizer video export */
  vidState: RecState;
  vidTime: number;
  vidMsg: string;
  takes: Take[];
  exporting: string;
  /** feedback from the file picker (iOS silently rejects a lot) */
  importMsg: string;
  // on-device stem separation
  /** play AI instrumentals (when a track has one) instead of the original */
  instMode: boolean;
  stemProgress: string;
  // lyrics
  lyricsOn: boolean;
  /** a lyric lookup for the current track is in flight */
  lyricBusy: boolean;
  /** outcome of the last lookup, per track: drives the searching / not found / error states */
  lyricState: { id: string; state: "searching" | "missing" | "error" | "" };
  /** manual-search candidates awaiting a choice (see lyrics.ts) */
  lyricPicks: import("../lyrics").LyricPick[];
  lyricStatus: string;
  /** auto-search lyrics when a track starts (manual FIND when off) */
  lyricAuto: boolean;
  /** search failed → offer a type-the-artist retry (transient) */
  lyricAskArtist: boolean;
  // profile
  stats: Stats;
  // ── AI layer (all optional; the app is fully functional with no API key) ──
  /** a validated key for the active provider exists in this browser */
  aiReady: boolean;
  /** which AI provider to call (see src/ai/providers.ts) */
  aiProvider: string;
  aiModel: string;
  /** base URL for the OpenAI-compatible provider */
  aiBaseUrl: string;
  /** speech-to-text model for lyric transcription (OpenAI-compatible providers) */
  aiSttModel: string;
  /** a request is in flight (drives the ✦ spinner) */
  aiBusy: boolean;
  aiLabel: string;
  aiPanel: boolean;
  aiChat: ChatMsg[];
  /** last live BPM reading per track id, used as AI context */
  trackBpm: Record<string, number>;
  /** bumped whenever cover art changes so views re-read the cache */
  coverRev: number;
  /** drive visuals from a pre-computed timeline instead of live FFT */
  analyzedMode: boolean;
  /** run the slow, triple-checked analysis on every track automatically */
  deepAnalyze: boolean;
  /** Discord application id for Rich Presence; empty turns it off entirely.
   * Not a secret — it identifies a public application, not an account — but it
   * has to be yours, because the name Discord shows is that application's. */
  discordAppId: string;
  analyzeStatus: string;
  /** why the mini player didn't open, shown in ME → PLAYBACK */
  miniStatus: string;
  /** progress/result text for melody transcription (see audio/revoice.ts) */
  melodyStatus: string;
  /** progress/result text for the online catalogue (see audius.ts) */
  /** transient progress/error line for the DISCOVER panel */
  catStatus: string;
  /** 0..1 attenuation applied to the original track only, so Revoice can
   * replace it rather than play on top of it. The synth joins after this. */
  revoiceDuck: number;
  /** a Spotify session exists in this browser (import is metadata-only) */
  spotifyReady: boolean;
  /** a YouTube Data API key is stored in this browser */
  ytReady: boolean;
  /** transient progress/error line for the YOUTUBE panel */
  ytStatus: string;
  /** hide 30-second excerpts in DISCOVER, so a tap can't import one by mistake */
  fullOnly: boolean;
  /** float a mini player when the app is backgrounded */
  miniPlayer: boolean;
  /** spoken transitions between tracks */
  radioMode: "off" | "host" | "hype";
  // ui
  view: ViewId;
  /** the right-hand pane on Listen: lyrics or the queue */
  listenPane: "lyrics" | "queue";
  /** a playlist the Library should open on arrival (set by Search) */
  libOpen: string | null;
  shortcutsOpen: boolean;
  /** bumped whenever the user edits a connector, so pickers reload the list */
  connectorRev: number;

  // actions
  set: (partial: Partial<StoreState>) => void;
  setFxKey: <K extends keyof FxState>(k: K, v: FxState[K]) => void;
  /** patch one group of the look; marks it as edited */
  setLook: <K extends keyof Look>(k: K, v: Partial<Look[K]>) => void;
  applyLookPreset: (p: LookPreset) => void;
  saveLookPreset: (name: string) => string;
  renameLookPreset: (id: string, name: string) => void;
  duplicateLookPreset: (p: LookPreset) => string;
  deleteLookPreset: (id: string) => void;
  setLyricPrefs: (p: Partial<LyricPrefs>) => void;
  setUi: (p: Partial<UiPrefs>) => void;
  applyPreset: (p: Preset) => void;
  saveUserPreset: () => void;
  deleteUserPreset: (i: number) => void;
  chaos: () => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  toggleFav: (trackId: string) => void;
  toggleTag: (trackId: string, tag: string) => void;
  togglePinCurrent: () => void;
  newPlaylist: () => void;
  renamePlaylist: (plId: string, name: string) => void;
  addTracks: (plId: string, tracks: Track[]) => void;
  removeTrack: (trackId: string, plId: string) => void;
  moveTrack: (plId: string, from: number, to: number) => void;
  movePlaylist: (from: number, to: number) => void;
  copyTrack: (tr: Track, targetId: string) => void;
  playNextQueue: (tr: Track) => void;
  setCue: (i: number, v: number | null) => void;
  addTake: (t: Take) => void;
  removeTake: (id: string) => void;
}

/**
 * v2 → v3: the 85-theme visualizer became seven stage modes.
 *
 * Every old theme maps to the mode closest to it in composition, its palette to
 * the nearest new palette, and the sync offset carries over unchanged since it
 * describes the user's speakers rather than the visuals. Saved looks become
 * personal presets under their own names, so nothing the user built vanishes.
 */
function migrateToLooks(s: Record<string, unknown>): void {
  type OldCfg = { palette?: string; h1?: number; intensity?: number; speed?: number; syncMs?: number; trail?: number };
  const pals: Record<string, [number, number]> = {
    NEON: [187, 100], SUNSET: [18, 95], EMBER: [8, 95], MATRIX: [128, 90], ICE: [198, 85], GOLD: [44, 90],
    VAPOR: [265, 90], LAVA: [0, 100], OCEAN: [192, 90], FOREST: [92, 80], ROSE: [340, 90], GHOST: [0, 4],
    MIDNIGHT: [230, 80], SAKURA: [335, 70], MINT: [158, 65], NOIR: [222, 22], STEEL: [206, 38],
  };
  const toLook = (theme: string | undefined, cfg: OldCfg | undefined): Look => {
    const pal = cfg?.palette ? pals[cfg.palette] : undefined;
    const source = cfg?.palette === "CUSTOM" ? paletteForOldHue(cfg.h1) : pal ? paletteForOldHue(pal[0], pal[1]) : "artwork";
    return sanitizeLook({
      ...DEFAULT_LOOK,
      style: { ...DEFAULT_LOOK.style, mode: modeForOldTheme(theme) },
      color: { ...DEFAULT_LOOK.color, source: LOOK_PALETTES.some((x) => x.id === source) ? source : "artwork" },
      motion: { ...DEFAULT_LOOK.motion, speed: cfg?.speed ?? 1 },
      intensity: { ...DEFAULT_LOOK.intensity, react: Math.min(1.5, cfg?.intensity ?? 1) },
    }, MODE_IDS);
  };
  const cfg = s.visCfg as OldCfg | undefined;
  if (s.visTheme || cfg) {
    s.look = toLook(s.visTheme as string | undefined, cfg);
    s.lookFrom = "";
  }
  if (typeof cfg?.syncMs === "number") s.syncMs = cfg.syncMs;
  const old = s.visPresets as { name: string; look: { theme: string; cfg: OldCfg } }[] | undefined;
  if (Array.isArray(old)) {
    s.lookPresets = old.map((p, i) => ({ id: `m-${i}-${Date.now().toString(36)}`, name: p.name, note: "Imported", look: toLook(p.look?.theme, p.look?.cfg) }));
  }
  if (s.tab) s.view = s.tab === "library" ? "library" : s.tab === "dj" || s.tab === "fx" ? "sound" : s.tab === "me" ? "settings" : "listen";
  for (const k of ["visTheme", "visCfg", "visPresets", "favThemes", "playerTheme", "playerBgOn", "lyricStyle", "lyricFx", "lyricFxs", "lyricFxMatch", "tab"]) delete s[k];
}

export { BUILTIN_PRESETS };

/** Adjusts the playing index when a track list within the playing playlist is edited. */
function shiftCurrent(state: StoreState, plId: string, fn: (cur: number) => number): Partial<StoreState> {
  if (state.playPl !== plId || state.current < 0) return {};
  return { current: fn(state.current) };
}

export const useStore = create<StoreState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        playlists: [{ id: "main", name: "MAIN", tracks: [] }],
        viewMode: { type: "pl", id: "main" },
        search: "",
        sortBy: "added",
        playPl: "main",
        current: -1,
        playing: false,
        progress: 0,
        duration: 0,
        shuffle: false,
        repeat: "all",
        volume: 0.85,
        smooth: true,
        loopA: null,
        loopB: null,
        cues: [null, null, null, null],
        sleepEnd: null,
        fx: { ...DEFAULT_FX },
        amb: { rain: 0, fire: 0, wind: 0 },
        activePreset: "CLEAN",
        userPresets: [],
        stage: false,
        look: DEFAULT_LOOK,
        lookPresets: [],
        lookFrom: "p-veil",
        lyricPrefs: DEFAULT_LYRICS,
        ui: DEFAULT_UI,
        quality: "auto",
        syncMs: 0,
        introSeen: false,
        recState: "idle",
        recTime: 0,
        vidState: "idle",
        vidTime: 0,
        vidMsg: "",
        takes: [],
        exporting: "",
        importMsg: "",
        instMode: false,
        stemProgress: "",
        lyricsOn: true,
        lyricBusy: false,
        lyricState: { id: "", state: "" },
        lyricPicks: [],
        lyricStatus: "",
        lyricAuto: true,
        lyricAskArtist: false,
        stats: { plays: 0, seconds: 0 },
        aiReady: false,
        aiProvider: DEFAULT_PROVIDER,
        aiModel: "",
        aiBaseUrl: "",
        aiSttModel: "whisper-large-v3",
        aiBusy: false,
        aiLabel: "",
        aiPanel: false,
        aiChat: [],
        trackBpm: {},
        coverRev: 0,
        radioMode: "off",
        miniPlayer: true,
        analyzedMode: true,
        deepAnalyze: false,
        discordAppId: "",
        analyzeStatus: "",
        miniStatus: "",
        melodyStatus: "",
        catStatus: "",
        revoiceDuck: 1,
        spotifyReady: false,
        ytReady: false,
        ytStatus: "",
        fullOnly: true,
        view: "listen",
        listenPane: "lyrics",
        libOpen: null,
        shortcutsOpen: false,
        connectorRev: 0,

        set: (partial) => set(partial),

        setFxKey: (k, v) => set((s) => ({ fx: { ...s.fx, [k]: v }, activePreset: "" })),
        setLook: (k, v) => set((s) => ({ look: { ...s.look, [k]: { ...s.look[k], ...v } }, lookFrom: "" })),
        applyLookPreset: (p) => set({ look: sanitizeLook(p.look, MODE_IDS), lookFrom: p.id }),
        saveLookPreset: (name) => {
          const id = `u-${uid()}`;
          set((s) => ({
            lookPresets: [...s.lookPresets, { id, name: name.trim() || "Untitled look", look: s.look }],
            lookFrom: id,
          }));
          return id;
        },
        renameLookPreset: (id, name) =>
          set((s) => ({ lookPresets: s.lookPresets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) })),
        duplicateLookPreset: (p) => {
          const id = `u-${uid()}`;
          set((s) => {
            const at = s.lookPresets.findIndex((x) => x.id === p.id);
            const copy: LookPreset = { id, name: `${p.name} copy`, note: p.note, look: p.look };
            const list = [...s.lookPresets];
            list.splice(at >= 0 ? at + 1 : list.length, 0, copy);
            return { lookPresets: list };
          });
          return id;
        },
        deleteLookPreset: (id) =>
          set((s) => ({ lookPresets: s.lookPresets.filter((p) => p.id !== id), lookFrom: s.lookFrom === id ? "" : s.lookFrom })),
        setLyricPrefs: (p) => set((s) => ({ lyricPrefs: { ...s.lyricPrefs, ...p } })),
        setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),

        applyPreset: (p) => set({ fx: { ...DEFAULT_FX, ...p.fx }, activePreset: p.name }),

        saveUserPreset: () => {
          const { userPresets, fx } = get();
          const name = `MY-${userPresets.length + 1}`;
          set({ userPresets: [...userPresets, { name, fx: { ...fx } }], activePreset: name });
        },

        deleteUserPreset: (i) =>
          set((s) => ({ userPresets: s.userPresets.filter((_, j) => j !== i) })),

        chaos: () =>
          set({
            fx: {
              ...DEFAULT_FX,
              speed: 0.7 + Math.random() * 0.7, vinyl: Math.random() < 0.6,
              pitch: Math.random() < 0.3 ? Math.floor(Math.random() * 9) - 4 : 0,
              reverb: Math.random() * 0.6, size: 1.5 + Math.random() * 3,
              echoMix: Math.random() < 0.5 ? 0 : Math.random() * 0.4,
              echoTime: 0.1 + Math.random() * 0.4, echoFb: Math.random() * 0.55,
              bass: Math.floor(Math.random() * 10) - 2, treble: Math.floor(Math.random() * 8) - 4,
              spin: Math.random() < 0.3, spinRate: 0.3 + Math.random() * 0.8,
              crackle: Math.random() < 0.4 ? Math.random() * 0.6 : 0,
              crush: Math.random() < 0.4 ? Math.random() * 0.5 : 0,
              tone: Math.random() < 0.3 ? 800 + Math.random() * 6000 : 20000,
            },
            activePreset: "??",
          }),

        updateTrack: (trackId, patch) =>
          set((s) => ({
            playlists: s.playlists.map((p) => ({
              ...p,
              tracks: p.tracks.map((tr) => (tr.id === trackId ? { ...tr, ...patch } : tr)),
            })),
          })),

        toggleFav: (trackId) => {
          const tr = get().playlists.flatMap((p) => p.tracks).find((t) => t.id === trackId);
          if (tr) get().updateTrack(trackId, { fav: !tr.fav });
        },

        toggleTag: (trackId, tag) => {
          const tr = get().playlists.flatMap((p) => p.tracks).find((t) => t.id === trackId);
          if (!tr) return;
          const tags = tr.tags.includes(tag) ? tr.tags.filter((t) => t !== tag) : [...tr.tags, tag];
          get().updateTrack(trackId, { tags });
        },

        togglePinCurrent: () => {
          const s = get();
          const pl = s.playlists.find((p) => p.id === s.playPl);
          const tr = s.current >= 0 ? pl?.tracks[s.current] : null;
          if (!tr) return;
          s.updateTrack(tr.id, { fxPin: tr.fxPin ? undefined : { ...s.fx } });
        },

        newPlaylist: () => {
          const id = uid();
          set((s) => ({
            playlists: [...s.playlists, { id, name: `PLAYLIST ${s.playlists.length}`, tracks: [] }],
            viewMode: { type: "pl", id },
          }));
        },

        renamePlaylist: (plId, name) =>
          set((s) => ({
            playlists: s.playlists.map((p) => (p.id === plId ? { ...p, name: name.trim().toUpperCase() } : p)),
          })),

        addTracks: (plId, tracks) =>
          set((s) => ({
            playlists: s.playlists.map((p) => (p.id === plId ? { ...p, tracks: [...p.tracks, ...tracks] } : p)),
          })),

        removeTrack: (trackId, plId) =>
          set((s) => {
            const pl = s.playlists.find((p) => p.id === plId);
            const idx = pl ? pl.tracks.findIndex((t) => t.id === trackId) : -1;
            const playlists = s.playlists.map((p) =>
              p.id === plId ? { ...p, tracks: p.tracks.filter((tr) => tr.id !== trackId) } : p
            );
            let patch: Partial<StoreState> = {};
            if (idx >= 0 && s.playPl === plId && s.current >= 0) {
              if (idx < s.current) patch = { current: s.current - 1 };
              else if (idx === s.current) patch = { current: -1, playing: false };
            }
            return { playlists, ...patch };
          }),

        moveTrack: (plId, from, to) =>
          set((s) => {
            const pl = s.playlists.find((p) => p.id === plId);
            if (!pl || to < 0 || to >= pl.tracks.length || from === to) return {};
            const tracks = [...pl.tracks];
            const [moved] = tracks.splice(from, 1);
            tracks.splice(to, 0, moved);
            return {
              playlists: s.playlists.map((p) => (p.id === plId ? { ...p, tracks } : p)),
              ...shiftCurrent(s, plId, (cur) => {
                if (cur === from) return to;
                if (from < cur && to >= cur) return cur - 1;
                if (from > cur && to <= cur) return cur + 1;
                return cur;
              }),
            };
          }),

        movePlaylist: (from, to) =>
          set((s) => {
            if (to < 0 || to >= s.playlists.length || from === to) return {};
            const playlists = [...s.playlists];
            const [moved] = playlists.splice(from, 1);
            playlists.splice(to, 0, moved);
            return { playlists };
          }),

        copyTrack: (tr, targetId) =>
          set((s) => ({
            playlists: s.playlists.map((p) =>
              p.id === targetId ? { ...p, tracks: [...p.tracks, { ...tr, id: uid() }] } : p
            ),
          })),

        playNextQueue: (tr) =>
          set((s) => ({
            playlists: s.playlists.map((p) => {
              if (p.id !== s.playPl) return p;
              const tracks = [...p.tracks];
              tracks.splice(Math.max(0, s.current + 1), 0, { ...tr, id: uid() });
              return { ...p, tracks };
            }),
          })),

        setCue: (i, v) =>
          set((s) => {
            const cues = [...s.cues];
            cues[i] = v;
            return { cues };
          }),

        addTake: (t) => set((s) => ({ takes: [...s.takes, t] })),
        removeTake: (id) => set((s) => ({ takes: s.takes.filter((t) => t.id !== id) })),
      }),
      {
        name: "flux-store",
        version: 3,
        // v2 turns ANALYZED on. It was opt-in and off by default, which meant
        // almost nobody had the exact drop timeline and everyone got the guessed
        // one instead — and that guessed path was the broken one. Existing
        // installs carry `false` in storage, so flipping the default alone would
        // leave them on the old behaviour forever.
        migrate: (prev: unknown, from: number) => {
          const s = (prev ?? {}) as Record<string, unknown>;
          if (from < 2) s.analyzedMode = true;
          if (from < 3) migrateToLooks(s);
          return s;
        },
        storage: lazyJsonStorage(1500),
        partialize: (s) => ({
          playlists: s.playlists,
          viewMode: s.viewMode,
          sortBy: s.sortBy,
          playPl: s.playPl,
          current: s.current,
          shuffle: s.shuffle,
          repeat: s.repeat,
          volume: s.volume,
          smooth: s.smooth,
          fx: s.fx,
          activePreset: s.activePreset,
          userPresets: s.userPresets,
          look: s.look,
          lookPresets: s.lookPresets,
          lookFrom: s.lookFrom,
          lyricPrefs: s.lyricPrefs,
          ui: s.ui,
          quality: s.quality,
          syncMs: s.syncMs,
          introSeen: s.introSeen,
          listenPane: s.listenPane,
          takes: s.takes,
          stats: s.stats,
          instMode: s.instMode,
          lyricsOn: s.lyricsOn,
          fullOnly: s.fullOnly,
          lyricAuto: s.lyricAuto,
          trackBpm: s.trackBpm,
          radioMode: s.radioMode,
          miniPlayer: s.miniPlayer,
          analyzedMode: s.analyzedMode,
          deepAnalyze: s.deepAnalyze,
          discordAppId: s.discordAppId,
          aiProvider: s.aiProvider,
          aiModel: s.aiModel,
          aiBaseUrl: s.aiBaseUrl,
          aiSttModel: s.aiSttModel,
        }),
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Partial<StoreState>;
          return {
            ...current,
            ...p,
            fx: { ...DEFAULT_FX, ...(p.fx ?? {}) },
            look: sanitizeLook(p.look, MODE_IDS),
            lyricPrefs: { ...DEFAULT_LYRICS, ...(p.lyricPrefs ?? {}) },
            ui: { ...DEFAULT_UI, ...(p.ui ?? {}) },
            lookPresets: (p.lookPresets ?? []).map((x) => ({ ...x, look: sanitizeLook(x.look, MODE_IDS) })),
            // never resume in a transient state
            playing: false,
            stage: false,
            lyricBusy: false,
            recState: "idle",
            vidState: "idle",
            vidTime: 0,
            vidMsg: "",
            aiBusy: false,
            aiLabel: "",
            aiPanel: false,
          };
        },
      }
    )
  )
);

// ── derived helpers ─────────────────────────────────────────────
export const getPlayingList = (s: StoreState) =>
  s.playlists.find((p) => p.id === s.playPl) || s.playlists[0];

export const getCurrentTrack = (s: StoreState): Track | null => {
  const pl = getPlayingList(s);
  return s.current >= 0 ? pl.tracks[s.current] ?? null : null;
};

export const getViewingPlId = (s: StoreState) => (s.viewMode.type === "pl" ? s.viewMode.id : null);

// Derives fresh arrays — call from useMemo, never pass directly to useStore as a selector.
/**
 * A track's artist. Streamed tracks carry it as metadata; local files usually
 * encode it in the filename, so the common "Artist - Title" shape is parsed as
 * a fallback rather than leaving every local import unattributed.
 */
export function artistOf(tr: Track): string | undefined {
  if (tr.artist?.trim()) return tr.artist.trim();
  const m = tr.name.match(/^\s*(.+?)\s+[-–—]\s+.+$/);
  if (!m) return undefined;
  const a = m[1].trim();
  // guard against "01 - Title" and other numbering that looks like an artist
  if (!a || /^\d+$/.test(a) || a.length > 48) return undefined;
  return a;
}

/**
 * Every artist in the library with a track count, most tracks first.
 *
 * Takes the playlists rather than the store because it builds a fresh array
 * every call: used directly as a zustand selector, reference equality would see
 * a change on every render and loop forever. Callers memoise it on `playlists`.
 */
export function getArtists(playlists: Playlist[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of playlists)
    for (const tr of p.tracks) {
      const a = artistOf(tr);
      if (a) map.set(a, (map.get(a) ?? 0) + 1);
    }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

export function getViewEntries(s: Pick<StoreState, "playlists" | "viewMode" | "search" | "sortBy">) {
  let entries: { tr: Track; plId: string; idx: number }[];
  if (s.viewMode.type === "pl") {
    const vm = s.viewMode;
    const pl = s.playlists.find((p) => p.id === vm.id) || s.playlists[0];
    entries = pl.tracks.map((tr, idx) => ({ tr, plId: pl.id, idx }));
  } else {
    entries = [];
    for (const p of s.playlists)
      p.tracks.forEach((tr, idx) => {
        if (s.viewMode.type === "fav" && tr.fav) entries.push({ tr, plId: p.id, idx });
        if (s.viewMode.type === "recent" && tr.lastPlayedAt) entries.push({ tr, plId: p.id, idx });
        if (s.viewMode.type === "tag" && tr.tags?.includes(s.viewMode.tag)) entries.push({ tr, plId: p.id, idx });
        if (s.viewMode.type === "artist" && artistOf(tr) === s.viewMode.artist) entries.push({ tr, plId: p.id, idx });
      });
    if (s.viewMode.type === "recent") entries.sort((a, b) => b.tr.lastPlayedAt - a.tr.lastPlayedAt);
  }
  if (s.search.trim()) {
    const q = s.search.trim().toLowerCase();
    // search the artist too — looking up a name and getting nothing because the
    // artist lives in a separate field is the obvious way this would annoy
    entries = entries.filter(
      (e) => e.tr.name.toLowerCase().includes(q) || (artistOf(e.tr) ?? "").toLowerCase().includes(q),
    );
  }
  if (s.sortBy === "name") entries = [...entries].sort((a, b) => a.tr.name.localeCompare(b.tr.name));
  if (s.sortBy === "plays") entries = [...entries].sort((a, b) => (b.tr.plays || 0) - (a.tr.plays || 0));
  return entries;
}

export const getFavCount = (s: StoreState) =>
  s.playlists.flatMap((p) => p.tracks).filter((t) => t.fav).length;
