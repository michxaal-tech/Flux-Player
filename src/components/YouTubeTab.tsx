import { useEffect, useRef, useState } from "react";
import { BORDER, CYAN, MAG, MONO } from "../constants";
import { useStore } from "../store/useStore";
import { chip, Module } from "./ui";
import { mix } from "../theme";
import { fmt } from "../utils";
import { playAt } from "../audio/transport";
import {
  ensurePlayer, loadYtKey, openOnYouTube, saveYtKey, searchYouTube, ytTrack, type YtHit,
} from "../youtube";

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)",
  border: BORDER, borderRadius: 9, padding: "9px 11px", fontSize: 12, color: "#fff", outline: "none",
};

/**
 * The YouTube source tab.
 *
 * Search through the Data API v3 with the user's own key, play through
 * YouTube's IFrame player, and drop results into FLUX's ordinary queue — a
 * YouTube result becomes a Track like any other, so the existing playlist,
 * shuffle and next/prev machinery works on it unchanged.
 *
 * The player element is mounted here and never unmounted while the app runs:
 * recreating it per track is slow, and on mobile it loses the user-gesture
 * permission that lets it start at all.
 */
export function YouTubeTab() {
  const ytReady = useStore((s) => s.ytReady);
  const ytStatus = useStore((s) => s.ytStatus);
  const playlists = useStore((s) => s.playlists);
  const viewMode = useStore((s) => s.viewMode);
  const addTracks = useStore((s) => s.addTracks);

  const [key, setKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<YtHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  const target = viewMode.type === "pl" ? viewMode.id : playlists[0]?.id;

  useEffect(() => {
    loadYtKey().then((k) => {
      setKey(k);
      useStore.setState({ ytReady: !!k });
      if (!k) setKeyOpen(true);
    });
  }, []);

  // the player is created once, lazily, and lives for the session
  useEffect(() => {
    if (hostRef.current) void ensurePlayer(hostRef.current).catch(() => {});
  }, []);

  const run = async () => {
    if (!q.trim()) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setErr("");
    try {
      setHits(await searchYouTube(q, ac.signal));
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setErr(e instanceof Error ? e.message : "Search failed");
        setHits([]);
      }
    }
    setBusy(false);
  };

  const queue = (h: YtHit, playNow: boolean) => {
    if (!target) return;
    const tr = ytTrack(h);
    addTracks(target, [tr]);
    if (playNow) {
      const pl = useStore.getState().playlists.find((p) => p.id === target);
      const i = pl ? pl.tracks.findIndex((t) => t.id === tr.id) : -1;
      if (i >= 0) void playAt(target, i);
    } else {
      useStore.setState({ ytStatus: `Queued “${h.title}”` });
      setTimeout(() => useStore.setState({ ytStatus: "" }), 2500);
    }
  };

  return (
    <div>
      {/* The player. Kept mounted and merely hidden when nothing YouTube is
          playing — unmounting it would destroy the iframe and, on mobile, the
          permission to start audio without a fresh tap. */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            position: "relative", width: "100%", aspectRatio: "16 / 9",
            borderRadius: 12, overflow: "hidden", border: BORDER,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        </div>
      </div>

      <Module
        title="▶ YOUTUBE"
        extra={
          <button
            onClick={() => setKeyOpen((v) => !v)}
            style={{ ...chip(keyOpen, ytReady ? CYAN : MAG), padding: "5px 10px", fontSize: 9.5 }}
          >{ytReady ? "KEY SET" : "ADD KEY"}</button>
        }
      >
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
          Search YouTube and queue tracks alongside your own files. Playback runs in
          YouTube's own player, so views and ads count normally.
        </div>

        {/* Stated up front rather than discovered. This is the browser's
            same-origin rule, not a missing feature. */}
        <div style={{ marginTop: 8, fontSize: 10.5, color: "rgba(255,200,140,0.9)", lineHeight: 1.5, border: `1px solid ${mix(MAG, 26)}`, borderRadius: 9, padding: "8px 10px" }}>
          A YouTube track plays inside a cross-origin iframe, so the page can't read its
          audio. The <b>visualizer won't react</b> to it and the FX rack, stem separation
          and beat analysis don't apply — those all work from decoded samples. Your own
          files are unaffected.
        </div>

        {keyOpen && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              Create a key in Google Cloud Console, enable <b>YouTube Data API v3</b> on it, and
              paste it here. It's stored only on this device and sent only to googleapis.com.
            </div>
            <input
              style={input}
              type="password"
              value={key}
              placeholder="AIza…"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveYtKey(key).then(() => setKeyOpen(false)); }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => void saveYtKey(key).then(() => setKeyOpen(false))}
                style={{ ...chip(true, CYAN), flex: 1, padding: "9px 6px", fontSize: 11 }}
              >SAVE KEY</button>
              {ytReady && (
                <button
                  onClick={() => void saveYtKey("").then(() => { setKey(""); })}
                  style={{ ...chip(false, MAG), flex: 1, padding: "9px 6px", fontSize: 11 }}
                >REMOVE</button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
          <input
            data-ytq
            style={{ ...input, flex: 1, minWidth: 0 }}
            value={q}
            placeholder={ytReady ? "search YouTube…" : "add a key first"}
            disabled={!ytReady}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
          />
          <button
            onClick={() => void run()}
            disabled={!ytReady || busy}
            style={{ ...chip(true, MAG), padding: "9px 13px", fontSize: 10, flexShrink: 0, opacity: ytReady ? 1 : 0.4 }}
          >{busy ? "…" : "🔍"}</button>
        </div>

        {(err || ytStatus) && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: err ? "rgba(255,170,170,0.95)" : CYAN, lineHeight: 1.5 }}>
            {err || ytStatus}
          </div>
        )}

        {hits.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {hits.map((h) => (
              <div
                key={h.id}
                data-ythit={h.id}
                style={{
                  display: "flex", gap: 9, alignItems: "center", padding: 7,
                  border: BORDER, borderRadius: 10, background: "rgba(255,255,255,0.03)",
                  opacity: h.embeddable ? 1 : 0.45,
                }}
              >
                {h.thumb && (
                  <img
                    src={h.thumb} alt="" width={64} height={36}
                    style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.title}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>
                    {h.channel}
                    {h.duration > 0 && <span style={{ fontFamily: MONO }}> · {fmt(h.duration)}</span>}
                    {!h.embeddable && <span style={{ color: MAG }}> · embedding disabled</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button
                    disabled={!h.embeddable}
                    onClick={() => queue(h, true)}
                    style={{ ...chip(false, CYAN), padding: "6px 9px", fontSize: 9 }}
                  >▶</button>
                  <button
                    disabled={!h.embeddable}
                    onClick={() => queue(h, false)}
                    style={{ ...chip(false), padding: "6px 9px", fontSize: 9 }}
                  >＋ QUEUE</button>
                  {/* always available, and the way out when the embedded player
                      cannot run — a video with embedding disabled, or the
                      desktop shell's non-http origin */}
                  <button
                    title="Open on YouTube in your browser"
                    onClick={() => openOnYouTube(h.id)}
                    style={{ ...chip(false), padding: "6px 9px", fontSize: 9 }}
                  >↗</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hits.length && ytReady && !busy && !err && (
          <div style={{ marginTop: 10, fontSize: 10.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
            Results are added to <b>{playlists.find((p) => p.id === target)?.name ?? "your playlist"}</b> and
            play through the normal queue — shuffle, repeat and next/previous all work.
          </div>
        )}
      </Module>
      <div style={{ height: 8 }} />
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", lineHeight: 1.5, padding: "0 2px" }}>
        Uses the official YouTube Data API and IFrame Player. Nothing is downloaded or
        extracted; every play goes through YouTube.
      </div>
    </div>
  );
}
