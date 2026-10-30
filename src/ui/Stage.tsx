// The immersive stage, and the opening sequence.
//
// Entering the stage, the interface recedes (handled by the shell) while an
// aperture ring opens from the button you pressed and the scene behind comes
// forward to full brightness and reactivity. Controls sit at the edges and
// fade away when you stop moving; any movement or key brings them back. The
// mode can be changed in place — the stage cross-dissolves between scenes
// through its own transition rather than cutting.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { artistOf, getCurrentTrack, useStore } from "../store/useStore";
import { modeById, MODES } from "../stage/modes";
import { Lyrics } from "./Lyrics";
import { FluxLine } from "./FluxLine";
import { Transport, LikeButton } from "./Transport";
import { I } from "./icons";
import { ease, spring } from "./motion";
import { FluxMark, stageOrigin } from "./Chrome";

export function StageView() {
  const track = useStore((s) => getCurrentTrack(s));
  const mode = useStore((s) => s.look.style.mode);
  const lyricsShown = useStore((s) => s.lyricsOn && s.lyricPrefs.show);
  const scrim = useStore((s) => s.lyricPrefs.scrim);
  const setLook = useStore((s) => s.setLook);
  const [awake, setAwake] = useState(true);
  const timer = useRef(0);
  const m = modeById(mode);
  const hasLyrics = !!track?.lyrics?.length && track.lyricsTimed !== false;
  const showLyrics = lyricsShown && hasLyrics && !m.ownsLyrics;

  useEffect(() => {
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAwake(false), 2800);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);

  const step = (d: number) => {
    const i = MODES.findIndex((x) => x.id === mode);
    setLook("style", { mode: MODES[(i + d + MODES.length) % MODES.length].id });
  };
  const artist = track ? artistOf(track) : undefined;
  const title = track ? (artist && track.name.startsWith(artist) ? track.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : track.name) : "";
  const ox = stageOrigin.x >= 0 ? stageOrigin.x : window.innerWidth / 2;
  const oy = stageOrigin.y >= 0 ? stageOrigin.y : window.innerHeight / 2;
  const reach = Math.hypot(Math.max(ox, window.innerWidth - ox), Math.max(oy, window.innerHeight - oy));

  return (
    <motion.div
      role="dialog"
      aria-label="Stage"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      style={{ position: "fixed", inset: 0, zIndex: 30, cursor: awake ? "default" : "none" }}
    >
      {/* the aperture */}
      <motion.div
        aria-hidden
        initial={{ scale: 0, opacity: 0.9 }}
        animate={{ scale: 1, opacity: 0 }}
        transition={{ duration: 1.1, ease: ease.out }}
        style={{ position: "absolute", left: ox - reach, top: oy - reach, width: reach * 2, height: reach * 2, borderRadius: "50%", border: "2px solid var(--accent)", boxShadow: "0 0 60px rgb(var(--accent-rgb) / 0.5), inset 0 0 60px rgb(var(--accent-rgb) / 0.35)", pointerEvents: "none" }}
      />
      {/* lyrics, over a scrim that keeps them readable on any mode */}
      <AnimatePresence>
        {showLyrics && (
          <motion.div
            key="lyr"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.7, ease: ease.out } }}
            exit={{ opacity: 0, y: 20 }}
            style={{ position: "absolute", left: 0, right: 0, top: "18vh", bottom: "16vh", pointerEvents: "auto" }}
          >
            <div aria-hidden style={{ position: "absolute", inset: "-10% 0", background: `radial-gradient(ellipse 60% 45% at 50% 50%, rgba(0,0,0,${0.7 * scrim}), transparent 75%)` }} />
            <div style={{ position: "relative", height: "100%", color: "#fbf7f0" }}><Lyrics variant="stage" /></div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {awake && (
          <>
            <motion.div
              key="top"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.4 } }}
              transition={spring.soft}
              style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "18px 22px", display: "flex", alignItems: "center", gap: 12, color: "#fbf7f0", background: "linear-gradient(rgba(0,0,0,0.45), transparent)" }}
            >
              <FluxMark size={28} />
              <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 6, background: "rgba(0,0,0,0.35)", borderRadius: 999, padding: 4 }}>
                <button className="icon-btn" aria-label="Previous mode" onClick={() => step(-1)} style={{ color: "#fbf7f0" }}><I.back size={18} /></button>
                <div style={{ minWidth: 104, textAlign: "center", position: "relative", height: 22, overflow: "hidden" }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div key={m.id} initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -22, opacity: 0 }} transition={spring.snap} style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</motion.div>
                  </AnimatePresence>
                </div>
                <button className="icon-btn" aria-label="Next mode" onClick={() => step(1)} style={{ color: "#fbf7f0" }}><I.chevron size={18} /></button>
              </div>
              <div style={{ flex: 1 }} />
              <RecordButton />
              <button className="icon-btn" aria-label={lyricsShown ? "Hide lyrics" : "Show lyrics"} data-on={lyricsShown} onClick={() => useStore.getState().setLyricPrefs({ show: !lyricsShown })} style={{ color: lyricsShown ? "var(--accent)" : "#fbf7f0" }}><I.lyrics size={21} /></button>
              <button className="icon-btn" aria-label="Customise in Studio" onClick={() => useStore.setState({ stage: false, view: "studio" })} style={{ color: "#fbf7f0" }}><I.studio size={21} /></button>
              <button className="icon-btn" aria-label="Leave the stage (Esc)" title="Leave the stage (Esc)" onClick={() => useStore.setState({ stage: false })} style={{ color: "#fbf7f0" }}><I.minimize size={21} /></button>
            </motion.div>
            <motion.div
              key="bottom"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30, transition: { duration: 0.4 } }}
              transition={spring.soft}
              style={{
                position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 28px calc(22px + env(safe-area-inset-bottom))",
                background: "linear-gradient(transparent, rgba(0,0,0,0.55))", color: "#fbf7f0",
                display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 18,
                ["--text" as string]: "#fbf7f0", ["--text-3" as string]: "rgba(251,247,240,0.42)", ["--text-2" as string]: "rgba(251,247,240,0.7)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 720, fontSize: 22, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || "Nothing playing"}</div>
                <div style={{ opacity: 0.7, fontSize: 14 }}>{artist ?? ""}</div>
              </div>
              <Transport size={60} compact />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                <div style={{ width: "min(26vw, 300px)" }}>{track && <FluxLine track={track} height={22} compact />}</div>
                <LikeButton />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Record the stage (with the master audio) to a video take. */
function RecordButton() {
  const vid = useStore((s) => s.vidState);
  const t = useStore((s) => s.vidTime);
  const rec = vid === "rec";
  return (
    <motion.button
      className="btn"
      data-size="sm"
      whileTap={{ scale: 0.92 }}
      aria-label={rec ? "Stop recording video" : "Record a video of the stage"}
      title={rec ? "Stop and save" : "Record this song with the stage as a video (restarts the track)"}
      onClick={() => void import("../audio/videoRecorder").then((m) => (rec ? m.stopVideoExport() : m.startVideoExport(true)))}
      style={{ background: rec ? "var(--danger)" : "rgba(0,0,0,0.35)", color: "#fbf7f0", borderColor: "transparent" }}
    >
      <motion.span
        animate={rec ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={rec ? { duration: 1.2, repeat: Infinity } : undefined}
        style={{ width: 9, height: 9, borderRadius: rec ? 2 : 9, background: rec ? "#fff" : "var(--danger)", transition: "border-radius var(--t2)" }}
      />
      {rec ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "Record"}
    </motion.button>
  );
}

/**
 * The opening.
 *
 * First visit: the mark draws itself, the wordmark sets letter by letter from
 * condensed to full width, a line says what Flux is, and then the mark flies
 * to its place in the rail as the interface assembles around it. After that,
 * every launch gets a short version — the mark appears and flies home — so the
 * entrance is recognisable without ever being in the way. Any key or click
 * skips it.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const seen = useStore((s) => s.introSeen);
  const full = !seen;
  const [phase, setPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("out"), full ? 2100 : 450);
    const skip = () => setPhase("out");
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", skip); window.removeEventListener("pointerdown", skip); };
  }, [full]);
  useEffect(() => {
    if (phase === "out") {
      useStore.setState({ introSeen: true });
      onDone();
    }
  }, [phase, onDone]);
  return (
    <AnimatePresence>
      {phase === "in" && (
        <motion.div
          key="intro"
          exit={{ opacity: 0, transition: { duration: 0.5, ease: ease.out } }}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--bg)", display: "grid", placeItems: "center" }}
        >
          <div style={{ display: "grid", justifyItems: "center", gap: 18 }}>
            <motion.div layoutId="flux-mark" transition={spring.soft} style={{ color: "var(--text)" }}>
              <FluxMark size={full ? 84 : 64} draw={full} />
            </motion.div>
            {full && (
              <>
                <div className="display" aria-label="Flux" style={{ fontSize: "clamp(64px, 12vw, 140px)", display: "flex" }}>
                  {"Flux".split("").map((ch, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: 40, fontStretch: "75%", fontWeight: 300 }}
                      animate={{ opacity: 1, y: 0, fontStretch: "92%", fontWeight: 780 }}
                      transition={{ duration: 0.9, ease: ease.out, delay: 0.35 + i * 0.07 }}
                      style={{ display: "inline-block" }}
                    >{ch}</motion.span>
                  ))}
                </div>
                <motion.div className="eyebrow" initial={{ opacity: 0, letterSpacing: "0.5em" }} animate={{ opacity: 1, letterSpacing: "0.22em" }} transition={{ duration: 1.1, ease: ease.out, delay: 0.9 }}>
                  Music, made visible
                </motion.div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
