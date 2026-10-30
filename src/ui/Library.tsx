// The library: playlists, songs, artists, liked, recent.
//
// Spatial continuity is the rule here. A playlist's collage cover is the same
// element as the header of its page — opening it, the cover grows into place
// and the tracks rise up under it; going back, it shrinks home into the grid.
// Rows enter in a short stagger, the playing row carries live meter bars, and
// reordering is a physical drag with the neighbours making room.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion, Reorder, useDragControls } from "framer-motion";
import { artistOf, getArtists, useStore } from "../store/useStore";
import { deletePlaylist, playAt, removeTrack } from "../audio/transport";
import { exportTrack } from "../audio/exporter";
import { TAGS } from "../constants";
import type { Playlist, Track } from "../types";
import { Artwork, useArt } from "./Artwork";
import { I } from "./icons";
import { EmptyState, Segmented, useMenuButton, type MenuItem } from "./kit";
import { ease, spring } from "./motion";
import { sig } from "../flux/signals";
import { pickFiles } from "./files";
import { EmojiSearch, LibraryAiBar, TrackAiMenu } from "../components/ai/LibraryAi";

type Tab = "playlists" | "songs" | "artists" | "liked" | "recent";

export function Library() {
  const [tab, setTab] = useState<Tab>("playlists");
  const [openPl, setOpenPl] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const playlists = useStore((s) => s.playlists);
  const aiReady = useStore((s) => s.aiReady);
  const open = playlists.find((p) => p.id === openPl) ?? null;
  // arriving from Search with a playlist picked: open straight onto it
  const libOpen = useStore((s) => s.libOpen);
  useEffect(() => {
    if (libOpen) { setOpenPl(libOpen); useStore.setState({ libOpen: null }); }
  }, [libOpen]);

  return (
    <LayoutGroup id="library">
      <AnimatePresence mode="popLayout" initial={false}>
        {open ? (
          <PlaylistPage key={`pl-${open.id}`} pl={open} onBack={() => setOpenPl(null)} />
        ) : (
          <motion.div
            key="index"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: ease.out }}
          >
            <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>{playlists.reduce((n, p) => n + p.tracks.length, 0)} tracks · {playlists.length} playlists</div>
                <motion.h1
                  className="display"
                  initial={{ clipPath: "inset(0 0 100% 0)", y: 18 }}
                  animate={{ clipPath: "inset(0 0 -10% 0)", y: 0 }}
                  transition={{ duration: 0.7, ease: ease.out }}
                  style={{ margin: 0, fontSize: "clamp(40px, 6vw, 72px)" }}
                >Library</motion.h1>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn" onClick={() => pickFiles()}><I.upload size={17} /> Add music</button>
                <button className="btn" data-variant="ghost" onClick={() => pickFiles(true)} title="Pick any file — for when the picker greys out audio">Any file…</button>
              </div>
            </header>
            {aiReady && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="instrument" style={{ marginBottom: 20, display: "grid", gap: 10 }}>
                <EmojiSearch />
                <LibraryAiBar />
              </motion.div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <div className="hscroll" style={{ maxWidth: "100%" }}>
                <Segmented
                  label="Library section"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { id: "playlists", label: "Playlists" },
                    { id: "songs", label: "Songs" },
                    { id: "artists", label: "Artists" },
                    { id: "liked", label: "Liked" },
                    { id: "recent", label: "Recent" },
                  ]}
                />
              </div>
              {tab !== "playlists" && tab !== "artists" && (
                <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
                  <I.search size={16} style={{ position: "absolute", left: 12, top: 13, color: "var(--text-3)" }} />
                  <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter tracks" style={{ paddingLeft: 36, height: 42 }} />
                </div>
              )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                transition={{ duration: 0.4, ease: ease.out }}
              >
                {tab === "playlists" && <PlaylistGrid onOpen={setOpenPl} />}
                {tab === "songs" && <SongList filter={q} which="all" />}
                {tab === "liked" && <SongList filter={q} which="liked" />}
                {tab === "recent" && <SongList filter={q} which="recent" />}
                {tab === "artists" && <Artists />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

// ── playlists ──────────────────────────────────────────────────────────────
function Collage({ pl, radius = 16, style }: { pl: Playlist; radius?: number; style?: CSSProperties }) {
  const firsts = pl.tracks.slice(0, 4);
  if (firsts.length < 4) return <Artwork track={firsts[0] ?? null} title={pl.name} radius={radius} style={style} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: radius, overflow: "hidden", aspectRatio: "1 / 1", ...style }}>
      {firsts.map((t) => <Artwork key={t.id} track={t} radius={0} />)}
    </div>
  );
}

function PlaylistGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const playlists = useStore((s) => s.playlists);
  const playPl = useStore((s) => s.playPl);
  const playing = useStore((s) => s.playing);
  const newPlaylist = useStore((s) => s.newPlaylist);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 22 }}>
      {playlists.map((p, i) => (
        <motion.button
          key={p.id}
          onClick={() => onOpen(p.id)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ease.out, delay: Math.min(i, 12) * 0.04 }}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.97 }}
          style={{ border: 0, background: "none", padding: 0, textAlign: "left", color: "inherit" }}
        >
          <motion.div layoutId={`pl-cover-${p.id}`} transition={spring.soft} style={{ borderRadius: 16, boxShadow: "var(--shadow)" }}>
            <Collage pl={p} />
          </motion.div>
          <motion.div layoutId={`pl-name-${p.id}`} transition={spring.soft} style={{ marginTop: 12, fontWeight: 650, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            {playPl === p.id && playing && <MeterBars />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleCase(p.name)}</span>
          </motion.div>
          <div className="faint" style={{ fontSize: 13 }}>{p.tracks.length} {p.tracks.length === 1 ? "track" : "tracks"}</div>
        </motion.button>
      ))}
      <motion.button
        onClick={newPlaylist}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.97 }}
        style={{ border: "1.5px dashed var(--line-2)", background: "transparent", borderRadius: 16, aspectRatio: "1 / 1", color: "var(--text-2)", display: "grid", placeItems: "center", gap: 6 }}
      >
        <span style={{ display: "grid", justifyItems: "center", gap: 8 }}><I.plus size={28} /> New playlist</span>
      </motion.button>
    </div>
  );
}

export const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : s;

function PlaylistPage({ pl, onBack }: { pl: Playlist; onBack: () => void }) {
  const rename = useStore((s) => s.renamePlaylist);
  const moveTrack = useStore((s) => s.moveTrack);
  const playlists = useStore((s) => s.playlists);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(titleCase(pl.name));
  const [confirm, setConfirm] = useState(false);
  const order = pl.tracks.map((t) => t.id);
  const dragging = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editing) onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onBack]);

  return (
    <motion.div key={pl.id} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <button className="btn" data-variant="ghost" onClick={onBack} style={{ marginBottom: 16, paddingLeft: 8 }}><I.back size={18} /> Library</button>
      <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 28 }}>
        <motion.div layoutId={`pl-cover-${pl.id}`} transition={spring.soft} style={{ width: "min(240px, 60vw)", borderRadius: 18, boxShadow: "var(--shadow-lg)" }}>
          <Collage pl={pl} radius={18} />
        </motion.div>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Playlist · {pl.tracks.length} tracks</div>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); rename(pl.id, name); setEditing(false); }}>
              <input
                autoFocus
                className="display"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { rename(pl.id, name); setEditing(false); }}
                aria-label="Playlist name"
                style={{ fontSize: "clamp(34px, 5vw, 60px)", background: "transparent", border: 0, borderBottom: "2px solid var(--accent)", width: "100%", color: "var(--text)", padding: 0 }}
              />
            </form>
          ) : (
            <motion.h1 layoutId={`pl-name-${pl.id}`} transition={spring.soft} className="display" onDoubleClick={() => setEditing(true)} style={{ margin: 0, fontSize: "clamp(34px, 5vw, 60px)", overflowWrap: "anywhere" }}>
              {titleCase(pl.name)}
            </motion.h1>
          )}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
            style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}
          >
            <button className="btn" data-variant="accent" disabled={!pl.tracks.length} onClick={() => { useStore.setState({ shuffle: false }); void playAt(pl.id, 0); }}>Play</button>
            <button className="btn" disabled={!pl.tracks.length} onClick={() => { useStore.setState({ shuffle: true }); void playAt(pl.id, Math.floor(Math.random() * pl.tracks.length)); }}><I.shuffle size={16} /> Shuffle</button>
            <button className="btn" data-variant="ghost" onClick={() => setEditing(true)}><I.edit size={16} /> Rename</button>
            {playlists.length > 1 && (
              <button className="btn" data-variant={confirm ? "accent" : "ghost"} style={confirm ? { background: "var(--danger)", color: "#fff" } : { color: "var(--danger)" }}
                onClick={() => { if (confirm) { deletePlaylist(pl.id); onBack(); } else { setConfirm(true); setTimeout(() => setConfirm(false), 3000); } }}
              ><I.trash size={16} /> {confirm ? "Delete — sure?" : "Delete"}</button>
            )}
          </motion.div>
        </div>
      </div>
      {pl.tracks.length ? (
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={(next) => {
            const id = dragging.current;
            if (!id) return;
            const from = order.indexOf(id), to = next.indexOf(id);
            if (from >= 0 && to >= 0 && from !== to) moveTrack(pl.id, from, to);
          }}
          style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}
        >
          {pl.tracks.map((t, i) => (
            <DraggableRow key={t.id} track={t} plId={pl.id} idx={i} onDragStart={() => { dragging.current = t.id; }} onDragEnd={() => { dragging.current = null; }} />
          ))}
        </Reorder.Group>
      ) : (
        <EmptyState title="Empty playlist" body="Drop audio files anywhere on the window, or add them here." action={<button className="btn" data-variant="accent" onClick={() => { useStore.setState({ viewMode: { type: "pl", id: pl.id } }); pickFiles(); }}><I.upload size={16} /> Add music</button>} />
      )}
    </motion.div>
  );
}

function DraggableRow({ track, plId, idx, onDragStart, onDragEnd }: { track: Track; plId: string; idx: number; onDragStart: () => void; onDragEnd: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={track.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(idx, 14) * 0.025, duration: 0.4, ease: ease.out } }}
      whileDrag={{ scale: 1.02, boxShadow: "var(--shadow-lg)", background: "var(--bg-raise)", zIndex: 5 }}
      style={{ borderRadius: 14, position: "relative" }}
    >
      <TrackRow track={track} plId={plId} idx={idx} handle={(
        <span
          aria-label="Drag to reorder"
          onPointerDown={(e) => controls.start(e)}
          style={{ cursor: "grab", color: "var(--text-3)", display: "grid", placeItems: "center", width: 22, touchAction: "none" }}
        ><I.drag size={18} /></span>
      )} />
    </Reorder.Item>
  );
}

// ── song lists ─────────────────────────────────────────────────────────────
const ROW_H = 62;

function SongList({ filter, which }: { filter: string; which: "all" | "liked" | "recent" }) {
  const playlists = useStore((s) => s.playlists);
  const sortBy = useStore((s) => s.sortBy);
  const entries = useMemo(() => {
    let out: { tr: Track; plId: string; idx: number }[] = [];
    for (const p of playlists) p.tracks.forEach((tr, idx) => out.push({ tr, plId: p.id, idx }));
    if (which === "liked") out = out.filter((e) => e.tr.fav);
    if (which === "recent") out = out.filter((e) => e.tr.lastPlayedAt).sort((a, b) => b.tr.lastPlayedAt - a.tr.lastPlayedAt).slice(0, 100);
    const qq = filter.trim().toLowerCase();
    if (qq) out = out.filter((e) => e.tr.name.toLowerCase().includes(qq) || (artistOf(e.tr) ?? "").toLowerCase().includes(qq));
    if (which === "all") {
      if (sortBy === "name") out.sort((a, b) => a.tr.name.localeCompare(b.tr.name));
      else if (sortBy === "plays") out.sort((a, b) => (b.tr.plays || 0) - (a.tr.plays || 0));
      else out.sort((a, b) => b.tr.addedAt - a.tr.addedAt);
    }
    return out;
  }, [playlists, which, filter, sortBy]);

  // simple windowing so a library of thousands scrolls like a library of ten
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState([0, 40]);
  useEffect(() => {
    const scroller = host.current?.closest(".scroll") as HTMLElement | null;
    if (!scroller) return;
    const on = () => {
      const top = (host.current?.offsetTop ?? 0);
      const a = Math.max(0, Math.floor((scroller.scrollTop - top) / ROW_H) - 8);
      const b = a + Math.ceil(scroller.clientHeight / ROW_H) + 16;
      setRange((r) => (r[0] === a && r[1] === b ? r : [a, b]));
    };
    on();
    scroller.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { scroller.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [entries.length]);

  if (!entries.length) {
    return (
      <EmptyState
        title={which === "liked" ? "Nothing liked yet" : which === "recent" ? "Nothing played yet" : filter ? "No matches" : "Your library is empty"}
        body={which === "liked" ? "Tap the heart while something plays and it collects here." : filter ? "Try a shorter or different word." : "Drop audio files anywhere on the window, or search online sources."}
        action={which === "all" && !filter ? <button className="btn" data-variant="accent" onClick={() => pickFiles()}><I.upload size={16} /> Add music</button> : undefined}
      />
    );
  }
  const visible = entries.slice(range[0], range[1]);
  return (
    <div>
      {which === "all" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Segmented size="sm" label="Sort" value={sortBy} onChange={(v) => useStore.setState({ sortBy: v })} options={[{ id: "added", label: "Recent" }, { id: "name", label: "A–Z" }, { id: "plays", label: "Most played" }]} />
        </div>
      )}
      <div ref={host} style={{ position: "relative", height: entries.length * ROW_H }}>
        {visible.map((e, k) => {
          const i = range[0] + k;
          return (
            <motion.div
              key={e.tr.id}
              initial={i < 16 ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: ease.out, delay: i < 16 ? i * 0.025 : 0 }}
              style={{ position: "absolute", left: 0, right: 0, top: i * ROW_H, height: ROW_H }}
            >
              <TrackRow track={e.tr} plId={e.plId} idx={e.idx} showSource={playlists.length > 1} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Artists() {
  const playlists = useStore((s) => s.playlists);
  const artists = useMemo(() => getArtists(playlists), [playlists]);
  const [open, setOpen] = useState<string | null>(null);
  if (!artists.length) return <EmptyState title="No artists yet" body={'Artists come from track metadata, or from "Artist - Title" file names.'} />;
  if (open) {
    const tracks: { tr: Track; plId: string; idx: number }[] = [];
    for (const p of playlists) p.tracks.forEach((tr, idx) => { if (artistOf(tr) === open) tracks.push({ tr, plId: p.id, idx }); });
    return (
      <div>
        <button className="btn" data-variant="ghost" onClick={() => setOpen(null)} style={{ marginBottom: 12, paddingLeft: 8 }}><I.back size={18} /> Artists</button>
        <h2 className="display" style={{ fontSize: 44, margin: "0 0 18px" }}>{open}</h2>
        {tracks.map((e) => <TrackRow key={e.tr.id} track={e.tr} plId={e.plId} idx={e.idx} />)}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 18 }}>
      {artists.map((a, i) => {
        const first = playlists.flatMap((p) => p.tracks).find((t) => artistOf(t) === a.name) ?? null;
        return (
          <motion.button
            key={a.name}
            onClick={() => setOpen(a.name)}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring.soft, delay: Math.min(i, 16) * 0.03 }}
            whileHover={{ y: -3 }}
            style={{ border: 0, background: "none", padding: 0, color: "inherit", textAlign: "center" }}
          >
            <Artwork track={first} radius={999} />
            <div style={{ marginTop: 10, fontWeight: 650 }}>{a.name}</div>
            <div className="faint" style={{ fontSize: 13 }}>{a.count} {a.count === 1 ? "track" : "tracks"}</div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── a track row ────────────────────────────────────────────────────────────
export function MeterBars({ size = 14 }: { size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const bands = [sig.bass, sig.mid, sig.high];
      for (let i = 0; i < 3; i++) {
        const b = el.children[i] as HTMLElement;
        const v = sig.playing ? 0.25 + Math.min(1, bands[i] * 1.2) * 0.75 : 0.25;
        b.style.transform = `scaleY(${v.toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span ref={ref} aria-label="Now playing" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: size, width: size }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: "100%", borderRadius: 2, background: "var(--accent)", transformOrigin: "bottom", transition: "transform 90ms linear" }} />)}
    </span>
  );
}

export function TrackRow({ track, plId, idx, handle, showSource }: { track: Track; plId: string; idx: number; handle?: React.ReactNode; showSource?: boolean }) {
  const isCur = useStore((s) => s.playPl === plId && s.current === idx);
  const playing = useStore((s) => s.playing);
  const playlists = useStore((s) => s.playlists);
  const toggleFav = useStore((s) => s.toggleFav);
  const aiReady = useStore((s) => s.aiReady);
  const art = useArt(track);
  const artist = artistOf(track);
  const title = artist && track.name.startsWith(artist) ? track.name.replace(/^\s*.+?\s+[-–—]\s+/, "") : track.name;
  const [confirmRm, setConfirmRm] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const menu = useMenuButton((): MenuItem[] => [
    { label: "Play next", icon: <I.queue size={17} />, onSelect: () => useStore.getState().playNextQueue(track) },
    {
      label: "Add to playlist", icon: <I.playlist size={17} />, subTitle: "Add to…",
      sub: [
        ...playlists.filter((p) => p.id !== plId).map((p) => ({ label: titleCase(p.name), icon: <I.plus size={16} />, onSelect: () => useStore.getState().copyTrack(track, p.id) })),
        { label: "New playlist", icon: <I.plus size={16} />, onSelect: () => { useStore.getState().newPlaylist(); const s = useStore.getState(); s.copyTrack(track, s.playlists[s.playlists.length - 1].id); } },
      ],
    },
    {
      label: "Tags", icon: <I.note size={17} />, subTitle: "Tags",
      sub: TAGS.map((tg) => ({ label: `${track.tags.includes(tg) ? "✓ " : ""}#${tg.toLowerCase()}`, keep: true, onSelect: () => useStore.getState().toggleTag(track.id, tg) })),
    },
    {
      label: "Export", icon: <I.upload size={17} />, subTitle: track.fxPin ? "Export (pinned FX)" : "Export (current FX)",
      sub: [
        { label: "WAV", onSelect: () => void exportTrack(track, "wav") },
        { label: "MP3", onSelect: () => void exportTrack(track, "mp3") },
      ],
    },
    ...(aiReady ? [{ label: "AI: notes & cover", icon: <I.sparkle size={17} />, onSelect: () => setAiOpen(true) }] : []),
    { label: confirmRm ? "Remove — click again" : "Remove from playlist", icon: <I.trash size={17} />, danger: true, keep: !confirmRm, onSelect: () => { if (confirmRm) removeTrack(track.id, plId); else setConfirmRm(true); } },
  ]);
  useEffect(() => { if (!menu.open) setConfirmRm(false); }, [menu.open]);
  const plName = showSource ? playlists.find((p) => p.id === plId)?.name : undefined;
  return (
    <div
      className="track-row"
      data-current={isCur}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, height: ROW_H, padding: "0 8px", borderRadius: 14 }}
      onDoubleClick={() => void playAt(plId, idx)}
    >
      {handle}
      <button
        onClick={() => void playAt(plId, idx)}
        aria-label={`Play ${track.name}`}
        style={{ position: "relative", width: 44, height: 44, padding: 0, border: 0, background: "none", flexShrink: 0, borderRadius: 9, overflow: "hidden" }}
      >
        <Artwork track={track} radius={9} />
        <span className="row-play" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: `${art.palette[0]}aa`, color: "#fff" }}>
          {isCur && playing ? <MeterBars /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
        </span>
      </button>
      <div style={{ flex: 1, minWidth: 0, cursor: "default" }} onClick={() => void playAt(plId, idx)}>
        <div style={{ fontWeight: 600, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isCur ? "var(--accent)" : "var(--text)", transition: "color var(--t3)" }}>{title}</div>
        <div className="faint" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {artist ?? "Unknown artist"}
          {track.source && <span> · {track.source === "youtube" ? "YouTube" : track.source}</span>}
          {plName && <span> · {titleCase(plName)}</span>}
        </div>
      </div>
      {track.plays > 0 && <span className="mono faint hide-narrow" style={{ fontSize: 11.5 }}>{track.plays}×</span>}
      <motion.button className="icon-btn" aria-label={track.fav ? "Unlike" : "Like"} data-on={track.fav} whileTap={{ scale: 0.8 }} onClick={() => toggleFav(track.id)}>
        <motion.span animate={{ scale: track.fav ? [1, 1.3, 1] : 1 }} style={{ display: "grid" }}><I.heart size={18} fill={track.fav ? "currentColor" : "none"} /></motion.span>
      </motion.button>
      <button className="icon-btn" aria-label="More" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle}><I.more size={18} /></button>
      {menu.menu}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            key="ai"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={spring.snap}
            className="instrument"
            style={{ position: "absolute", right: 8, top: ROW_H - 4, zIndex: 20, width: "min(420px, 90vw)", padding: 10 }}
          >
            <TrackAiMenu track={track} onClose={() => setAiOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
