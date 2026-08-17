// Spotify playlist import — metadata only.
//
// This reads track names, artists and durations from Spotify's official Web
// API and matches them against audio files you already have on this device.
// It never touches Spotify's audio: their streams are DRM-protected and
// downloading them would be both illegal and a good way to lose your account.
// What it fixes is the real annoyance — your playlists live over there and
// your files live here.
//
// Auth is Authorization Code with PKCE, which is designed for apps with no
// backend: the secret never leaves this browser, and both Spotify endpoints
// were verified to accept cross-origin browser requests.
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
  if (r.status === 404) throw new Error("Not found — is the playlist private or the link wrong?");
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
}

interface ApiTrack { name?: string; artists?: { name: string }[]; album?: { name: string }; duration_ms?: number }

const toItem = (t: ApiTrack): SpotifyItem => ({
  name: t.name ?? "",
  artists: (t.artists ?? []).map((a) => a.name).join(", "),
  album: t.album?.name ?? "",
  duration: Math.round((t.duration_ms ?? 0) / 1000),
});

export async function fetchSpotifyItems(ref: SpotifyRef): Promise<{ title: string; items: SpotifyItem[] }> {
  if (ref.kind === "track") {
    const t = await api<ApiTrack>(`/tracks/${ref.id}`);
    return { title: t.name ?? "SPOTIFY TRACK", items: [toItem(t)] };
  }
  if (ref.kind === "album") {
    const al = await api<{ name?: string; tracks?: { items?: ApiTrack[] } }>(`/albums/${ref.id}`);
    return { title: al.name ?? "SPOTIFY ALBUM", items: (al.tracks?.items ?? []).map(toItem) };
  }
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
      const sc = matchScore(item, t.name, s.trackBpm ? undefined : undefined);
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

/** A plain-text shopping list of everything that wasn't found locally. */
export function missingList(rows: MatchRow[]): string {
  return rows
    .filter((r) => !r.track)
    .map((r) => `${r.item.artists} — ${r.item.name}`)
    .join("\n");
}
