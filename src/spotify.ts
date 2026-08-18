// Spotify import — playlists, albums and songs, with no account setup.
//
// Paste a link and FLUX reads its track list, then fills the playlist from
// three places in order of quality: a file you already have (full length),
// Spotify's own 30-second preview clip, or Apple's 30-second preview.
//
// What this never does is take Spotify's actual streams. Those are encrypted,
// and pulling them apart would be both illegal and a good way to lose the
// account. The preview clips are a different thing entirely: plain unencrypted
// MP3 on p.scdn.co, no key, `access-control-allow-origin: *`, the same clips
// their embed player hands to any page on the web — exactly the same kind of
// excerpt FLUX already imports from Apple.
//
// Reading the track list needs one workaround, because Spotify sends no
// `access-control-allow-origin` on the pages that carry it (verified — every
// path under open.spotify.com except /oembed refuses a cross-origin read).
// The list lives in the `__NEXT_DATA__` blob of the public embed page, so a
// reader service fetches that page and answers with CORS open. Nothing private
// passes through it: only the link, which is public by definition.
//
// The official Web API is still here as an optional upgrade — it is the only
// way to reach private playlists and Liked Songs — but nothing requires it.
// Auth is Authorization Code with PKCE, designed for apps with no backend, so
// no secret is involved.
import { apple, fetchAsTrack, PREVIEW_SECS, type CatTrack } from "./catalogue";
import { parseEmbed } from "./spotifyEmbed";
import { blobStore } from "./store/blobStore";
import { useStore } from "./store/useStore";
import type { Track } from "./types";
import { uid } from "./utils";

const CLIENT_BLOB = "spotify-client-id";
const TOKEN_BLOB = "spotify-token";
const VERIFIER_KEY = "flux-spotify-verifier";
const AUTH = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

/** The exact URI the user must register in their Spotify app settings. */
export function redirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

interface StoredToken {
  access: string;
  refresh: string;
  expires: number;
}

export async function loadClientId(): Promise<string> {
  const b = await blobStore.get(CLIENT_BLOB);
  return b ? (await b.text()).trim() : "";
}

export async function saveClientId(id: string): Promise<void> {
  const v = id.trim();
  if (!v) await blobStore.del(CLIENT_BLOB);
  else await blobStore.put(CLIENT_BLOB, new Blob([v], { type: "text/plain" }));
}

async function loadToken(): Promise<StoredToken | null> {
  const b = await blobStore.get(TOKEN_BLOB);
  if (!b) return null;
  try {
    return JSON.parse(await b.text()) as StoredToken;
  } catch {
    return null;
  }
}

async function saveToken(t: StoredToken | null): Promise<void> {
  if (!t) await blobStore.del(TOKEN_BLOB);
  else await blobStore.put(TOKEN_BLOB, new Blob([JSON.stringify(t)], { type: "application/json" }));
  useStore.setState({ spotifyReady: !!t });
}

export async function spotifyConnected(): Promise<boolean> {
  return !!(await loadToken());
}

export async function disconnectSpotify(): Promise<void> {
  await saveToken(null);
}

// ── PKCE ────────────────────────────────────────────────────────────────
function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]).join("");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sends the user to Spotify to approve read-only access. */
export async function beginSpotifyAuth(): Promise<void> {
  const clientId = await loadClientId();
  if (!clientId) throw new Error("Add your Spotify Client ID first");
  const verifier = randomString(96);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
    // read-only: enough to list playlists, nothing that can modify the account
    scope: "playlist-read-private playlist-read-collaborative user-library-read",
  });
  location.assign(`${AUTH}?${params}`);
}

/** Call once on load: completes the redirect back from Spotify. */
export async function completeSpotifyAuth(): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (!code && !err) return false;
  // clean the query so a refresh doesn't retry a spent code
  history.replaceState({}, "", redirectUri());
  if (err || !code) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) return false;
  const clientId = await loadClientId();
  if (!clientId) return false;

  const resp = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!resp.ok) return false;
  const d = await resp.json();
  await saveToken({ access: d.access_token, refresh: d.refresh_token, expires: Date.now() + d.expires_in * 1000 });
  return true;
}

async function accessToken(): Promise<string> {
  const t = await loadToken();
  if (!t) throw new Error("Connect Spotify first");
  if (Date.now() < t.expires - 30_000) return t.access;
  const clientId = await loadClientId();
  const resp = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: clientId }),
  });
  if (!resp.ok) {
    await saveToken(null);
    throw new Error("Spotify session expired — connect again");
  }
  const d = await resp.json();
  const next: StoredToken = {
    access: d.access_token,
    refresh: d.refresh_token || t.refresh,
    expires: Date.now() + d.expires_in * 1000,
  };
  await saveToken(next);
  return next.access;
}

async function api<T>(path: string): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 401) {
    await saveToken(null);
    throw new Error("Spotify rejected the session — connect again");
  }
  if (r.status === 403) {
    // Two real causes, and the raw 403 tells the user neither of them.
    throw new Error(
      "Spotify refused that (403). Two usual causes: your app is in Development mode, " +
      "so the Spotify account you logged in with must be listed under the app's User Management; " +
      "and Spotify blocks its own editorial/algorithmic playlists (Discover Weekly, Daily Mix, " +
      "Today's Top Hits) from third-party apps. Try one of your own playlists."
    );
  }
  if (r.status === 404) throw new Error("Not found — private, or a Spotify-owned playlist that third-party apps can't read");
  if (r.status === 429) throw new Error("Spotify rate limit — wait a moment");
  if (!r.ok) throw new Error(`Spotify error ${r.status}`);
  return (await r.json()) as T;
}

// ── link parsing ────────────────────────────────────────────────────────
export interface SpotifyRef { kind: "playlist" | "album" | "track"; id: string }

export function parseSpotifyLink(input: string): SpotifyRef | null {
  const s = input.trim();
  const uriMatch = s.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (uriMatch) return { kind: uriMatch[1].toLowerCase() as SpotifyRef["kind"], id: uriMatch[2] };
  const urlMatch = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i);
  if (urlMatch) return { kind: urlMatch[1].toLowerCase() as SpotifyRef["kind"], id: urlMatch[2] };
  return null;
}

// ── fetching ────────────────────────────────────────────────────────────
export interface SpotifyItem {
  name: string;
  artists: string;
  album: string;
  /** seconds */
  duration: number;
  /** Spotify's track id, when the source of the list gives one */
  id?: string;
  /** Spotify's own 30-second MP3 clip, when it publishes one for this track */
  preview?: string;
}

interface ApiTrack { name?: string; artists?: { name: string }[]; album?: { name: string }; duration_ms?: number; id?: string }

const toItem = (t: ApiTrack): SpotifyItem => ({
  name: t.name ?? "",
  artists: (t.artists ?? []).map((a) => a.name).join(", "),
  album: t.album?.name ?? "",
  duration: Math.round((t.duration_ms ?? 0) / 1000),
  id: t.id,
});

/**
 * Public oEmbed lookup. Needs no app, no login and no key, and it is the one
 * Spotify endpoint that answers a cross-origin read directly. It returns only
 * a title, so it is the last-resort fallback rather than the main path.
 */
async function fetchOEmbed(ref: SpotifyRef): Promise<string> {
  const link = `https://open.spotify.com/${ref.kind}/${ref.id}`;
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`);
  if (!r.ok) throw new Error("Spotify couldn't resolve that link — is it public?");
  const d = (await r.json()) as { title?: string };
  const title = (d.title ?? "").trim();
  if (!title) throw new Error("Spotify returned no title for that link");
  return title;
}

// ── public track lists, no account ──────────────────────────────────────
// Spotify's embed page carries the whole list — every title, artist, length
// and preview clip — in a `__NEXT_DATA__` script tag. It just won't hand it to
// another origin, so these read it somewhere that will and answer CORS-open.
// Each is tried in turn and the parse below is strict, so a proxy that returns
// an error page or an interstitial fails over to the next instead of being
// mistaken for an empty playlist.
const READERS: ((url: string) => Promise<string>)[] = [
  (url) => fetch(`https://r.jina.ai/${url}`, { headers: { "x-respond-with": "html" } }).then(okText),
  (url) => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`).then(okText),
];

async function okText(r: Response): Promise<string> {
  if (!r.ok) throw new Error(`reader ${r.status}`);
  return r.text();
}

async function fetchPublic(ref: SpotifyRef): Promise<{ title: string; items: SpotifyItem[] }> {
  const url = `https://open.spotify.com/embed/${ref.kind}/${ref.id}`;
  let last = "";
  for (const read of READERS) {
    try {
      const { title, items } = parseEmbed(await read(url));
      return { title, items: items.map((i) => ({ ...i, album: "" })) };
    } catch (e) {
      last = (e as Error).message;
    }
  }
  if (ref.kind === "track") {
    // Worst case a song still works: oEmbed is Spotify's own endpoint and
    // reads cross-origin, it just knows nothing but the title.
    const title = await fetchOEmbed(ref);
    return { title, items: [{ name: title, artists: "", album: "", duration: 0 }] };
  }
  throw new Error(`Couldn't read that link (${last}). If it's a private playlist, connect a Spotify app below.`);
}

export async function fetchSpotifyItems(ref: SpotifyRef): Promise<{ title: string; items: SpotifyItem[] }> {
  // The public read covers anything with a shareable link and needs nothing
  // from the user. A connected app is only better for private material, so it
  // is tried first when there is one and quietly falls back when it refuses.
  if (!(await spotifyConnected())) return fetchPublic(ref);
  try {
    if (ref.kind === "track") {
      const t = await api<ApiTrack>(`/tracks/${ref.id}`);
      return { title: t.name ?? "SPOTIFY TRACK", items: [toItem(t)] };
    }
    if (ref.kind === "album") {
      const al = await api<{ name?: string; tracks?: { items?: ApiTrack[] } }>(`/albums/${ref.id}`);
      return { title: al.name ?? "SPOTIFY ALBUM", items: (al.tracks?.items ?? []).map(toItem) };
    }
    return await fetchPlaylistApi(ref);
  } catch (e) {
    // Development-mode 403s and editorial-playlist blocks are common enough
    // that falling through to the public read is the useful behaviour.
    try {
      return await fetchPublic(ref);
    } catch {
      throw e;
    }
  }
}

async function fetchPlaylistApi(ref: SpotifyRef): Promise<{ title: string; items: SpotifyItem[] }> {
  const pl = await api<{ name?: string }>(`/playlists/${ref.id}?fields=name`);
  const items: SpotifyItem[] = [];
  let url = `/playlists/${ref.id}/tracks?limit=100&fields=next,items(track(name,duration_ms,artists(name),album(name)))`;
  for (let page = 0; page < 20 && url; page++) {
    const d = await api<{ items?: { track?: ApiTrack | null }[]; next?: string | null }>(url);
    for (const row of d.items ?? []) if (row.track) items.push(toItem(row.track));
    if (!d.next) break;
    url = d.next.replace(API, "");
  }
  return { title: pl.name ?? "SPOTIFY PLAYLIST", items };
}

// ── matching against the local library ──────────────────────────────────
const norm = (s: string): string[] =>
  s.toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !["the", "feat", "ft", "official", "audio", "video", "remaster", "remastered"].includes(w));

/** 0-1 similarity between a Spotify entry and a local filename. */
export function matchScore(item: SpotifyItem, fileName: string, dur?: number): number {
  const want = new Set([...norm(item.name), ...norm(item.artists)]);
  const have = new Set(norm(fileName));
  if (!want.size || !have.size) return 0;
  let hit = 0;
  for (const w of want) if (have.has(w)) hit++;
  // the title matters more than the artist, so weight title tokens again
  const titleTokens = norm(item.name);
  let titleHit = 0;
  for (const w of new Set(titleTokens)) if (have.has(w)) titleHit++;
  const titleCover = titleTokens.length ? titleHit / new Set(titleTokens).size : 0;
  let score = (hit / want.size) * 0.45 + titleCover * 0.55;
  if (dur && item.duration) {
    const dd = Math.abs(dur - item.duration);
    if (dd <= 4) score += 0.12;
    else if (dd > 25) score -= 0.25;
  }
  return Math.max(0, Math.min(1, score));
}

export interface MatchRow {
  item: SpotifyItem;
  track: Track | null;
  score: number;
}

export function matchLibrary(items: SpotifyItem[]): MatchRow[] {
  const s = useStore.getState();
  const seen = new Set<string>();
  const lib: Track[] = [];
  for (const p of s.playlists) {
    for (const t of p.tracks) {
      if (seen.has(t.fileId)) continue;
      seen.add(t.fileId);
      lib.push(t);
    }
  }
  const used = new Set<string>();
  return items.map((item) => {
    let best: Track | null = null;
    let bestScore = 0;
    for (const t of lib) {
      if (used.has(t.id)) continue;
      // the artist is part of a streamed track's record rather than its name,
      // so match against both or an imported track never scores on its artist
      const sc = matchScore(item, t.artist ? `${t.artist} ${t.name}` : t.name);
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    if (best && bestScore >= 0.55) {
      used.add(best.id);
      return { item, track: best, score: bestScore };
    }
    return { item, track: null, score: bestScore };
  });
}

/** Creates a FLUX playlist from the matched rows, in Spotify's order. */
export function buildPlaylistFromMatches(name: string, rows: MatchRow[]): { id: string; added: number } {
  const tracks: Track[] = [];
  for (const r of rows) if (r.track) tracks.push({ ...r.track, id: uid() });
  const id = uid();
  useStore.setState((s) => ({
    playlists: [...s.playlists, { id, name: name.toUpperCase().slice(0, 40), tracks }],
  }));
  return { id, added: tracks.length };
}

// ── filling the gaps with audio ─────────────────────────────────────────
// Anything not already on the device is fetched as a 30-second excerpt, which
// the whole app treats like any other file: it decodes to an AudioBuffer, so
// the visualizer, the FX rack, separation and Revoice all run on it.

/** where each row's audio ended up coming from */
export type Fill = "library" | "spotify" | "apple" | null;

const spotifyPreviewTrack = (item: SpotifyItem): CatTrack => ({
  id: item.id ?? item.name.replace(/\W+/g, "").slice(0, 22),
  source: "spotify",
  title: item.name,
  artist: item.artists,
  artistKey: item.artists,
  duration: PREVIEW_SECS,
  url: item.preview!,
  preview: true,
  // p.scdn.co serves plain MP3, which every browser decodes — no codec guard
  // needed the way Apple's AAC needs one
  mime: "audio/mpeg",
});

/** Looks the song up on Apple and takes the best-matching preview. */
async function fromApple(item: SpotifyItem): Promise<Track | null> {
  const q = `${item.artists} ${item.name}`.trim();
  if (!q) return null;
  const found = await apple.search(q).catch(() => [] as CatTrack[]);
  let best: CatTrack | null = null;
  let bestScore = 0;
  for (const c of found.slice(0, 12)) {
    const sc = matchScore(item, `${c.artist} ${c.title}`);
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  // a loose match here would quietly put the wrong song in the playlist, which
  // is worse than a gap
  return best && bestScore >= 0.6 ? fetchAsTrack(best) : null;
}

async function fillOne(row: MatchRow): Promise<{ track: Track | null; via: Fill }> {
  if (row.track) return { track: { ...row.track, id: uid() }, via: "library" };
  if (row.item.preview) {
    const t = await fetchAsTrack(spotifyPreviewTrack(row.item));
    if (t) return { track: t, via: "spotify" };
  }
  const a = await fromApple(row.item);
  return a ? { track: a, via: "apple" } : { track: null, via: null };
}

export interface FillResult {
  id: string;
  tracks: number;
  fromLibrary: number;
  previews: number;
  missing: number;
}

/**
 * Builds the whole playlist: local files where they exist, previews where they
 * don't. Rows are resolved a few at a time — one at a time takes a minute over
 * fifty tracks, all at once buries the network — and then filed in Spotify's
 * order rather than in whatever order they finished.
 */
export async function importSpotifyPlaylist(
  name: string,
  rows: MatchRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<FillResult> {
  const out: { track: Track | null; via: Fill }[] = new Array(rows.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= rows.length) return;
      out[i] = await fillOne(rows[i]);
      onProgress?.(++done, rows.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));

  const tracks: Track[] = [];
  let fromLibrary = 0;
  let previews = 0;
  for (const r of out) {
    if (!r?.track) continue;
    tracks.push(r.track);
    if (r.via === "library") fromLibrary++;
    else previews++;
  }
  const id = uid();
  useStore.setState((s) => ({
    playlists: [...s.playlists, { id, name: name.toUpperCase().slice(0, 40), tracks }],
  }));
  return { id, tracks: tracks.length, fromLibrary, previews, missing: rows.length - tracks.length };
}

/** A plain-text shopping list of everything that wasn't found locally. */
export function missingList(rows: MatchRow[]): string {
  return rows
    .filter((r) => !r.track)
    .map((r) => (r.item.artists ? `${r.item.artists} — ${r.item.name}` : r.item.name))
    .join("\n");
}
