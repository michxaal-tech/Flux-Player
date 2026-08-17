// Spotify playlist import: reads track metadata via the official API and
// matches it against files already on this device. No audio is downloaded.
import { useEffect, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../constants";
import {
  beginSpotifyAuth, buildPlaylistFromMatches, disconnectSpotify, fetchSpotifyItems,
  loadClientId, matchLibrary, missingList, parseSpotifyLink, redirectUri, saveClientId,
} from "../spotify";
import type { MatchRow } from "../spotify";
import { useStore } from "../store/useStore";
import { mix } from "../theme";
import { Module } from "./ui";

export function SpotifyImport() {
  const ready = useStore((s) => s.spotifyReady);
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

  const doImport = async () => {
    const ref = parseSpotifyLink(link);
    if (!ref) { setStatus("⚠ That doesn't look like a Spotify playlist, album or track link"); return; }
    setBusy(true);
    setStatus("Reading from Spotify…");
    setRows(null);
    try {
      const { title: t, items } = await fetchSpotifyItems(ref);
      if (!items.length) { setStatus("⚠ Nothing in that playlist"); setBusy(false); return; }
      setTitle(t);
      setStatus(`Matching ${items.length} tracks against your library…`);
      const m = matchLibrary(items);
      setRows(m);
      setStatus("");
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
          {ready ? "CONNECTED" : "OPTIONAL"}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
          Paste a Spotify link and FLUX matches it against the audio you already have.
          <strong style={{ color: "rgba(255,255,255,0.75)" }}> Single song links work right away</strong> — no setup.
          Playlists and albums need a free one-time connection to read their track list.
          It reads names and artists only; Spotify's audio is DRM-protected and stays on Spotify.
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doImport(); }}
            placeholder="paste a song, playlist or album link…"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fff", outline: "none" }}
          />
          <button
            onClick={doImport}
            disabled={busy || !link.trim()}
            style={{ flexShrink: 0, padding: "0 15px", borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: busy ? "wait" : "pointer", background: mix(CYAN, 16), border: `1px solid ${mix(CYAN, 45)}`, color: CYAN, opacity: busy || !link.trim() ? 0.45 : 1 }}
          >IMPORT</button>
        </div>

        {!ready ? (
          <>
            <button
              onClick={() => setShowSetup((v) => !v)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", textAlign: "left", padding: 0 }}
            >{showSetup ? "▾" : "▸"} ONE-TIME SETUP</button>
            {showSetup && (
              <div style={{ fontSize: 10, lineHeight: 1.65, color: "rgba(255,255,255,0.5)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: "rgba(255,255,255,0.6)" }}>Only needed for playlists and albums.</div>
            <div>1. Open <span style={{ color: CYAN }}>developer.spotify.com/dashboard</span> and create an app (free).</div>
                <div>2. In its settings, add this exact Redirect URI:</div>
                <code style={{ fontFamily: MONO, fontSize: 9.5, padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: BORDER, color: CYAN, wordBreak: "break-all" }}>
                  {redirectUri()}
                </code>
                <div>3. Copy the app's Client ID and paste it below. It isn't a secret and never leaves this browser.</div>
                <div>4. Still in the dashboard, open <span style={{ color: CYAN }}>User Management</span> and add your own
                  Spotify account (name + the email on the account). New apps start in Development mode, and
                  anyone not on that list gets a 403.</div>
                <div style={{ color: "rgba(255,200,120,0.75)" }}>
                  Note: Spotify blocks its own editorial and algorithmic playlists — Discover Weekly, Daily Mix,
                  Release Radar, Today's Top Hits — from all third-party apps. Your own playlists work.
                </div>
              </div>
            )}
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
          </>
        ) : (
          <>
            <button
              onClick={async () => { await disconnectSpotify(); setRows(null); setStatus("Disconnected."); }}
              style={{ padding: "8px", borderRadius: 9, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.6)" }}
            >DISCONNECT SPOTIFY</button>
          </>
        )}

        {!!status && (
          <div style={{ fontSize: 10.5, lineHeight: 1.5, color: status.startsWith("⚠") ? "#FF9A9A" : CYAN }}>{status}</div>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 11, color: "#fff" }}>
              <span style={{ color: CYAN, fontWeight: 700 }}>{found}</span> of {rows.length} found in your library
              {missing > 0 && <span style={{ color: "rgba(255,255,255,0.5)" }}> · {missing} missing</span>}
            </div>
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
                  <span style={{ fontSize: 10, color: r.track ? CYAN : "rgba(255,255,255,0.3)", flexShrink: 0 }}>{r.track ? "✓" : "○"}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.item.artists} — {r.item.name}
                  </span>
                  {r.track && <span style={{ fontSize: 8.5, fontFamily: MONO, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>{Math.round(r.score * 100)}%</span>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  const { added } = buildPlaylistFromMatches(title, rows);
                  setStatus(added ? `✓ Created “${title}” with ${added} tracks` : "⚠ None of those tracks are in your library yet");
                  setRows(null);
                }}
                disabled={!found}
                style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: mix(CYAN, 14), border: `1px solid ${mix(CYAN, 42)}`, color: CYAN, opacity: found ? 1 : 0.4 }}
              >CREATE PLAYLIST ({found})</button>
              {missing > 0 && (
                <button
                  onClick={() => {
                    const text = missingList(rows);
                    navigator.clipboard?.writeText(text).then(
                      () => setStatus(`✓ Copied ${missing} missing tracks to the clipboard`),
                      () => setStatus("⚠ Couldn't reach the clipboard")
                    );
                  }}
                  style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: mix(MAG, 12), border: `1px solid ${mix(MAG, 38)}`, color: MAG }}
                >COPY MISSING</button>
              )}
            </div>
          </>
        )}
      </div>
    </Module>
  );
}
