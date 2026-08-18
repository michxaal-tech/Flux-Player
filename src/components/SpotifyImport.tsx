// Spotify import: reads a public link's track list with no account setup, then
// builds the playlist out of files already on this device plus 30-second
// preview clips for the rest. See spotify.ts for what is and isn't fetched.
import { useEffect, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../constants";
import {
  beginSpotifyAuth, buildPlaylistFromMatches, disconnectSpotify, fetchSpotifyItems,
  importSpotifyPlaylist, loadClientId, matchLibrary, missingList, parseSpotifyLink,
  redirectUri, saveClientId,
} from "../spotify";
import type { MatchRow } from "../spotify";
import { useStore } from "../store/useStore";
import { mix } from "../theme";
import { Module } from "./ui";

export function SpotifyImport({ onLoadClick }: { onLoadClick?: () => void }) {
  const ready = useStore((s) => s.spotifyReady);
  const libraryCount = useStore((s) => new Set(s.playlists.flatMap((p) => p.tracks.map((t) => t.fileId))).size);
  const [clientId, setClientId] = useState("");
  const [savedId, setSavedId] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => { loadClientId().then(setSavedId); }, [ready]);

  const found = (rows ?? []).filter((r) => r.track).length;
  const missing = (rows ?? []).length - found;

  const doRead = async () => {
    const ref = parseSpotifyLink(link);
    if (!ref) { setStatus("⚠ That doesn't look like a Spotify playlist, album or track link"); return; }
    setBusy(true);
    setStatus("Reading from Spotify…");
    setRows(null);
    try {
      const { title: t, items } = await fetchSpotifyItems(ref);
      if (!items.length) { setStatus("⚠ Nothing in that playlist"); setBusy(false); return; }
      setTitle(t);
      const m = matchLibrary(items);
      setRows(m);
      setStatus("");
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    }
    setBusy(false);
  };

  const doImport = async () => {
    if (!rows) return;
    setBusy(true);
    setStatus(`Fetching audio… 0/${rows.length}`);
    try {
      const r = await importSpotifyPlaylist(title, rows, (d, n) => setStatus(`Fetching audio… ${d}/${n}`));
      const bits = [`${r.tracks} tracks`];
      if (r.fromLibrary) bits.push(`${r.fromLibrary} from your own files`);
      if (r.previews) bits.push(`${r.previews} as 30s previews`);
      setStatus(r.tracks
        ? `✓ Created “${title}” — ${bits.join(", ")}${r.missing ? ` · ${r.missing} couldn't be found anywhere` : ""}`
        : "⚠ Couldn't find audio for any of those tracks");
      setRows(null);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <Module
      title="🟢 SPOTIFY IMPORT"
      extra={
        <span style={{ fontSize: 9.5, letterSpacing: "0.14em", color: ready ? CYAN : "rgba(255,255,255,0.35)", fontFamily: MONO }}>
          {ready ? "CONNECTED" : "NO SETUP NEEDED"}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
          Paste any Spotify link — song, album or playlist — and FLUX rebuilds it here.
          Tracks you already have are used <strong style={{ color: "rgba(255,255,255,0.75)" }}>at full length</strong>;
          the rest come in as the same 30-second preview clips Spotify's embed player hands out,
          which the visualizer and FX rack run on like any other file.
          Spotify's actual streams are DRM-protected and stay on Spotify.
        </div>
        <div style={{ fontSize: 9.5, lineHeight: 1.55, color: "rgba(255,255,255,0.33)" }}>
          Spotify won't answer this page directly, so a public reader service fetches the link's
          page for it. Only the link itself is sent, and it's already public.
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doRead(); }}
            placeholder="paste a song, playlist or album link…"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fff", outline: "none" }}
          />
          <button
            onClick={doRead}
            disabled={busy || !link.trim()}
            style={{ flexShrink: 0, padding: "0 15px", borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer", background: mix(CYAN, 16), border: `1px solid ${mix(CYAN, 45)}`, color: CYAN, opacity: busy || !link.trim() ? 0.45 : 1 }}
          >READ</button>
        </div>

        {!!status && (
          <div style={{ fontSize: 10.5, lineHeight: 1.5, color: status.startsWith("⚠") ? "#FF9A9A" : CYAN }}>{status}</div>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 11, color: "#fff" }}>
              <span style={{ color: CYAN, fontWeight: 700 }}>{rows.length}</span> tracks ·{" "}
              <span style={{ color: found ? CYAN : "rgba(255,255,255,0.5)" }}>{found} already yours</span>
              {missing > 0 && <span style={{ color: "rgba(255,255,255,0.5)" }}> · {missing} as previews</span>}
            </div>
            {found === 0 && libraryCount === 0 && onLoadClick && (
              <div style={{ fontSize: 10.5, lineHeight: 1.6, color: "rgba(255,255,255,0.62)", background: "rgba(255,255,255,0.04)", border: BORDER, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>Your library is empty, so all of these will come in as 30-second previews. Add your own files and FLUX uses those instead, at full length.</div>
                <button
                  onClick={onLoadClick}
                  style={{ padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: mix(CYAN, 14), border: `1px solid ${mix(CYAN, 42)}`, color: CYAN }}
                >＋ ADD MUSIC FILES FROM THIS DEVICE</button>
              </div>
            )}
            <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", gap: 8, alignItems: "center", padding: "6px 9px", borderRadius: 8,
                    background: r.track ? mix(CYAN, 7) : "rgba(255,255,255,0.03)",
                    border: `1px solid ${r.track ? mix(CYAN, 22) : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <span style={{ fontSize: 10, color: r.track ? CYAN : "rgba(255,255,255,0.3)", flexShrink: 0 }}>{r.track ? "✓" : "♪"}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.item.artists ? `${r.item.artists} — ${r.item.name}` : r.item.name}
                  </span>
                  <span style={{ fontSize: 8.5, fontFamily: MONO, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
                    {r.track ? `${Math.round(r.score * 100)}% YOURS` : r.item.preview ? "30s" : "SEARCH"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={doImport}
                disabled={busy}
                style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer", background: mix(CYAN, 14), border: `1px solid ${mix(CYAN, 42)}`, color: CYAN, opacity: busy ? 0.5 : 1 }}
              >IMPORT PLAYLIST ({rows.length})</button>
              {found > 0 && (
                <button
                  onClick={() => {
                    const { added } = buildPlaylistFromMatches(title, rows);
                    setStatus(`✓ Created “${title}” with ${added} of your own files`);
                    setRows(null);
                  }}
                  disabled={busy}
                  title="Skip the previews — use only files already on this device"
                  style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.6)" }}
                >MINE ONLY ({found})</button>
              )}
              {missing > 0 && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(missingList(rows)).then(
                      () => setStatus(`✓ Copied ${missing} track names to the clipboard`),
                      () => setStatus("⚠ Couldn't reach the clipboard")
                    );
                  }}
                  style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: mix(MAG, 12), border: `1px solid ${mix(MAG, 38)}`, color: MAG }}
                >COPY LIST</button>
              )}
            </div>
          </>
        )}

        {!ready ? (
          <>
            <button
              onClick={() => setShowSetup((v) => !v)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", textAlign: "left", padding: 0 }}
            >{showSetup ? "▾" : "▸"} CONNECT AN APP (OPTIONAL)</button>
            {showSetup && (
              <div style={{ fontSize: 10, lineHeight: 1.65, color: "rgba(255,255,255,0.5)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: "rgba(255,255,255,0.6)" }}>
                  Everything above works without this. Connecting only adds what a public link can't reach:
                  your private playlists and Liked Songs.
                </div>
                <div>1. Open <span style={{ color: CYAN }}>developer.spotify.com/dashboard</span> and create an app (free).</div>
                <div>2. In its settings, add this exact Redirect URI:</div>
                <code style={{ fontFamily: MONO, fontSize: 9.5, padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: BORDER, color: CYAN, wordBreak: "break-all" }}>
                  {redirectUri()}
                </code>
                <div>3. Copy the app's Client ID and paste it below. It isn't a secret and never leaves this browser.</div>
                <div>4. Still in the dashboard, open <span style={{ color: CYAN }}>User Management</span> and add your own
                  Spotify account (name + the email on the account). New apps start in Development mode, and
                  anyone not on that list gets a 403.</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={clientId || savedId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Spotify Client ID"
                    spellCheck={false}
                    style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fff", outline: "none", fontFamily: MONO }}
                  />
                  <button
                    onClick={async () => {
                      const id = (clientId || savedId).trim();
                      if (!id) { setStatus("⚠ Paste your Client ID first"); return; }
                      await saveClientId(id);
                      try { await beginSpotifyAuth(); } catch (e) { setStatus(`⚠ ${(e as Error).message}`); }
                    }}
                    style={{ flexShrink: 0, padding: "0 15px", borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: mix(CYAN, 16), border: `1px solid ${mix(CYAN, 45)}`, color: CYAN }}
                  >CONNECT</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={async () => { await disconnectSpotify(); setRows(null); setStatus("Disconnected."); }}
            style={{ padding: "8px", borderRadius: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.6)" }}
          >DISCONNECT SPOTIFY</button>
        )}
      </div>
    </Module>
  );
}
