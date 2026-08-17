// Shared building blocks for every AI surface: the ✦ spinner, a prompt box,
// a result card, and the gate that keeps AI UI hidden until a key exists.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BORDER, CYAN, MAG, MONO } from "../../constants";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";
import { errText } from "../../ai/features";

/** True when a validated key is present — all AI UI is hidden otherwise. */
export function useAiReady(): boolean {
  return useStore((s) => s.aiReady);
}

export function Spark({ size = 13, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", fontSize: size, lineHeight: 1, color: MAG,
        animation: spin ? "fluxspin 1.1s linear infinite" : undefined,
      }}
    >✦</span>
  );
}

/** Global busy indicator — one per screen, driven by the client's counter. */
export function AiBusyChip() {
  const busy = useStore((s) => s.aiBusy);
  const label = useStore((s) => s.aiLabel);
  if (!busy) return null;
  return (
    <div
      style={{
        position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)", zIndex: 80,
        display: "flex", alignItems: "center", gap: 8, padding: "8px 15px", borderRadius: 999,
        background: "rgba(10,12,18,0.92)", border: `1px solid ${mix(MAG, 40)}`,
        backdropFilter: "blur(14px)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
        color: "#fff", pointerEvents: "none",
      }}
    >
      <Spark spin /> {label.toUpperCase()}…
    </div>
  );
}

export const aiInput: CSSProperties = {
  flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10,
  padding: "10px 12px", fontSize: 12.5, color: "#fff", outline: "none", fontFamily: "inherit",
};

/** Text prompt + run button, with inline result/error display. */
export function AiPrompt({
  placeholder, cta = "✦ GO", run, examples, multiline = false, color = MAG,
}: {
  placeholder: string;
  cta?: string;
  run: (text: string) => Promise<string | void>;
  examples?: string[];
  multiline?: boolean;
  color?: string;
}) {
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const busy = useStore((s) => s.aiBusy);

  const go = async (q = text) => {
    if (!q.trim() || busy) return;
    setOut("");
    try {
      const r = await run(q.trim());
      setOut(typeof r === "string" ? r : "done");
      setText("");
    } catch (e) {
      setOut(errText(e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {multiline ? (
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
            rows={2} style={{ ...aiInput, resize: "vertical" }}
          />
        ) : (
          <input
            value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            style={aiInput}
          />
        )}
        <button
          onClick={() => go()} disabled={busy || !text.trim()}
          style={{
            flexShrink: 0, padding: "0 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer",
            background: mix(color, 16), border: `1px solid ${mix(color, 45)}`, color,
            opacity: busy || !text.trim() ? 0.45 : 1,
          }}
        >{cta}</button>
      </div>
      {!!examples?.length && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {examples.map((ex) => (
            <button
              key={ex} onClick={() => { setText(ex); go(ex); }}
              style={{
                padding: "5px 9px", borderRadius: 999, fontSize: 9.5, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: BORDER, color: "rgba(255,255,255,0.5)",
              }}
            >{ex}</button>
          ))}
        </div>
      )}
      {!!out && <ResultText text={out} />}
    </div>
  );
}

export function ResultText({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11.5, lineHeight: 1.55, color: text.startsWith("⚠") ? "#FF9A9A" : "rgba(255,255,255,0.72)",
        background: "rgba(255,255,255,0.03)", border: BORDER, borderRadius: 10, padding: "9px 11px",
        whiteSpace: "pre-wrap",
      }}
    >{text}</div>
  );
}

/** One-tap AI action button with its own inline result. */
export function AiAction({
  label, hint, run, color = CYAN, wide = false,
}: {
  label: string;
  hint?: string;
  run: () => Promise<string | void>;
  color?: string;
  wide?: boolean;
}) {
  const [out, setOut] = useState("");
  const busy = useStore((s) => s.aiBusy);
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined, display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={async () => {
          if (busy) return;
          setOut("");
          try {
            const r = await run();
            setOut(typeof r === "string" ? r : "done");
          } catch (e) {
            setOut(errText(e));
          }
        }}
        disabled={busy}
        style={{
          padding: "12px 10px", borderRadius: 11, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          cursor: busy ? "wait" : "pointer", background: mix(color, 9), border: `1px solid ${mix(color, 32)}`,
          color, textAlign: "center", opacity: busy ? 0.5 : 1, lineHeight: 1.35,
        }}
      >
        {label}
        {hint && <div style={{ fontSize: 8.5, letterSpacing: "0.1em", opacity: 0.6, marginTop: 3 }}>{hint}</div>}
      </button>
      {!!out && <ResultText text={out} />}
    </div>
  );
}

export function AiCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: BORDER, borderRadius: 12, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: mix(MAG, 85), fontFamily: MONO }}>{title}</div>
      {children}
    </div>
  );
}
