// AI surfaces for the library tab: emoji-only search and a per-track menu
// (studio notes, cover art).
import { useState } from "react";
import { BORDER, CYAN, MAG } from "../../constants";
import { aiPlaylist, emojiSearch, errText, studioNotes } from "../../ai/features";
import { coverArt } from "../../ai/features";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";
import type { Track } from "../../types";
import { aiInput, ResultText, Spark } from "./AiBits";

/** 11. EMOJI SEARCH — emoji-only query, results shown as a filtered strip. */
export function EmojiSearch() {
  const busy = useStore((s) => s.aiBusy);
  const playlists = useStore((s) => s.playlists);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Track[] | null>(null);
  const [msg, setMsg] = useState("");

  const go = async () => {
    if (!q.trim() || busy) return;
    setMsg("");
    setHits(null);
    try {
      const ids = await emojiSearch(q.trim());
      const lib = playlists.flatMap((p) => p.tracks);
      const found = ids.map((id) => lib.find((t) => t.id === id)).filter((t): t is Track => !!t);
      if (!found.length) setMsg("Nothing in the library matches that mood.");
      setHits(found);
    } catch (e) { setMsg(errText(e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder="✦ search with emoji only… 🌧️🌃🚗"
          style={aiInput}
        />
        <button
          onClick={go}
          disabled={busy || !q.trim()}
          style={{
            flexShrink: 0, padding: "0 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer", background: mix(MAG, 16),
            border: `1px solid ${mix(MAG, 45)}`, color: MAG, opacity: busy || !q.trim() ? 0.45 : 1,
          }}
        >✦ FIND</button>
      </div>
      {!!msg && <ResultText text={msg} />}
      {!!hits?.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: mix(MAG, 80) }}>
            {hits.length} MATCH{hits.length === 1 ? "" : "ES"} — TAP TO PLAY
          </div>
          {hits.slice(0, 12).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                const s = useStore.getState();
                const pl = s.playlists.find((p) => p.tracks.some((x) => x.id === t.id));
                if (!pl) return;
                import("../../audio/transport").then((m) =>
                  m.playAt(pl.id, pl.tracks.findIndex((x) => x.id === t.id))
                );
              }}
              style={{
                textAlign: "left", padding: "8px 11px", borderRadius: 9, fontSize: 11.5, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: BORDER, color: "rgba(255,255,255,0.8)",
              }}
            >▸ {t.name}</button>
          ))}
          <button
            onClick={() => { setHits(null); setQ(""); }}
            style={{ padding: "6px", borderRadius: 8, fontSize: 9.5, cursor: "pointer", background: "none", border: "none", color: "rgba(255,255,255,0.35)" }}
          >clear</button>
        </div>
      )}
    </div>
  );
}

/** 7. AI PLAYLIST launcher for the library tab. */
export function LibraryAiBar() {
  const busy = useStore((s) => s.aiBusy);
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter" || !text.trim()) return;
            setOut("");
            try { setOut(await aiPlaylist(text.trim())); setText(""); } catch (er) { setOut(errText(er)); }
          }}
          placeholder="✦ describe a playlist to build…"
          style={aiInput}
        />
        <button
          onClick={async () => {
            if (!text.trim() || busy) return;
            setOut("");
            try { setOut(await aiPlaylist(text.trim())); setText(""); } catch (e) { setOut(errText(e)); }
          }}
          disabled={busy || !text.trim()}
          style={{
            flexShrink: 0, padding: "0 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer", background: mix(CYAN, 14),
            border: `1px solid ${mix(CYAN, 42)}`, color: CYAN, opacity: busy || !text.trim() ? 0.45 : 1,
          }}
        >✦ BUILD</button>
      </div>
      {!!out && <ResultText text={out} />}
    </div>
  );
}

/** 20. STUDIO NOTES + 10. COVER ART for one track. */
export function TrackAiMenu({ track, onClose }: { track: Track; onClose: () => void }) {
  const busy = useStore((s) => s.aiBusy);
  const [out, setOut] = useState("");

  const run = async (fn: () => Promise<string | boolean>) => {
    setOut("");
    try {
      const r = await fn();
      setOut(typeof r === "string" ? r : r ? "✓ cover art generated" : "⚠ couldn't use that artwork");
    } catch (e) { setOut(errText(e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "9px 11px", background: "rgba(255,255,255,0.03)", border: BORDER, borderRadius: 10, marginTop: 6 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: mix(MAG, 80), display: "flex", justifyContent: "space-between" }}>
        <span><Spark size={9} /> AI · {track.name.slice(0, 28)}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12 }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => run(() => studioNotes(track.id))} disabled={busy} style={mini(CYAN, busy)}>✦ STUDIO NOTES</button>
        <button onClick={() => run(() => coverArt("track", track.id, track.name))} disabled={busy} style={mini(MAG, busy)}>✦ COVER ART</button>
      </div>
      {!!out && <ResultText text={out} />}
      {!!track.note && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>📝 {track.note}</div>}
    </div>
  );
}

const mini = (color: string, disabled: boolean) => ({
  flex: 1, padding: "8px", borderRadius: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
  cursor: disabled ? "wait" : "pointer", background: mix(color, 12),
  border: `1px solid ${mix(color, 36)}`, color, opacity: disabled ? 0.5 : 1,
} as const);
