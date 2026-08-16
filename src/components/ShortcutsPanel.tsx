import { BORDER, CYAN, MONO } from "../constants";
import { SHORTCUTS } from "../hooks/useKeyboard";
import { useStore } from "../store/useStore";
import { chip } from "./ui";

export function ShortcutsPanel() {
  const set = useStore((s) => s.set);
  return (
    <div
      onClick={() => set({ shortcutsOpen: false })}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 420px)", maxHeight: "80vh", overflowY: "auto", background: "rgba(12,14,20,0.97)", border: BORDER, borderRadius: 18, padding: 18 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", color: "#fff" }}>⌨ KEYBOARD SHORTCUTS</span>
          <button onClick={() => set({ shortcutsOpen: false })} style={{ ...chip(false), fontSize: 12 }}>✕</button>
        </div>
        {SHORTCUTS.map((sc) => (
          <div key={sc.keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 2px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>{sc.does}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: CYAN, background: "rgba(83,233,255,0.08)", border: `1px solid ${CYAN}33`, borderRadius: 6, padding: "3px 8px" }}>{sc.keys}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 10 }}>Press ? anywhere to open this panel.</div>
      </div>
    </div>
  );
}
