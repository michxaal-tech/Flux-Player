// Online catalogues FLUX can actually use, behind one interface.
//
// The bar a source has to clear is unusual and it rules out almost everything:
// FLUX needs the *samples*. The visualiser, the FX rack, stem separation and
// Revoice all work from a decoded AudioBuffer, so a source must serve an audio
// file that a page can `fetch()` — which means open CORS on the audio itself,
// not just on its JSON.
//
//   Spotify's Web Playback SDK streams full tracks, but inside its own
//   encrypted player. A page gets no access to the samples at all, so every
//   feature above would be dead on a streamed track. Premium only, and the
//   audio-analysis endpoints closed to new applications in late 2024.
//
//   SoundCloud stopped accepting API registrations years ago, and its embed is
//   a cross-origin iframe — the same wall.
//
//   Deezer's API answers from a browser but sends no
//   `access-control-allow-origin`, so the response is unreadable.
//
//   Apple's own charts feed (rss.marketingtools.apple.com) likewise sends no
//   CORS headers, which is why browsing here is built out of searches.
//
// Two sources clear it, and they cover different halves of the problem: Audius
// has full-length tracks but only independent artists, and Apple has essentially
// every song ever released but hands out a 30-second preview of each.
import { blobStore } from "./store/blobStore";
import { useStore } from "./store/useStore";
import type { Track } from "./types";

export interface CatTrack {
  /** unique within its source */
  id: string;
  source: string;
  title: string;
  artist: string;
  /** what to pass back to `byArtist` for "everything by them" */
  artistKey: string;
  /** seconds of audio you actually get */
  duration: number;
  artwork?: string;
  genre?: string;
  /** the audio to fetch — must be CORS-readable */
  url: string;
  /** true when the source serves an excerpt rather than the whole track */
  preview?: boolean;
  /** what the audio is encoded as, so playability can be checked before import */
  mime?: string;
}

export interface Source {
  id: string;
  label: string;
  /** one line under the picker, explaining what you get here */
  blurb: string;
  genres: string[];
  search(query: string): Promise<CatTrack[]>;
  browse(genre: string): Promise<CatTrack[]>;
  byArtist(key: string): Promise<CatTrack[]>;
}

// ── Audius ────────────────────────────────────────────────────────────────
// Full-length, artist-published, open CORS on the stream endpoint. No key.

const AU = "https://discoveryprovider.audius.co/v1";
const APP = "FLUX";

interface AuRaw {
  id?: string;
  title?: string;
  duration?: number;
  genre?: string;
  user?: { name?: string; handle?: string };
  artwork?: Record<string, string> | null;
}

const auTrack = (r: AuRaw): CatTrack | null => {
  if (!r?.id || !r.title) return null;
  const art = r.artwork ?? undefined;
  return {
    id: r.id,
    source: "audius",
    title: r.title,
    artist: r.user?.name ?? r.user?.handle ?? "Unknown",
    artistKey: r.user?.handle ?? "",
    duration: r.duration ?? 0,
    artwork: art?.["480x480"] ?? art?.["150x150"] ?? art?.["1000x1000"],
    genre: r.genre,
    url: `${AU}/tracks/${r.id}/stream?app_name=${APP}`,
  };
};

async function auGet(path: string): Promise<AuRaw[]> {
  const sep = path.includes("?") ? "&" : "?";
  const resp = await fetch(`${AU}${path}${sep}app_name=${APP}`);
  if (!resp.ok) throw new Error(`Audius ${resp.status}`);
  const j = (await resp.json()) as { data?: AuRaw[] };
  return j.data ?? [];
}

const clean = <T,>(xs: (T | null)[]): T[] => xs.filter((x): x is T => !!x);

export const audius: Source = {
  id: "audius",
  label: "AUDIUS",
  blurb: "Full-length tracks, published by the artists themselves. Independent music — you won't find chart pop here.",
  genres: ["ALL", "Electronic", "Hip-Hop/Rap", "Dubstep", "Drum & Bass", "House", "Techno", "Trap", "Ambient", "Rock", "Pop", "R&B/Soul", "Lo-Fi"],
  async search(q) {
    return clean((await auGet(`/tracks/search?query=${encodeURIComponent(q)}&limit=30`)).map(auTrack));
  },
  async browse(genre) {
    const g = genre && genre !== "ALL" ? `&genre=${encodeURIComponent(genre)}` : "";
    return clean((await auGet(`/tracks/trending?limit=30${g}`)).map(auTrack));
  },
  async byArtist(handle) {
    if (!handle) return [];
    const u = (await fetch(`${AU}/users/handle/${encodeURIComponent(handle)}?app_name=${APP}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { data?: { id?: string } } | null;
    const uid = u?.data?.id;
    if (!uid) return [];
    return clean((await auGet(`/users/${uid}/tracks?limit=50`)).map(auTrack));
  },
};

// ── Apple ─────────────────────────────────────────────────────────────────
// The iTunes Search API: no key, no account, `access-control-allow-origin: *`
// on both the JSON and the preview audio itself, which is the part that
// matters. The catch is the length — a preview is ~30 seconds. That is a real
// limitation, not something to bury: it is stated on the source picker, on
// every row, and again on the track once it is imported.

const AP = "https://itunes.apple.com/search";
/** how long an Apple preview runs; the API reports the *full* track's length,
 * which would be a lie about what you actually get */
const PREVIEW_SECS = 30;

interface ApRaw {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
}

const apTrack = (r: ApRaw): CatTrack | null => {
  if (!r?.trackId || !r.trackName || !r.previewUrl) return null;
  return {
    id: String(r.trackId),
    source: "apple",
    title: r.trackName,
    artist: r.artistName ?? "Unknown",
    artistKey: r.artistName ?? "",
    duration: PREVIEW_SECS,
    // the 100px art is what the API returns; the same path serves any size
    artwork: r.artworkUrl100?.replace("100x100", "300x300"),
    genre: r.primaryGenreName,
    url: r.previewUrl,
    preview: true,
    // Apple previews are AAC in an MP4 container
    mime: 'audio/mp4; codecs="mp4a.40.2"',
  };
};

async function apGet(params: string): Promise<CatTrack[]> {
  const resp = await fetch(`${AP}?${params}&media=music&entity=song`);
  if (!resp.ok) throw new Error(`Apple ${resp.status}`);
  const j = (await resp.json()) as { results?: ApRaw[] };
  return clean((j.results ?? []).map(apTrack));
}

/** `genreId` is accepted and then silently ignored by the search API — every
 * genre returns the same rows — so the chips are searches for the genre. */
const APPLE_TERMS: Record<string, string> = {
  "Top Hits": "hits",
  Pop: "pop",
  "Hip-Hop": "hip hop",
  "R&B": "r&b soul",
  Rock: "rock",
  Dance: "dance",
  House: "house",
  Latin: "latin",
  Afrobeats: "afrobeats",
  Country: "country",
  Metal: "metal",
  Jazz: "jazz",
  Classical: "classical",
};

export const apple: Source = {
  id: "apple",
  label: "APPLE",
  blurb: "Essentially every song ever released, by name. Apple serves a 30-second preview of each — the whole FX rack and visualizer run on it, but it is an excerpt, not the full track.",
  genres: Object.keys(APPLE_TERMS),
  search: (q) => apGet(`term=${encodeURIComponent(q)}&limit=40`),
  browse: (genre) => apGet(`term=${encodeURIComponent(APPLE_TERMS[genre] ?? "hits")}&limit=40`),
  byArtist: (name) => (name ? apGet(`term=${encodeURIComponent(name)}&attribute=artistTerm&limit=50`) : Promise.resolve([])),
};

export const SOURCES: Source[] = [apple, audius];

export const sourceById = (id: string): Source => SOURCES.find((s) => s.id === id) ?? SOURCES[0];

/**
 * Pulls a track into the library.
 *
 * The audio is fetched and stored like any other import, so it survives a
 * reload and runs through the whole DSP chain from its decoded buffer.
 */
export async function importTrack(t: CatTrack, plId: string): Promise<Track | null> {
  const set = (catStatus: string) => useStore.setState({ catStatus });

  // AAC is a licensed codec, so it is absent from some open-source browser
  // builds — Chromium without proprietary codecs decodes nothing here, while
  // Safari, Chrome and Edge all handle it. Checking first turns a track that
  // imports and then silently refuses to play into a sentence that explains
  // itself.
  if (t.mime && typeof document !== "undefined") {
    const probe = document.createElement("audio");
    if (!probe.canPlayType(t.mime)) {
      set("This browser can't play Apple's format (AAC). Safari, Chrome and Edge can — or use the Audius source, which serves MP3.");
      setTimeout(() => set(""), 9000);
      return null;
    }
  }

  try {
    set(`fetching ${t.title}…`);
    const resp = await fetch(t.url);
    if (!resp.ok) throw new Error(`stream ${resp.status}`);
    const blob = await resp.blob();
    if (blob.size < 1000) throw new Error("empty stream");

    const fileId = `${t.source}-${t.id}`;
    await blobStore.put(fileId, blob);

    const tr: Track = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileId,
      // the name carries the limitation, so a 30-second file in the library is
      // never a mystery later
      name: t.preview ? `${t.title} (preview)` : t.title,
      artist: t.artist,
      source: t.source,
      sourceId: t.id,
      plays: 0,
      fav: false,
      tags: [],
      note: "",
      addedAt: Date.now(),
      lastPlayedAt: 0,
    };
    useStore.getState().addTracks(plId, [tr]);
    set(`✓ added ${t.title}`);
    setTimeout(() => set(""), 3500);
    return tr;
  } catch (e) {
    console.warn("catalogue import failed:", e);
    set("Couldn't fetch that track — try again or pick another.");
    setTimeout(() => set(""), 6000);
    return null;
  }
}
