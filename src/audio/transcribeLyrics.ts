/**
 * Lyrics transcribed from the audio itself.
 *
 * This is the fallback for the case tagLyrics.ts can't cover: a track whose
 * file carries no words at all. Lookup is hopeless there by definition — if
 * you generated the song, nobody has ever transcribed it — so the only place
 * left to get the words is the waveform.
 *
 * It uses the OpenAI-compatible `/audio/transcriptions` endpoint, which Groq
 * and OpenAI both serve and which returns per-segment timestamps. That is a
 * deliberate reuse rather than a new dependency: FLUX is already strictly
 * bring-your-own-key (see ai/client.ts), the "Other (OpenAI-compatible)"
 * provider already lists Groq, and running Whisper locally would mean shipping
 * a quarter-gigabyte model to a phone to do a job the user's existing key can
 * do in a few seconds. The audio leaves the device only if the user asks for
 * this, and only to the endpoint they configured.
 *
 * Accuracy on *music* is the whole difficulty. Whisper is trained on speech,
 * and a full mix — drums, bass, synths — is mostly not speech. So when stem
 * separation is available the vocal is isolated first, which is the difference
 * between a usable sheet and a page of confident nonsense.
 */
import { loadKey } from "../ai/client";
import { useStore } from "../store/useStore";

export interface TranscribeResult {
  lines: { t: number; text: string }[];
  /** the model actually used, for the status line */
  model: string;
  /** true when the vocal was isolated before sending */
  isolated: boolean;
}

export interface TranscribeOpts {
  /** vocal-only buffer when stem separation has run; the mix otherwise */
  buffer: AudioBuffer;
  isolated: boolean;
  /** a hint for the model — the track title often names the song */
  title?: string;
  signal?: AbortSignal;
  onStage?: (s: string) => void;
}

/** Whisper endpoints cap the upload; 24MB keeps a margin under the usual 25. */
const MAX_BYTES = 24 * 1024 * 1024;

/**
 * Downmix to 16kHz mono.
 *
 * Whisper resamples to 16kHz internally, so sending 44.1kHz stereo is four
 * times the upload for identical output — and upload time is most of the wait
 * on a phone. Done with a plain linear resample rather than an OfflineAudio
 * pass because the target is speech recognition, not playback: the artefacts a
 * better filter would remove are all far above the band Whisper looks at.
 */
function to16kMono(buf: AudioBuffer): { data: Float32Array; rate: number } {
  const rate = 16000;
  const ratio = buf.sampleRate / rate;
  const outLen = Math.floor(buf.length / ratio);
  const out = new Float32Array(outLen);
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(buf.length - 1, i0 + 1);
    const f = src - i0;
    let s = 0;
    for (const ch of chans) s += ch[i0] * (1 - f) + ch[i1] * f;
    out[i] = s / chans.length;
  }
  return { data: out, rate };
}

/**
 * 16-bit mono WAV.
 *
 * encoders.ts has `encodeWav`, but it takes an AudioBuffer and always writes
 * stereo at the buffer's own rate — which is the opposite of what is wanted
 * here, where the whole point is one downsampled mono channel.
 */
function monoWav(d: Float32Array, rate: number): Blob {
  const ab = new ArrayBuffer(44 + d.length * 2);
  const v = new DataView(ab);
  const tag = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, "RIFF"); v.setUint32(4, 36 + d.length * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, d.length * 2, true);
  let o = 44;
  for (let i = 0; i < d.length; i++, o += 2) {
    const x = d[i] < -1 ? -1 : d[i] > 1 ? 1 : d[i];
    v.setInt16(o, Math.round(x * 32767), true);
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Peak-normalise, because an isolated vocal is often very quiet. */
function normalise(d: Float32Array): void {
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    const a = d[i] < 0 ? -d[i] : d[i];
    if (a > peak) peak = a;
  }
  if (peak < 1e-4 || peak > 0.99) return;
  const g = 0.97 / peak;
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

interface VerboseSegment { start?: number; text?: string }

/**
 * Transcribe, returning timed lines.
 *
 * Throws with a readable message rather than a status code: this runs behind a
 * button a user pressed, so the failure has to say what to do about it.
 */
export async function transcribeLyrics(o: TranscribeOpts): Promise<TranscribeResult> {
  const st = useStore.getState();
  const providerId = st.aiProvider;
  const key = await loadKey(providerId);
  if (!key) throw new Error("Add an API key in the AI settings first.");

  // Only the OpenAI-compatible shape has a transcription endpoint. Anthropic
  // and Gemini chat models cannot take an audio file this way, and pretending
  // otherwise would fail with something unreadable at request time.
  const base = (providerId === "openai-compat" ? st.aiBaseUrl : "") || "";
  if (!base) {
    throw new Error(
      'Transcription needs an OpenAI-compatible provider. In AI settings pick "Other (OpenAI-compatible)" and a base URL — Groq\'s is https://api.groq.com/openai/v1 and its Whisper is free to use.',
    );
  }

  o.onStage?.("preparing audio");
  const { data, rate } = to16kMono(o.buffer);
  normalise(data);
  const wav = monoWav(data, rate);
  if (wav.size > MAX_BYTES) {
    const mins = Math.floor(o.buffer.duration / 60);
    throw new Error(
      `This track is too long to send in one piece (${mins} min). Transcription currently handles up to about 25 minutes of 16kHz mono.`,
    );
  }

  const model = st.aiSttModel || "whisper-large-v3";
  const form = new FormData();
  form.append("file", new File([wav], "audio.wav", { type: "audio/wav" }));
  form.append("model", model);
  // segment timestamps are the entire point — without them there is nothing to
  // sync to and the result is a text blob
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (o.title) {
    // the prompt biases spelling of names the model would otherwise invent
    form.append("prompt", `Song lyrics${o.title ? ` from the track "${o.title}"` : ""}.`);
  }

  o.onStage?.(o.isolated ? "transcribing vocals" : "transcribing");
  const url = `${base.replace(/\/+$/, "")}/audio/transcriptions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new Error("Couldn't reach the transcription endpoint — check your connection and base URL.");
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) throw new Error("The API key was rejected.");
    if (resp.status === 404) throw new Error(`This provider has no ${model} transcription model at that base URL.`);
    if (resp.status === 429) throw new Error("Rate limited by the provider — wait a moment and try again.");
    throw new Error(`Transcription failed (${resp.status}). ${body.slice(0, 160)}`);
  }

  const j = (await resp.json()) as { segments?: VerboseSegment[]; text?: string };
  const segs = j.segments ?? [];
  const lines = segs
    .map((s) => ({ t: Math.max(0, s.start ?? 0), text: (s.text ?? "").trim() }))
    .filter((l) => l.text)
    .sort((a, b) => a.t - b.t);

  if (!lines.length) {
    // a mix with no discernible vocal comes back empty rather than wrong, and
    // saying so is more useful than showing nothing and implying a bug
    throw new Error(
      o.isolated
        ? "No vocal was found in this track."
        : "Nothing was transcribed. Try running stem separation first so the vocal can be isolated.",
    );
  }
  return { lines, model, isolated: o.isolated };
}
