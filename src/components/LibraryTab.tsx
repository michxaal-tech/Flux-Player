import { useMemo, useRef, useState } from "react";
import type React from "react";
import { BORDER, CARD, CYAN, MAG, MONO, TAGS } from "../constants";
import { deletePlaylist, playAt, removeTrack } from "../audio/transport";
import { exportTrack } from "../audio/exporter";
import { getCurrentTrack, getFavCount, getViewEntries, getViewingPlId, useStore } from "../store/useStore";
import { chip } from "./ui";

export function LibraryTab({ onLoadClick }: { onLoadClick: () => void }) {
  const playlists = useStore((s) => s.playlists);
  const viewMode = useStore((s) => s.viewMode);
  const search = useStore((s) => s.search);
  const sortBy = useStore((s) => s.sortBy);
  const playPl = useStore((s) => s.playPl);
  const currentTrack = useStore(getCurrentTrack);
  const favCount = useStore(getFavCount);
  const entries = useMemo(
    () => getViewEntries({ playlists, viewMode, search, sortBy }),
    [playlists, viewMode, search, sortBy]
  );
  const viewingPlId = useStore(getViewingPlId);
  const exporting = useStore((s) => s.exporting);
  const set = useStore((s) => s.set);
  const toggleFav = useStore((s) => s.toggleFav);
  const newPlaylist = useStore((s) => s.newPlaylist);
  const renamePlaylist = useStore((s) => s.renamePlaylist);
  const moveTrack = useStore((s) => s.moveTrack);
  const movePlaylist = useStore((s) => s.movePlaylist);
  const copyTrack = useStore((s) => s.copyTrack);
  const playNextQueue = useStore((s) => s.playNextQueue);

  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragPl = useRef<number | null>(null);

  const viewingList = playlists.find((p) => p.id === viewingPlId);
  const canReorder = viewMode.type === "pl" && sortBy === "added" && !search;

  const doRename = () => {
    if (!renameVal.trim() || !viewingPlId) {
      setRenaming(false);
      return;
    }
    renamePlaylist(viewingPlId, renameVal);
    setRenaming(false);
  };

  return (
    <div>
      <input
        type="text" value={search} onChange={(e) => set({ search: e.target.value })} placeholder="🔎 Search your library…"
        style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", padding: "11px 13px", fontSize: 13, marginBottom: 10 }}
      />

      <div className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
        <button onClick={() => set({ viewMode: { type: "fav" } })} style={chip(viewMode.type === "fav", MAG)}>♥ FAVORITES ({favCount})</button>
        <button onClick={() => set({ viewMode: { type: "recent" } })} style={chip(viewMode.type === "recent")}>🕐 RECENT</button>
        {TAGS.map((tg) => (
          <button key={tg} onClick={() => set({ viewMode: { type: "tag", tag: tg } })} style={chip(viewMode.type === "tag" && viewMode.tag === tg)}>#{tg}</button>
        ))}
      </div>
      <div className="hscroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, alignItems: "center" }}>
        {playlists.map((p, pi) => (
          <button
            key={p.id}
            draggable
            onDragStart={() => { dragPl.current = pi; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragPl.current !== null && dragPl.current !== pi) movePlaylist(dragPl.current, pi);
              dragPl.current = null;
            }}
            onClick={() => { set({ viewMode: { type: "pl", id: p.id } }); setRenaming(false); setConfirmDel(false); }}
            style={chip(viewingPlId === p.id)}
          >
            {p.name} <span style={{ opacity: 0.6 }}>({p.tracks.length})</span>
          </button>
        ))}
        <button onClick={newPlaylist} style={chip(false, MAG)}>＋ NEW</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {viewingPlId && (
          <>
            <button
              onClick={onLoadClick}
              style={{
                flex: 1, minWidth: 160, padding: "11px", borderRadius: 12, cursor: "pointer",
                background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)",
                fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em",
              }}
            >＋ LOAD INTO “{viewingList?.name}”</button>
            {renaming ? (
              <span style={{ display: "flex", gap: 6 }}>
                <input
                  type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRename()}
                  style={{ background: "rgba(255,255,255,0.07)", border: BORDER, borderRadius: 8, color: "#fff", padding: "8px 10px", fontSize: 12, width: 120 }}
                  autoFocus
                />
                <button onClick={doRename} style={chip(true)}>✓</button>
              </span>
            ) : (
              <button onClick={() => { setRenaming(true); setRenameVal(viewingList?.name || ""); }} style={chip(false)}>✎</button>
            )}
            {playlists.length > 1 && (
              confirmDel
                ? <button onClick={() => { deletePlaylist(viewingPlId); setConfirmDel(false); }} style={chip(true, "#FF4949")}>SURE?</button>
                : <button onClick={() => setConfirmDel(true)} style={chip(false, "#FF4949")}>🗑</button>
            )}
          </>
        )}
        <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)" }}>SORT</span>
        {([["added", "ADDED"], ["name", "A-Z"], ["plays", "PLAYS"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => set({ sortBy: k })} style={chip(sortBy === k)}>{l}</button>
        ))}
      </div>

      {exporting && (
        <div style={{ padding: "9px 12px", marginBottom: 8, borderRadius: 10, border: `1px solid ${CYAN}44`, background: "rgba(83,233,255,0.07)", color: CYAN, fontSize: 12, fontFamily: MONO }}>
          ⏳ {exporting}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {entries.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, padding: 24, textAlign: "center" }}>
            {search ? "No matches." : viewMode.type === "fav" ? "No favorites yet — tap ♡ on a track." : viewMode.type === "recent" ? "Nothing played yet." : viewMode.type === "tag" ? "No tracks with this tag yet." : "This playlist is empty."}
          </div>
        )}
        {entries.map(({ tr, plId, idx }) => {
          const isPlaying = playPl === plId && currentTrack?.id === tr.id;
          return (
            <div
              key={tr.id}
              className={canReorder && dragOver === idx && dragIdx !== idx ? "drag-over" : undefined}
              draggable={canReorder}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e: React.DragEvent) => {
                if (!canReorder) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOver(idx);
              }}
              onDrop={(e: React.DragEvent) => {
                if (!canReorder) return;
                e.preventDefault();
                e.stopPropagation();
                if (dragIdx !== null && dragIdx !== idx) moveTrack(plId, dragIdx, idx);
                setDragIdx(null);
                setDragOver(null);
              }}
              onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
              style={{
                padding: "10px 12px", borderRadius: 10, fontSize: 13.5, display: "flex", gap: 9, alignItems: "center",
                background: isPlaying ? "rgba(83,233,255,0.1)" : CARD,
                border: isPlaying ? `1px solid rgba(83,233,255,0.5)` : BORDER,
                opacity: dragIdx === idx ? 0.4 : 1,
                cursor: canReorder ? "grab" : undefined,
              }}
            >
              <button onClick={() => toggleFav(tr.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: tr.fav ? MAG : "rgba(255,255,255,0.25)", padding: 0 }}>
                {tr.fav ? "♥" : "♡"}
              </button>
              <span onClick={() => playAt(plId, idx)} style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", color: isPlaying ? CYAN : "rgba(255,255,255,0.85)" }}>
                {tr.fxPin && "📌 "}{tr.name}
                {tr.tags?.length > 0 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{tr.tags.map((t2) => `#${t2}`).join(" ")}</span>}
              </span>
              {tr.plays > 0 && <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.4 }}>{tr.plays}×</span>}
              <div style={{ position: "relative" }}>
                <button onClick={() => setRowMenu(rowMenu === tr.id ? null : tr.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 15 }}>⋯</button>
                {rowMenu === tr.id && (
                  <div style={{ position: "absolute", right: 0, top: 24, zIndex: 5, background: "#14161d", border: BORDER, borderRadius: 10, padding: 6, width: 190, boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
                    <div onClick={() => { playNextQueue(tr); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: CYAN }}>⏭ Play next</div>
                    {canReorder && <div onClick={() => { moveTrack(plId, idx, idx - 1); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "rgba(255,255,255,0.85)" }}>▲ Move up</div>}
                    {canReorder && <div onClick={() => { moveTrack(plId, idx, idx + 1); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "rgba(255,255,255,0.85)" }}>▼ Move down</div>}
                    <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", padding: "6px 8px 2px" }}>EXPORT WITH FX</div>
                    <div onClick={() => { exportTrack(tr, "wav"); setRowMenu(null); }} style={{ padding: "7px 8px", fontSize: 12.5, cursor: "pointer", color: MAG }}>⬇ WAV {tr.fxPin ? "(pinned FX)" : "(current FX)"}</div>
                    <div onClick={() => { exportTrack(tr, "mp3"); setRowMenu(null); }} style={{ padding: "7px 8px", fontSize: 12.5, cursor: "pointer", color: MAG }}>⬇ MP3 {tr.fxPin ? "(pinned FX)" : "(current FX)"}</div>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", padding: "6px 8px 2px" }}>COPY TO…</div>
                    {playlists.filter((p) => p.id !== plId).map((p) => (
                      <div key={p.id} onClick={() => { copyTrack(tr, p.id); setRowMenu(null); }} style={{ padding: "7px 8px", fontSize: 12.5, cursor: "pointer", color: CYAN }}>→ {p.name}</div>
                    ))}
                    <div onClick={() => { removeTrack(tr.id, plId); setRowMenu(null); }} style={{ padding: "8px", fontSize: 12.5, cursor: "pointer", color: "#FF6B6B", borderTop: BORDER, marginTop: 4 }}>✕ Remove</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
