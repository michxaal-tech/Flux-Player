// Synced lyrics: LRC parsing plus free lookup via lrclib.net (no key, CORS).
import { useStore, getCurrentTrack } from "./store/useStore";
import { blobStore } from "./store/blobStore";
import { lyricsFromFile } from "./audio/tagLyrics";
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
 * and picks the best confident match. With `artistHint` (typed by the user
 * after a failed search) it searches that artist's songs for the track name. */
/**
 * Lyrics from the track's own file.
 *
 * Tried before any online lookup, because it is exact when it works: the words
 * came from whoever made the file rather than from a database's best guess at
 * which song this is. For an AI-generated track it is also the only thing that
 * can work at all — Suno and Udio write the lyrics into the export, and no
 * lookup service has ever heard the song.
 *
 * `quiet` suppresses the status line so the automatic path can try this first
 * without narrating a miss.
 */
export async function lyricsFromTrackFile(tr: Track, quiet = false): Promise<boolean> {
  const set = (lyricStatus: string) => { if (!quiet) useStore.setState({ lyricStatus }); };
  try {
    const blob = await blobStore.get(tr.fileId);
    if (!blob) { set("That track's audio isn't stored on this device"); return false; }
    // Track carries no duration of its own; the store has it for whatever is
    // loaded, and the fallback only affects where *untimed* prose is placed.
    const dur = useStore.getState().duration || 180;
    const got = await lyricsFromFile(blob, dur);
    if (!got) {
      set("No lyrics inside that file");
      if (!quiet) setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
      return false;
    }
    useStore.getState().updateTrack(tr.id, { lyrics: got.lines });
    // The synced/estimated distinction is surfaced rather than smoothed over.
    // Evenly-spread prose drifts against the song, and a user who knows that is
    // reading along; one who doesn't thinks the player is broken.
    useStore.setState({
      lyricPicks: [], lyricAskArtist: false,
      lyricStatus: got.synced
        ? `\u2713 ${got.lines.length} lines from the file (${got.source})`
        : `\u2713 ${got.lines.length} lines from the file — not timed, spaced evenly`,
    });
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 5000);
    return true;
  } catch {
    set("Couldn't read that file's tags");
    return false;
  }
}

/**
 * Lyrics transcribed from the audio.
 *
 * The last resort, for a track whose file carries nothing and which no lookup
 * service has ever heard — which is every song you generated yourself.
 *
 * Where an instrumental exists it is *subtracted* from the mix first. The stem
 * separator produces an instrumental rather than a vocal, and mix minus
 * instrumental is the vocal: a residual that Whisper can actually read, where
 * a full mix is mostly drums and synths and comes back as confident nonsense.
 * That costs nothing extra — the separation has already been paid for.
 */
export async function transcribeTrack(tr: Track): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  const clearSoon = (ms = 6000) => setTimeout(() => useStore.setState({ lyricStatus: "" }), ms);
  try {
    const mixBlob = await blobStore.get(tr.fileId);
    if (!mixBlob) { set("That track's audio isn't stored on this device"); clearSoon(4000); return; }

    set("Decoding audio…");
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let buffer: AudioBuffer;
    let isolated = false;
    try {
      buffer = await ctx.decodeAudioData(await mixBlob.arrayBuffer());
      const instBlob = tr.hasInst ? await blobStore.get(`inst-${tr.fileId}`) : null;
      if (instBlob) {
        const inst = await ctx.decodeAudioData(await instBlob.arrayBuffer());
        // Only subtract when the two really are the same recording; a length
        // mismatch means they are not aligned and the residual would be noise.
        if (Math.abs(inst.length - buffer.length) < buffer.sampleRate * 0.5 && inst.sampleRate === buffer.sampleRate) {
          const n = Math.min(inst.length, buffer.length);
          const voc = ctx.createBuffer(1, n, buffer.sampleRate);
          const out = voc.getChannelData(0);
          const chans = Math.min(buffer.numberOfChannels, inst.numberOfChannels);
          for (let c = 0; c < chans; c++) {
            const m = buffer.getChannelData(c);
            const i = inst.getChannelData(c);
            for (let k = 0; k < n; k++) out[k] += (m[k] - i[k]) / chans;
          }
          buffer = voc;
          isolated = true;
        }
      }
    } finally {
      void ctx.close();
    }

    const { transcribeLyrics } = await import("./audio/transcribeLyrics");
    const res = await transcribeLyrics({
      buffer,
      isolated,
      title: tr.name,
      onStage: (st) => set(`${st}…`),
    });
    useStore.getState().updateTrack(tr.id, { lyrics: res.lines });
    useStore.setState({
      lyricPicks: [], lyricAskArtist: false,
      lyricStatus: `\u2713 ${res.lines.length} lines transcribed${isolated ? " from the isolated vocal" : " (full mix — separate stems for better accuracy)"}`,
    });
    clearSoon();
  } catch (e) {
    set(e instanceof Error ? e.message : "Transcription failed");
    clearSoon(9000);
  }
}

export async function fetchLyrics(tr: Track, artistHint?: string): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  try {
    // the file itself first: instant, offline, and exact when present
    if (await lyricsFromTrackFile(tr, true)) return;
    set("Searching lyrics…");
    const cleaned = cleanQuery(tr.name);
    const attempts = new Set<string>();
    const hint = artistHint?.trim();
    if (hint) {
      // title guess = the filename minus the artist's own tokens
      const at = new Set(tokenize(hint));
      const titleGuess = tokenize(tr.name).filter((t) => !at.has(t)).join(" ") || cleaned;
      attempts.add(`track_name=${encodeURIComponent(titleGuess)}&artist_name=${encodeURIComponent(hint)}`);
      attempts.add(`q=${encodeURIComponent(`${hint} ${titleGuess}`)}`);
      attempts.add(`artist_name=${encodeURIComponent(hint)}`);
    } else {
      attempts.add(`q=${encodeURIComponent(cleaned)}`);
      const dash = cleaned.split(/\s*[-–—_]\s*/).map((p) => p.trim()).filter(Boolean);
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
    }

    const s0 = useStore.getState();
    const dur = getCurrentTrack(s0)?.id === tr.id ? s0.duration : 0;
    // with a typed artist, its tokens count toward the match like the filename's
    const fileTokens = tokenize(hint ? `${hint} ${tr.name}` : tr.name);

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
      useStore.setState({ lyricAskArtist: true });
      set(hint
        ? `No match in ${hint}'s songs — check the spelling?`
        : "No confident match — type the artist name below ↓");
      setTimeout(() => useStore.setState({ lyricStatus: "" }), 8000);
      return;
    }
    const lines = parseLrc(best.syncedLyrics);
    if (!lines.length) throw new Error("empty lyrics");
    useStore.getState().updateTrack(tr.id, { lyrics: lines });
    useStore.setState({ lyricAskArtist: false });
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


// ── manual correction ────────────────────────────────────────────────────
// Automatic matching works from the filename, so a track whose file is named
// after something else — or a title that collides with a more famous song —
// lands on the wrong lyrics with no way back. This lets you say what the song
// actually is and choose from the candidates yourself. Same public API as the
// automatic path, so nothing has to be downloaded.

export interface LyricPick {
  artist: string;
  title: string;
  duration: number;
  synced: string;
  lines: number;
}

/** Searches by an explicit title/artist and puts the candidates in the store. */
export async function searchLyricPicks(title: string, artist: string): Promise<void> {
  const set = (lyricStatus: string) => useStore.setState({ lyricStatus });
  const t = title.trim(), a = artist.trim();
  if (!t && !a) return;
  set("Searching…");
  useStore.setState({ lyricPicks: [] });
  try {
    const attempts: string[] = [];
    if (t && a) attempts.push(`track_name=${encodeURIComponent(t)}&artist_name=${encodeURIComponent(a)}`);
    if (t) attempts.push(`q=${encodeURIComponent(a ? `${a} ${t}` : t)}`);
    if (a && !t) attempts.push(`artist_name=${encodeURIComponent(a)}`);

    const seen = new Set<string>();
    const picks: LyricPick[] = [];
    for (const params of attempts) {
      for (const h of await search(params)) {
        if (!h.syncedLyrics) continue;              // unsynced can't drive the overlay
        const key = `${h.artistName}∷${h.trackName}∷${h.duration}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const lines = parseLrc(h.syncedLyrics).length;
        if (!lines) continue;
        picks.push({
          artist: h.artistName ?? "?", title: h.trackName ?? "?",
          duration: h.duration ?? 0, synced: h.syncedLyrics, lines,
        });
      }
      if (picks.length >= 12) break;
    }
    // closest duration first — the strongest signal that it is *this* recording
    const dur = useStore.getState().duration;
    if (dur > 0) picks.sort((x, y) => Math.abs(x.duration - dur) - Math.abs(y.duration - dur));
    useStore.setState({ lyricPicks: picks.slice(0, 12) });
    set(picks.length ? `${picks.length} match${picks.length === 1 ? "" : "es"} — pick one` : "Nothing found — try a different spelling");
    if (!picks.length) setTimeout(() => useStore.setState({ lyricStatus: "" }), 5000);
  } catch (e) {
    console.warn("lyric search failed:", e);
    set("Search failed (offline?)");
    setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
  }
}

/** Applies a chosen candidate to the track. */
export function applyLyricPick(tr: Track, pick: LyricPick): void {
  const lines = parseLrc(pick.synced);
  if (!lines.length) return;
  useStore.getState().updateTrack(tr.id, { lyrics: lines });
  useStore.setState({
    lyricPicks: [], lyricAskArtist: false,
    lyricStatus: `\u2713 ${pick.title} — ${pick.artist} · ${lines.length} lines`,
  });
  setTimeout(() => useStore.setState({ lyricStatus: "" }), 4000);
}

/** Drops the lyrics attached to a track, so a wrong match can simply be removed. */
export function clearLyrics(tr: Track): void {
  useStore.getState().updateTrack(tr.id, { lyrics: undefined });
  useStore.setState({ lyricPicks: [], lyricStatus: "Lyrics cleared" });
  setTimeout(() => useStore.setState({ lyricStatus: "" }), 3000);
}
