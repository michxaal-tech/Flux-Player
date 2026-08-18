// Reading a track list out of Spotify's public embed page.
//
// Kept free of every other import so `node scripts/spotify-check.mjs` can run
// it against the live page: this is the one piece that breaks silently if
// Spotify reshapes its markup, and a parser that returns an empty list is
// indistinguishable from an empty playlist unless something checks.

export interface EmbedItem {
  name: string;
  artists: string;
  /** seconds */
  duration: number;
  id?: string;
  /** Spotify's own 30-second MP3 clip, when it publishes one for this track */
  preview?: string;
}

interface EmbedRow {
  uri?: string;
  id?: string;
  title?: string;
  name?: string;
  subtitle?: string;
  artists?: { name?: string }[];
  duration?: number;
  audioPreview?: { url?: string } | null;
}

const rowItem = (r: EmbedRow): EmbedItem => ({
  name: (r.title ?? r.name ?? "").trim(),
  // a row inside a list carries the artist as `subtitle`; a lone track spells
  // it out as an array instead
  artists: (r.subtitle ?? (r.artists ?? []).map((a) => a.name ?? "").filter(Boolean).join(", ")).trim(),
  duration: Math.round((r.duration ?? 0) / 1000),
  id: r.id ?? r.uri?.split(":").pop(),
  preview: r.audioPreview?.url,
});

/**
 * Pulls the list out of an embed page's `__NEXT_DATA__` blob. Throws rather
 * than returning nothing, so a proxy that answered with an error page or an
 * interstitial fails over to the next reader instead of being mistaken for an
 * empty playlist.
 */
export function parseEmbed(html: string): { title: string; items: EmbedItem[] } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("that page carried no track list");
  let entity: any;
  try {
    entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  } catch {
    throw new Error("that page's data didn't parse");
  }
  if (!entity) throw new Error("that page carried no track list");
  const list: EmbedRow[] = Array.isArray(entity.trackList) && entity.trackList.length ? entity.trackList : [entity];
  const items = list.map(rowItem).filter((i) => i.name);
  if (!items.length) throw new Error("that page carried no track list");
  return { title: String(entity.name ?? entity.title ?? "SPOTIFY").trim(), items };
}
