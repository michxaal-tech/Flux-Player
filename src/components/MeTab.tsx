import { useEffect, useState } from "react";
import { BORDER, CYAN, LEVELS, MAG, MONO } from "../constants";
import { deleteTake, startRec, stopRec } from "../audio/recorder";
import { exportTrack } from "../audio/exporter";
import { getUrl } from "../store/blobStore";
import { getCurrentTrack, getFavCount, useStore } from "../store/useStore";
import { mix } from "../theme";
import type { Take } from "../types";
import { fmt } from "../utils";
import { bigBtn, chip, Module, Toggle } from "./ui";
import { AiSettings } from "./ai/AiSettings";
import { AiStudio } from "./ai/AiStudio";

function TakeRow({ take }: { take: Take }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getUrl(`take-${take.id}`).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [take.id]);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <a
        href={url ?? undefined}
        download={take.name}
        style={{
          flex: 1, display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10,
          background: mix(CYAN, 8), border: `1px solid ${mix(CYAN, 27)}`, color: CYAN,
          textDecoration: "none", fontSize: 12.5, fontWeight: 700, opacity: url ? 1 : 0.5,
        }}
      >
        <span>{take.kind === "video" ? "🎬" : "⬇"} {take.name}</span>
        <span style={{ fontFamily: MONO, opacity: 0.7 }}>{fmt(take.secs)}</span>
      </a>
      <button
        onClick={() => deleteTake(take.id)}
        style={{ background: "rgba(255,73,73,0.1)", border: "1px solid rgba(255,73,73,0.35)", borderRadius: 10, color: "#FF6B6B", cursor: "pointer", padding: "0 10px", fontSize: 12 }}
      >✕</button>
    </div>
  );
}

export function MeTab() {
  const stats = useStore((s) => s.stats);
  const playlists = useStore((s) => s.playlists);
  const recState = useStore((s) => s.recState);
  const recTime = useStore((s) => s.recTime);
  const takes = useStore((s) => s.takes);
  const smooth = useStore((s) => s.smooth);
  const sleepEnd = useStore((s) => s.sleepEnd);
  const exporting = useStore((s) => s.exporting);
  const track = useStore(getCurrentTrack);
  const favCount = useStore(getFavCount);
  const set = useStore((s) => s.set);
  const aiReady = useStore((s) => s.aiReady);

  const minutes = Math.floor(stats.seconds / 60);
  let lvlIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (minutes >= LEVELS[i].min) lvlIdx = i;
  const nextLvl = LEVELS[lvlIdx + 1];
  const lvlProg = nextLvl ? (minutes - LEVELS[lvlIdx].min) / (nextLvl.min - LEVELS[lvlIdx].min) : 1;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "UP LATE" : hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";

  const sleepLabel = sleepEnd ? `${Math.max(0, Math.floor((sleepEnd - Date.now()) / 60000))}m` : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ background: `linear-gradient(135deg, ${mix(CYAN, 12)}, ${mix(MAG, 12)})`, border: BORDER, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.24em", color: "rgba(255,255,255,0.55)" }}>{greeting} · LEVEL {lvlIdx + 1}</div>
        <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 10px" }}>{LEVELS[lvlIdx].name}</div>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(lvlProg * 100)}%`, background: `linear-gradient(90deg, ${CYAN}, ${MAG})` }} />
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
          {nextLvl ? `${minutes} min listened — ${nextLvl.min - minutes} min to ${nextLvl.name}` : `${minutes} min listened — max level!`}
        </div>
      </div>

      <AiSettings />
      {aiReady && <AiStudio />}

      <Module title="⏺ SESSION RECORDER" extra={recState === "rec" && <span style={{ fontFamily: MONO, fontSize: 11, color: "#FF4949" }}>● {fmt(recTime)}</span>}>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 10 }}>
          Records everything you hear — FX, stutters, brakes, ambience — then download the take.
        </div>
        {recState === "idle"
          ? <button onClick={startRec} style={{ ...bigBtn("#FF4949"), width: "100%" }}>● START RECORDING</button>
          : <button onClick={stopRec} style={{ ...bigBtn("#FF4949"), width: "100%", background: "rgba(255,73,73,0.15)" }}>■ STOP & SAVE TAKE</button>}
        {takes.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {takes.map((t) => <TakeRow key={t.id} take={t} />)}
          </div>
        )}
      </Module>

      <Module title="💾 EXPORT STUDIO" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>OFFLINE RENDER</span>}>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 10 }}>
          {track
            ? <>Render “{track.name}” with its {track.fxPin ? "📌 pinned FX" : "current FX rack"} baked in — full length, no live recording needed. Speed changes are exported tape-style (pitch follows speed).</>
            : "Play a track to export it with FX baked in."}
        </div>
        {exporting ? (
          <div style={{ padding: "12px", borderRadius: 10, border: `1px solid ${mix(CYAN, 27)}`, background: mix(CYAN, 7), color: CYAN, fontSize: 12, fontFamily: MONO, textAlign: "center" }}>
            ⏳ {exporting}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <button disabled={!track} onClick={() => track && exportTrack(track, "wav")} style={{ ...bigBtn(CYAN), opacity: track ? 1 : 0.4 }}>⬇ EXPORT WAV</button>
            <button disabled={!track} onClick={() => track && exportTrack(track, "mp3")} style={{ ...bigBtn(MAG), opacity: track ? 1 : 0.4 }}>⬇ EXPORT MP3</button>
          </div>
        )}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>Finished exports appear in the takes list above.</div>
      </Module>

      <Module title="📊 SESSION STATS">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
          <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: CYAN }}>{stats.plays}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>PLAYS</div>
          </div>
          <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: MAG }}>{minutes}<span style={{ fontSize: 13 }}>m</span></div>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>LISTENED</div>
          </div>
          <div style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: CYAN }}>{favCount}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>FAVORITES</div>
          </div>
        </div>
        {(() => {
          const all = playlists.flatMap((p) => p.tracks).filter((tr) => tr.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 3);
          return all.length ? (
            <div>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>MOST PLAYED</div>
              {all.map((tr, i) => (
                <div key={tr.id} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "5px 0", color: "rgba(255,255,255,0.8)" }}>
                  <span style={{ color: CYAN, fontFamily: MONO }}>{i + 1}.</span>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.name}</span>
                  <span style={{ fontFamily: MONO, opacity: 0.5 }}>{tr.plays}×</span>
                </div>
              ))}
            </div>
          ) : null;
        })()}
      </Module>

      <Module title="⚙ PLAYBACK">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Toggle label="SMOOTH SWITCH" on={smooth} onChange={(v) => set({ smooth: v })} />
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>fade between tracks</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>SLEEP TIMER</span>
          {[15, 30, 60].map((m) => (
            <button key={m} onClick={() => set({ sleepEnd: Date.now() + m * 60000 })} style={chip(false)}>{m}m</button>
          ))}
          {sleepEnd && <button onClick={() => set({ sleepEnd: null })} style={chip(true, MAG)}>✕ {sleepLabel}</button>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={() => set({ shortcutsOpen: true })} style={chip(false)}>⌨ KEYBOARD SHORTCUTS</button>
        </div>
      </Module>

      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, padding: "0 4px" }}>
        Your library, playlists, favorites, tags, notes, pinned FX, presets, stats and takes are stored on this
        device and survive restarts. Install FLUX PRO from your browser menu to use it like a native app — it
        works fully offline.
      </div>
    </div>
  );
}
