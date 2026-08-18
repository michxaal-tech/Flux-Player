import { useEffect, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../constants";
import { useStore } from "../store/useStore";
import { chip, Module, NewTag } from "./ui";
import { mix } from "../theme";
import { importTrack, SOURCES, sourceById, type CatTrack } from "../catalogue";
import { fmt } from "../utils";

/**
 * Browse online catalogues and pull tracks straight into the library.
 *
 * Three sources rather than one, because none covers the whole problem on its
 * own: Apple has essentially every song ever released but hands out a
 * 30-second preview of each, the Internet Archive has millions of full-length
 * recordings that are live sets and old records rather than chart pop, and
 * Audius has full-length tracks from independent artists. Which of those
 * matters depends entirely on what you came for, so the trade-off is stated
 * rather than decided on the user's behalf.
 */
export function Discover() {
  const status = useStore((s) => s.catStatus);
  const playlists = useStore((s) => s.playlists);
  const viewMode = useStore((s) => s.viewMode);
  const fullOnly = useStore((s) => s.fullOnly);

  const [open, setOpen] = useState(false);
  const [srcId, setSrcId] = useState(SOURCES[0].id);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState(SOURCES[0].genres[0]);
  const [rows, setRows] = useState<CatTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const src = sourceById(srcId);
  const target = viewMode.type === "pl" ? viewMode.id : playlists[0]?.id;

  const load = async (fn: () => Promise<CatTrack[]>) => {
    setBusy(true);
    setErr("");
    try {
      setRows(await fn());
    } catch (e) {
      setErr(e instanceof Error && /Failed to fetch/.test(e.message)
        ? "Couldn't reach the catalogue — check your connection."
        : `Search failed: ${e instanceof Error ? e.message : "unknown"}`);
      setRows([]);
    }
    setBusy(false);
  };

  // show something on first open rather than an empty box
  useEffect(() => {
    if (open && rows.length === 0 && !busy) load(() => src.browse(genre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickSource = (id: string) => {
    const s = sourceById(id);
    setSrcId(id);
    setGenre(s.genres[0]);
    setQ("");
    load(() => (q.trim() ? s.search(q) : s.browse(s.genres[0])));
  };

  const add = async (t: CatTrack) => {
    // the filter below already hides these; this is the second lock, so a stale
    // row from a previous source can't slip a 30-second file into the library
    if (!target || (fullOnly && t.preview)) return;
    setAdding(t.id);
    await importTrack(t, target);
    setAdding(null);
  };

  /** what the list would show if previews were allowed, and what it shows now */
  const shown = fullOnly ? rows.filter((t) => !t.preview) : rows;
  const hidden = rows.length - shown.length;

  return (
    <Module
      title="🌐 DISCOVER"
      extra={
        <button onClick={() => setOpen((v) => !v)} style={{ ...chip(open, MAG), padding: "5px 10px", fontSize: 9.5 }}>
          {open ? "HIDE" : "BROWSE"}
        </button>
      }
    >
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
        Search real catalogues and add tracks straight to your library — no account, no
        subscription. Streamed tracks get the full FX rack, visualizer and Revoice, exactly like
        your own files.
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            {SOURCES.map((s) => (
              <button
                key={s.id}
                data-src={s.id}
                onClick={() => pickSource(s.id)}
                style={{ ...chip(srcId === s.id, MAG), flex: 1, padding: "8px 6px", fontSize: 10 }}
              >{s.label}{s.id === "archive" && <NewTag />}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginBottom: 8 }}>
            {src.blurb}
          </div>

          <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
            <input
              data-discoverq
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) load(() => src.search(q)); }}
              placeholder={src.id === "apple" ? "any artist or song…" : "search artists or tracks…"}
              style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 9, padding: "8px 10px", fontSize: 11, color: "#fff", outline: "none" }}
            />
            <button
              onClick={() => q.trim() && load(() => src.search(q))}
              style={{ ...chip(true, MAG), padding: "8px 12px", fontSize: 9.5, flexShrink: 0 }}
            >🔍</button>
          </div>

          <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8 }}>
            <button
              data-fullonly
              onClick={() => useStore.setState({ fullOnly: !fullOnly })}
              title="Hide 30-second excerpts, so only whole tracks can be added"
              style={{ ...chip(fullOnly, CYAN), padding: "6px 10px", fontSize: 9 }}
            >{fullOnly ? "✓ FULL TRACKS ONLY" : "PREVIEWS SHOWN"}</button>
            {hidden > 0 && (
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.38)" }}>
                {hidden} excerpt{hidden === 1 ? "" : "s"} hidden
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {src.genres.map((g) => (
              <button
                key={g}
                onClick={() => { setGenre(g); setQ(""); load(() => src.browse(g)); }}
                style={{ ...chip(genre === g && !q), padding: "6px 9px", fontSize: 9 }}
              >{g}</button>
            ))}
          </div>

          {busy && <div style={{ fontSize: 11, color: CYAN, fontFamily: MONO }}>loading…</div>}
          {!!err && <div style={{ fontSize: 11, color: "#FF6B6B", lineHeight: 1.5 }}>{err}</div>}
          {!!status && <div style={{ fontSize: 11, color: CYAN, fontFamily: MONO, marginBottom: 6 }}>{status}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
            {shown.map((t) => (
              <div
                key={`${t.source}-${t.id}`}
                data-cat={t.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 9px",
                  borderRadius: 9, background: "rgba(255,255,255,0.04)", border: BORDER,
                }}
              >
                {t.artwork
                  ? <img src={t.artwork} alt="" width={34} height={34} style={{ borderRadius: 6, flexShrink: 0, objectFit: "cover" }} />
                  : <div style={{ width: 34, height: 34, borderRadius: 6, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span
                      onClick={() => { setQ(t.artist); load(() => src.byArtist(t.artistKey)); }}
                      style={{ cursor: "pointer", color: MAG }}
                    >{t.artist}</span>
                    {" · "}{fmt(t.duration)}{t.genre ? ` · ${t.genre}` : ""}
                    {t.preview && (
                      <span style={{ marginLeft: 5, padding: "1px 5px", borderRadius: 5, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", color: MAG, border: `1px solid ${mix(MAG, 34)}` }}>
                        EXCERPT
                      </span>
                    )}
                  </div>
                </div>
                <button
                  data-add={t.id}
                  disabled={!target || adding === t.id}
                  onClick={() => add(t)}
                  style={{ ...chip(false, CYAN), padding: "6px 10px", fontSize: 9.5, flexShrink: 0, opacity: target ? 1 : 0.4 }}
                >{adding === t.id ? "…" : "＋ ADD"}</button>
              </div>
            ))}
          </div>

          {!busy && !err && shown.length === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
              {hidden > 0 ? (
                <>
                  Every result here is a 30-second excerpt — that's all {src.label} serves.
                  {" "}
                  <button
                    onClick={() => useStore.setState({ fullOnly: false })}
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: CYAN, cursor: "pointer", textDecoration: "underline" }}
                  >Show them anyway</button>, or try ARCHIVE or AUDIUS for whole tracks.
                </>
              ) : "Nothing found. Try a different search, or pick a genre above."}
            </div>
          )}
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", lineHeight: 1.5, marginTop: 8 }}>
            Tap an artist's name to see the rest of their catalogue. Added tracks are stored on this
            device like any other import.
            {!target && <> <b>Make a playlist first</b> — there's nowhere to add to yet.</>}
          </div>
        </div>
      )}
    </Module>
  );
}
