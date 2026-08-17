// FLUX COPILOT: dockable chat that drives the whole app, plus VOICE DJ —
// the mic feeds transcripts into the same command pipeline.
import { useEffect, useRef, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../../constants";
import { copilot } from "../../ai/features";
import { listenOnce, recognitionSupported } from "../../ai/speech";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";
import { aiInput, Spark } from "./AiBits";

const EXAMPLES = [
  "play something dark and slow it down",
  "make the visuals red and hypnotic",
  "build me a focus playlist",
  "sleep timer 30 minutes",
];

export function CopilotPanel() {
  const open = useStore((s) => s.aiPanel);
  const chat = useStore((s) => s.aiChat);
  const busy = useStore((s) => s.aiBusy);
  const set = useStore((s) => s.set);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat.length, busy]);

  if (!open) return null;

  const send = (q: string) => {
    const msg = q.trim();
    if (!msg || busy) return;
    setText("");
    setHeard("");
    copilot(msg);
  };

  const mic = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setListening(true);
    setHeard("");
    const { promise, stop } = listenOnce(setHeard);
    stopRef.current = stop;
    const transcript = await promise;
    setListening(false);
    stopRef.current = null;
    if (transcript) send(transcript);
  };

  return (
    <div
      style={{
        position: "fixed", right: 0, bottom: 0, left: 0, zIndex: 70,
        maxWidth: 560, margin: "0 auto",
        background: "rgba(10,12,18,0.96)", backdropFilter: "blur(22px)",
        border: BORDER, borderBottom: "none", borderRadius: "18px 18px 0 0",
        boxShadow: "0 -18px 50px rgba(0,0,0,0.55)",
        display: "flex", flexDirection: "column", maxHeight: "72vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
          <Spark spin={busy} /> FLUX COPILOT
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {chat.length > 0 && (
            <button
              onClick={() => set({ aiChat: [] })}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 10, letterSpacing: "0.1em" }}
            >CLEAR</button>
          )}
          <button
            onClick={() => set({ aiPanel: false })}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
          >✕</button>
        </div>
      </div>

      <div ref={logRef} style={{ overflowY: "auto", padding: "0 14px", display: "flex", flexDirection: "column", gap: 9, minHeight: 90 }}>
        {chat.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "6px 0 4px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              Ask for anything — playback, sound, visuals, playlists. Try:
            </div>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => send(ex)}
                style={{
                  textAlign: "left", padding: "8px 11px", borderRadius: 9, fontSize: 11,
                  background: "rgba(255,255,255,0.04)", border: BORDER, color: "rgba(255,255,255,0.65)", cursor: "pointer",
                }}
              >“{ex}”</button>
            ))}
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "88%", padding: "9px 12px", borderRadius: 12, fontSize: 12, lineHeight: 1.5,
                background: m.role === "user" ? mix(CYAN, 14) : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.role === "user" ? mix(CYAN, 30) : "rgba(255,255,255,0.09)"}`,
                color: m.text.startsWith("⚠") ? "#FF9A9A" : "#fff",
                whiteSpace: "pre-wrap",
              }}
            >{m.text}</div>
            {!!m.notes?.length && (
              <div style={{ fontSize: 9.5, fontFamily: MONO, color: mix(MAG, 80), letterSpacing: "0.04em" }}>
                ▸ {m.notes.join(" · ")}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", gap: 7, alignItems: "center" }}>
            <Spark spin /> working…
          </div>
        )}
      </div>

      {listening && (
        <div style={{ padding: "8px 14px 0", fontSize: 11, color: MAG, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ animation: "fluxpulse 1s ease-in-out infinite" }}>●</span>
          {heard || "listening…"}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: "10px 14px", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
        {recognitionSupported() && (
          <button
            onClick={mic}
            title="Voice DJ"
            style={{
              flexShrink: 0, width: 40, borderRadius: 10, cursor: "pointer", fontSize: 15,
              background: listening ? mix(MAG, 26) : "rgba(255,255,255,0.06)",
              border: `1px solid ${listening ? mix(MAG, 60) : "rgba(255,255,255,0.09)"}`,
              color: listening ? MAG : "rgba(255,255,255,0.7)",
            }}
          >🎙</button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(text); }}
          placeholder="tell FLUX what you want…"
          style={aiInput}
        />
        <button
          onClick={() => send(text)}
          disabled={busy || !text.trim()}
          style={{
            flexShrink: 0, padding: "0 15px", borderRadius: 10, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer",
            background: mix(MAG, 16), border: `1px solid ${mix(MAG, 45)}`, color: MAG,
            opacity: busy || !text.trim() ? 0.4 : 1,
          }}
        >SEND</button>
      </div>
    </div>
  );
}

/** Floating launcher — only rendered when a key exists. */
export function CopilotFab() {
  const open = useStore((s) => s.aiPanel);
  const busy = useStore((s) => s.aiBusy);
  const set = useStore((s) => s.set);
  if (open) return null;
  return (
    <button
      onClick={() => set({ aiPanel: true })}
      title="FLUX Copilot"
      style={{
        position: "fixed", right: 14, bottom: 82, zIndex: 60,
        width: 46, height: 46, borderRadius: 999, cursor: "pointer", fontSize: 18,
        background: "rgba(10,12,18,0.92)", border: `1px solid ${mix(MAG, 45)}`,
        color: MAG, backdropFilter: "blur(14px)", boxShadow: `0 6px 24px ${mix(MAG, 22)}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Spark size={17} spin={busy} />
    </button>
  );
}
