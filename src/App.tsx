import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { AiBusyChip } from "./components/ai/AiBits";
import { CopilotFab, CopilotPanel } from "./components/ai/CopilotPanel";

export default function App() {
  const tab = useStore((s) => s.tab);
  const visOpen = useStore((s) => s.visOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const aiReady = useStore((s) => s.aiReady);
  const playerBgOn = useStore((s) => s.playerBgOn);
  const recState = useStore((s) => s.recState);
  const recTime = useStore((s) => s.recTime);
  const set = useStore((s) => s.set);
  const sleepLeft = useSleepLeft();

  useKeyboard();
  useMediaSession();

  // ── tab motion: remember where we came from so the incoming panel slides
  // in from that side, and slide the accent bar to the active tab ──
  const TAB_ORDER: TabId[] = ["player", "visuals", "dj", "fx", "library", "me"];
  const prevTab = useRef<TabId>(tab);
  const [dir, setDir] = useState<1 | -1>(1);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState({ x: 0, w: 0 });

  useLayoutEffect(() => {
    if (prevTab.current !== tab) {
      setDir(TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(prevTab.current) ? 1 : -1);
      prevTab.current = tab;
    }
    const bar = tabBarRef.current;
    const btn = bar?.querySelector<HTMLElement>(`[data-tab="${visOpen ? "visuals" : tab}"]`);
    if (bar && btn) setInk({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [tab, visOpen]);

  // keep the accent bar aligned when the window resizes
  useEffect(() => {
    const onResize = () => {
      const bar = tabBarRef.current;
      const btn = bar?.querySelector<HTMLElement>(`[data-tab="${visOpen ? "visuals" : tab}"]`);
      if (bar && btn) setInk({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab, visOpen]);

  const bgRef = useRef<HTMLCanvasElement>(null);
  const pbgRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    canvasRefs.bg = bgRef.current;
    canvasRefs.pbg = pbgRef.current;
    return () => {
      if (canvasRefs.bg === bgRef.current) canvasRefs.bg = null;
      if (canvasRefs.pbg === pbgRef.current) canvasRefs.pbg = null;
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
      {/* live theme behind the whole player page, rendered tiny and blurred so
          it reads as colour and motion rather than a competing picture */}
      <canvas
        ref={pbgRef}
        aria-hidden
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
          opacity: tab === "player" && playerBgOn && !visOpen ? 0.6 : 0,
          filter: "blur(40px) saturate(1.4)",
          transition: "opacity 0.55s var(--ease-soft)",
        }}
      />
      <canvas ref={bgRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <div className="bootIn" style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px" }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.22em" }}>FLUX<span style={{ color: CYAN }}> PRO</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {recState === "rec" && <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#FF4949" }}>● {fmt(recTime)}</span>}
          {sleepLeft && <span style={{ fontFamily: MONO, fontSize: 10.5, color: MAG }}>☾ {sleepLeft}</span>}
          <button onClick={() => set({ visOpen: true })} className="sheen" style={{ padding: "7px 13px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: `linear-gradient(120deg, ${CYAN}, ${MAG})`, color: BG, border: "none" }}>◉ VISUALS</button>
        </div>
      </div>

      <input
        ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="bootIn d1" style={{ position: "relative", flex: 1, overflowY: "auto", padding: "2px 18px 14px" }}>
        {/* keyed by tab so the entrance animation replays on every switch */}
        <div key={tab} className={dir === 1 ? "tabIn-r" : "tabIn-l"}>
          {tab === "player" && <PlayerTab />}
          {tab === "dj" && <DJTab />}
          {tab === "fx" && <FXRackTab />}
          {tab === "library" && <LibraryTab onLoadClick={() => fileInputRef.current?.click()} />}
          {tab === "me" && <MeTab />}
        </div>
      </div>

      {/* bottom tabs */}
      <div ref={tabBarRef} className="bootIn d2" style={{ position: "relative", display: "flex", borderTop: BORDER, background: "rgba(10,11,16,0.85)", backdropFilter: "blur(16px)" }}>
        <div className="tabInk" style={{ transform: `translateX(${ink.x}px)`, width: ink.w }} />
        {([
          ["player", <PlayIcon key="i" size={15} color="currentColor" />, "PLAYER"],
          ["visuals", "◉", "VISUALS"],
          ["dj", "🎧", "DJ"],
          ["fx", "🎛", "FX"],
          ["library", "≡", "LIBRARY"],
          ["me", "👤", "ME"],
        ] as [TabId, React.ReactNode, string][]).map(([id, icon, label]) => (
          <button
            key={id}
            data-tab={id}
            data-on={(id === "visuals" ? visOpen : tab === id) ? "1" : "0"}
            className="tabBtn"
            onClick={() => (id === "visuals" ? set({ visOpen: true }) : set({ tab: id }))}
            style={{
              flex: 1, padding: "11px 0 13px", background: "transparent", border: "none", cursor: "pointer",
              color: (id === "visuals" ? visOpen : tab === id) ? CYAN : "rgba(255,255,255,0.45)",
              borderTop: "2px solid transparent",
            }}
          >
            <div className="tabIcon" style={{ fontSize: 15 }}>{icon}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", fontWeight: 700, marginTop: 2 }}>{label}</div>
          </button>
        ))}
      </div>

      {visOpen && <VisualizerOverlay />}
      {shortcutsOpen && <ShortcutsPanel />}
      {/* AI surfaces stay entirely absent until a key is connected */}
      {aiReady && !visOpen && <CopilotFab />}
      {aiReady && <CopilotPanel />}
      <AiBusyChip />
    </div>
  );
}
