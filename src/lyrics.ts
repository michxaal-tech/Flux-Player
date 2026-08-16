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

/** Strip filename junk that ruins lyric search: bracketed tags, quality
 * markers, "official video", leading track numbers, feat. clauses. */
export function cleanQuery(name: string): string {
  return name
    .replace(/[([{][^)\]}]*[)\]}]/g, " ") // (Official Video), [320kbps], {...}
    .replace(/^\s*\d{1,3}[.\-)\s]+\s*/, "") // leading track number
    .replace(/\b(official|video|audio|lyrics?|lyric|visualizer|visualiser|hd|4k|mv|explicit|remaster(ed)?|slowed|reverb|nightcore|\d{3,4}\s?kbps|hq)\b/gi, " ")
    .replace(/\b(ft|feat)\.?\s.+$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function search(params: string): Promise<LrclibHit[]> {
  const resp = await fetch(`https://lrclib.net/api/search?${params}`);
  if (!resp.ok) return [];
  try {
    return (await resp.json()) as LrclibHit[];
  } catch {
    return [];
  }
}

/** Look up synced lyrics: tries several query strategies (full name,
 * artist/title split in both orders, title alone) and ranks by duration. */
export async function fetchLyrics(tr: Track): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  try {
    set("Searching lyrics…");
    const cleaned = cleanQuery(tr.name);
    const dash = cleaned.split(/\s*[-–—]\s*/);
    const attempts: string[] = [`q=${encodeURIComponent(cleaned)}`];
    if (dash.length >= 2) {
      const [a, b] = [dash[0].trim(), dash.slice(1).join(" ").trim()];
      attempts.push(
        `track_name=${encodeURIComponent(b)}&artist_name=${encodeURIComponent(a)}`,
        `track_name=${encodeURIComponent(a)}&artist_name=${encodeURIComponent(b)}`,
        `q=${encodeURIComponent(b)}`
      );
    }
    const s0 = useStore.getState();
    const dur = getCurrentTrack(s0)?.id === tr.id ? s0.duration : 0;

    let best: LrclibHit | null = null;
    let bestScore = Infinity;
    for (const params of attempts) {
      const hits = (await search(params)).filter((h) => h.syncedLyrics);
      for (const h of hits) {
        // duration mismatch is the strongest wrong-song signal
        const dd = dur ? Math.abs((h.duration ?? 0) - dur) : 0;
        if (dur && dd > 10) continue;
        if (dd < bestScore) {
          bestScore = dd;
          best = h;
        }
      }
      if (best && (!dur || bestScore <= 3)) break; // solid match — stop early
    }
    if (!best?.syncedLyrics) {
      set("No match — try renaming to 'Artist - Title' or import a .lrc");
      setTimeout(() => useStore.setState({ lyricStatus: "" }), 6000);
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
