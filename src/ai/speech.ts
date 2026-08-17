// Spoken output (radio host / hype man / sleep story) and voice input.
// Both are browser-native: no audio leaves the device.
import { engine } from "../audio/engine";

let voices: SpeechSynthesisVoice[] = [];
function pickVoice(prefer?: string): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  if (!voices.length) voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  if (prefer) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(prefer.toLowerCase()));
    if (hit) return hit;
  }
  return pool.find((v) => v.localService) ?? pool[0];
}

if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", () => { voices = speechSynthesis.getVoices(); });
}

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
  /** duck the music to this gain multiplier while speaking */
  duck?: number;
}

/** Speaks over the music, ducking the master fader so the line is audible. */
export function speak(text: string, opts?: Record<string, unknown> | SpeakOpts): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text.trim()) return resolve();
    const o = (opts ?? {}) as SpeakOpts;
    const u = new SpeechSynthesisUtterance(text.slice(0, 600));
    u.rate = Math.min(2, Math.max(0.5, o.rate ?? 1));
    u.pitch = Math.min(2, Math.max(0, o.pitch ?? 1));
    u.volume = Math.min(1, Math.max(0, o.volume ?? 1));
    const v = pickVoice(o.voice);
    if (v) u.voice = v;

    const n = engine.nodes;
    const duck = Math.min(1, Math.max(0, o.duck ?? 0.32));
    const restore = () => {
      if (n) n.fader.gain.setTargetAtTime(1, n.ctx.currentTime, 0.25);
      resolve();
    };
    if (n) n.fader.gain.setTargetAtTime(duck, n.ctx.currentTime, 0.12);
    u.onend = restore;
    u.onerror = restore;
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      restore();
    }
    // hard safety: never leave the music ducked if the utterance never ends
    setTimeout(restore, 22000);
  });
}

export function stopSpeaking(): void {
  try { speechSynthesis.cancel(); } catch { /* unsupported */ }
  const n = engine.nodes;
  if (n) n.fader.gain.setTargetAtTime(1, n.ctx.currentTime, 0.1);
}

export function speechSupported(): boolean {
  return "speechSynthesis" in window;
}

// ── voice input (Web Speech API) ────────────────────────────────────────────
type SR = typeof window extends { SpeechRecognition: infer T } ? T : unknown;

export function recognitionSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Starts one-shot dictation; resolves with the transcript (empty if none). */
export function listenOnce(
  onPartial?: (t: string) => void
): { promise: Promise<string>; stop: () => void } {
  const w = window as unknown as Record<string, new () => any>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return { promise: Promise.resolve(""), stop: () => {} };
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  let finalText = "";
  const promise = new Promise<string>((resolve) => {
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += txt;
        else interim += txt;
      }
      onPartial?.((finalText + interim).trim());
    };
    rec.onerror = () => resolve(finalText.trim());
    rec.onend = () => resolve(finalText.trim());
  });
  try { rec.start(); } catch { /* already running */ }
  return { promise, stop: () => { try { rec.stop(); } catch { /* ignore */ } } };
}
