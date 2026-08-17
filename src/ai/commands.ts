// The command protocol: every AI feature returns this one shape, and the app
// executes it. Adding a feature should mean writing a prompt, not new plumbing,
// so the action set is deliberately broad and each executor is defensive about
// whatever a model actually sends.
import { DEFAULT_FX, DEFAULT_VIS_CFG, PALETTES, P_STYLES, VIS_THEMES } from "../constants";
import { playAt } from "../audio/transport";
import { useStore } from "../store/useStore";
import type { FxState, TabId, Track, VisCfg } from "../types";
import { uid } from "../utils";
import { speak } from "./speech";
import { saveCover } from "./covers";

export type ActionType =
  | "fx" | "visuals" | "queue" | "playlist" | "say" | "sleepTimer"
  | "tags" | "note" | "preset" | "cover" | "ui";

export interface Action {
  type: ActionType;
  payload?: unknown;
}

export interface Command {
  reply: string;
  actions: Action[];
}

export function isCommand(v: unknown): v is Command {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.reply === "string" && (o.actions === undefined || Array.isArray(o.actions));
}

// ── coercion helpers: models send strings for numbers, "true"/1 for booleans,
// and occasionally out-of-range values. Clamp rather than reject. ───────────
const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};
const bool = (v: unknown, dflt: boolean): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1" || v === "yes" || v === "on";
  if (typeof v === "number") return v !== 0;
  return dflt;
};

/** Slider ranges, shared with the prompts so Claude only ever sends legal values. */
export const FX_RANGES: Record<keyof FxState, [number, number] | "bool"> = {
  speed: [0.5, 1.5], vinyl: "bool", pitch: [-12, 12], reverb: [0, 0.85], size: [0.6, 5.5],
  echoMix: [0, 0.7], echoTime: [0.05, 0.7], echoFb: [0, 0.8],
  bass: [-12, 12], mid: [-12, 12], treble: [-12, 12],
  spin: "bool", spinRate: [0.1, 1.6], crackle: [0, 1], crush: [0, 0.8],
  tone: [400, 20000], highpass: [20, 1200], vocalCut: "bool", boost: [0.5, 2],
};

export function sanitizeFx(raw: unknown): Partial<FxState> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<FxState> = {};
  for (const k of Object.keys(FX_RANGES) as (keyof FxState)[]) {
    if (!(k in src)) continue;
    const range = FX_RANGES[k];
    if (range === "bool") (out as Record<string, unknown>)[k] = bool(src[k], DEFAULT_FX[k] as boolean);
    else (out as Record<string, unknown>)[k] = num(src[k], range[0], range[1], DEFAULT_FX[k] as number);
  }
  return out;
}

const VIS_NUM: Partial<Record<keyof VisCfg, [number, number]>> = {
  h1: [0, 360], h2: [0, 360], glow: [0, 1.6], trail: [0, 0.95], particles: [0, 1],
  speed: [0.2, 2.5], intensity: [0.3, 2], zoom: [0.6, 1.6], spinV: [-1, 1],
  bgWash: [0, 1], thick: [0.4, 2.6],
};

export function sanitizeVis(raw: unknown): { cfg: Partial<VisCfg>; theme?: string } {
  if (!raw || typeof raw !== "object") return { cfg: {} };
  const src = raw as Record<string, unknown>;
  const cfg: Partial<VisCfg> = {};
  for (const k of Object.keys(VIS_NUM) as (keyof VisCfg)[]) {
    const r = VIS_NUM[k]!;
    if (k in src) (cfg as Record<string, unknown>)[k] = num(src[k], r[0], r[1], DEFAULT_VIS_CFG[k] as number);
  }
  for (const k of ["mirror", "shake", "flash"] as const) {
    if (k in src) cfg[k] = bool(src[k], DEFAULT_VIS_CFG[k]);
  }
  if (typeof src.palette === "string") {
    const p = PALETTES.find((x) => x.id.toLowerCase() === (src.palette as string).toLowerCase());
    if (p) cfg.palette = p.id;
  }
  if (typeof src.pStyle === "string") {
    const s = P_STYLES.find((x) => x.toLowerCase() === (src.pStyle as string).toLowerCase());
    if (s) cfg.pStyle = s;
  }
  if (typeof src.autoMode === "string" && ["off", "cycle", "shuffle"].includes(src.autoMode)) {
    cfg.autoMode = src.autoMode as VisCfg["autoMode"];
  }
  // custom hues only mean something on the CUSTOM palette
  if ((("h1" in src) || ("h2" in src)) && !("palette" in src)) cfg.palette = "CUSTOM";

  let theme: string | undefined;
  const t = src.theme ?? src.visTheme;
  if (typeof t === "string") {
    theme = VIS_THEMES.find((x) => x.toLowerCase() === t.toLowerCase());
  }
  return { cfg, theme };
}

const allTracks = (): Track[] => useStore.getState().playlists.flatMap((p) => p.tracks);

/** Resolve ids that may be track ids or (fuzzily) track names. */
function resolveTracks(ids: unknown): Track[] {
  if (!Array.isArray(ids)) return [];
  const lib = allTracks();
  const byId = new Map(lib.map((t) => [t.id, t]));
  const out: Track[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const direct = byId.get(raw);
    if (direct) { out.push(direct); continue; }
    const lower = raw.toLowerCase();
    const named = lib.find((t) => t.name.toLowerCase() === lower)
      ?? lib.find((t) => t.name.toLowerCase().includes(lower));
    if (named) out.push(named);
  }
  return out;
}

/** Creates (or replaces) a playlist and returns its id. */
function upsertPlaylist(name: string, tracks: Track[]): string {
  const clean = (name || "AI MIX").trim().toUpperCase().slice(0, 40);
  const id = uid();
  useStore.setState((s) => ({
    playlists: [
      ...s.playlists,
      { id, name: clean, tracks: tracks.map((t) => ({ ...t, id: uid() })) },
    ],
  }));
  return id;
}

export interface ExecResult {
  /** human-readable notes about what actually happened, for the chat log */
  notes: string[];
}

export async function executeCommand(cmd: Command): Promise<ExecResult> {
  const notes: string[] = [];
  const st = useStore.getState();

  for (const action of cmd.actions ?? []) {
    if (!action || typeof action.type !== "string") continue;
    const p = (action.payload ?? {}) as Record<string, unknown>;
    try {
      switch (action.type) {
        case "fx": {
          const fx = sanitizeFx(p.fx ?? p);
          if (!Object.keys(fx).length) break;
          const name = typeof p.name === "string" ? p.name.toUpperCase().slice(0, 22) : "AI FX";
          // base on defaults so a described vibe isn't polluted by old settings
          const full = bool(p.merge, false) ? { ...st.fx, ...fx } : { ...DEFAULT_FX, ...fx };
          useStore.setState({ fx: full, activePreset: name });
          notes.push(`FX → ${name}`);
          break;
        }
        case "visuals": {
          const { cfg, theme } = sanitizeVis(p.visuals ?? p);
          const patch: Record<string, unknown> = {};
          if (Object.keys(cfg).length) patch.visCfg = { ...useStore.getState().visCfg, ...cfg };
          if (theme) patch.visTheme = theme;
          if (Object.keys(patch).length) useStore.setState(patch);
          notes.push(theme ? `visuals → ${theme}` : "visuals updated");
          break;
        }
        case "queue": {
          const tracks = resolveTracks(p.trackIds ?? p.tracks ?? p.ids);
          if (!tracks.length) break;
          const mode = typeof p.mode === "string" ? p.mode : "replace";
          if (mode === "next") {
            for (const t of [...tracks].reverse()) useStore.getState().playNextQueue(t);
            notes.push(`queued ${tracks.length} next`);
          } else if (mode === "append") {
            useStore.getState().addTracks(useStore.getState().playPl, tracks.map((t) => ({ ...t, id: uid() })));
            notes.push(`appended ${tracks.length}`);
          } else {
            const name = typeof p.playlistName === "string" ? p.playlistName : "AI QUEUE";
            const id = upsertPlaylist(name, tracks);
            useStore.setState({ playPl: id, viewMode: { type: "pl", id } });
            notes.push(`new queue “${name}” (${tracks.length})`);
            if (bool(p.play, true)) await playAt(id, 0);
          }
          break;
        }
        case "playlist": {
          const tracks = resolveTracks(p.trackIds ?? p.tracks ?? p.ids);
          const name = typeof p.name === "string" ? p.name : "AI MIX";
          if (!tracks.length) break;
          const id = upsertPlaylist(name, tracks);
          notes.push(`playlist “${name}” (${tracks.length} tracks)`);
          if (bool(p.activate, false)) {
            useStore.setState({ viewMode: { type: "pl", id }, playPl: id });
            if (bool(p.play, false)) await playAt(id, 0);
          }
          break;
        }
        case "say": {
          const text = typeof p.text === "string" ? p.text : typeof action.payload === "string" ? action.payload : "";
          if (text) { speak(text, p.voice as Record<string, unknown> | undefined); notes.push("spoke a line"); }
          break;
        }
        case "sleepTimer": {
          const mins = num(p.minutes ?? p.mins ?? action.payload, 1, 180, 30);
          useStore.setState({ sleepEnd: Date.now() + mins * 60000 });
          notes.push(`sleep timer ${Math.round(mins)}m`);
          break;
        }
        case "tags": {
          const ups = Array.isArray(p.updates) ? p.updates : Array.isArray(action.payload) ? action.payload : [];
          let n = 0;
          for (const u of ups as Record<string, unknown>[]) {
            const tr = resolveTracks([u.trackId ?? u.id ?? u.name])[0];
            if (!tr || !Array.isArray(u.tags)) continue;
            const tags = (u.tags as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.toUpperCase().slice(0, 14)).slice(0, 6);
            useStore.getState().updateTrack(tr.id, { tags });
            n++;
          }
          if (n) notes.push(`tagged ${n} tracks`);
          break;
        }
        case "note": {
          const tr = resolveTracks([p.trackId ?? p.id ?? p.name])[0];
          if (tr && typeof p.note === "string") {
            useStore.getState().updateTrack(tr.id, { note: p.note.slice(0, 600) });
            notes.push("saved a note");
          }
          break;
        }
        case "preset": {
          const list = Array.isArray(p.presets) ? p.presets : Array.isArray(action.payload) ? action.payload : [p];
          const add = (list as Record<string, unknown>[])
            .map((x) => ({
              name: String(x.name ?? "AI").toUpperCase().slice(0, 22),
              fx: sanitizeFx(x.fx ?? x),
            }))
            .filter((x) => Object.keys(x.fx).length);
          if (add.length) {
            useStore.setState((s) => ({ userPresets: [...s.userPresets, ...add] }));
            notes.push(`added ${add.length} preset${add.length > 1 ? "s" : ""}`);
          }
          break;
        }
        case "cover": {
          const svg = typeof p.svg === "string" ? p.svg : "";
          const kind = p.targetType === "playlist" ? "playlist" : "track";
          const id = typeof p.id === "string" ? p.id : "";
          if (svg && id) {
            const ok = await saveCover(kind, id, svg);
            if (ok) notes.push("cover art saved");
          }
          break;
        }
        case "ui": {
          const patch: Record<string, unknown> = {};
          const tabs: TabId[] = ["player", "dj", "fx", "library", "me"];
          if (typeof p.tab === "string" && tabs.includes(p.tab as TabId)) patch.tab = p.tab;
          if ("visOpen" in p) patch.visOpen = bool(p.visOpen, false);
          if (Object.keys(patch).length) { useStore.setState(patch); notes.push("view changed"); }
          break;
        }
      }
    } catch (e) {
      console.warn("action failed:", action.type, e);
    }
  }
  return { notes };
}

/** The protocol description injected into every feature's system prompt. */
export const COMMAND_SPEC = `You control a music player by returning JSON of exactly this shape:
{"reply": "<one short sentence to the user>", "actions": [ ... ]}

Every action is {"type": "<type>", "payload": {...}}. Available types:
- "fx": payload {name: string, fx: {<any FX fields>}, merge?: boolean}
   Audio effects. merge=false (default) starts from a clean rack.
- "visuals": payload {theme?: string, palette?: string, h1?: number, h2?: number,
   glow?, trail?, particles?, pStyle?, speed?, intensity?, zoom?, spinV?, bgWash?,
   thick?, mirror?, shake?, flash?, autoMode?: "off"|"cycle"|"shuffle"}
- "queue": payload {trackIds: string[], mode?: "replace"|"append"|"next",
   playlistName?: string, play?: boolean}
- "playlist": payload {name: string, trackIds: string[], activate?: boolean, play?: boolean}
- "say": payload {text: string}  — spoken aloud
- "sleepTimer": payload {minutes: number}
- "tags": payload {updates: [{trackId: string, tags: string[]}]}
- "note": payload {trackId: string, note: string}
- "preset": payload {presets: [{name: string, fx: {...}}]} — saved to the FX rack
- "ui": payload {tab?: "player"|"dj"|"fx"|"library"|"me", visOpen?: boolean}

Use an empty actions array when nothing should change. Always use real track ids
from the provided library context. Never invent tracks that are not listed.`;
