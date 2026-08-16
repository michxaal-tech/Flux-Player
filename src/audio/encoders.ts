import { Mp3Encoder } from "@breezystack/lamejs";

function interleave16(buf: AudioBuffer): { left: Int16Array; right: Int16Array } {
  const n = buf.length;
  const l = buf.getChannelData(0);
  const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  const left = new Int16Array(n);
  const right = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767)));
    right[i] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767)));
  }
  return { left, right };
}

export function encodeWav(buf: AudioBuffer): Blob {
  const { left, right } = interleave16(buf);
  const n = buf.length, channels = 2, rate = buf.sampleRate;
  const dataSize = n * channels * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(off, left[i], true); off += 2;
    v.setInt16(off, right[i], true); off += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

export async function encodeMp3(
  buf: AudioBuffer,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const { left, right } = interleave16(buf);
  const enc = new Mp3Encoder(2, buf.sampleRate, 192);
  const block = 1152;
  const out: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += block) {
    const chunk = enc.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
    if (chunk.length) out.push(new Uint8Array(chunk));
    // yield to the UI every ~half second of audio
    if (i % (block * 20) === 0) {
      onProgress?.(i / left.length);
      await new Promise((r) => setTimeout(r));
    }
  }
  const end = enc.flush();
  if (end.length) out.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(out as BlobPart[], { type: "audio/mpeg" });
}
