// Lyrics.
//
// Real DOM text, so it is selectable, crisp at any size and readable by a
// screen reader — but driven per frame from the shared clock through refs, not
// through React state, so following the song costs no re-renders.
//
// What is shown is only ever what the timing supports:
//   • word timing (enhanced LRC, karaoke SYLT, word-level transcription): each
//     word fills as it is sung;
//   • line timing: the active line lights as a whole;
//   • no timing: the words as a static page, marked as such.
// Long instrumental gaps get a countdown that fills toward the next line
// rather than leaving the last words hanging.
//
// The column glides to the active line on a spring that retargets from
// wherever it is, so seeking and skipping never snap. Scrolling by hand pauses
// the follow; it drifts back a few seconds after you let go.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { clock } from "../flux/clock";
import { lineAt, wordAt, GAP_MIN } from "../flux/lyricTime";
import { seek } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import type { LyricLineData, Track } from "../types";
import { EmptyState, Loader } from "./kit";
import { I } from "./icons";
import { ease, spring } from "./motion";

export function Lyrics({ variant = "pane" }: { variant?: "pane" | "stage" }) {
  const track = useStore((s) => getCurrentTrack(s));
  const lyricState = useStore((s) => s.lyricState);
  const lyricsOn = useStore((s) => s.lyricsOn);
  const prefs = useStore((s) => s.lyricPrefs);
  const lines = track?.lyrics;
  const searching = lyricState.id === track?.id && lyricState.state === "searching";

  if (!track) return variant === "pane" ? <EmptyState title="Nothing playing" body="Pick something from your library and the words will appear here." /> : null;
  if (!lyricsOn || !prefs.show) return null;
  if (!lines?.length) {
    if (variant === "stage") return null;
    if (searching) return <LyricSkeleton />;
    return <NoLyrics track={track} state={lyricState.id === track.id ? lyricState.state : ""} />;
  }
  if (track.lyricsTimed === false) return <StaticLyrics key={track.id} lines={lines} variant={variant} />;
  return <TimedLyrics key={track.id} lines={lines} variant={variant} />;
}

function LyricSkeleton() {
  return (
    <div style={{ display: "grid", gap: 18, padding: "18vh 4px 0" }} aria-label="Searching for lyrics">
      {[78, 62, 88, 54, 70].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 30, width: `${w}%`, animationDelay: `${i * 120}ms` }} />
      ))}
      <div className="faint" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}><Loader size={14} /> Looking for the words…</div>
    </div>
  );
}

function NoLyrics({ track, state }: { track: Track; state: string }) {
  const [open, setOpen] = useState(false);
  const aiReady = useStore((s) => s.aiReady);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div>
      <EmptyState
        kind={state === "error" ? "error" : "empty"}
        title={state === "error" ? "Couldn't reach the lyrics service" : "No lyrics yet"}
        body={state === "error"
          ? "Check your connection — or attach a .lrc file you have."
          : "Nothing timed was found for this track. Search by artist and title, read them from the file, or attach a .lrc."}
        action={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <button className="btn" data-variant="accent" onClick={() => setOpen((v) => !v)}><I.search size={16} /> Search</button>
            <button className="btn" onClick={() => void import("../lyrics").then((m) => m.lyricsFromTrackFile(track))}>From file tags</button>
            <button className="btn" onClick={() => file.current?.click()}><I.upload size={16} /> .lrc</button>
            {aiReady && <button className="btn" onClick={() => void import("../lyrics").then((m) => m.transcribeTrack(track))}><I.sparkle size={16} /> Transcribe</button>}
            <input ref={file} type="file" accept=".lrc,text/plain" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void import("../lyrics").then((m) => m.importLrcFile(track, f));
              e.target.value = "";
            }} />
          </div>
        }
      />
      <AnimatePresence>{open && <LyricSearch track={track} />}</AnimatePresence>
    </div>
  );
}

export function LyricSearch({ track }: { track: Track }) {
  const picks = useStore((s) => s.lyricPicks);
  const status = useStore((s) => s.lyricStatus);
  const guess = track.name.split(/\s+[-–—]\s+/);
  const [title, setTitle] = useState(guess.length > 1 ? guess.slice(1).join(" - ") : track.name);
  const [artist, setArtist] = useState(track.artist ?? (guess.length > 1 ? guess[0] : ""));
  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: ease.out }}
      style={{ overflow: "hidden" }}
      onSubmit={(e) => { e.preventDefault(); void import("../lyrics").then((m) => m.searchLyricPicks(title, artist)); }}
    >
      <div style={{ display: "grid", gap: 8, padding: "4px 2px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Song title" />
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" aria-label="Artist" />
          <button className="btn" data-variant="accent" type="submit">Find</button>
        </div>
        {status && <div className="faint" style={{ fontSize: 13 }}>{status}</div>}
        <motion.div layout style={{ display: "grid", gap: 4 }}>
          <AnimatePresence initial={false}>
            {picks.map((p, i) => (
              <motion.button
                key={`${p.artist}-${p.title}-${p.duration}`}
                type="button"
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0 }}
                className="btn"
                data-variant="ghost"
                style={{ justifyContent: "space-between", height: 44, borderRadius: 12 }}
                onClick={() => void import("../lyrics").then((m) => m.applyLyricPick(track, p))}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title} — <span className="muted">{p.artist}</span></span>
                <span className="mono faint" style={{ fontSize: 11.5 }}>{p.lines} lines · {Math.round(p.duration)}s</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.form>
  );
}

function StaticLyrics({ lines, variant }: { lines: LyricLineData[]; variant: "pane" | "stage" }) {
  const prefs = useStore((s) => s.lyricPrefs);
  if (variant === "stage") return null;
  return (
    <div className="scroll" style={{ height: "100%", padding: "8px 4px 40px" }}>
      <div className="eyebrow" style={{ marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 6, height: 6, borderRadius: 6, background: "var(--text-3)" }} /> Not timed — shown as text
      </div>
      {lines.map((l, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.02, 0.5) } }}
          style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22 * prefs.size, lineHeight: 1.25, color: "var(--text-2)", textAlign: prefs.align }}
        >{l.text}</motion.p>
      ))}
    </div>
  );
}

function TimedLyrics({ lines, variant }: { lines: LyricLineData[]; variant: "pane" | "stage" }) {
  const prefs = useStore((s) => s.lyricPrefs);
  const box = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const lineEls = useRef<(HTMLDivElement | null)[]>([]);
  const wordEls = useRef<(HTMLSpanElement | null)[][]>([]);
  const gapEl = useRef<HTMLDivElement>(null);
  const [userScroll, setUserScroll] = useState(false);
  const st = useRef({ y: 0, v: 0, target: 0, active: -2, manual: 0, lastManual: 0, settled: false });
  const stage = variant === "stage";
  // in the stage only a window of lines around the active one is shown
  const hasWords = useMemo(() => lines.some((l) => l.words?.length), [lines]);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const s = st.current;
      const t = clock.audible() + useStore.getState().lyricPrefs.offsetMs / 1000;
      const at = lineAt(lines, t);
      const focus = at.index >= 0 ? at.index : at.last;
      if (at.index !== s.active) {
        s.active = at.index;
        lineEls.current.forEach((el, i) => {
          if (!el) return;
          const d = focus < 0 ? i + 1 : i - focus;
          el.dataset.state = i === at.index ? "active" : d < 0 ? "past" : "future";
          el.dataset.dist = String(Math.min(4, Math.abs(d)));
        });
      }
      // word fill on the active line
      if (at.index >= 0) {
        const L = lines[at.index];
        const ws = wordEls.current[at.index];
        if (L.words && ws) {
          const k = wordAt(L, t);
          for (let j = 0; j < ws.length; j++) {
            const el = ws[j];
            if (!el) continue;
            let p = 0;
            if (j < k) p = 1;
            else if (j === k) {
              const w = L.words[j];
              const e = w.e ?? L.words[j + 1]?.t ?? w.t + 0.6;
              p = Math.min(1, Math.max(0, (t - w.t) / Math.max(0.08, e - w.t)));
            } else if (k >= L.words.length) p = 1;
            el.style.setProperty("--p", p.toFixed(3));
          }
        }
      }
      // instrumental countdown
      const g = gapEl.current;
      if (g) {
        const show = at.index < 0 && at.span >= GAP_MIN && at.gapLeft > 1.2;
        g.dataset.show = show ? "1" : "0";
        if (show) g.style.setProperty("--g", (1 - at.gapLeft / at.gapLen).toFixed(3));
      }
      // follow: put the focus line at ~38% of the box (stage: centre)
      const el = focus >= 0 ? lineEls.current[focus] : lineEls.current[0];
      const bh = box.current?.clientHeight ?? 0;
      if (el && bh) {
        const anchor = stage ? 0.5 : 0.36;
        s.target = -(el.offsetTop + el.offsetHeight / 2 - bh * anchor) + (focus < 0 ? bh * 0.12 : 0);
      }
      if (s.manual && now - s.lastManual > 3200) { s.manual = 0; setUserScroll(false); }
      const goal = s.target + s.manual;
      // critically-damped-ish spring with a hint of follow-through
      const k = 140, c = 22;
      s.v += (k * (goal - s.y) - c * s.v) * dt;
      s.y += s.v * dt;
      if (Math.abs(goal - s.y) > bh * 2) { s.y = goal + Math.sign(s.y - goal) * bh * 0.6; s.v *= 0.3; }
      if (col.current) col.current.style.transform = `translate3d(0, ${s.y.toFixed(2)}px, 0)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lines, stage]);

  const onWheel = (e: React.WheelEvent) => {
    if (stage) return;
    const s = st.current;
    s.manual -= e.deltaY;
    s.lastManual = performance.now();
    setUserScroll(true);
  };
  const touchY = useRef<number | null>(null);

  const size = (stage ? 46 : 36) * prefs.size;
  const center = prefs.align === "center" || stage;
  return (
    <div
      ref={box}
      onWheel={onWheel}
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => {
        if (touchY.current === null || stage) return;
        const y = e.touches[0].clientY;
        st.current.manual += y - touchY.current;
        st.current.lastManual = performance.now();
        touchY.current = y;
        setUserScroll(true);
      }}
      onTouchEnd={() => { touchY.current = null; }}
      className="lyrics"
      data-variant={variant}
      data-highlight={prefs.highlight}
      style={{
        position: "relative", height: "100%", overflow: "hidden",
        maskImage: "linear-gradient(to bottom, transparent 0, #000 14%, #000 78%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 14%, #000 78%, transparent 100%)",
      }}
    >
      <div ref={col} style={{ willChange: "transform", padding: stage ? "0 6vw" : "0 4px" }}>
        {lines.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: ease.out, delay: Math.min(i, 10) * 0.035 }}
          >
            <div
              ref={(el) => { lineEls.current[i] = el; }}
              className="lyric-line"
              data-state="future"
              data-dist="4"
              onClick={() => seek(Math.max(0, l.t - 0.05))}
              style={{ fontSize: size, textAlign: center ? "center" : "left", transformOrigin: center ? "center" : "left center" }}
            >
              {l.words?.length ? (
                l.words.map((w, j) => (
                  <span key={j}>
                    <span ref={(el) => { (wordEls.current[i] ??= [])[j] = el; }} className="lyric-word">{w.text}</span>{" "}
                  </span>
                ))
              ) : (
                <span className="lyric-text">{l.text}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
      <div ref={gapEl} className="lyric-gap" data-show="0" aria-hidden style={{ justifyContent: center ? "center" : "flex-start" }}>
        {[0, 1, 2].map((k) => <span key={k} style={{ ["--k" as string]: k }} />)}
      </div>
      <AnimatePresence>
        {userScroll && !stage && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={spring.snap}
            className="btn"
            data-size="sm"
            onClick={() => { st.current.manual = 0; setUserScroll(false); }}
            style={{ position: "absolute", bottom: 14, left: "50%", x: "-50%", zIndex: 2 }}
          >Back to now</motion.button>
        )}
      </AnimatePresence>
      {!hasWords && !stage && (
        <div className="eyebrow" style={{ position: "absolute", top: 4, right: 4, opacity: 0.7 }} title="This source times whole lines, not individual words">Line timing</div>
      )}
    </div>
  );
}
