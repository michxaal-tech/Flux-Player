// Up next: the rest of the playing list, in play order.
//
// Drag a row by its grip and the others make room; let go and it settles into
// its slot. Rows that join the queue rise in, rows that leave collapse out, and
// the list re-flows with layout animation so nothing jumps.
import { useMemo, useRef } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { artistOf, getPlayingList, useStore } from "../store/useStore";
import { playAt } from "../audio/transport";
import type { Track } from "../types";
import { Artwork } from "./Artwork";
import { I } from "./icons";
import { EmptyState } from "./kit";
import { ease, spring } from "./motion";

const SHOW = 60;

export function Queue() {
  const pl = useStore((s) => getPlayingList(s));
  const current = useStore((s) => s.current);
  const shuffle = useStore((s) => s.shuffle);
  const moveTrack = useStore((s) => s.moveTrack);
  const base = Math.max(0, current + 1);
  const upcoming = useMemo(() => pl.tracks.slice(base, base + SHOW), [pl.tracks, base]);
  const ids = upcoming.map((t) => t.id);
  const dragging = useRef<string | null>(null);
  if (!upcoming.length) {
    return <EmptyState title="That's the end of the list" body="Add more from the library — or use ‘Play next’ on any track." />;
  }
  return (
    <div className="scroll" style={{ height: "100%", paddingRight: 4 }}>
      {shuffle && <div className="eyebrow" style={{ margin: "0 0 10px 8px" }}>Shuffle is on — this is list order</div>}
      <Reorder.Group
        axis="y"
        values={ids}
        onReorder={(next) => {
          const id = dragging.current;
          if (!id) return;
          const from = ids.indexOf(id), to = next.indexOf(id);
          if (from >= 0 && to >= 0 && from !== to) moveTrack(pl.id, base + from, base + to);
        }}
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}
      >
        <AnimatePresence initial={false}>
          {upcoming.map((t, i) => (
            <QueueRow key={t.id} track={t} i={i} onPlay={() => void playAt(pl.id, base + i)} onDrag={(on) => { dragging.current = on ? t.id : null; }} />
          ))}
        </AnimatePresence>
      </Reorder.Group>
      {pl.tracks.length - base > SHOW && <div className="faint" style={{ padding: "12px 8px", fontSize: 13 }}>+ {pl.tracks.length - base - SHOW} more</div>}
    </div>
  );
}

function QueueRow({ track, i, onPlay, onDrag }: { track: Track; i: number; onPlay: () => void; onDrag: (on: boolean) => void }) {
  const controls = useDragControls();
  const artist = artistOf(track);
  return (
    <Reorder.Item
      value={track.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => onDrag(true)}
      onDragEnd={() => onDrag(false)}
      initial={{ opacity: 0, y: 16, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto", transition: { duration: 0.4, ease: ease.out, delay: Math.min(i, 12) * 0.03 } }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
      whileDrag={{ scale: 1.03, boxShadow: "var(--shadow-lg)", background: "var(--bg-raise)", zIndex: 5 }}
      transition={spring.slide}
      className="track-row"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 14, position: "relative" }}
    >
      <span className="mono faint" style={{ width: 20, fontSize: 11.5, textAlign: "right" }}>{i + 1}</span>
      <button onClick={onPlay} aria-label={`Play ${track.name}`} style={{ width: 40, height: 40, padding: 0, border: 0, background: "none", flexShrink: 0 }}>
        <Artwork track={track} radius={8} />
      </button>
      <button onClick={onPlay} style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "none", padding: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artist && track.name.startsWith(artist) ? track.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : track.name}</div>
        <div className="faint" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artist ?? "Unknown artist"}</div>
      </button>
      <span
        aria-label="Drag to reorder"
        role="button"
        tabIndex={-1}
        onPointerDown={(e) => controls.start(e)}
        style={{ cursor: "grab", color: "var(--text-3)", display: "grid", placeItems: "center", width: 30, height: 36, touchAction: "none" }}
      ><I.drag size={18} /></span>
    </Reorder.Item>
  );
}
