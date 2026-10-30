// The app's persistent chrome: the Flux mark, the navigation rail (wide) and
// tab bar (narrow), the mini-player dock, toasts, the drop target and the
// YouTube player host.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { artistOf, getCurrentTrack, useStore } from "../store/useStore";
import { addFiles } from "../audio/transport";
import { ensurePlayer, isYouTube } from "../youtube";
import type { ViewId } from "../types";
import { Artwork } from "./Artwork";
import { FluxLine } from "./FluxLine";
import { LikeButton, Transport, Volume } from "./Transport";
import { I } from "./icons";
import { Loader } from "./kit";
import { ease, spring } from "./motion";

// ── the mark ───────────────────────────────────────────────────────────────
/** A record seen edge-on, crossed by a waveform. `draw` animates the strokes in. */
export function FluxMark({ size = 30, draw = false, color = "currentColor" }: { size?: number; draw?: boolean; color?: string }) {
  const t = { duration: 1.1, ease: ease.out };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <motion.circle cx="16" cy="16" r="12.5" stroke={color} strokeWidth="2.2" initial={draw ? { pathLength: 0, rotate: -90 } : false} animate={{ pathLength: 1, rotate: 0 }} transition={t} style={{ originX: "16px", originY: "16px" }} />
      <motion.path d="M3.5 16c3.2-7 6.4-7 9.2 0s6 7 9.2 0 4.2-3.6 6.6-2.4" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ ...t, delay: draw ? 0.35 : 0 }} />
    </svg>
  );
}

// ── navigation ─────────────────────────────────────────────────────────────
export const NAV: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: "listen", label: "Listen", icon: <I.listen size={23} /> },
  { id: "library", label: "Library", icon: <I.library size={23} /> },
  { id: "search", label: "Search", icon: <I.search size={23} /> },
  { id: "sound", label: "Sound", icon: <I.sound size={23} /> },
  { id: "studio", label: "Studio", icon: <I.studio size={23} /> },
];
export const VIEW_ORDER: ViewId[] = ["listen", "library", "search", "sound", "studio", "settings"];

function NavButton({ id, label, icon, on, vertical }: { id: ViewId; label: string; icon: ReactNode; on: boolean; vertical: boolean }) {
  return (
    <motion.button
      onClick={() => useStore.setState({ view: id, stage: false })}
      aria-current={on ? "page" : undefined}
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={spring.pop}
      style={{
        position: "relative", border: 0, background: "none", color: on ? "var(--text)" : "var(--text-3)",
        display: "grid", justifyItems: "center", gap: 4, padding: vertical ? "10px 0" : "8px 0 6px", width: vertical ? 64 : "100%",
        transition: "color var(--t3) var(--ease-out)",
      }}
    >
      {on && (
        <motion.span
          layoutId={vertical ? "rail-pill" : "tab-pill"}
          transition={spring.slide}
          style={{ position: "absolute", inset: vertical ? "4px 6px" : "2px 14%", borderRadius: 16, background: "rgb(var(--accent-rgb) / 0.14)" }}
        />
      )}
      <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.06 : 1 }} transition={spring.pop} style={{ position: "relative", display: "grid", color: on ? "var(--accent)" : undefined }}>{icon}</motion.span>
      <span style={{ position: "relative", fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>{label}</span>
    </motion.button>
  );
}

export function Rail() {
  const view = useStore((s) => s.view);
  const stage = useStore((s) => s.stage);
  return (
    <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 0 18px", gap: 6, height: "100%", position: "relative", zIndex: 3 }}>
      <motion.div layoutId="flux-mark" transition={spring.soft} style={{ marginBottom: 22, color: "var(--text)" }}>
        <FluxMark size={34} />
      </motion.div>
      {NAV.map((n) => <NavButton key={n.id} {...n} on={!stage && view === n.id} vertical />)}
      <div style={{ flex: 1 }} />
      <StageButton />
      <NavButton id="settings" label="Settings" icon={<I.settings size={22} />} on={!stage && view === "settings"} vertical />
    </nav>
  );
}

export function StageButton({ size = 52, inline }: { size?: number; inline?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <motion.button
      ref={ref}
      aria-label="Enter the stage (V)"
      title="Enter the stage (V)"
      whileHover={{ scale: 1.06, rotate: 12 }}
      whileTap={{ scale: 0.9 }}
      transition={spring.pop}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) stageOrigin.x = r.left + r.width / 2, stageOrigin.y = r.top + r.height / 2;
        useStore.setState({ stage: true });
      }}
      style={{
        width: size, height: size, borderRadius: "50%", border: "1px solid var(--line-2)", marginBottom: inline ? 0 : 10,
        background: "radial-gradient(circle at 35% 30%, rgb(var(--accent-rgb) / 0.45), transparent 70%), var(--surface-2)",
        color: "var(--text)", display: "grid", placeItems: "center",
      }}
    >
      <I.stage size={Math.round(size * 0.46)} />
    </motion.button>
  );
}

/** Where the stage aperture opens from (the button that was pressed). */
export const stageOrigin = { x: -1, y: -1 };

export function TabBar() {
  const view = useStore((s) => s.view);
  const stage = useStore((s) => s.stage);
  return (
    <nav
      aria-label="Main"
      style={{
        display: "grid", gridTemplateColumns: `repeat(${NAV.length}, 1fr)`, padding: "4px 6px calc(6px + env(safe-area-inset-bottom))",
        background: "rgb(var(--scrim) / 0.92)", borderTop: "1px solid var(--line)", position: "relative", zIndex: 6,
      }}
    >
      {NAV.map((n) => <NavButton key={n.id} {...n} on={!stage && view === n.id} vertical={false} />)}
    </nav>
  );
}

// ── the dock (mini player) ─────────────────────────────────────────────────
export function Dock({ wide }: { wide: boolean }) {
  const track = useStore((s) => getCurrentTrack(s));
  if (!track) return null;
  const artist = artistOf(track);
  const title = artist && track.name.startsWith(artist) ? track.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : track.name;
  const open = () => useStore.setState({ view: "listen" });
  return (
    <motion.div
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0, transition: { duration: 0.25, ease: ease.in } }}
      transition={spring.soft}
      style={{
        position: "relative", zIndex: 5, display: "grid",
        gridTemplateColumns: wide ? "minmax(220px, 1.2fr) auto minmax(180px, 1fr)" : "1fr auto",
        alignItems: "center", gap: wide ? 24 : 10, padding: wide ? "10px 18px 10px 10px" : "8px 8px 8px 8px",
        margin: wide ? "0 0 16px" : 0, borderRadius: wide ? 22 : 0,
        background: "var(--bg-raise)", border: wide ? "1px solid var(--line)" : 0, borderTop: "1px solid var(--line)",
        boxShadow: wide ? "var(--shadow-lg)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <motion.button layoutId="np-art" transition={spring.soft} onClick={open} aria-label="Open now playing" style={{ width: wide ? 56 : 46, height: wide ? 56 : 46, padding: 0, border: 0, background: "none", flexShrink: 0, borderRadius: 12 }}>
          <Artwork track={track} radius={12} />
        </motion.button>
        <button onClick={open} style={{ minWidth: 0, textAlign: "left", border: 0, background: "none", padding: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={track.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: ease.out }}>
              <div style={{ fontWeight: 650, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
              <div className="faint" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist ?? "Unknown artist"}</div>
            </motion.div>
          </AnimatePresence>
        </button>
        {wide && <LikeButton size={36} />}
      </div>
      {wide ? (
        <div style={{ display: "grid", gap: 2, width: "min(36vw, 420px)" }}>
          <Transport size={46} compact />
          <FluxLine track={track} height={18} compact />
        </div>
      ) : (
        <Transport size={44} compact />
      )}
      {wide && <div style={{ justifySelf: "end" }}><Volume width={100} /></div>}
    </motion.div>
  );
}

// ── toasts ─────────────────────────────────────────────────────────────────
const TOAST_KEYS = ["importMsg", "catStatus", "ytStatus", "stemProgress", "vidMsg", "melodyStatus", "miniStatus", "lyricStatus"] as const;
type ToastKey = (typeof TOAST_KEYS)[number];

function kindOf(msg: string): "ok" | "err" | "busy" | "info" {
  if (/^✓|✓|added|imported|saved|queued/i.test(msg)) return "ok";
  if (/⚠|fail|couldn|can't|cannot|error|rejected|refused|no match|nothing|isn't|aren't/i.test(msg)) return "err";
  if (/…|\.\.\.|%|ing\b/i.test(msg)) return "busy";
  return "info";
}

export function Toasts() {
  const vals = useStore(useShallow((s) => TOAST_KEYS.map((k) => (s as unknown as Record<ToastKey, string>)[k] || "")));
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const items = TOAST_KEYS.map((k, i) => ({ k, msg: vals[i] }))
    .filter((t) => t.msg && dismissed[t.k] !== t.msg)
    // these states are shown in place by the lyrics view; only outcomes toast
    .filter((t) => t.k !== "lyricStatus" || /^✓|✓|fail|cleared|imported/i.test(t.msg))
    .slice(-3);
  return (
    <div aria-live="polite" style={{ position: "fixed", left: 0, right: 0, bottom: "calc(var(--dock-h) + 84px)", display: "grid", justifyItems: "center", gap: 8, zIndex: 70, pointerEvents: "none" }}>
      <AnimatePresence>
        {items.map((t) => {
          const kind = kindOf(t.msg);
          return (
            <motion.div
              key={t.k}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={kind === "err" ? { opacity: 1, y: 0, scale: 1, x: [0, -6, 5, -3, 0] } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.2 } }}
              transition={spring.soft}
              role="status"
              style={{
                pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12, maxWidth: "min(92vw, 520px)",
                padding: "10px 10px 10px 16px", borderRadius: 16, background: "var(--text)", color: "var(--bg)",
                boxShadow: "var(--shadow-lg)", fontSize: 14, fontWeight: 520,
              }}
            >
              {kind === "busy" && <Loader size={14} />}
              {kind === "ok" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: ease.out, delay: 0.1 }} />
                </svg>
              )}
              {kind === "err" && <span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--danger)", flexShrink: 0 }} />}
              <span style={{ flex: 1 }}>{t.msg.replace(/^[✓✓⚠]\s*/, "")}</span>
              <button aria-label="Dismiss" onClick={() => setDismissed((d) => ({ ...d, [t.k]: t.msg }))} style={{ border: 0, background: "none", color: "inherit", opacity: 0.6, display: "grid", padding: 4 }}><I.close size={16} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── drop target ────────────────────────────────────────────────────────────
export function DropOverlay() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const plName = useStore((s) => {
    const id = s.viewMode.type === "pl" ? s.viewMode.id : s.playPl;
    return s.playlists.find((p) => p.id === id)?.name ?? "your library";
  });
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); };
    const overH = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overH);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overH);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return (
    <AnimatePresence>
      {over && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgb(var(--scrim) / 0.82)", display: "grid", placeItems: "center", pointerEvents: "none" }}
        >
          <svg style={{ position: "absolute", inset: 16, width: "calc(100% - 32px)", height: "calc(100% - 32px)" }} aria-hidden>
            <motion.rect x="1" y="1" width="99.6%" height="99.4%" rx="28" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="10 10" animate={{ strokeDashoffset: [0, -40] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </svg>
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={spring.pop} style={{ textAlign: "center" }}>
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} style={{ color: "var(--accent)", display: "grid", placeItems: "center", marginBottom: 14 }}>
              <I.upload size={54} />
            </motion.div>
            <div className="display" style={{ fontSize: 48 }}>Drop to add</div>
            <div className="muted" style={{ marginTop: 6 }}>into {plName.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── YouTube player host ────────────────────────────────────────────────────
// YouTube audio can't be analysed (it plays in YouTube's own iframe), and its
// terms want the player visible, so a YouTube track shows as a small floating
// video. The host lives for the session: destroying the iframe on every
// navigation would lose mobile playback permission.
export function YouTubeHost({ wide }: { wide: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const yt = useStore((s) => isYouTube(getCurrentTrack(s)));
  const stage = useStore((s) => s.stage);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (yt && !started && host.current) {
      setStarted(true);
      void ensurePlayer(host.current).catch(() => {});
    }
  }, [yt, started]);
  return (
    <motion.div
      animate={{ opacity: yt ? 1 : 0, scale: yt ? 1 : 0.8, y: yt ? 0 : 30 }}
      transition={spring.soft}
      style={{
        position: "fixed", right: 20, bottom: wide ? 110 : 150, width: stage ? 200 : 260, aspectRatio: "16 / 9", zIndex: 40,
        borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-lg)", background: "#000", pointerEvents: yt ? "auto" : "none",
      }}
      aria-hidden={!yt}
    >
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
    </motion.div>
  );
}
