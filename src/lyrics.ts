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
  artistName?: string;
  trackName?: string;
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

const tokenize = (s: string): string[] =>
  cleanQuery(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

/** How well a search hit matches the filename: token overlap between the
 * hit's artist+title and the filename, plus duration proximity. */
function scoreHit(h: LrclibHit, fileTokens: string[], dur: number): number {
  const hitTokens = tokenize(`${h.artistName ?? ""} ${h.trackName ?? ""}`);
  if (!hitTokens.length) return -1;
  const fileSet = new Set(fileTokens);
  let overlap = 0;
  for (const t of new Set(hitTokens)) if (fileSet.has(t)) overlap++;
  const coverHit = overlap / new Set(hitTokens).size; // how much of the hit's name we matched
  const coverFile = overlap / Math.max(1, new Set(fileTokens).size);
  let score = coverHit * 0.6 + coverFile * 0.4;
  if (dur) {
    const dd = Math.abs((h.duration ?? 0) - dur);
    if (dd > 12) return -1; // wrong-song signal
    score += Math.max(0, 1 - dd / 12) * 0.5;
  }
  return score;
}

/** Look up synced lyrics: analyzes the filename, runs several query
 * strategies, then scores every candidate on name overlap + duration fit
 * and picks the best confident match. */
export async function fetchLyrics(tr: Track): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  try {
    set("Searching lyrics…");
    const cleaned = cleanQuery(tr.name);
    const dash = cleaned.split(/\s*[-–—_]\s*/).map((p) => p.trim()).filter(Boolean);
    const attempts = new Set<string>([`q=${encodeURIComponent(cleaned)}`]);
    if (dash.length >= 2) {
      const a = dash[0], b = dash.slice(1).join(" ");
      attempts.add(`track_name=${encodeURIComponent(b)}&artist_name=${encodeURIComponent(a)}`);
      attempts.add(`track_name=${encodeURIComponent(a)}&artist_name=${encodeURIComponent(b)}`);
      attempts.add(`q=${encodeURIComponent(b)}`);
      attempts.add(`q=${encodeURIComponent(a)}`);
    }
    // "Title by Artist" phrasing
    const by = cleaned.match(/^(.+)\s+by\s+(.+)$/i);
    if (by) attempts.add(`track_name=${encodeURIComponent(by[1])}&artist_name=${encodeURIComponent(by[2])}`);

    const s0 = useStore.getState();
    const dur = getCurrentTrack(s0)?.id === tr.id ? s0.duration : 0;
    const fileTokens = tokenize(tr.name);

    const seen = new Set<string>();
    let best: LrclibHit | null = null;
    let bestScore = 0;
    for (const params of attempts) {
      for (const h of await search(params)) {
        if (!h.syncedLyrics) continue;
        const key = `${h.artistName}∷${h.trackName}∷${h.duration}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sc = scoreHit(h, fileTokens, dur);
        if (sc > bestScore) {
          bestScore = sc;
          best = h;
        }
      }
      if (best && bestScore >= 1.0) break; // confident — stop early
    }
    if (!best?.syncedLyrics || bestScore < 0.4) {
      set("No confident match — rename to 'Artist - Title' or import a .lrc");
      setTimeout(() => useStore.setState({ lyricStatus: "" }), 6000);
      return;
    }
    const lines = parseLrc(best.syncedLyrics);
    if (!lines.length) throw new Error("empty lyrics");
    useStore.getState().updateTrack(tr.id, { lyrics: lines });
    set(`✓ ${best.trackName ?? "matched"} · ${lines.length} lines`);
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
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
