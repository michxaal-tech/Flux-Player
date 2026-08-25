// Bring-your-own-credentials sources.
//
// FLUX ships with a handful of open catalogues (see sources.ts). This file is
// the other half: a place to plug in a service *you* have access to, with your
// own credentials, and have it appear alongside them in the picker.
//
// Two things live here:
//
//   1. A credential store. Named connections — a base URL, a login, a
//      key/password, and which auth style to use — kept in the same IndexedDB
//      blob store the Spotify client ID uses, so secrets never land in the
//      serialized app state or in an export.
//
//   2. One turnkey connector: Subsonic / OpenSubsonic. That is the open
//      standard self-hosted music servers speak — Navidrome, Airsonic, Gonic,
//      Funkwhale, Jellyfin's plugin — and its `stream` endpoint hands back a
//      plain audio file a page can `fetch()`, which is the bar every FLUX
//      feature needs (the visualiser, the FX rack and stem separation all work
//      from decoded samples, not an opaque player). It is your server and your
//      library, so nothing here reaches around anyone's access controls.
//
// A connection whose kind is "generic" is stored but not turned into a source:
// FLUX can't know how an arbitrary API shapes its JSON or where the audio is.
// The field is there so you can keep a key for something you drive yourself —
// what you point it at, and whether you're allowed to, is on you.

import { blobStore } from "./store/blobStore";
import { setConnectorSources, type CatTrack, type Source } from "./sources";

export type ConnKind = "subsonic" | "generic";

export interface Connection {
  id: string;
  kind: ConnKind;
  /** shown on the source picker */
  name: string;
  /** e.g. https://music.example.com — no trailing slash needed */
  baseUrl: string;
  /** login name, where the service uses one (Subsonic does) */
  user?: string;
  /** password / API key / token — the secret */
  secret: string;
  /** generic only: header the secret rides in, e.g. "Authorization" */
  header?: string;
  /** generic only: prefix before the secret, e.g. "Bearer " */
  scheme?: string;
}

const KEY = "flux-connections";

/** Everything stored, secrets included. Kept out of the persisted store. */
export async function loadConnections(): Promise<Connection[]> {
  const b = await blobStore.get(KEY);
  if (!b) return [];
  try {
    const list = JSON.parse(await b.text()) as Connection[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveConnections(list: Connection[]): Promise<void> {
  if (!list.length) {
    await blobStore.del(KEY);
    return;
  }
  await blobStore.put(KEY, new Blob([JSON.stringify(list)], { type: "application/json" }));
}

// ── md5, for Subsonic token auth ────────────────────────────────────────────
//
// The Subsonic auth scheme is `token = md5(password + salt)` with a random
// salt per request, so the password never crosses the wire and never sits in a
// URL. WebCrypto has no md5, so this is a compact, self-contained one. It runs
// a few times per search — never in a hot loop — so plainness beats cleverness.
function md5(input: string): string {
  const rl = (n: number, c: number) => (n << c) | (n >>> (32 - c));
  const au = (x: number, y: number) => {
    const l = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff);
  };
  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) =>
    au(rl(au(au(a, q), au(x, t)), s), b);
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t);

  const toBlocks = (str: string) => {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    const n = bytes.length;
    const words = new Array<number>((((n + 8) >> 6) + 1) * 16).fill(0);
    for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    words[n >> 2] |= 0x80 << ((n % 4) * 8);
    words[words.length - 2] = n * 8;
    return words;
  };

  const x = toBlocks(input);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = au(a, oa); b = au(b, ob); c = au(c, oc); d = au(d, od);
  }
  const hex = (n: number) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

// ── Subsonic / OpenSubsonic source ──────────────────────────────────────────

const SUB_GENRES = ["ALL", "Electronic", "House", "Techno", "Hip-Hop", "Rock", "Pop", "Jazz", "Ambient", "Classical", "Metal"];

interface SubSong {
  id?: string;
  title?: string;
  artist?: string;
  artistId?: string;
  album?: string;
  duration?: number;
  genre?: string;
  coverArt?: string;
  suffix?: string;
  contentType?: string;
}

function trimUrl(u: string): string {
  return u.trim().replace(/\/+$/, "");
}

/** Auth query params for one request, freshly salted. */
function authParams(conn: Connection): string {
  const salt = Math.random().toString(36).slice(2, 12);
  const token = md5(conn.secret + salt);
  const p = new URLSearchParams({
    u: conn.user ?? "",
    t: token,
    s: salt,
    v: "1.16.1",
    c: "FLUX",
    f: "json",
  });
  return p.toString();
}

function subUrl(conn: Connection, view: string, extra = ""): string {
  const base = `${trimUrl(conn.baseUrl)}/rest/${view}.view?${authParams(conn)}`;
  return extra ? `${base}&${extra}` : base;
}

/** The stream URL is what a track actually plays from — auth baked in. */
function streamUrl(conn: Connection, songId: string): string {
  return subUrl(conn, "stream", `id=${encodeURIComponent(songId)}`);
}

function coverUrl(conn: Connection, coverArt?: string): string | undefined {
  return coverArt ? subUrl(conn, "getCoverArt", `id=${encodeURIComponent(coverArt)}&size=300`) : undefined;
}

async function subGet(conn: Connection, view: string, extra = ""): Promise<any> {
  const r = await fetch(subUrl(conn, view, extra));
  if (!r.ok) throw new Error(`${conn.name}: ${r.status}`);
  const j = await r.json();
  const resp = j["subsonic-response"];
  if (!resp) throw new Error(`${conn.name}: not a Subsonic server`);
  if (resp.status === "failed") {
    const msg = resp.error?.message || "auth failed";
    throw new Error(`${conn.name}: ${msg}`);
  }
  return resp;
}

function toTrack(conn: Connection, s: SubSong): CatTrack | null {
  if (!s.id || !s.title) return null;
  return {
    id: `${conn.id}:${s.id}`,
    source: conn.id,
    title: s.title,
    artist: s.artist ?? "Unknown",
    artistKey: s.artist ?? "",
    duration: s.duration ?? 0,
    artwork: coverUrl(conn, s.coverArt),
    genre: s.genre,
    url: streamUrl(conn, s.id),
    mime: s.contentType,
  };
}

const keep = (xs: (CatTrack | null)[]): CatTrack[] => xs.filter((x): x is CatTrack => !!x);

export function subsonicSource(conn: Connection): Source {
  return {
    id: conn.id,
    label: conn.name.toUpperCase(),
    blurb: "Your own Subsonic-compatible server — full-length tracks you host yourself.",
    genres: SUB_GENRES,
    async search(q) {
      const r = await subGet(conn, "search3", `query=${encodeURIComponent(q)}&songCount=40&artistCount=0&albumCount=0`);
      const songs: SubSong[] = r.searchResult3?.song ?? [];
      return keep(songs.map((s) => toTrack(conn, s)));
    },
    async browse(genre) {
      const extra = genre && genre !== "ALL"
        ? `genre=${encodeURIComponent(genre)}&count=40`
        : "size=40";
      const view = genre && genre !== "ALL" ? "getSongsByGenre" : "getRandomSongs";
      const r = await subGet(conn, view, extra);
      const songs: SubSong[] = r.songsByGenre?.song ?? r.randomSongs?.song ?? [];
      return keep(songs.map((s) => toTrack(conn, s)));
    },
    async byArtist(key) {
      if (!key) return [];
      const r = await subGet(conn, "search3", `query=${encodeURIComponent(key)}&songCount=60&artistCount=0&albumCount=0`);
      const songs: SubSong[] = r.searchResult3?.song ?? [];
      return keep(songs.map((s) => toTrack(conn, s)).filter((t) => t && t.artist === key));
    },
  };
}

/** Turn stored connections into ready-to-use sources (Subsonic ones only). */
export function connectorSources(list: Connection[]): Source[] {
  return list.filter((c) => c.kind === "subsonic" && c.baseUrl && c.secret).map(subsonicSource);
}

/** Load stored connections and register their sources in the picker. */
export async function refreshConnectorSources(): Promise<Connection[]> {
  const list = await loadConnections();
  setConnectorSources(connectorSources(list));
  return list;
}

/** A quick liveness/auth check for the settings panel. */
export async function pingConnection(conn: Connection): Promise<string> {
  if (conn.kind !== "subsonic") return "Stored. FLUX can't browse this kind automatically — use it from your own code.";
  await subGet(conn, "ping");
  return "Connected.";
}
