// Importing a catalogue track into the library.
//
// The catalogues themselves live in sources.ts, which imports nothing else so
// `node scripts/catalogue-check.mjs` can run them against the live services.
// This file is the half that touches storage and the store.
import { blobStore } from "./store/blobStore";
import { useStore } from "./store/useStore";
import type { Track } from "./types";
import { uid } from "./utils";
import type { CatTrack } from "./sources";

export * from "./sources";

/**
 * AAC is a licensed codec, so it is absent from some open-source browser
 * builds — Chromium without proprietary codecs decodes nothing here, while
 * Safari, Chrome and Edge all handle it. Checking first turns a track that
 * imports and then silently refuses to play into a sentence that explains
 * itself. Returns "" when the browser can play it.
 */
export function codecProblem(t: CatTrack): string {
  if (!t.mime || typeof document === "undefined") return "";
  const probe = document.createElement("audio");
  if (probe.canPlayType(t.mime)) return "";
  return "This browser can't play Apple's format (AAC). Safari, Chrome and Edge can — or use the Audius source, which serves MP3.";
}

/**
 * Fetches a catalogue track's audio, stores it, and hands back the Track
 * record without filing it in a playlist. `importTrack` is this plus a
 * destination and a status line; the Spotify importer builds a whole playlist
 * out of these, so it needs the record rather than the side effect.
 */
export async function fetchAsTrack(t: CatTrack): Promise<Track | null> {
  if (codecProblem(t)) return null;
  try {
    const resp = await fetch(t.url);
    if (!resp.ok) throw new Error(`stream ${resp.status}`);
    const blob = await resp.blob();
    if (blob.size < 1000) throw new Error("empty stream");

    const fileId = `${t.source}-${t.id}`;
    await blobStore.put(fileId, blob);

    return {
      id: uid(),
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
  } catch (e) {
    console.warn("catalogue fetch failed:", e);
    return null;
  }
}

/**
 * Pulls a track into the library.
 *
 * The audio is fetched and stored like any other import, so it survives a
 * reload and runs through the whole DSP chain from its decoded buffer.
 */
export async function importTrack(t: CatTrack, plId: string): Promise<Track | null> {
  const set = (catStatus: string) => useStore.setState({ catStatus });

  const bad = codecProblem(t);
  if (bad) {
    set(bad);
    setTimeout(() => set(""), 9000);
    return null;
  }

  set(`fetching ${t.title}…`);
  const tr = await fetchAsTrack(t);
  if (!tr) {
    set("Couldn't fetch that track — try again or pick another.");
    setTimeout(() => set(""), 6000);
    return null;
  }
  useStore.getState().addTracks(plId, [tr]);
  set(`✓ added ${t.title}`);
  setTimeout(() => set(""), 3500);
  return tr;
}
