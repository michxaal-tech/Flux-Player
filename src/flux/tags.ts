// Title and artist from the file's own tags (ID3, Vorbis comments, MP4).
//
// A local import used to take its name from the file name alone, so a
// properly tagged album showed up as "01 Track". The tags are read once, in the
// background, right after import; the file name stays as the fallback.
import { id3Frames, id3Text, vorbisComments } from "../audio/tagLyrics";

export interface BasicTags { title?: string; artist?: string }

function mp4Text(b: Uint8Array, atom: [number, number, number, number]): string | undefined {
  const limit = Math.min(b.length - 24, 4 << 20);
  for (let i = 4; i < limit; i++) {
    if (b[i] === atom[0] && b[i + 1] === atom[1] && b[i + 2] === atom[2] && b[i + 3] === atom[3] &&
        b[i + 8] === 0x64 && b[i + 9] === 0x61 && b[i + 10] === 0x74 && b[i + 11] === 0x61) {
      const size = ((b[i - 4] << 24) | (b[i - 3] << 16) | (b[i - 2] << 8) | b[i - 1]) >>> 0;
      const start = i + 4 + 16;
      const end = Math.min(b.length, i - 4 + size);
      if (end > start) return new TextDecoder("utf-8").decode(b.subarray(start, end)).replace(/\0+$/, "").trim() || undefined;
    }
  }
  return undefined;
}

export async function readTags(blob: Blob): Promise<BasicTags> {
  const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1 << 20)).arrayBuffer());
  const out: BasicTags = {};
  for (const f of id3Frames(head)) {
    const txt = () => id3Text(f.body[0], f.body.subarray(1)).replace(/\0/g, " ").trim();
    if ((f.id === "TIT2" || f.id === "TT2") && !out.title) out.title = txt();
    if ((f.id === "TPE1" || f.id === "TP1") && !out.artist) out.artist = txt();
  }
  if (!out.title) {
    const vc = vorbisComments(head);
    out.title = vc.get("TITLE") || undefined;
    out.artist = vc.get("ARTIST") || undefined;
  }
  if (!out.title) {
    out.title = mp4Text(head, [0xa9, 0x6e, 0x61, 0x6d]);
    out.artist = mp4Text(head, [0xa9, 0x41, 0x52, 0x54]);
  }
  return out;
}
