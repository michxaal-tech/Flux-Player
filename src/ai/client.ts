// Anthropic API client. Strictly BYOK: the key lives only in this browser
// (IndexedDB) and is sent only to api.anthropic.com. No proxy, no telemetry.
import { blobStore } from "../store/blobStore";
import { useStore } from "../store/useStore";

const KEY_BLOB = "ai-key";
export const AI_MODEL = "claude-sonnet-4-6";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

let cachedKey: string | null = null;
let loaded = false;

/** Key is stored as a Blob beside the audio so it never touches localStorage
 * (which is trivially readable by any injected script and synced by some
 * browsers). Still client-side secret material — documented in the UI. */
export async function loadKey(): Promise<string | null> {
  if (loaded) return cachedKey;
  loaded = true;
  try {
    const b = await blobStore.get(KEY_BLOB);
    cachedKey = b ? (await b.text()).trim() || null : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export async function saveKey(key: string): Promise<void> {
  const k = key.trim();
  cachedKey = k || null;
  loaded = true;
  if (!k) {
    await blobStore.del(KEY_BLOB);
  } else {
    await blobStore.put(KEY_BLOB, new Blob([k], { type: "text/plain" }));
  }
  useStore.setState({ aiReady: !!k });
}

export function hasKeyLoaded(): boolean {
  return !!cachedKey;
}

export class AiError extends Error {
  constructor(message: string, readonly kind: "key" | "rate" | "network" | "format" | "other") {
    super(message);
  }
}

interface AskOpts {
  system: string;
  user: string;
  maxTokens?: number;
  /** label shown next to the ✦ spinner */
  label?: string;
  temperature?: number;
}

let busyCount = 0;
function setBusy(delta: number, label = "") {
  busyCount = Math.max(0, busyCount + delta);
  useStore.setState({ aiBusy: busyCount > 0, aiLabel: busyCount > 0 ? label : "" });
}

async function rawCall(key: string, o: AskOpts, signal?: AbortSignal): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal,
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: o.maxTokens ?? 1200,
        temperature: o.temperature ?? 1,
        system: o.system,
        messages: [{ role: "user", content: o.user }],
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AiError("Network error reaching Anthropic — offline?", "network");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) throw new AiError("API key rejected — check the key in ME → AI", "key");
    if (resp.status === 429) throw new AiError("Rate limited by Anthropic — wait a moment and retry", "rate");
    if (resp.status === 529 || resp.status === 503) throw new AiError("Anthropic is overloaded — try again shortly", "rate");
    throw new AiError(`Anthropic error ${resp.status}: ${body.slice(0, 140)}`, "other");
  }
  const data = await resp.json();
  const text = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  if (!text) throw new AiError("Empty response from Claude", "format");
  return text;
}

/** Plain-text call. */
export async function askText(o: AskOpts): Promise<string> {
  const key = await loadKey();
  if (!key) throw new AiError("No API key set — add one in ME → AI", "key");
  setBusy(1, o.label ?? "thinking");
  try {
    return await rawCall(key, o);
  } finally {
    setBusy(-1);
  }
}

/**
 * Extracts a JSON value from a model reply that may be wrapped in prose or a
 * ```json fence. Falls back to brace/bracket matching so a stray sentence
 * around valid JSON doesn't fail the whole call.
 */
export function extractJson<T>(text: string): T | null {
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const v = tryParse(fence[1].trim());
    if (v) return v;
  }
  // widest balanced {...} or [...] span
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const a = text.indexOf(open);
    const b = text.lastIndexOf(close);
    if (a >= 0 && b > a) {
      const v = tryParse(text.slice(a, b + 1));
      if (v) return v;
    }
  }
  return null;
}

/**
 * JSON call with one automatic repair retry: if the reply doesn't parse (or
 * fails the caller's validator), Claude is shown its own bad output and asked
 * for strict JSON only.
 */
export async function askJson<T>(o: AskOpts & { validate?: (v: unknown) => v is T }): Promise<T> {
  const key = await loadKey();
  if (!key) throw new AiError("No API key set — add one in ME → AI", "key");
  const system = `${o.system}\n\nOutput rules: reply with a single valid JSON value and NOTHING else. No prose, no markdown fences, no comments, no trailing commas.`;
  setBusy(1, o.label ?? "thinking");
  try {
    const first = await rawCall(key, { ...o, system });
    const parsed = extractJson<T>(first);
    if (parsed && (!o.validate || o.validate(parsed))) return parsed;

    const repair = await rawCall(key, {
      ...o,
      system,
      user: `${o.user}\n\n---\nYour previous reply could not be parsed as the required JSON${o.validate ? " (or did not match the required shape)" : ""}. Here it is verbatim:\n<<<\n${first.slice(0, 2000)}\n>>>\nReply again with ONLY the corrected JSON value.`,
    });
    const parsed2 = extractJson<T>(repair);
    if (parsed2 && (!o.validate || o.validate(parsed2))) return parsed2;
    throw new AiError("Claude returned malformed JSON twice", "format");
  } finally {
    setBusy(-1);
  }
}

/** Cheap round-trip used by the settings panel to validate a pasted key. */
export async function validateKey(key: string): Promise<{ ok: true } | { ok: false; msg: string }> {
  try {
    await rawCall(key, { system: "Reply with the single word: ok", user: "ping", maxTokens: 8 });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e instanceof AiError ? e.message : String(e) };
  }
}
