// BYOK key management. The key is stored in this browser only (IndexedDB) and
// is sent to api.anthropic.com and nowhere else.
import { useEffect, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../../constants";
import { loadKey, saveKey, validateKey } from "../../ai/client";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";
import { Module } from "../ui";
import { aiInput, Spark } from "./AiBits";

export function AiSettings() {
  const aiReady = useStore((s) => s.aiReady);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    loadKey().then((k) => {
      setSaved(k);
      useStore.setState({ aiReady: !!k });
    });
  }, []);

  const connect = async () => {
    const k = key.trim();
    if (!k) return;
    setChecking(true);
    setStatus("Checking key…");
    const res = await validateKey(k);
    setChecking(false);
    if (res.ok) {
      await saveKey(k);
      setSaved(k);
      setKey("");
      setStatus("✓ Connected — AI features unlocked across the app");
    } else {
      setStatus(`⚠ ${res.msg}`);
    }
  };

  const disconnect = async () => {
    await saveKey("");
    setSaved(null);
    setStatus("Key removed. FLUX keeps working exactly as before.");
  };

  const masked = saved ? `${saved.slice(0, 11)}${"•".repeat(14)}${saved.slice(-4)}` : "";

  return (
    <Module
      title="✦ AI SETTINGS"
      extra={
        <span style={{ fontSize: 9.5, letterSpacing: "0.14em", color: aiReady ? CYAN : "rgba(255,255,255,0.35)", fontFamily: MONO }}>
          {aiReady ? "CONNECTED" : "OPTIONAL"}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
          Bring your own Anthropic API key to unlock <Spark size={10} /> features — copilot, vibe-to-FX,
          auto-tagging, cover art and more. The key is stored only in this browser and is sent
          only to api.anthropic.com. Everything else in FLUX works without it.
        </div>

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
                  const r = await validateKey(saved);
                  setChecking(false);
                  setStatus(r.ok ? "✓ Key is valid" : `⚠ ${r.msg}`);
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
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
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
        )}

        {!!status && (
          <div style={{ fontSize: 10.5, lineHeight: 1.5, color: status.startsWith("⚠") ? "#FF9A9A" : CYAN }}>{status}</div>
        )}
        {!saved && (
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}>
            Get a key at console.anthropic.com → API Keys. Usage is billed to your own Anthropic
            account. A browser-stored key is readable by anything running on this page — use a
            key with limited spend.
          </div>
        )}
      </div>
    </Module>
  );
}
