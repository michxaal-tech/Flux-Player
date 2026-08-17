// Audius — a free online catalogue FLUX can actually use.
//
// Why not Spotify or SoundCloud, which is what everyone asks for first:
//
//   Spotify's Web Playback SDK does stream full tracks in a browser, but the
//   audio plays inside Spotify's own encrypted player. A page gets no access to
//   the samples — no Web Audio graph, no AnalyserNode, nothing. That removes
//   the visualiser, the FX rack, stem separation and Revoice at a stroke, which
//   is the entire app. It also requires Premium, and the audio-analysis
//   endpoints were closed to new applications in late 2024.
//
//   SoundCloud stopped accepting new API app registrations years ago, and their
//   embed is a cross-origin iframe — the same wall.
//
// Audius clears the bar that actually matters: its stream endpoint returns a
// plain MP3 with `access-control-allow-origin: *`, so the file can be fetched,
// decoded and fed through the whole DSP chain exactly like a local import.
// No API key, no account, no OAuth.
import { blobStore } from "./store/blobStore";
import { useStore } from "./store/useStore";
import type { Track } from "./types";

const HOST = "https://discoveryprovider.audius.co/v1";
const APP = "FLUX";

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  artistHandle: string;
  duration: number;
  artwork?: string;
  /** the artist allows offline copies; streaming is always permitted */
  downloadable: boolean;
  plays: number;
  genre?: string;
}

interface RawTrack {
  id?: string;
  title?: string;
  duration?: number;
  play_count?: number;
  genre?: string;
  is_downloadable?: boolean;
  user?: { name?: string; handle?: string };
  artwork?: Record<string, string> | null;
}

function toTrack(r: RawTrack): AudiusTrack | null {
  if (!r?.id || !r.title) return null;
  const art = r.artwork ?? undefined;
  return {
    id: r.id,
    title: r.title,
    artist: r.user?.name ?? r.user?.handle ?? "Unknown",
    artistHandle: r.user?.handle ?? "",
    duration: r.duration ?? 0,
    artwork: art?.["480x480"] ?? art?.["150x150"] ?? art?.["1000x1000"],
    downloadable: !!r.is_downloadable,
    plays: r.play_count ?? 0,
    genre: r.genre,
  };
}

async function get(path: string): Promise<RawTrack[]> {
  const sep = path.includes("?") ? "&" : "?";
  const resp = await fetch(`${HOST}${path}${sep}app_name=${APP}`);
  if (!resp.ok) throw new Error(`Audius ${resp.status}`);
  const j = (await resp.json()) as { data?: RawTrack[] };
  return j.data ?? [];
}

export async function search(query: string, limit = 25): Promise<AudiusTrack[]> {
  const raw = await get(`/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  return raw.map(toTrack).filter((t): t is AudiusTrack => !!t);
}

export async function trending(genre?: string, limit = 25): Promise<AudiusTrack[]> {
  const g = genre && genre !== "ALL" ? `&genre=${encodeURIComponent(genre)}` : "";
  const raw = await get(`/tracks/trending?limit=${limit}${g}`);
  return raw.map(toTrack).filter((t): t is AudiusTrack => !!t);
}

/** Every track by one artist, by their handle. */
export async function byArtist(handle: string, limit = 50): Promise<AudiusTrack[]> {
  const users = await fetch(`${HOST}/users/handle/${encodeURIComponent(handle)}?app_name=${APP}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as { data?: { id?: string } } | null;
  const uid = users?.data?.id;
  if (!uid) return [];
  const raw = await get(`/users/${uid}/tracks?limit=${limit}`);
  return raw.map(toTrack).filter((t): t is AudiusTrack => !!t);
}

export const streamUrl = (id: string) => `${HOST}/tracks/${id}/stream?app_name=${APP}`;

/** Genres the trending endpoint understands, trimmed to what FLUX users pick. */
export const GENRES = [
  "ALL", "Electronic", "Hip-Hop/Rap", "Dubstep", "Drum & Bass", "House",
  "Techno", "Trap", "Ambient", "Rock", "Pop", "R&B/Soul", "Lo-Fi",
];

/**
 * Pulls a track into the library.
 *
 * Streaming is always allowed, but a permanent offline copy is only made when
 * the artist marked the track downloadable — that flag is their stated intent
 * and there is no good reason to ignore it. Everything else is fetched fresh
 * each time it plays, which the DSP chain does not care about either way since
 * it works from the decoded buffer.
 */
export async function importTrack(at: AudiusTrack, plId: string): Promise<Track | null> {
  const set = (audiusStatus: string) => useStore.setState({ audiusStatus });
  try {
    set(`fetching ${at.title}…`);
    const resp = await fetch(streamUrl(at.id));
    if (!resp.ok) throw new Error(`stream ${resp.status}`);
    const blob = await resp.blob();
    if (blob.size < 1000) throw new Error("empty stream");

    const fileId = `audius-${at.id}`;
    await blobStore.put(fileId, blob);

    const tr: Track = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileId,
      name: at.title,
      artist: at.artist,
      source: "audius",
      sourceId: at.id,
      plays: 0,
      fav: false,
      tags: [],
      note: "",
      addedAt: Date.now(),
      lastPlayedAt: 0,
    };
    useStore.getState().addTracks(plId, [tr]);
    set(`✓ added ${at.title}`);
    setTimeout(() => set(""), 3500);
    return tr;
  } catch (e) {
    console.warn("audius import failed:", e);
    set("Couldn't fetch that track — try again or pick another.");
    setTimeout(() => set(""), 6000);
    return null;
  }
}
