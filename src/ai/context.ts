// Builds the compact snapshot of app state that every AI feature sends as
// context. Kept terse on purpose — a large library must still fit comfortably
// in one request, so tracks are one line each.
import { PALETTES, P_STYLES, TAGS, VIS_THEMES } from "../constants";
import { getCurrentTrack, getPlayingList, useStore } from "../store/useStore";
import { FX_RANGES } from "./commands";
import type { StoreState } from "../store/useStore";
import type { Track } from "../types";

export interface CtxOpts {
  /** include the full library listing (off for features that don't need it) */
  library?: boolean;
  /** cap on tracks listed, most relevant first */
  maxTracks?: number;
  fx?: boolean;
  visuals?: boolean;
  queue?: boolean;
  stats?: boolean;
}

const trackLine = (t: Track, bpm?: number): string => {
  const bits = [`id=${t.id}`, `"${t.name.replace(/"/g, "'").slice(0, 90)}"`];
  if (t.tags.length) bits.push(`tags=${t.tags.join("/")}`);
  if (bpm) bits.push(`bpm=${bpm}`);
  if (t.plays) bits.push(`plays=${t.plays}`);
  if (t.fav) bits.push("fav");
  if (t.note) bits.push(`note="${t.note.replace(/"/g, "'").slice(0, 70)}"`);
  if (t.lastPlayedAt) {
    const days = Math.round((Date.now() - t.lastPlayedAt) / 86400000);
    if (days <= 30) bits.push(`played=${days}d ago`);
  }
  return `- ${bits.join(" ")}`;
};

/** Live BPM readings are only known for tracks that have been played through
 * the analyser; the store keeps the last reading per track id. */
function bpmFor(s: StoreState, id: string): number | undefined {
  return s.trackBpm?.[id];
}

export function uniqueTracks(s: StoreState): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const p of s.playlists) {
    for (const t of p.tracks) {
      if (seen.has(t.fileId)) continue;
      seen.add(t.fileId);
      out.push(t);
    }
  }
  return out;
}

export function buildContext(o: CtxOpts = {}): string {
  const s = useStore.getState();
  const parts: string[] = [];

  const now = new Date();
  parts.push(
    `LOCAL TIME: ${now.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })} (hour ${now.getHours()})`
  );

  if (o.library !== false) {
    const lib = uniqueTracks(s);
    const cap = o.maxTracks ?? 250;
    const shown = lib.slice(0, cap);
    parts.push(
      `LIBRARY (${lib.length} track${lib.length === 1 ? "" : "s"}${lib.length > shown.length ? `, showing ${shown.length}` : ""}):`,
      shown.length ? shown.map((t) => trackLine(t, bpmFor(s, t.id))).join("\n") : "(empty)"
    );
    parts.push(
      `PLAYLISTS: ${s.playlists.map((p) => `"${p.name}"(${p.tracks.length})`).join(", ") || "(none)"}`
    );
    parts.push(`EXISTING TAGS IN USE: ${TAGS.join(", ")}`);
  }

  if (o.queue !== false) {
    const cur = getCurrentTrack(s);
    const pl = getPlayingList(s);
    parts.push(
      `NOW PLAYING: ${cur ? `"${cur.name}" (id=${cur.id})` : "nothing"}${s.playing ? " [playing]" : " [paused]"} from "${pl.name}"`,
      `QUEUE ORDER: ${pl.tracks.slice(0, 40).map((t, i) => `${i + 1}.${t.name.slice(0, 40)}`).join(" | ") || "(empty)"}`
    );
  }

  if (o.fx !== false) {
    const fx = Object.entries(s.fx)
      .map(([k, v]) => `${k}=${typeof v === "number" ? +v.toFixed(2) : v}`)
      .join(" ");
    parts.push(`CURRENT FX: preset="${s.activePreset || "custom"}" ${fx}`);
  }

  if (o.visuals !== false) {
    const v = s.visCfg;
    parts.push(
      `CURRENT VISUALS: theme=${s.visTheme} palette=${v.palette} h1=${v.h1} h2=${v.h2} glow=${v.glow} trail=${v.trail} particles=${v.particles} pStyle=${v.pStyle} speed=${v.speed} intensity=${v.intensity} zoom=${v.zoom} mirror=${v.mirror} shake=${v.shake} flash=${v.flash}`
    );
  }

  if (o.stats) {
    parts.push(
      `LISTENING STATS: ${s.stats.plays} plays, ${Math.round(s.stats.seconds / 60)} minutes total`
    );
  }
  return parts.join("\n\n");
}

/** Static reference blocks the prompts use so Claude only emits legal values. */
export const FX_REFERENCE = `FX FIELDS (name: range — meaning):
speed: 0.5-1.5 — playback rate (also pitch when vinyl=true)
vinyl: boolean — tape mode; true lets speed change pitch, false keeps pitch
pitch: -12..12 — independent semitone shift, works at any speed
reverb: 0-0.85 — wet mix; size: 0.6-5.5 — room decay seconds
echoMix: 0-0.7; echoTime: 0.05-0.7 sec; echoFb: 0-0.8 — delay send/time/feedback
bass/mid/treble: -12..12 dB shelves
spin: boolean, spinRate: 0.1-1.6 — 8D auto-panning
crackle: 0-1 — vinyl noise; crush: 0-0.8 — bit/waveshape distortion
tone: 400-20000 Hz — lowpass (20000 = open); highpass: 20-1200 Hz — thins the low end
vocalCut: boolean — mid-side vocal cancel (karaoke)
boost: 0.5-2 — output gain`;

export const VIS_REFERENCE = `VISUAL THEMES: ${VIS_THEMES.join(", ")}
PALETTES: ${PALETTES.map((p) => p.id).join(", ")} (CUSTOM uses h1/h2 hue degrees 0-360)
PARTICLE STYLES: ${P_STYLES.join(", ")}
TUNE RANGES: glow 0-1.6, trail 0-0.95 (motion blur), particles 0-1 (density),
speed 0.2-2.5, intensity 0.3-2 (audio reactivity), zoom 0.6-1.6, spinV -1..1
(scene rotation; keep 0 unless asked), bgWash 0-1, thick 0.4-2.6 (line weight),
mirror/shake/flash booleans`;

export const FX_FIELD_LIST = Object.keys(FX_RANGES).join(", ");
