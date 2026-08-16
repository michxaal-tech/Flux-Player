// Synced lyrics: LRC parsing plus free lookup via lrclib.net (no key, CORS).
import { useStore, getCurrentTrack } from "./store/useStore";
import type { Track } from "./types";

export interface LyricLine {
  /** seconds */
  t: number;
  text: string;
}

export function parseLrc(src: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const m of tags) out.push({ t: +m[1] * 60 + +m[2], text });
  }
  return out.sort((a, b) => a.t - b.t);
}

interface LrclibHit {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  duration?: number;
}

/** Look up synced lyrics for a track by its (cleaned) name; ranks by duration match. */
export async function fetchLyrics(tr: Track): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  try {
    set("Searching lyrics…");
    const resp = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(tr.name)}`);
    if (!resp.ok) throw new Error(`lookup failed (${resp.status})`);
    const hits = (await resp.json()) as LrclibHit[];
    const s = useStore.getState();
    const dur = getCurrentTrack(s)?.id === tr.id ? s.duration : 0;
    const synced = hits
      .filter((h) => h.syncedLyrics)
      .sort((a, b) => {
        if (!dur) return 0;
        return Math.abs((a.duration ?? 0) - dur) - Math.abs((b.duration ?? 0) - dur);
      });
    const best = synced[0];
    if (!best?.syncedLyrics) {
      set("No synced lyrics found for this name");
      setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
      return;
    }
    const lines = parseLrc(best.syncedLyrics);
    if (!lines.length) throw new Error("empty lyrics");
    useStore.getState().updateTrack(tr.id, { lyrics: lines });
    set(`✓ ${lines.length} lines synced`);
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 3000);
  } catch (e) {
    console.warn("lyrics fetch failed:", e);
    set("Lyrics lookup failed (offline?)");
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
  }
}

/** Attach a user-provided .lrc file to a track. */
export async function importLrcFile(tr: Track, file: File): Promise<void> {
  const lines = parseLrc(await file.text());
  if (!lines.length) {
    useStore.setState({ lyricStatus: "That file has no timed [mm:ss] lines" });
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
    return;
  }
  useStore.getState().updateTrack(tr.id, { lyrics: lines });
  useStore.setState({ lyricStatus: `✓ ${lines.length} lines imported` });
  setTimeout(() => useStore.setState({ lyricStatus: "" }), 3000);
}
