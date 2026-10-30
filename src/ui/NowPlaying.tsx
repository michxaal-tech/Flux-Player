// Listen — the now-playing view.
//
// A track change is one choreographed beat across the whole view:
//   • the sleeve slides out the way you went and tilts away, the next one
//     slides in from the other side (a stack of records, flipped through);
//   • the title re-sets letter by letter, the artist crossfades after it;
//   • the accent, the stage behind and the waveform all glide to the new
//     record's colour and shape over the same ~0.9s;
//   • the lyrics column rises in fresh.
// You can also throw the sleeve: drag it sideways and let go to skip.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, type PanInfo } from "framer-motion";
import { artistOf, getCurrentTrack, getPlayingList, useStore } from "../store/useStore";
import { nextTrack, playAt, prevTrack, setInstMode } from "../audio/transport";
import { Artwork } from "./Artwork";
import { KineticText } from "./Kinetic";
import { FluxLine } from "./FluxLine";
import { LikeButton, Transport, Volume } from "./Transport";
import { Lyrics } from "./Lyrics";
import { Queue } from "./Queue";
import { I } from "./icons";
import { EmptyState, Segmented, useMenuButton, type MenuItem } from "./kit";
import { ease, spring } from "./motion";
import { titleCase } from "./Library";
import { pickFiles } from "./files";
import { clock } from "../flux/clock";
import { sig } from "../flux/signals";
import { useSleepLeft } from "../hooks/useSleepLeft";

export function useTrackDirection(): 1 | -1 {
  const idx = useStore((s) => s.current);
  const id = useStore((s) => getCurrentTrack(s)?.id);
  const prev = useRef({ idx, id, dir: 1 as 1 | -1 });
  if (prev.current.id !== id) {
    prev.current.dir = idx < prev.current.idx && !(prev.current.idx > 0 && idx === 0) ? -1 : 1;
    prev.current.idx = idx;
    prev.current.id = id;
  }
  return prev.current.dir;
}

function Sleeve({ wide }: { wide: boolean }) {
  const track = useStore((s) => getCurrentTrack(s));
  const motionPref = useStore((s) => s.ui.motion);
  const dir = useTrackDirection();
  const rx = useSpring(0, { stiffness: 160, damping: 18 });
  const ry = useSpring(0, { stiffness: 160, damping: 18 });
  const dragX = useMotionValue(0);
  const tilt = motionPref === "full";
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tilt) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  };
  const onEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -90 || info.velocity.x < -600) nextTrack();
    else if (info.offset.x > 90 || info.velocity.x > 600) prevTrack();
  };
  return (
    <motion.div
      layoutId="np-art"
      transition={spring.soft}
      onPointerMove={onMove}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}
      style={{ position: "relative", width: wide ? "min(34vw, 46vh, 440px)" : "min(72vw, 38vh, 340px)", aspectRatio: "1 / 1", perspective: 1100, zIndex: 1 }}
    >
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={track?.id ?? "none"}
          custom={dir}
          variants={{
            enter: (d: number) => ({ x: d * 140, rotateY: d * -32, scale: 0.82, opacity: 0, filter: "blur(4px)" }),
            center: { x: 0, rotateY: 0, scale: 1, opacity: 1, filter: "blur(0px)" },
            exit: (d: number) => ({ x: d * -170, rotateY: d * 38, scale: 0.78, opacity: 0, filter: "blur(6px)", transition: { duration: 0.45, ease: ease.in } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ ...spring.soft, opacity: { duration: 0.35 } }}
          drag={track ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          onDragEnd={onEnd}
          style={{ position: "absolute", inset: 0, x: dragX, rotateX: rx, rotateY: ry, cursor: track ? "grab" : "default", touchAction: "pan-y" }}
          whileTap={{ cursor: "grabbing" }}
        >
          <Artwork track={track} radius={wide ? 20 : 16} shadow style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function TrackMenu() {
  const track = useStore((s) => getCurrentTrack(s));
  const instMode = useStore((s) => s.instMode);
  const stemProgress = useStore((s) => s.stemProgress);
  const loopA = useStore((s) => s.loopA);
  const loopB = useStore((s) => s.loopB);
  const [note, setNote] = useState(false);
  const menu = useMenuButton((): MenuItem[] => {
    if (!track) return [];
    return [
      { label: track.fxPin ? "Unpin FX from track" : "Pin current FX to track", icon: <I.sound size={17} />, onSelect: () => useStore.getState().togglePinCurrent() },
      {
        label: loopA === null ? "Loop: set start here" : loopB === null ? "Loop: set end here" : "Clear loop",
        icon: <I.repeat size={17} />,
        onSelect: () => {
          const t = clock.media();
          if (loopA === null) useStore.setState({ loopA: t });
          else if (loopB === null) useStore.setState(t > loopA ? { loopB: t } : { loopA: t });
          else useStore.setState({ loopA: null, loopB: null });
        },
      },
      track.hasInst
        ? { label: instMode ? "Play original (with vocals)" : "Play instrumental", icon: <I.note size={17} />, onSelect: () => void setInstMode(!instMode) }
        : {
          label: stemProgress ? `Separating… ${stemProgress}` : "Make instrumental (on-device)", icon: <I.note size={17} />, disabled: !!stemProgress,
          onSelect: () => {
            if (confirm("Generate an instrumental (vocals removed) version of this track?\n\nRuns entirely on this device — nothing is uploaded. First use downloads a ~64MB model (kept for later). Takes a few minutes per song.")) {
              void import("../audio/stems/separator").then((m) => m.generateInstrumental(track));
            }
          },
        },
      { label: track.note ? "Edit note" : "Add a note", icon: <I.edit size={17} />, onSelect: () => setNote(true) },
    ];
  });
  return (
    <>
      <button className="icon-btn" aria-label="Track options" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle}><I.more size={20} /></button>
      {menu.menu}
      <AnimatePresence>
        {note && track && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={spring.snap}
            style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 8, zIndex: 5 }}
          >
            <textarea
              autoFocus
              className="input"
              value={track.note}
              onChange={(e) => useStore.getState().updateTrack(track.id, { note: e.target.value })}
              onBlur={() => setNote(false)}
              onKeyDown={(e) => { if (e.key === "Escape") setNote(false); }}
              placeholder="Your note on this track — e.g. ‘the drop at 1:32’"
              style={{ height: 76, padding: 12, resize: "none", background: "var(--bg-raise)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Meta({ wide }: { wide: boolean }) {
  const track = useStore((s) => getCurrentTrack(s));
  const pl = useStore((s) => getPlayingList(s));
  const fxPinned = !!track?.fxPin;
  const loopOn = useStore((s) => s.loopA !== null);
  const sleepLeft = useSleepLeft();
  const dir = useTrackDirection();
  const artist = track ? artistOf(track) : undefined;
  const title = track ? (artist && track.name.startsWith(artist) ? track.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : track.name) : "";
  return (
    <div style={{ display: "grid", gap: 4, textAlign: wide ? "left" : "center", position: "relative" }}>
      <div className="eyebrow" style={{ display: "flex", gap: 10, justifyContent: wide ? "flex-start" : "center", alignItems: "center" }}>
        <span>From {titleCase(pl.name)}</span>
        {fxPinned && <Badge>FX pinned</Badge>}
        {loopOn && <Badge>Loop</Badge>}
        {track?.source === "youtube" && <Badge>YouTube</Badge>}
        {sleepLeft && <Badge>Sleep {sleepLeft}</Badge>}
      </div>
      <KineticText
        text={title || "Nothing playing"}
        dir={dir}
        as="h1"
        className="display"
        style={{ fontSize: wide ? "clamp(34px, 3.6vw, 58px)" : "clamp(28px, 7vw, 40px)", lineHeight: 1, overflowWrap: "anywhere" }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={artist ?? track?.id ?? "-"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.4, ease: ease.out } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
          style={{ fontSize: wide ? 18 : 16, color: "var(--text-2)", fontWeight: 520 }}
        >{artist ?? (track ? "Unknown artist" : "Pick a track to begin")}</motion.div>
      </AnimatePresence>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring.pop}
      style={{ padding: "2px 8px", borderRadius: 999, background: "rgb(var(--accent-rgb) / 0.16)", color: "var(--accent)", letterSpacing: "0.08em" }}
    >{children}</motion.span>
  );
}

/** The quiet tempo readout: honest about where it comes from. */
function TempoChip() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      let txt = "";
      const an = useStore.getState().analyzeStatus;
      if (an && /analys|decod/.test(an)) txt = an.replace("analysing", "reading the beat");
      else if (sig.playing && sig.confidence > 0.45 && sig.bpm > 0) txt = `${Math.round(sig.bpm)} BPM${sig.tempoSource === "live" ? " · listening" : ""}`;
      else if (sig.playing && sig.live) txt = "free time";
      if (txt !== last) { el.textContent = txt; last = txt; }
      el.style.opacity = txt ? "1" : "0";
      const dot = el.previousSibling as HTMLElement | null;
      if (dot) dot.style.transform = `scale(${sig.confidence > 0.45 ? 0.6 + sig.pulse * 0.8 : 0.6})`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="mono faint" title="Tempo from the track analysis (or listening, before it finishes). Shown only when the beat is steady enough to trust." style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 7, letterSpacing: "0.08em" }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: "var(--accent)", display: "inline-block", transition: "transform 80ms linear" }} />
      <span ref={ref} style={{ transition: "opacity var(--t3)" }} />
    </span>
  );
}

export function NowPlaying({ wide }: { wide: boolean }) {
  const track = useStore((s) => getCurrentTrack(s));
  const pane = useStore((s) => s.listenPane);
  const total = useStore((s) => s.playlists.reduce((n, p) => n + p.tracks.length, 0));
  const playPl = useStore((s) => s.playPl);
  if (!track && total === 0) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <EmptyState
          title="Bring your music"
          body="Drop audio files anywhere on this window, pick them from your device, or find something in Search. Everything stays on this device."
          action={
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" data-variant="accent" onClick={() => pickFiles()}><I.upload size={16} /> Add music</button>
              <button className="btn" onClick={() => useStore.setState({ view: "search" })}><I.search size={16} /> Search online</button>
            </div>
          }
        />
      </div>
    );
  }
  const paneEl = (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 14, minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: wide ? "flex-start" : "center", alignItems: "center", gap: 14 }}>
        <Segmented
          size="sm"
          label="Show"
          value={pane}
          onChange={(v) => useStore.setState({ listenPane: v })}
          options={[{ id: "lyrics", label: "Lyrics", icon: <I.lyrics size={15} /> }, { id: "queue", label: "Up next", icon: <I.queue size={15} /> }]}
        />
        {wide && <TempoChip />}
      </div>
      <div style={{ minHeight: 0, position: "relative" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pane + (track?.id ?? "")}
            initial={{ opacity: 0, y: 24, clipPath: "inset(0 0 30% 0)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.18, ease: ease.in } }}
            transition={{ duration: 0.55, ease: ease.out }}
            style={{ height: "100%" }}
          >
            {pane === "lyrics" ? <Lyrics /> : <Queue />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  if (!track) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <EmptyState title="Ready when you are" body="Press play to start the playlist, or pick a track from the library." action={<button className="btn" data-variant="accent" onClick={() => void playAt(playPl, 0)}>Play</button>} />
      </div>
    );
  }

  if (wide) {
    return (
      <div style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(340px, 0.9fr) minmax(360px, 1.1fr)", gap: "clamp(32px, 5vw, 88px)", alignItems: "stretch" }}>
        <div style={{ display: "grid", alignContent: "center", gap: 26, minHeight: 0 }}>
          <Sleeve wide />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: 520, position: "relative" }}>
            <div style={{ flex: 1, minWidth: 0 }}><Meta wide /></div>
            <LikeButton />
            <TrackMenu />
          </div>
          <div style={{ maxWidth: 520 }}><FluxLine track={track} /></div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 520, gap: 12, flexWrap: "wrap" }}>
            <Transport />
            <Volume width={110} />
          </div>
        </div>
        <div style={{ minHeight: 0, padding: "6vh 0 2vh" }}>{paneEl}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 18, justifyItems: "center", paddingBottom: 24 }}>
      <Sleeve wide={false} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", maxWidth: 520, position: "relative" }}>
        <LikeButton />
        <div style={{ flex: 1, minWidth: 0 }}><Meta wide={false} /></div>
        <TrackMenu />
      </div>
      <div style={{ width: "100%", maxWidth: 520 }}><FluxLine track={track} /></div>
      <Transport size={68} />
      <div style={{ width: "100%", maxWidth: 520, height: "56vh" }}>{paneEl}</div>
    </div>
  );
}
