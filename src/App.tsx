import { useEffect, useRef } from "react";
import type React from "react";
import { BG, BORDER, CYAN, MAG, MONO, SANS } from "./constants";
import { addFiles } from "./audio/transport";
import { useKeyboard } from "./hooks/useKeyboard";
import { useMediaSession } from "./hooks/useMediaSession";
import { useSleepLeft } from "./hooks/useSleepLeft";
import { useStore } from "./store/useStore";
import { canvasRefs } from "./visualizer/live";
import type { TabId } from "./types";
import { fmt } from "./utils";
import { DJTab } from "./components/DJTab";
import { FXRackTab } from "./components/FXRackTab";
import { LibraryTab } from "./components/LibraryTab";
import { MeTab } from "./components/MeTab";
import { PlayerTab } from "./components/PlayerTab";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { VisualizerOverlay } from "./components/VisualizerOverlay";
import { PlayIcon } from "./components/ui";

export default function App() {
  const tab = useStore((s) => s.tab);
  const visOpen = useStore((s) => s.visOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const recState = useStore((s) => s.recState);
  const recTime = useStore((s) => s.recTime);
  const set = useStore((s) => s.set);
  const sleepLeft = useSleepLeft();

  useKeyboard();
  useMediaSession();

  const bgRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    canvasRefs.bg = bgRef.current;
    return () => {
      if (canvasRefs.bg === bgRef.current) canvasRefs.bg = null;
    };
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ position: "fixed", inset: 0, background: BG, fontFamily: SANS, color: "#fff", display: "flex", flexDirection: "column", userSelect: "none" }}
    >
      <canvas ref={bgRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px" }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.22em" }}>FLUX<span style={{ color: CYAN }}> PRO</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {recState === "rec" && <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#FF4949" }}>● {fmt(recTime)}</span>}
          {sleepLeft && <span style={{ fontFamily: MONO, fontSize: 10.5, color: MAG }}>☾ {sleepLeft}</span>}
          <button onClick={() => set({ visOpen: true })} style={{ padding: "7px 13px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: `linear-gradient(120deg, ${CYAN}, ${MAG})`, color: BG, border: "none" }}>◉ VISUALS</button>
        </div>
      </div>

      <input
        ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div style={{ position: "relative", flex: 1, overflowY: "auto", padding: "2px 18px 14px" }}>
        {tab === "player" && <PlayerTab />}
        {tab === "dj" && <DJTab />}
        {tab === "fx" && <FXRackTab />}
        {tab === "library" && <LibraryTab onLoadClick={() => fileInputRef.current?.click()} />}
        {tab === "me" && <MeTab />}
      </div>

      {/* bottom tabs */}
      <div style={{ position: "relative", display: "flex", borderTop: BORDER, background: "rgba(10,11,16,0.85)", backdropFilter: "blur(16px)" }}>
        {([
          ["player", <PlayIcon key="i" size={15} color="currentColor" />, "PLAYER"],
          ["dj", "🎧", "DJ"],
          ["fx", "🎛", "FX"],
          ["library", "≡", "LIBRARY"],
          ["me", "👤", "ME"],
        ] as [TabId, React.ReactNode, string][]).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => set({ tab: id })}
            style={{
              flex: 1, padding: "11px 0 13px", background: "transparent", border: "none", cursor: "pointer",
              color: tab === id ? CYAN : "rgba(255,255,255,0.45)",
              borderTop: tab === id ? `2px solid ${CYAN}` : "2px solid transparent",
            }}
          >
            <div style={{ fontSize: 15, display: "flex", justifyContent: "center" }}>{icon}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, marginTop: 2 }}>{label}</div>
          </button>
        ))}
      </div>

      {visOpen && <VisualizerOverlay />}
      {shortcutsOpen && <ShortcutsPanel />}
    </div>
  );
}
