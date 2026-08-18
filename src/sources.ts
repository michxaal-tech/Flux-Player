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
//   audio-analysis endpoints closed to new applications in late 2024. Its
//   30-second preview clips are a different matter — plain MP3, CORS open —
//   and spotify.ts imports those, but there is no keyless way to *search*
//   them, so Spotify is a link importer here rather than a source.
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
// Three sources clear it, and each covers a different half of the problem:
// Apple has essentially every song ever released but hands out a 30-second
// preview of each; the Internet Archive has millions of full-length recordings,
// free and legal, but they are live sets and pre-1960 masters rather than chart
// pop; Audius has full-length tracks from independent artists.
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
export const PREVIEW_SECS = 30;

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

// ── Internet Archive ──────────────────────────────────────────────────────
// Full-length audio, no key, `access-control-allow-origin: *` on the search
// JSON, the metadata and the MP3s themselves, with Range support so seeking
// works. Millions of items, and legal — taper-approved concert recordings and
// out-of-copyright masters, not a rip of anything.
//
// Two things shape the code. Search is item-level, not track-level: a hit is a
// whole concert or record, so the files come from a second call per item and
// those run together. And a free-text search matches descriptions, so
// "radiohead" returns jam bands who merely mention them — scoping to creator
// and title instead turns that into real Radiohead recordings, or an honest
// nothing.

const IA = "https://archive.org";
/** VBR MP3 is what the Archive derives for streaming; without it a hit can be
 * a FLAC-only concert with nothing a browser will take. `mediatype` filters
 * out collections, which have no files of their own — the Live Music Archive
 * predates the audio mediatype and still uses `etree`. */
const IA_BASE = "mediatype:(etree OR audio) AND format:(VBR MP3)";

interface IaDoc { identifier: string; title?: string; creator?: string | string[]; year?: string }
interface IaFile { name?: string; title?: string; format?: string; length?: string; track?: string }

const iaName = (c: string | string[] | undefined): string =>
  (Array.isArray(c) ? c[0] : c) ?? "Unknown";

/** the Archive writes lengths either as seconds or as mm:ss */
function iaSecs(len: string | undefined): number {
  if (!len) return 0;
  if (!len.includes(":")) return Math.round(parseFloat(len) || 0);
  return len.split(":").reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
}

/** file titles are usually absent, so the filename has to carry it */
const iaTitle = (f: IaFile): string =>
  f.title?.trim() ||
  (f.name ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^[\s_-]*\d{1,3}[\s._-]+/, "")
    .replace(/[_]+/g, " ")
    .trim();

async function iaSearch(query: string, rows: number, sort?: string): Promise<IaDoc[]> {
  const fl = ["identifier", "title", "creator", "year"].map((f) => `&fl[]=${f}`).join("");
  const s = sort ? `&sort[]=${encodeURIComponent(sort)}` : "";
  const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}${fl}${s}&rows=${rows}&output=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Archive ${resp.status}`);
  const j = (await resp.json()) as { response?: { docs?: IaDoc[] } };
  return j.response?.docs ?? [];
}

/** Turns items into tracks. `perItem` keeps one 30-song concert from filling
 * the whole page when you're browsing; asking for an artist wants the opposite. */
async function iaTracks(docs: IaDoc[], perItem: number, cap: number): Promise<CatTrack[]> {
  const lists = await Promise.all(
    docs.map(async (d) => {
      try {
        const r = await fetch(`${IA}/metadata/${encodeURIComponent(d.identifier)}`);
        if (!r.ok) return [];
        const m = (await r.json()) as { server?: string; dir?: string; files?: IaFile[]; metadata?: { creator?: string | string[]; title?: string } };
        if (!m.server || !m.dir) return [];
        const artist = iaName(m.metadata?.creator ?? d.creator);
        return (m.files ?? [])
          .filter((f) => f.format === "VBR MP3" && f.name)
          .slice(0, perItem)
          .map((f): CatTrack => ({
            id: `${d.identifier}/${f.name}`,
            source: "archive",
            title: iaTitle(f) || d.title || d.identifier,
            artist,
            artistKey: artist,
            duration: iaSecs(f.length),
            artwork: `${IA}/services/img/${encodeURIComponent(d.identifier)}`,
            genre: d.year,
            // straight to the node that holds it: the /download path in front
            // of it answers 503 under load often enough to matter
            url: `https://${m.server}${m.dir}/${encodeURIComponent(f.name!)}`,
            mime: "audio/mpeg",
          }));
      } catch {
        return [];
      }
    })
  );
  return lists.flat().slice(0, cap);
}

/**
 * Each chip is a corner of the Archive worth arriving at, rather than a genre
 * word thrown at the whole thing. A chip may list more than one query, run in
 * order — the narrow, exactly-right one first, then what fills the page out.
 *
 * Every one of these names a collection, which is also what keeps the results
 * honest. The Archive takes uploads from anyone, so a bare subject search for a
 * modern genre surfaces bootlegged commercial albums at the top; `netlabels`,
 * `etree` and `georgeblood` are artist-published, taper-approved and
 * out-of-copyright respectively. The item's own licence tag can't do this job —
 * whoever uploads picks it, and the bootlegs claim Creative Commons too.
 */
/**
 * The netlabel scene includes a shock-noise corner that tags itself with the
 * genres either side of it, and sorting by downloads puts it first — one such
 * release led the Hyperpop chip with hardcore-porn track titles until this
 * existed. Excluding its own tags is narrow enough to leave the rest of the
 * underground alone, which is the point: this is not a profanity filter.
 */
const IA_NO_SHOCK = ' AND NOT subject:(shitcore OR lolinoise OR "internet noise" OR pornogrind OR porngrind OR gore OR sexcore)';

const IA_BROWSE: Record<string, string[]> = {
  "Live sets": ["collection:etree"],
  "78s": ["collection:georgeblood"],
  Jazz: ["collection:georgeblood AND subject:(jazz)"],
  Blues: ["collection:georgeblood AND subject:(blues)"],
  Swing: ["collection:georgeblood AND subject:(swing OR foxtrot)"],
  Country: ["collection:georgeblood AND subject:(country OR hillbilly)"],
  Latin: ["collection:georgeblood AND subject:(latin OR rumba OR mambo)"],
  Rock: ["collection:etree AND subject:(rock)"],
  Jam: ["collection:etree AND subject:(jam OR improvisation)"],
  Folk: ["collection:etree AND subject:(folk OR bluegrass)"],
  Hyperpop: [
    // tagged hyperpop on a netlabel is a short list, so it leads and the
    // neighbouring sounds follow rather than burying it
    `collection:netlabels AND subject:(hyperpop OR glitchcore OR digicore OR bloxcore)${IA_NO_SHOCK}`,
    `collection:netlabels AND subject:(breakcore OR nightcore OR "glitch pop" OR chiptune OR mashup)${IA_NO_SHOCK}`,
  ],
  Electronic: ["collection:netlabels AND subject:(electronic OR techno OR house OR ambient)"],
  Classical: ["collection:audio_music AND subject:(classical)"],
};

export const archive: Source = {
  id: "archive",
  label: "ARCHIVE",
  blurb: "Full-length tracks, free and legal: taper-approved live recordings and pre-1960 masters from the Internet Archive. Millions of them — but it is live sets and old records, not chart pop.",
  genres: Object.keys(IA_BROWSE),
  async search(q) {
    const term = q.replace(/["\\]/g, " ").trim();
    if (!term) return [];
    // an exact-phrase search on who made it and what it's called, which is what
    // separates a real recording from something that only mentions the name
    const scoped = await iaSearch(`${IA_BASE} AND (creator:("${term}") OR title:("${term}"))`, 8, "downloads desc");
    const docs = scoped.length ? scoped : await iaSearch(`${IA_BASE} AND (${term})`, 8, "downloads desc");
    return iaTracks(docs, 6, 40);
  },
  async browse(genre) {
    const qs = IA_BROWSE[genre] ?? IA_BROWSE["Live sets"];
    const pages = await Promise.all(qs.map((q) => iaSearch(`${IA_BASE} AND ${q}`, 10, "downloads desc").catch(() => [])));
    const seen = new Set<string>();
    const docs: IaDoc[] = [];
    for (const d of pages.flat()) {
      if (seen.has(d.identifier)) continue;
      seen.add(d.identifier);
      docs.push(d);
      if (docs.length >= 12) break;
    }
    return iaTracks(docs, 4, 40);
  },
  async byArtist(name) {
    if (!name) return [];
    const term = name.replace(/["\\]/g, " ").trim();
    return iaTracks(await iaSearch(`${IA_BASE} AND creator:("${term}")`, 8, "downloads desc"), 12, 60);
  },
};

export const SOURCES: Source[] = [apple, archive, audius];

export const sourceById = (id: string): Source => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
