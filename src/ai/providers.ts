// AI providers. Every feature speaks the same command protocol, so a provider
// only has to describe how to shape a request and pull the text back out.
//
// All three endpoints below were verified to answer CORS preflights for a
// browser origin — FLUX has no backend, so a provider that refuses direct
// browser calls simply cannot be used here.

export interface ProviderModel {
  id: string;
  label: string;
  note?: string;
}

export interface AskShape {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /** ask the provider to guarantee JSON where it supports doing so */
  json: boolean;
}

/**
 * Asks the provider which models this key may actually call. Hardcoded model
 * lists rot — Google retires ids for new keys without warning — so the picker
 * is populated from the live API wherever the provider exposes one.
 */
export type ListModels = (key: string, baseUrl: string) => Promise<ProviderModel[]>;

/** Ranks candidate models so "just connect it" picks something sensible. */
export function rankModel(id: string): number {
  const s = id.toLowerCase();
  if (/embed|aqa|imagen|veo|tts|image-generation|learnlm|guard/.test(s)) return -1;
  const ver = parseFloat((s.match(/(\d+(?:\.\d+)?)/) || [])[1] ?? "0") || 0;
  let kind = 0;
  if (/flash/.test(s) && !/lite/.test(s)) kind = 4;
  else if (/flash/.test(s)) kind = 3;
  else if (/sonnet|gpt|llama|deepseek|qwen/.test(s)) kind = 3;
  else if (/pro|opus/.test(s)) kind = 2;
  else kind = 1;
  // prefer generally-available ids over preview/experimental snapshots
  const stable = /preview|exp|thinking|-\d{3,}/.test(s) ? 0 : 2;
  return ver * 10 + kind + stable;
}

export interface Provider {
  id: string;
  label: string;
  /** short badge in the picker */
  badge: "FREE" | "PAID";
  blurb: string;
  /** where to get a key */
  keyUrl: string;
  keyHint: string;
  /** free-tier facts shown under the picker (kept vague where limits drift) */
  limits: string;
  /** shown when the provider trains on free-tier data etc. */
  caveat?: string;
  models: ProviderModel[];
  defaultModel: string;
  /** advanced: user may type any model id */
  customModel?: boolean;
  endpoint(model: string): string;
  headers(key: string): Record<string, string>;
  body(o: AskShape, model: string): unknown;
  parse(data: unknown): string;
  /** provider-specific wording for common failures */
  errorMessage?(status: number, body: string): string | null;
  /** live model discovery, where the provider exposes it */
  listModels?: ListModels;
}

const ANTHROPIC: Provider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  badge: "PAID",
  blurb: "Best quality. Pay-as-you-go from your own Anthropic account.",
  keyUrl: "https://console.anthropic.com/settings/keys",
  keyHint: "sk-ant-…",
  limits: "Usage billed to your Anthropic account. Not included with a Claude Pro/Max subscription.",
  models: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "balanced" },
    { id: "claude-opus-4-5", label: "Opus 4.5", note: "most capable" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fastest" },
  ],
  defaultModel: "claude-sonnet-4-6",
  endpoint: () => "https://api.anthropic.com/v1/messages",
  headers: (key) => ({
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  }),
  body: (o, model) => ({
    model,
    max_tokens: o.maxTokens,
    temperature: o.temperature,
    system: o.system,
    messages: [{ role: "user", content: o.user }],
  }),
  parse: (data) => {
    const d = data as { content?: { type: string; text?: string }[] };
    return (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  },
  listModels: async (key) => {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!r.ok) throw new Error(`models list failed (${r.status})`);
    const d = (await r.json()) as { data?: { id: string; display_name?: string }[] };
    return (d.data ?? []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
  },
};

const GEMINI: Provider = {
  id: "gemini",
  label: "Google Gemini",
  badge: "FREE",
  blurb: "Free tier, no credit card. The best free option for FLUX.",
  keyUrl: "https://aistudio.google.com/apikey",
  keyHint: "AIza…",
  limits: "Free tier: roughly 15 requests/min and 1,500 requests/day on Flash — far more than FLUX needs. No credit card required.",
  caveat: "Google may use free-tier prompts to improve their models. FLUX sends your track names, tags and settings as context, so use the paid tier or Anthropic if that matters to you.",
  // seeds only — the real list is fetched from the key on connect, because
  // Google retires model ids for new keys without notice
  models: [
    { id: "gemini-flash-latest", label: "Flash (latest)", note: "recommended" },
    { id: "gemini-flash-lite-latest", label: "Flash-Lite (latest)", note: "fastest" },
  ],
  defaultModel: "gemini-flash-latest",
  customModel: true,
  endpoint: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
  headers: (key) => ({ "content-type": "application/json", "x-goog-api-key": key }),
  body: (o, _model) => ({
    system_instruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ text: o.user }] }],
    generationConfig: {
      maxOutputTokens: o.maxTokens,
      temperature: o.temperature,
      // native JSON mode: the model cannot return prose around the object
      ...(o.json ? { responseMimeType: "application/json" } : {}),
    },
  }),
  parse: (data) => {
    const d = data as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (d.promptFeedback?.blockReason) throw new Error(`blocked by safety filter (${d.promptFeedback.blockReason})`);
    const c = d.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text && c?.finishReason === "MAX_TOKENS") throw new Error("hit the output limit before answering");
    return text;
  },
  listModels: async (key) => {
    const out: ProviderModel[] = [];
    let pageToken = "";
    for (let page = 0; page < 4; page++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const r = await fetch(url, { headers: { "x-goog-api-key": key } });
      if (!r.ok) throw new Error(`models list failed (${r.status})`);
      const d = (await r.json()) as {
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
        nextPageToken?: string;
      };
      for (const m of d.models ?? []) {
        if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
        const id = m.name.replace(/^models\//, "");
        out.push({ id, label: m.displayName || id });
      }
      if (!d.nextPageToken) break;
      pageToken = d.nextPageToken;
    }
    return out;
  },
  errorMessage: (status, body) => {
    if (status === 404 && /no longer available|not found/i.test(body)) {
      return "That Gemini model isn't available to your key — open MODEL below and pick one from the live list";
    }
    if (status === 400 && /API key not valid/i.test(body)) return "That Google API key isn't valid — copy it again from aistudio.google.com/apikey";
    if (status === 429) return "Gemini free-tier limit reached — wait a minute, or try again tomorrow if you hit the daily cap";
    if (status === 403 && /SERVICE_DISABLED|has not been used/i.test(body)) return "Enable the Generative Language API for this key's Google Cloud project, then retry";
    return null;
  },
};

/** Groq / OpenRouter / Cerebras / anything speaking the OpenAI chat API. */
const OPENAI_COMPAT: Provider = {
  id: "openai-compat",
  label: "Other (OpenAI-compatible)",
  badge: "FREE",
  blurb: "Groq, OpenRouter, Cerebras or any OpenAI-style endpoint.",
  keyUrl: "https://console.groq.com/keys",
  keyHint: "gsk_… / sk-or-…",
  limits: "Depends on the service. Groq and Cerebras have generous free tiers; OpenRouter models ending in :free are free with daily caps.",
  models: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "Groq" },
    { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B", note: "Groq" },
    { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", note: "OpenRouter free" },
  ],
  defaultModel: "llama-3.3-70b-versatile",
  customModel: true,
  endpoint: () => "", // supplied by the user (base URL), see resolveEndpoint
  headers: (key) => ({ "content-type": "application/json", authorization: `Bearer ${key}` }),
  body: (o, model) => ({
    model,
    max_tokens: o.maxTokens,
    temperature: o.temperature,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
  }),
  parse: (data) => {
    const d = data as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content ?? "";
  },
  errorMessage: (status) => {
    if (status === 404) return "Model not found at that endpoint — check the model id and base URL";
    return null;
  },
  listModels: async (key, baseUrl) => {
    const base = (baseUrl || COMPAT_PRESETS[0].base).replace(/\/+$/, "");
    const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`models list failed (${r.status})`);
    const d = (await r.json()) as { data?: { id: string }[] };
    return (d.data ?? []).map((m) => ({ id: m.id, label: m.id }));
  },
};

export const PROVIDERS: Provider[] = [GEMINI, ANTHROPIC, OPENAI_COMPAT];

export const DEFAULT_PROVIDER = "gemini";

/** Known base URLs for the OpenAI-compatible provider. */
export const COMPAT_PRESETS = [
  { label: "Groq", base: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys" },
  { label: "OpenRouter", base: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/settings/keys" },
  { label: "Cerebras", base: "https://api.cerebras.ai/v1", keyUrl: "https://cloud.cerebras.ai" },
];

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/** OpenAI-compatible providers need the user's base URL joined to the path. */
export function resolveEndpoint(p: Provider, model: string, baseUrl: string): string {
  if (p.id !== "openai-compat") return p.endpoint(model);
  const base = (baseUrl || COMPAT_PRESETS[0].base).replace(/\/+$/, "");
  return `${base}/chat/completions`;
}
