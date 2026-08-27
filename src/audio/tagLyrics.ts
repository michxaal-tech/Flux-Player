/**
 * Lyrics that are already inside the file.
 *
 * The online lyric databases (see lyrics.ts) can only find a song somebody has
 * already transcribed, which is exactly wrong for a track you generated
 * yourself an hour ago: nobody has ever heard it. But the generators —
 * Suno, Udio, and most tagging tools — write the words into the file's own
 * metadata when they export it. So for the case where lookup is hopeless, the
 * answer is usually sitting in the first few kilobytes of the upload.
 *
 * This reads that, for the three container families FLUX accepts:
 *
 *   ID3v2   (MP3, and AIFF/WAV with an ID3 chunk) — USLT, SYLT, TXXX
 *   Vorbis  (FLAC, OGG) — LYRICS / UNSYNCEDLYRICS / SYNCEDLYRICS comments
 *   MP4     (M4A, MP4) — the `©lyr` atom
 *
 * Two shapes come out of those. SYLT and LRC-formatted text are *timed* and
 * drop straight into the player. Plain prose is not, and that distinction is
 * carried through to the caller rather than papered over — a lyric sheet shown
 * against the wrong moments is worse than none, so the UI has to be able to say
 * which one it got.
 */

export interface TagLyrics {
  /** the lines, timed if the file carried timings */
  lines: { t: number; text: string }[];
  /** true when the timings came from the file rather than being estimated */
  synced: boolean;
  /** which container/frame it came from, for the status line */
  source: string;
}

// ── text decoding ───────────────────────────────────────────────────────────

const dec = (enc: string, b: Uint8Array): string => {
  try {
    return new TextDecoder(enc).decode(b);
  } catch {
    return new TextDecoder("utf-8").decode(b);
  }
};

/**
 * ID3 text encodings. 0 and 3 are single-byte-terminated; 1 and 2 are UTF-16
 * and terminate on a *double* null, which is the detail that turns a lyric
 * sheet into one line of mojibake if you get it wrong.
 */
function id3Text(encoding: number, b: Uint8Array): string {
  switch (encoding) {
    case 0: return dec("iso-8859-1", b);
    case 1: return dec("utf-16", b);      // has a BOM
    case 2: return dec("utf-16be", b);
    default: return dec("utf-8", b);
  }
}

const wide = (encoding: number): boolean => encoding === 1 || encoding === 2;

/** Index just past the terminator, and the bytes before it. */
function splitTerminated(b: Uint8Array, start: number, encoding: number): [Uint8Array, number] {
  if (wide(encoding)) {
    for (let i = start; i + 1 < b.length; i += 2) {
      if (b[i] === 0 && b[i + 1] === 0) return [b.subarray(start, i), i + 2];
    }
  } else {
    for (let i = start; i < b.length; i++) {
      if (b[i] === 0) return [b.subarray(start, i), i + 1];
    }
  }
  return [b.subarray(start), b.length];
}

// ── LRC ─────────────────────────────────────────────────────────────────────

/**
 * The timestamp pattern, kept as a source string rather than as one shared
 * regex object — because a shared one with the `g` flag carries state.
 *
 * The first version of this had `looksLikeLrc` call `.test()` on a global
 * regex, which *advances* `lastIndex` on a match, and `parseLrcText` then used
 * `matchAll` on the same object. `matchAll` inherits `lastIndex`, so it began
 * searching past the first timestamp and returned nothing — every embedded LRC
 * sheet was detected as LRC and then parsed as zero lines, so it fell through
 * to being spread evenly as if it had never had timings at all. Silent, and
 * exactly the failure that makes lyrics worse than not having them.
 */
const LRC_TAG_SRC = "\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]";

/** Stateless: no `g` flag, so `.test()` has nowhere to leave a position. */
const LRC_TEST = new RegExp(LRC_TAG_SRC);

/** Does this text carry LRC timestamps? */
export function looksLikeLrc(s: string): boolean {
  return LRC_TEST.test(s);
}

/**
 * Parse LRC, including the several-timestamps-on-one-line form that repeated
 * choruses use.
 */
export function parseLrcText(src: string): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  // fresh per call, so nothing another caller did can move where it starts
  const re = new RegExp(LRC_TAG_SRC, "g");
  for (const raw of src.split(/\r?\n/)) {
    const tags = [...raw.matchAll(re)];
    if (!tags.length) continue;
    const text = raw.replace(re, "").trim();
    if (!text) continue;
    for (const m of tags) {
      // the fraction may be centiseconds or milliseconds depending on who wrote
      // the file, so scale by its own digit count rather than assuming
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Turn prose into lines placed across the track.
 *
 * This is an estimate and is always reported as one. It exists because a rough
 * position is genuinely useful for reading along with a song you just made,
 * and refusing to show anything at all would be the worse failure. The lead-in
 * skips the intro, which is where an even split otherwise puts the first line
 * over silence.
 */
export function spreadPlain(text: string, duration: number): { t: number; text: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]*\]$/.test(l)); // drop bare [Verse] / [Chorus] markers
  if (!lines.length) return [];
  const lead = Math.min(6, duration * 0.06);
  const span = Math.max(1, duration - lead - duration * 0.04);
  return lines.map((text, i) => ({ t: lead + (i / lines.length) * span, text }));
}

// ── ID3v2 ───────────────────────────────────────────────────────────────────

const syncsafe = (b: Uint8Array, o: number): number =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

const plain32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

interface Frame { id: string; body: Uint8Array; }

/** Walk the ID3v2 frame list. Returns [] when there is no ID3 header. */
function id3Frames(b: Uint8Array): Frame[] {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return []; // "ID3"
  const major = b[3];
  const flags = b[5];
  const size = syncsafe(b, 6);
  let p = 10;
  // an extended header sits between the header and the first frame
  if (flags & 0x40) {
    p += major >= 4 ? syncsafe(b, p) : plain32(b, p) + 4;
  }
  const end = Math.min(b.length, 10 + size);
  const idLen = major === 2 ? 3 : 4;
  const out: Frame[] = [];
  while (p + idLen + (major === 2 ? 3 : 6) <= end) {
    const id = String.fromCharCode(...b.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    let len: number;
    if (major === 2) {
      len = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5];
      p += 6;
    } else {
      // v2.4 sizes are syncsafe; v2.3 are plain. Reading a v2.3 size as
      // syncsafe silently truncates any frame over 128 bytes — which is every
      // lyric sheet there has ever been.
      len = major >= 4 ? syncsafe(b, p + 4) : plain32(b, p + 4);
      p += 10;
    }
    if (len <= 0 || p + len > end) break;
    out.push({ id, body: b.subarray(p, p + len) });
    p += len;
  }
  return out;
}

/** SYLT: timed syllables/lines, each terminated then followed by a timestamp. */
function readSylt(body: Uint8Array): { t: number; text: string }[] | null {
  if (body.length < 7) return null;
  const encoding = body[0];
  const format = body[4];            // 1 = MPEG frames, 2 = milliseconds
  if (format !== 2) return null;     // frame-based timing needs the decoder; skip
  let p = 6;
  [, p] = splitTerminated(body, p, encoding); // content descriptor
  const out: { t: number; text: string }[] = [];
  while (p < body.length) {
    const [txt, next] = splitTerminated(body, p, encoding);
    if (next + 4 > body.length) break;
    const ms = plain32(body, next);
    const text = id3Text(encoding, txt).trim();
    if (text) out.push({ t: ms / 1000, text });
    p = next + 4;
  }
  return out.length ? out.sort((a, b) => a.t - b.t) : null;
}

/** USLT: a whole lyric sheet as one string (often LRC-formatted in practice). */
function readUslt(body: Uint8Array): string | null {
  if (body.length < 5) return null;
  const encoding = body[0];
  let p = 4;                                   // encoding + 3-byte language
  [, p] = splitTerminated(body, p, encoding);  // content descriptor
  const text = id3Text(encoding, body.subarray(p)).trim();
  return text || null;
}

/** TXXX: a user-defined key/value pair; some taggers put lyrics here. */
function readTxxx(body: Uint8Array): [string, string] | null {
  if (body.length < 2) return null;
  const encoding = body[0];
  const [keyB, p] = splitTerminated(body, 1, encoding);
  return [id3Text(encoding, keyB).trim().toUpperCase(), id3Text(encoding, body.subarray(p)).trim()];
}

// ── Vorbis comments (FLAC / OGG) ────────────────────────────────────────────

const LYRIC_KEYS = new Set(["LYRICS", "UNSYNCEDLYRICS", "SYNCEDLYRICS", "LYRICS:DESCRIPTION"]);

/**
 * Scan for a Vorbis comment block.
 *
 * Rather than fully parsing FLAC metadata blocks or the Ogg page structure,
 * this finds the "vorbis" marker and reads the comment vector from there — the
 * layout after that point is identical in both containers, and the alternative
 * is two container parsers to reach the same twelve bytes.
 */
function vorbisComments(b: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  const le = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  // FLAC: "fLaC" then metadata blocks; type 4 is VORBIS_COMMENT
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) {
    let p = 4;
    for (let guard = 0; guard < 64 && p + 4 <= b.length; guard++) {
      const last = (b[p] & 0x80) !== 0;
      const type = b[p] & 0x7f;
      const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
      p += 4;
      if (type === 4) return readVorbisVector(b, p, len, out);
      p += len;
      if (last) break;
    }
    return out;
  }

  // Ogg: find the "\x03vorbis" comment-header marker
  for (let i = 0; i + 7 < Math.min(b.length, 1 << 18); i++) {
    if (b[i] === 3 && b[i + 1] === 0x76 && b[i + 2] === 0x6f && b[i + 3] === 0x72 &&
        b[i + 4] === 0x62 && b[i + 5] === 0x69 && b[i + 6] === 0x73) {
      const vlen = le(i + 7);
      return readVorbisVector(b, i + 11 + vlen, b.length - (i + 11 + vlen), out, true);
    }
  }
  return out;
}

function readVorbisVector(
  b: Uint8Array, start: number, len: number, out: Map<string, string>, skipVendor = false,
): Map<string, string> {
  const le = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  let p = start;
  const end = Math.min(b.length, start + Math.max(0, len));
  if (!skipVendor) {
    if (p + 4 > end) return out;
    p += 4 + le(p); // vendor string
  }
  if (p + 4 > end) return out;
  let n = le(p);
  p += 4;
  if (n > 4096) n = 4096;
  for (let i = 0; i < n && p + 4 <= end; i++) {
    const l = le(p);
    p += 4;
    if (l < 0 || p + l > end) break;
    const s = dec("utf-8", b.subarray(p, p + l));
    p += l;
    const eq = s.indexOf("=");
    if (eq > 0) out.set(s.slice(0, eq).toUpperCase(), s.slice(eq + 1));
  }
  return out;
}

// ── MP4 / M4A ───────────────────────────────────────────────────────────────

/**
 * Find the `©lyr` atom.
 *
 * A flat scan for the four-byte atom name rather than a full box-tree walk: the
 * value that follows is a `data` box whose payload starts at a fixed offset, so
 * the tree only tells us what the scan already found.
 */
function mp4Lyrics(b: Uint8Array): string | null {
  const limit = Math.min(b.length, 4 << 20);
  for (let i = 0; i + 8 < limit; i++) {
    // 0xA9 is the copyright sign that prefixes iTunes text atoms
    if (b[i] === 0xa9 && b[i + 1] === 0x6c && b[i + 2] === 0x79 && b[i + 3] === 0x72) {
      const size = plain32(b, i - 4 >= 0 ? i - 4 : 0);
      const dataStart = i + 4 + 8 + 8; // 'data' header + version/flags + reserved
      const end = Math.min(b.length, i - 4 + Math.max(16, size));
      if (dataStart < end) {
        const s = dec("utf-8", b.subarray(dataStart, end)).replace(/\0+$/, "").trim();
        if (s) return s;
      }
    }
  }
  return null;
}

// ── the entry point ─────────────────────────────────────────────────────────

/**
 * Read whatever lyrics the file itself carries.
 *
 * `duration` is only used to place plain prose; timed sources ignore it.
 * Returns null when the file carries nothing, which is the common case for a
 * plain rip and the *uncommon* case for a generated track.
 */
export async function lyricsFromFile(blob: Blob, duration: number): Promise<TagLyrics | null> {
  // ID3 lives at the front; MP4 atoms and Vorbis blocks can sit further in, and
  // a tag can carry cover art, so this reads a generous head rather than the
  // whole file — which on a phone would mean holding a 60MB decode in memory.
  const head = new Uint8Array(await blob.slice(0, 4 << 20).arrayBuffer());

  // 1. ID3 SYLT — genuinely timed, the best case
  const frames = id3Frames(head);
  for (const f of frames) {
    if (f.id === "SYLT" || f.id === "SLT") {
      const timed = readSylt(f.body);
      if (timed) return { lines: timed, synced: true, source: "ID3 SYLT" };
    }
  }

  // 2. ID3 USLT / TXXX — often LRC text, sometimes prose
  const texts: [string, string][] = [];
  for (const f of frames) {
    if (f.id === "USLT" || f.id === "ULT") {
      const t = readUslt(f.body);
      if (t) texts.push([t, "ID3 USLT"]);
    } else if (f.id === "TXXX" || f.id === "TXX") {
      const kv = readTxxx(f.body);
      if (kv && LYRIC_KEYS.has(kv[0]) && kv[1]) texts.push([kv[1], `ID3 TXXX:${kv[0]}`]);
    }
  }

  // 3. Vorbis comments
  if (!texts.length) {
    const vc = vorbisComments(head);
    for (const k of LYRIC_KEYS) {
      const v = vc.get(k);
      if (v) { texts.push([v, `Vorbis ${k}`]); break; }
    }
  }

  // 4. MP4
  if (!texts.length) {
    const m = mp4Lyrics(head);
    if (m) texts.push([m, "MP4 ©lyr"]);
  }

  for (const [text, source] of texts) {
    if (looksLikeLrc(text)) {
      const lines = parseLrcText(text);
      if (lines.length) return { lines, synced: true, source: `${source} (LRC)` };
    }
  }
  for (const [text, source] of texts) {
    const lines = spreadPlain(text, duration);
    if (lines.length) return { lines, synced: false, source };
  }
  return null;
}
