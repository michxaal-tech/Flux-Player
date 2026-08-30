/**
 * YouTube as a source, through YouTube's own player.
 *
 * Two official interfaces, both used the way Google documents them:
 *
 *   Data API v3      search, with the user's own API key
 *   IFrame Player    playback, inside YouTube's embedded player
 *
 * Playback happens in YouTube's player rather than as a stream FLUX decodes,
 * which is the whole point: views count, ads serve, and nothing is extracted.
 * That is what separates this from the private-API scraping FLUX does not do.
 *
 * ── The limitation, stated plainly ──
 *
 * The IFrame player is a *cross-origin iframe*, and a page cannot reach into
 * one to capture its audio. Every FLUX feature that works from decoded samples
 * — the reactive visualizer, the FX rack, stem separation, Revoice, beat
 * analysis — is therefore unavailable on a YouTube track. This is the identical
 * wall documented for Spotify's SDK in sources.ts, and it is a property of the
 * browser's security model, not something a cleverer implementation avoids.
 *
 * The visualizers still animate: they have a no-live-audio path and fall back
 * to it. They just cannot react to a waveform they are not allowed to see. The
 * UI says so rather than letting it read as a bug.
 */
import { blobStore } from "./store/blobStore";
import { useStore } from "./store/useStore";
import type { Track } from "./types";
import { uid } from "./utils";

const KEY_BLOB = "youtube-api-key";

// ── the key ─────────────────────────────────────────────────────────────────
// Kept in IndexedDB alongside every other credential FLUX holds, never in the
// persisted store — so it is not in an export and not in localStorage.

let keyCache: string | null | undefined;

export async function loadYtKey(): Promise<string> {
  if (keyCache !== undefined) return keyCache ?? "";
  try {
    const b = await blobStore.get(KEY_BLOB);
    keyCache = b ? (await b.text()).trim() || null : null;
  } catch {
    keyCache = null;
  }
  return keyCache ?? "";
}

export async function saveYtKey(key: string): Promise<void> {
  const k = key.trim();
  keyCache = k || null;
  if (!k) await blobStore.del(KEY_BLOB);
  else await blobStore.put(KEY_BLOB, new Blob([k], { type: "text/plain" }));
  useStore.setState({ ytReady: !!k });
}

// ── search ──────────────────────────────────────────────────────────────────

export interface YtHit {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  /** seconds; 0 when the duration lookup was skipped or failed */
  duration: number;
  /** false when the uploader forbids embedding — it cannot be played here */
  embeddable: boolean;
}

/** ISO-8601 durations, which is what the API returns. */
export function parseIsoDuration(s: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

function apiError(status: number, body: string): Error {
  if (status === 403 && /quota/i.test(body)) {
    return new Error("That key's daily quota is used up. Quota resets at midnight Pacific.");
  }
  if (status === 403) {
    return new Error("Key rejected. Check that YouTube Data API v3 is enabled for it, and that any HTTP-referrer restriction allows this page.");
  }
  if (status === 400) return new Error("The key looks malformed.");
  return new Error(`YouTube API error ${status}. ${body.slice(0, 140)}`);
}

/**
 * Search, then fetch durations and embeddability in one follow-up call.
 *
 * search.list does not return either, and `status.embeddable` matters: a video
 * whose uploader disabled embedding will load the player and then refuse, which
 * looks exactly like a broken app. Better to grey it out in the results.
 */
export async function searchYouTube(q: string, signal?: AbortSignal): Promise<YtHit[]> {
  const key = await loadYtKey();
  if (!key) throw new Error("Add a YouTube Data API key first.");
  if (!q.trim()) return [];

  const su = new URL("https://www.googleapis.com/youtube/v3/search");
  su.searchParams.set("part", "snippet");
  su.searchParams.set("type", "video");
  su.searchParams.set("maxResults", "25");
  // 10 = Music. Narrows a search for a song away from reaction videos and
  // lyric-video re-uploads, which is most of what an unfiltered query returns.
  su.searchParams.set("videoCategoryId", "10");
  su.searchParams.set("q", q.trim());
  su.searchParams.set("key", key);

  const r = await fetch(su, { signal });
  if (!r.ok) throw apiError(r.status, await r.text().catch(() => ""));
  const j = (await r.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> } }[];
  };
  const base = (j.items ?? [])
    .map((it) => ({
      id: it.id?.videoId ?? "",
      title: decodeEntities(it.snippet?.title ?? ""),
      channel: decodeEntities(it.snippet?.channelTitle ?? ""),
      thumb: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? "",
      duration: 0,
      embeddable: true,
    }))
    .filter((h) => h.id);
  if (!base.length) return [];

  try {
    const vu = new URL("https://www.googleapis.com/youtube/v3/videos");
    vu.searchParams.set("part", "contentDetails,status");
    vu.searchParams.set("id", base.map((b) => b.id).join(","));
    vu.searchParams.set("key", key);
    const vr = await fetch(vu, { signal });
    if (vr.ok) {
      const vj = (await vr.json()) as {
        items?: { id?: string; contentDetails?: { duration?: string }; status?: { embeddable?: boolean } }[];
      };
      const by = new Map((vj.items ?? []).map((v) => [v.id ?? "", v]));
      for (const h of base) {
        const v = by.get(h.id);
        if (!v) continue;
        h.duration = parseIsoDuration(v.contentDetails?.duration ?? "");
        h.embeddable = v.status?.embeddable !== false;
      }
    }
  } catch {
    // durations are a nicety; a failure here should not lose the search
  }
  return base;
}

/** The API returns HTML-escaped titles ("Rock &amp; Roll"). */
function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

// ── as a FLUX track ─────────────────────────────────────────────────────────

/**
 * A YouTube hit as a Track.
 *
 * `fileId` is empty because there is no stored audio — that emptiness is what
 * the transport branches on to hand playback to the iframe instead of the
 * audio element.
 */
export function ytTrack(h: YtHit): Track {
  return {
    id: uid(),
    fileId: "",
    name: h.title,
    artist: h.channel,
    source: "youtube",
    sourceId: h.id,
    plays: 0,
    fav: false,
    tags: [],
    note: "",
    addedAt: Date.now(),
    lastPlayedAt: 0,
  };
}

export const isYouTube = (t: Track | undefined | null): boolean =>
  !!t && t.source === "youtube" && !!t.sourceId;

// ── the IFrame player ───────────────────────────────────────────────────────

interface YtPlayer {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  setVolume: (v: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

let player: YtPlayer | null = null;
let ready = false;
let pending: string | null = null;
let poll = 0;

/** Load the IFrame API once. */
function loadApi(): Promise<void> {
  const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

/**
 * Create the player in `host`, or reuse the existing one.
 *
 * The host element lives for the app's lifetime (see YouTubeHost), because
 * destroying and recreating the player on every track is both slow and a
 * reliable way to lose playback permission on mobile.
 */
export async function ensurePlayer(host: HTMLElement): Promise<void> {
  if (player) return;
  await loadApi();
  const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, o: unknown) => YtPlayer } }).YT;
  await new Promise<void>((resolve) => {
    player = new YT.Player(host, {
      height: "100%",
      width: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          ready = true;
          player?.setVolume(Math.round(useStore.getState().volume * 100));
          if (pending) { player?.loadVideoById(pending); pending = null; }
          resolve();
        },
        onStateChange: (e: { data: number }) => {
          // 1 playing, 2 paused, 0 ended
          if (e.data === 1) useStore.setState({ playing: true });
          if (e.data === 2) useStore.setState({ playing: false });
          if (e.data === 0) {
            useStore.setState({ playing: false });
            void import("./audio/transport").then((m) => m.next());
          }
        },
        onError: () => {
          useStore.setState({
            playing: false,
            ytStatus: "That video can't be embedded — the uploader disabled it.",
          });
        },
      },
    });
  });
}

export function ytLoad(videoId: string): void {
  if (!player || !ready) { pending = videoId; return; }
  player.loadVideoById(videoId);
  startPoll();
}

export function ytPlay(): void { player?.playVideo(); startPoll(); }
export function ytPause(): void { player?.pauseVideo(); }
export function ytSeek(sec: number): void { player?.seekTo(sec, true); }
export function ytVolume(v: number): void { player?.setVolume(Math.round(v * 100)); }

export function ytStop(): void {
  player?.pauseVideo();
  stopPoll();
}

/**
 * Drive `progress`/`duration` from the player.
 *
 * The audio element does this with a `timeupdate` event; the iframe has no such
 * event, so the position has to be polled. Four times a second is enough for a
 * seek bar and is not enough to matter for battery.
 */
function startPoll(): void {
  if (poll) return;
  poll = window.setInterval(() => {
    if (!player || !ready) return;
    const d = player.getDuration() || 0;
    const t = player.getCurrentTime() || 0;
    if (d > 0) useStore.setState({ duration: d, progress: Math.min(1, t / d) });
  }, 250);
}

function stopPoll(): void {
  if (poll) { window.clearInterval(poll); poll = 0; }
}
