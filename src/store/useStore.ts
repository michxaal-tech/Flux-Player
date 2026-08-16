import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type {
  AmbState, FxState, Playlist, Preset, RecState, RepeatMode, SortBy, Stats, TabId,
  Take, Track, ViewMode, VisCfg,
} from "../types";
import { DEFAULT_FX, DEFAULT_VIS_CFG, P_STYLES, PALETTES, VIS_THEMES } from "../constants";
import { uid } from "../utils";

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
  // vis
  visOpen: boolean;
  visTheme: string;
  visCfg: VisCfg;
  visPanel: boolean;
  // recorder / exports
  recState: RecState;
  recTime: number;
  takes: Take[];
  exporting: string;
  // profile
  stats: Stats;
  // ui
  tab: TabId;
  shortcutsOpen: boolean;

  // actions
  set: (partial: Partial<StoreState>) => void;
  setFxKey: <K extends keyof FxState>(k: K, v: FxState[K]) => void;
  setVisKey: <K extends keyof VisCfg>(k: K, v: VisCfg[K]) => void;
  applyPreset: (p: Preset) => void;
  saveUserPreset: () => void;
  deleteUserPreset: (i: number) => void;
  chaos: () => void;
  visChaos: () => void;
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
        visOpen: false,
        visTheme: "RING",
        visCfg: { ...DEFAULT_VIS_CFG },
        visPanel: false,
        recState: "idle",
        recTime: 0,
        takes: [],
        exporting: "",
        stats: { plays: 0, seconds: 0 },
        tab: "player",
        shortcutsOpen: false,

        set: (partial) => set(partial),

        setFxKey: (k, v) => set((s) => ({ fx: { ...s.fx, [k]: v }, activePreset: "" })),
        setVisKey: (k, v) => set((s) => ({ visCfg: { ...s.visCfg, [k]: v } })),

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

        visChaos: () => {
          const pal = PALETTES[Math.floor(Math.random() * (PALETTES.length - 1))];
          const th = VIS_THEMES.filter((x) => x !== "CLOCK");
          set((s) => ({
            visCfg: {
              ...s.visCfg, palette: pal.id,
              glow: 0.3 + Math.random() * 0.7, trail: Math.random() * 0.9, particles: Math.random(),
              pStyle: P_STYLES[Math.floor(Math.random() * P_STYLES.length)],
              speed: 0.5 + Math.random() * 1.2, intensity: 0.7 + Math.random() * 1.0,
              zoom: 0.8 + Math.random() * 0.5, spinV: (Math.random() - 0.5) * 1.6,
              bgWash: Math.random() * 0.6, thick: 0.6 + Math.random() * 1.4,
              mirror: Math.random() < 0.35, shake: Math.random() < 0.5,
            },
            visTheme: th[Math.floor(Math.random() * th.length)],
          }));
        },

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
        version: 1,
        partialize: (s) => ({
          // peaks are cheap to re-decode and too big for localStorage at scale
          playlists: s.playlists.map((p) => ({
            ...p,
            tracks: p.tracks.map(({ peaks: _peaks, ...t }) => t),
          })),
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
          visTheme: s.visTheme,
          visCfg: s.visCfg,
          takes: s.takes,
          stats: s.stats,
        }),
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Partial<StoreState>;
          return {
            ...current,
            ...p,
            fx: { ...DEFAULT_FX, ...(p.fx ?? {}) },
            visCfg: { ...DEFAULT_VIS_CFG, ...(p.visCfg ?? {}) },
            // never resume in a transient state
            playing: false,
            visOpen: false,
            recState: "idle",
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
      });
    if (s.viewMode.type === "recent") entries.sort((a, b) => b.tr.lastPlayedAt - a.tr.lastPlayedAt);
  }
  if (s.search.trim())
    entries = entries.filter((e) => e.tr.name.toLowerCase().includes(s.search.trim().toLowerCase()));
  if (s.sortBy === "name") entries = [...entries].sort((a, b) => a.tr.name.localeCompare(b.tr.name));
  if (s.sortBy === "plays") entries = [...entries].sort((a, b) => (b.tr.plays || 0) - (a.tr.plays || 0));
  return entries;
}

export const getFavCount = (s: StoreState) =>
  s.playlists.flatMap((p) => p.tracks).filter((t) => t.fav).length;
