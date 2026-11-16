// The shell: the stage canvas behind everything, navigation, the current view,
// the dock, and the overlays.
//
// Views sit in a simple spatial model. Listen is the front layer — going to it
// brings it toward you, leaving it lets it fall back. The other views are
// side by side in nav order, so moving between them slides left or right.
// Every transition retargets if you click again mid-flight.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { useStore } from "./store/useStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useMediaSession } from "./hooks/useMediaSession";
import { refreshConnectorSources } from "./connectors";
import { stage } from "./stage/engine";
import type { ViewId } from "./types";
import { NowPlaying } from "./ui/NowPlaying";
import { Library } from "./ui/Library";
import { Search } from "./ui/Search";
import { Studio } from "./ui/Studio";
import { Sound, Settings } from "./ui/Panels";
import { Aura, Dock, DropOverlay, FluxMark, Rail, StageButton, TabBar, Toasts, VIEW_ORDER, YouTubeHost } from "./ui/Chrome";
import { Intro, StageView } from "./ui/Stage";
import { CommandPalette, LyricSync } from "./ui/Extras";
import { I } from "./ui/icons";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { AiBusyChip } from "./components/ai/AiBits";
import { CopilotFab, CopilotPanel } from "./components/ai/CopilotPanel";
import { ease } from "./ui/motion";

function useWide(): boolean {
  const q = "(min-width: 960px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * The stage (the visualizer) draws only where it is the subject: in the
 * immersive stage, and as the live preview in Studio. Everywhere else the room
 * is lit by the aura — colour taken from the playing record — so the interface
 * never depends on which visualizer is running.
 */
function usePresence() {
  const view = useStore((s) => s.view);
  const open = useStore((s) => s.stage);
  useEffect(() => {
    if (open) stage.setPresence({ show: true, calm: 0, dim: 1, paper: 0 });
    else if (view === "studio") stage.setPresence({ show: true, calm: 0.15, dim: 1, paper: 0 });
    else stage.setPresence({ show: false, calm: 1, dim: 0, paper: 0 });
  }, [view, open]);
}

const depthOf = (v: ViewId) => (v === "listen" ? 0 : 1);

export default function App() {
  const view = useStore((s) => s.view);
  const open = useStore((s) => s.stage);
  const motionPref = useStore((s) => s.ui.motion);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const aiReady = useStore((s) => s.aiReady);
  const wide = useWide();
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const prevView = useRef<ViewId>(view);
  const [dir, setDir] = useState({ x: 0, z: 0 });

  useKeyboard();
  useMediaSession();
  usePresence();

  useEffect(() => {
    if (canvas.current) stage.attach(canvas.current);
    void refreshConnectorSources().then(() => useStore.setState({ connectorRev: Date.now() }));
  }, []);

  // direction of travel between views, for the transition
  if (prevView.current !== view) {
    const a = prevView.current, b = view;
    const z = depthOf(b) - depthOf(a); // -1 toward you (to Listen), 1 away
    const x = z === 0 ? Math.sign(VIEW_ORDER.indexOf(b) - VIEW_ORDER.indexOf(a)) : 0;
    prevView.current = view;
    if (dir.x !== x || dir.z !== z) setDir({ x, z });
  }

  const onIntroDone = useCallback(() => setReady(true), []);
  // Minimal always reduces; otherwise follow the system's reduced-motion setting
  const reduce = motionPref === "minimal" ? "always" : "user";

  const content = (
    <>
      {view === "listen" && <NowPlaying wide={wide} />}
      {view === "library" && <Library />}
      {view === "search" && <Search />}
      {view === "sound" && <Sound />}
      {view === "studio" && <Studio wide={wide} />}
      {view === "settings" && <Settings />}
    </>
  );
  const scrolls = view !== "studio" && !(view === "listen" && wide);

  return (
    <MotionConfig reducedMotion={reduce} transition={motionPref === "calm" ? { duration: 0.25 } : undefined}>
      <LayoutGroup>
        <div style={{ position: "fixed", inset: 0, background: "var(--bg)", overflow: "hidden" }}>
          {(window as unknown as { __fluxPlatform?: string }).__fluxPlatform === "darwin" && <div className="mac-drag" />}
          <Aura hidden={open || view === "studio"} />
          <motion.canvas
            ref={canvas}
            aria-hidden
            animate={{ opacity: open || view === "studio" ? 1 : 0 }}
            transition={{ duration: 0.7, ease: ease.out }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
          />

          <motion.div
            animate={open ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1 }}
            transition={{ duration: open ? 0.5 : 0.6, ease: ease.out }}
            style={{
              position: "absolute", inset: 0, display: "grid",
              gridTemplateColumns: wide ? "var(--rail) 1fr" : "1fr",
              gridTemplateRows: wide ? "1fr" : "auto 1fr auto auto",
              pointerEvents: open ? "none" : "auto",
            }}
            aria-hidden={open}
          >
            {wide ? (
              ready ? (
                <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.7, ease: ease.out }}>
                  <Rail />
                </motion.div>
              ) : <div />
            ) : (
              <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top)) 16px 6px", position: "relative", zIndex: 4 }}>
                {ready && <motion.div layoutId="flux-mark"><FluxMark size={28} /></motion.div>}
                <span className="display" style={{ fontSize: 22 }}>Flux</span>
                <div style={{ flex: 1 }} />
                <StageButton size={38} inline />
                <button className="icon-btn" aria-label="Settings" data-on={view === "settings"} onClick={() => useStore.setState({ view: "settings" })}><I.settings size={22} /></button>
              </header>
            )}

            <main style={{ position: "relative", minHeight: 0, minWidth: 0, display: "grid", gridTemplateRows: wide ? "1fr auto" : "1fr", padding: wide ? "0 28px 0 8px" : 0 }}>
              <div style={{ position: "relative", minHeight: 0, overflow: "hidden" }}>
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  {ready && (
                    <motion.section
                      key={view}
                      custom={dir}
                      className={scrolls ? "scroll" : undefined}
                      variants={{
                        enter: (d: { x: number; z: number }) => ({
                          opacity: 0,
                          x: d.x * 56,
                          scale: d.z < 0 ? 0.94 : d.z > 0 ? 1.03 : 1,
                        }),
                        center: { opacity: 1, x: 0, scale: 1 },
                        exit: (d: { x: number; z: number }) => ({
                          opacity: 0,
                          x: d.x * -40,
                          scale: d.z > 0 ? 0.95 : d.z < 0 ? 1.04 : 1,
                          transition: { duration: 0.26, ease: ease.in },
                        }),
                      }}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.6, ease: ease.out }}
                      style={{
                        position: "absolute", inset: 0,
                        padding: wide ? (view === "listen" ? "28px 20px 24px" : view === "studio" ? "24px 0 24px" : "40px 20px 40px") : "8px 16px 24px",
                        overflowY: scrolls ? "auto" : "hidden",
                      }}
                    >
                      {content}
                    </motion.section>
                  )}
                </AnimatePresence>
              </div>
              {wide && (
                <AnimatePresence>
                  {ready && view !== "listen" && <Dock key="dock" wide />}
                </AnimatePresence>
              )}
            </main>
            {!wide && (
              <>
                <AnimatePresence>{ready && view !== "listen" && <Dock key="dock" wide={false} />}</AnimatePresence>
                <TabBar />
              </>
            )}
          </motion.div>

          <AnimatePresence>{open && <StageView key="stage" />}</AnimatePresence>
          <YouTubeHost wide={wide} />
          <Toasts />
          <DropOverlay />
          <AnimatePresence>{shortcutsOpen && <ShortcutsPanel key="sc" />}</AnimatePresence>
          {aiReady && !open && <CopilotFab />}
          {aiReady && <CopilotPanel />}
          <AiBusyChip />
          <LyricSync />
          <CommandPalette />
          <Intro onDone={onIntroDone} />
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
