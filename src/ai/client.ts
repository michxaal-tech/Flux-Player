// Provider-agnostic AI client. Strictly BYOK: keys live only in this browser
// (IndexedDB) and are sent only to the provider the user chose. No proxy, no
// telemetry, no backend of any kind.
import { blobStore } from "../store/blobStore";
import { useStore } from "../store/useStore";
import { getProvider, rankModel, resolveEndpoint } from "./providers";
import type { AskShape, ProviderModel } from "./providers";

const keyBlob = (providerId: string) => `ai-key-${providerId}`;

// keys are cached per provider so switching back and forth doesn't re-prompt
const cache = new Map<string, string | null>();

/** Keys are stored as Blobs beside the audio rather than in localStorage.
 * Still client-side secret material — the settings UI says so plainly. */
export async function loadKey(providerId?: string): Promise<string | null> {
  const id = providerId ?? useStore.getState().aiProvider;
  if (cache.has(id)) return cache.get(id) ?? null;
  let key: string | null = null;
  try {
    const b = await blobStore.get(keyBlob(id));
    key = b ? (await b.text()).trim() || null : null;
  } catch {
    key = null;
  }
  cache.set(id, key);
  return key;
}

export async function saveKey(key: string, providerId?: string): Promise<void> {
  const id = providerId ?? useStore.getState().aiProvider;
  const k = key.trim();
  cache.set(id, k || null);
  if (!k) await blobStore.del(keyBlob(id));
  else await blobStore.put(keyBlob(id), new Blob([k], { type: "text/plain" }));
  if (id === useStore.getState().aiProvider) useStore.setState({ aiReady: !!k });
}

/** Refresh aiReady after a provider switch. */
export async function refreshReady(): Promise<void> {
  const k = await loadKey();
  useStore.setState({ aiReady: !!k });
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

interface CallCfg {
  providerId: string;
  model: string;
  baseUrl: string;
  key: string;
}

function currentCfg(key: string): CallCfg {
  const s = useStore.getState();
  const p = getProvider(s.aiProvider);
  return {
    providerId: p.id,
    model: s.aiModel || p.defaultModel,
    baseUrl: s.aiBaseUrl,
    key,
  };
}

async function rawCall(cfg: CallCfg, o: AskOpts, json: boolean): Promise<string> {
  const p = getProvider(cfg.providerId);
  const shape: AskShape = {
    system: o.system,
    user: o.user,
    maxTokens: o.maxTokens ?? 1200,
    temperature: o.temperature ?? 1,
    json,
  };
  const url = resolveEndpoint(p, cfg.model, cfg.baseUrl);
  const send = (body: unknown) =>
    fetch(url, { method: "POST", headers: p.headers(cfg.key), body: JSON.stringify(body) });

  let resp: Response;
  try {
    resp = await send(p.body(shape, cfg.model));
    // a 400 usually means the model rejected an option rather than the prompt;
    // retry once with the provider's conservative body before giving up
    if (resp.status === 400 && p.bodyFallback) {
      const alt = await send(p.bodyFallback(shape, cfg.model));
      if (alt.ok) resp = alt;
    }
  } catch {
    throw new AiError(`Couldn't reach ${p.label} — offline, or the endpoint blocked the request`, "network");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const custom = p.errorMessage?.(resp.status, body);
    if (custom) throw new AiError(custom, resp.status === 429 ? "rate" : "key");
    if (resp.status === 401 || resp.status === 403) throw new AiError(`${p.label} rejected the key — check it in ME → AI`, "key");
    if (resp.status === 429) throw new AiError(`${p.label} rate limit reached — wait a moment and retry`, "rate");
    if (resp.status === 529 || resp.status === 503) throw new AiError(`${p.label} is overloaded — try again shortly`, "rate");
    throw new AiError(`${p.label} error ${resp.status}: ${body.slice(0, 140)}`, "other");
  }
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new AiError(`${p.label} returned a malformed response`, "format");
  }
  let text: string;
  try {
    text = p.parse(data);
  } catch (e) {
    throw new AiError((e as Error).message || "Unreadable response", "format");
  }
  if (!text) throw new AiError(`${p.label} returned an empty response`, "format");
  return text;
}

async function requireCfg(): Promise<CallCfg> {
  const key = await loadKey();
  if (!key) throw new AiError("No API key set — add one in ME → AI", "key");
  return currentCfg(key);
}

/** Plain-text call. */
export async function askText(o: AskOpts): Promise<string> {
  const cfg = await requireCfg();
  setBusy(1, o.label ?? "thinking");
  try {
    return await rawCall(cfg, o, false);
  } finally {
    setBusy(-1);
  }
}

/**
 * Extracts a JSON value from a reply that may be wrapped in prose or a
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
 * fails the caller's validator), the model is shown its own bad output and
 * asked for strict JSON only. Providers with a native JSON mode (Gemini) get
 * it switched on, which makes the retry path rare.
 */
export async function askJson<T>(o: AskOpts & { validate?: (v: unknown) => v is T }): Promise<T> {
  const cfg = await requireCfg();
  const system = `${o.system}\n\nOutput rules: reply with a single valid JSON value and NOTHING else. No prose, no markdown fences, no comments, no trailing commas.`;
  setBusy(1, o.label ?? "thinking");
  try {
    const first = await rawCall(cfg, { ...o, system }, true);
    const parsed = extractJson<T>(first);
    if (parsed && (!o.validate || o.validate(parsed))) return parsed;

    const repair = await rawCall(cfg, {
      ...o,
      system,
      user: `${o.user}\n\n---\nYour previous reply could not be parsed as the required JSON${o.validate ? " (or did not match the required shape)" : ""}. Here it is verbatim:\n<<<\n${first.slice(0, 2000)}\n>>>\nReply again with ONLY the corrected JSON value.`,
    }, true);
    const parsed2 = extractJson<T>(repair);
    if (parsed2 && (!o.validate || o.validate(parsed2))) return parsed2;
    throw new AiError("The model returned malformed JSON twice", "format");
  } finally {
    setBusy(-1);
  }
}

/**
 * Asks the provider which models this key can actually call, best first.
 * Hardcoded lists go stale (Google retires ids for new keys), so the picker
 * and the auto-chosen default both come from here.
 */
export async function discoverModels(
  key: string,
  providerId: string,
  baseUrl: string
): Promise<ProviderModel[]> {
  const p = getProvider(providerId);
  if (!p.listModels) return p.models;
  const list = await p.listModels(key.trim(), baseUrl);
  return list
    .filter((m) => rankModel(m.id) >= 0)
    .sort((a, b) => rankModel(b.id) - rankModel(a.id));
}

/** Cheap round-trip used by the settings panel to validate a pasted key. */
export async function validateKey(
  key: string,
  providerId: string,
  model: string,
  baseUrl: string
): Promise<{ ok: true } | { ok: false; msg: string }> {
  try {
    await rawCall(
      { providerId, model: model || getProvider(providerId).defaultModel, baseUrl, key },
      { system: "Reply with the single word: ok", user: "ping", maxTokens: 256 },
      false
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e instanceof AiError ? e.message : String(e) };
  }
}
