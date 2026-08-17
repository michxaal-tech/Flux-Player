// BYOK key management across providers. Keys are stored in this browser only
// (IndexedDB, one per provider) and are sent only to the provider you pick.
import { useEffect, useRef, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../../constants";
import { discoverModels, loadKey, refreshReady, saveKey, validateKey } from "../../ai/client";
import { COMPAT_PRESETS, getProvider, PROVIDERS } from "../../ai/providers";
import type { ProviderModel } from "../../ai/providers";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";
import { Module } from "../ui";
import { aiInput, Spark } from "./AiBits";

export function AiSettings() {
  const aiReady = useStore((s) => s.aiReady);
  const providerId = useStore((s) => s.aiProvider);
  const model = useStore((s) => s.aiModel);
  const baseUrl = useStore((s) => s.aiBaseUrl);
  const set = useStore((s) => s.set);

  const provider = getProvider(providerId);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // live model list from the key — hardcoded ids go stale
  const [liveModels, setLiveModels] = useState<ProviderModel[] | null>(null);
  // read inside async flows without waiting for a re-render
  const liveModelsRef = useRef<ProviderModel[] | null>(null);

  // reload the stored key whenever the provider changes
  useEffect(() => {
    let alive = true;
    setStatus("");
    setKey("");
    setLiveModels(null);
    loadKey(providerId).then((k) => {
      if (!alive) return;
      setSaved(k);
      refreshReady();
      if (k) discoverModels(k, providerId, baseUrl)
        .then((m) => { if (alive && m.length) { setLiveModels(m); liveModelsRef.current = m; } })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [providerId]);

  const activeModel = model || provider.defaultModel;

  const connect = async () => {
    const k = key.trim();
    if (!k) return;
    setChecking(true);
    // Ask the provider what this key can call before testing anything — a
    // model id that was valid last month may not be offered to a new key.
    setStatus("Finding available models…");
    let use = activeModel;
    try {
      const models = await discoverModels(k, providerId, baseUrl);
      if (models.length) {
        setLiveModels(models);
        liveModelsRef.current = models;
        // keep the user's pick only if their key actually offers it
        if (!models.some((m) => m.id === use)) use = models[0].id;
      }
    } catch { /* fall back to the seeded id and let the test call report */ }

    setStatus("Checking key…");
    let res = await validateKey(k, providerId, use, baseUrl);
    // A model can be listed and still be refused (retired for new keys, or
    // not enabled on this tier). If the failure is about the model rather
    // than the key, fall back to the best one the key offers.
    if (!res.ok && /model|404|not available|not found/i.test(res.msg)) {
      const best = (liveModelsRef.current ?? [])[0]?.id;
      if (best && best !== use) {
        setStatus(`${use} was refused — trying ${best}…`);
        const retry = await validateKey(k, providerId, best, baseUrl);
        if (retry.ok) { use = best; res = retry; }
      }
    }
    setChecking(false);
    if (res.ok) {
      await saveKey(k, providerId);
      set({ aiModel: use });
      setSaved(k);
      setKey("");
      setStatus(`✓ Connected to ${provider.label} using ${use}`);
    } else {
      setStatus(`⚠ ${res.msg}`);
    }
  };

  const disconnect = async () => {
    await saveKey("", providerId);
    setSaved(null);
    setStatus("Key removed. FLUX keeps working exactly as before.");
  };

  const masked = saved
    ? `${saved.slice(0, Math.min(8, saved.length - 4))}${"•".repeat(12)}${saved.slice(-4)}`
    : "";

  return (
    <Module
      title="✦ AI SETTINGS"
      extra={
        <span style={{ fontSize: 9.5, letterSpacing: "0.14em", color: aiReady ? CYAN : "rgba(255,255,255,0.35)", fontFamily: MONO }}>
          {aiReady ? "CONNECTED" : "OPTIONAL"}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
          Connect an AI provider to unlock <Spark size={10} /> features — copilot, vibe-to-FX,
          auto-tagging, cover art and more. Your key is stored only in this browser and is sent
          only to the provider you choose. Everything else in FLUX works without it.
        </div>

        {/* provider picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {PROVIDERS.map((p) => {
            const on = p.id === providerId;
            const col = p.badge === "FREE" ? CYAN : MAG;
            return (
              <button
                key={p.id}
                onClick={() => set({ aiProvider: p.id, aiModel: "", aiBaseUrl: p.id === "openai-compat" ? COMPAT_PRESETS[0].base : "" })}
                style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 11, cursor: "pointer",
                  background: on ? mix(col, 12) : "rgba(255,255,255,0.03)",
                  border: `1px solid ${on ? mix(col, 42) : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: on ? "#fff" : "rgba(255,255,255,0.75)" }}>{p.label}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", padding: "2px 6px", borderRadius: 999, background: mix(col, 20), color: col }}>
                    {p.badge}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3, lineHeight: 1.45 }}>{p.blurb}</div>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.55 }}>{provider.limits}</div>
        {provider.caveat && (
          <div style={{ fontSize: 9.5, color: "rgba(255,200,120,0.7)", lineHeight: 1.55 }}>⚠ {provider.caveat}</div>
        )}

        {/* OpenAI-compatible needs a base URL */}
        {provider.id === "openai-compat" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {COMPAT_PRESETS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => set({ aiBaseUrl: c.base })}
                  style={{
                    flex: 1, padding: "7px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: baseUrl === c.base ? mix(CYAN, 16) : "rgba(255,255,255,0.04)",
                    border: `1px solid ${baseUrl === c.base ? mix(CYAN, 42) : "rgba(255,255,255,0.08)"}`,
                    color: baseUrl === c.base ? CYAN : "rgba(255,255,255,0.6)",
                  }}
                >{c.label}</button>
              ))}
            </div>
            <input
              value={baseUrl}
              onChange={(e) => set({ aiBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
              style={{ ...aiInput, fontFamily: MONO, fontSize: 10.5 }}
            />
          </div>
        )}

        {saved ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, background: mix(CYAN, 8), border: `1px solid ${mix(CYAN, 28)}` }}>
              <span style={{ color: CYAN, fontSize: 12 }}>✓</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis" }}>{masked}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={async () => {
                  setChecking(true); setStatus("Re-checking…");
                  const r = await validateKey(saved, providerId, activeModel, baseUrl);
                  setChecking(false);
                  setStatus(r.ok ? `✓ Key is valid (${activeModel})` : `⚠ ${r.msg}`);
                }}
                disabled={checking}
                style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.75)" }}
              >TEST KEY</button>
              <button
                onClick={disconnect}
                style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,73,73,0.08)", border: "1px solid rgba(255,73,73,0.3)", color: "#FF8B8B" }}
              >REMOVE KEY</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={provider.keyHint}
                style={{ ...aiInput, fontFamily: MONO, fontSize: 11 }}
              />
              <button
                onClick={connect}
                disabled={checking || !key.trim()}
                style={{
                  flexShrink: 0, padding: "0 15px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em", cursor: "pointer", background: mix(MAG, 16),
                  border: `1px solid ${mix(MAG, 45)}`, color: MAG, opacity: checking || !key.trim() ? 0.45 : 1,
                }}
              >{checking ? "…" : "CONNECT"}</button>
            </div>
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                textAlign: "center", padding: "9px", borderRadius: 10, fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.06em", textDecoration: "none", background: "rgba(255,255,255,0.05)",
                border: BORDER, color: CYAN,
              }}
            >↗ GET A FREE KEY — {provider.keyUrl.replace(/^https:\/\//, "").split("/")[0]}</a>
          </>
        )}

        {!!status && (
          <div style={{ fontSize: 10.5, lineHeight: 1.5, color: status.startsWith("⚠") ? "#FF9A9A" : CYAN }}>{status}</div>
        )}

        {/* model selection */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", textAlign: "left", padding: 0 }}
        >{showAdvanced ? "▾" : "▸"} MODEL — {activeModel}</button>
        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {saved && (
              <button
                onClick={async () => {
                  setStatus("Refreshing model list…");
                  try {
                    const m = await discoverModels(saved, providerId, baseUrl);
                    setLiveModels(m);
                    liveModelsRef.current = m;
                    setStatus(m.length ? `✓ ${m.length} models available to this key` : "⚠ No models returned");
                  } catch (e) {
                    setStatus(`⚠ ${(e as Error).message}`);
                  }
                }}
                style={{ padding: "8px", borderRadius: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.7)" }}
              >⟳ REFRESH FROM MY KEY</button>
            )}
            {(liveModels ?? provider.models).map((m) => (
              <button
                key={m.id}
                onClick={() => set({ aiModel: m.id })}
                style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 11px", borderRadius: 9,
                  fontSize: 11, cursor: "pointer", textAlign: "left",
                  background: activeModel === m.id ? mix(CYAN, 12) : "rgba(255,255,255,0.03)",
                  border: `1px solid ${activeModel === m.id ? mix(CYAN, 38) : "rgba(255,255,255,0.08)"}`,
                  color: activeModel === m.id ? CYAN : "rgba(255,255,255,0.7)",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0, marginLeft: 8 }}>{m.note ?? (liveModels ? m.id : "")}</span>
              </button>
            ))}
            {provider.customModel && (
              <input
                value={model}
                onChange={(e) => set({ aiModel: e.target.value })}
                placeholder="or type any model id…"
                spellCheck={false}
                style={{ ...aiInput, fontFamily: MONO, fontSize: 10.5 }}
              />
            )}
          </div>
        )}

        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}>
          A key stored in a browser is readable by anything running on this page — prefer a key
          with a spend limit, and remove it here when you're done.
        </div>
      </div>
    </Module>
  );
}
