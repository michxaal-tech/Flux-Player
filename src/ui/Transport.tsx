// Transport controls around the play button, plus the like heart and volume.
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nextTrack, prevTrack, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { clock } from "../flux/clock";
import { I, VolumeGlyph } from "./icons";
import { PlayButton } from "./PlayButton";
import { spring } from "./motion";
import { Slider } from "./kit";

/** Skip button whose glyph shoots in its direction on each press. */
function Skip({ dir, onClick, size = 48 }: { dir: 1 | -1; onClick: () => void; size?: number }) {
  const [n, setN] = useState(0);
  return (
    <motion.button
      className="icon-btn"
      aria-label={dir > 0 ? "Next track" : "Previous track"}
      title={dir > 0 ? "Next (→)" : "Previous (←)"}
      whileTap={{ scale: 0.86 }}
      transition={spring.pop}
      onClick={() => { setN((k) => k + 1); onClick(); }}
      style={{ width: size, height: size, color: "var(--text)" }}
    >
      <motion.span
        key={n}
        initial={n ? { x: dir * 7, opacity: 0.4 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={spring.pop}
        style={{ display: "grid" }}
      >
        {dir > 0 ? <I.next size={24} /> : <I.prev size={24} />}
      </motion.span>
    </motion.button>
  );
}

export function ShuffleButton() {
  const on = useStore((s) => s.shuffle);
  return (
    <motion.button
      className="icon-btn"
      aria-label="Shuffle"
      aria-pressed={on}
      data-on={on}
      title="Shuffle (S)"
      whileTap={{ scale: 0.86 }}
      onClick={() => useStore.setState({ shuffle: !on })}
    >
      <motion.span animate={{ rotate: on ? 0 : -180, scaleY: on ? 1 : -1 }} transition={spring.slide} style={{ display: "grid" }}>
        <I.shuffle size={20} />
      </motion.span>
      <Dot on={on} />
    </motion.button>
  );
}

export function RepeatButton() {
  const repeat = useStore((s) => s.repeat);
  const next = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
  return (
    <motion.button
      className="icon-btn"
      aria-label={`Repeat: ${repeat}`}
      data-on={repeat !== "off"}
      title="Repeat (R)"
      whileTap={{ scale: 0.86 }}
      onClick={() => useStore.setState({ repeat: next })}
    >
      <motion.span animate={{ rotate: repeat === "off" ? 0 : 360 }} transition={{ ...spring.soft }} style={{ display: "grid" }}>
        <I.repeat size={20} />
      </motion.span>
      <AnimatePresence>
        {repeat === "one" && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring.pop}
            className="mono"
            style={{
              position: "absolute", top: 5, right: 4, width: 15, height: 15, borderRadius: "50%", fontSize: 9.5, fontWeight: 700,
              background: "var(--accent)", color: "var(--on-accent)", display: "grid", placeItems: "center",
            }}
          >1</motion.span>
        )}
      </AnimatePresence>
      <Dot on={repeat !== "off"} />
    </motion.button>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
      transition={spring.pop}
      style={{ position: "absolute", bottom: 3, left: "50%", marginLeft: -2, width: 4, height: 4, borderRadius: 4, background: "var(--accent)" }}
    />
  );
}

/** The like heart: fills with a pop and throws a small burst. */
export function LikeButton({ size = 40 }: { size?: number }) {
  const tr = useStore((s) => getCurrentTrack(s));
  const toggleFav = useStore((s) => s.toggleFav);
  const on = !!tr?.fav;
  const [burst, setBurst] = useState(0);
  return (
    <motion.button
      className="icon-btn"
      aria-label={on ? "Unlike" : "Like"}
      aria-pressed={on}
      data-on={on}
      title="Like (F)"
      disabled={!tr}
      whileTap={{ scale: 0.8 }}
      onClick={() => { if (!tr) return; if (!on) setBurst((b) => b + 1); toggleFav(tr.id); }}
      style={{ width: size, height: size }}
    >
      <motion.span animate={{ scale: on ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.4 }} style={{ display: "grid" }}>
        <I.heart size={21} fill={on ? "currentColor" : "none"} style={{ transition: "fill var(--t2)" }} />
      </motion.span>
      {burst > 0 && (
        <span key={burst} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const a = (i / 7) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                animate={{ x: Math.cos(a) * 20, y: Math.sin(a) * 20, scale: 0, opacity: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 5, margin: -2.5, borderRadius: 5, background: "var(--accent)" }}
              />
            );
          })}
        </span>
      )}
    </motion.button>
  );
}

export function Volume({ width = 120 }: { width?: number }) {
  const volume = useStore((s) => s.volume);
  const last = useRef(0.85);
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 6 }}
      onWheel={(e) => {
        const v = Math.min(1, Math.max(0, volume - Math.sign(e.deltaY) * 0.04));
        useStore.setState({ volume: v });
      }}
    >
      <motion.button
        className="icon-btn"
        aria-label={volume > 0 ? "Mute" : "Unmute"}
        title="Mute (M)"
        whileTap={{ scale: 0.86 }}
        onClick={() => {
          if (volume > 0) { last.current = volume; useStore.setState({ volume: 0 }); }
          else useStore.setState({ volume: last.current || 0.85 });
        }}
      >
        <VolumeGlyph level={volume} size={21} />
      </motion.button>
      <div style={{ width }}>
        <Slider label="Volume" value={volume} onChange={(v) => useStore.setState({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
    </div>
  );
}

export function Transport({ size = 72, compact }: { size?: number; compact?: boolean }) {
  const playing = useStore((s) => s.playing);
  const hasTrack = useStore((s) => s.current >= 0);
  const busy = playing && clock.buffering;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: compact ? 4 : 14 }}>
      {!compact && <ShuffleButton />}
      <Skip dir={-1} onClick={prevTrack} size={compact ? 40 : 52} />
      <PlayButton playing={playing && hasTrack} onToggle={togglePlay} size={size} busy={busy} />
      <Skip dir={1} onClick={() => nextTrack()} size={compact ? 40 : 52} />
      {!compact && <RepeatButton />}
    </div>
  );
}
