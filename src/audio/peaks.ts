import { blobStore } from "../store/blobStore";
import { engine } from "./engine";
import { useStore } from "../store/useStore";
import type { Track } from "../types";

const decoding = new Set<string>();

/** Decodes the track once and stores 180 normalized waveform peaks on it (persisted). */
export async function ensurePeaks(tr: Track): Promise<void> {
  if (tr.peaks || decoding.has(tr.id)) return;
  decoding.add(tr.id);
  try {
    const blob = await blobStore.get(tr.fileId);
    if (!blob) return;
    const ab = await blob.arrayBuffer();
    engine.ensure();
    const buf = await engine.nodes!.ctx.decodeAudioData(ab);
    const ch = buf.getChannelData(0);
    const N = 180, step = Math.floor(ch.length / N), pk: number[] = [];
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let j = 0; j < step; j += 24) {
        const a = Math.abs(ch[i * step + j]);
        if (a > m) m = a;
      }
      pk.push(m);
    }
    const mx = Math.max(...pk, 0.01);
    useStore.getState().updateTrack(tr.id, { peaks: pk.map((p) => p / mx) });
  } catch {
    /* undecodable file — waveform stays synthetic */
  } finally {
    decoding.delete(tr.id);
  }
}
