import { useEffect, useRef, useState } from "react";
import type React from "react";
import { BG, BORDER, CYAN, LEVELS, MAG, MONO, TAGS } from "../constants";
import { nextTrack, prevTrack, playAt, seek, togglePlay } from "../audio/transport";
import { getCurrentTrack, getFavCount, getPlayingList, useStore } from "../store/useStore";
import { canvasRefs } from "../visualizer/live";
import { fmt } from "../utils";
import { PresetRow } from "./PresetRow";
import { chip, Module, NextIcon, PauseIcon, playBtn, PlayIcon, PrevIcon, skipBtn, Toggle } from "./ui";

export function PlayerTab() {
  const playingList = useStore(getPlayingList);
  const track = useStore(getCurrentTrack);
  const current = useStore((s) => s.current);
  const playing = useStore((s) => s.playing);
  const playPl = useStore((s) => s.playPl);
  const progress = useStore((s) => s.progress);
  const duration = useStore((s) => s.duration);
  const shuffle = useStore((s) => s.shuffle);
  const repeat = useStore((s) => s.repeat);
  const volume = useStore((s) => s.volume);
  const loopA = useStore((s) => s.loopA);
  const loopB = useStore((s) => s.loopB);
  const fx = useStore((s) => s.fx);
  const activePreset = useStore((s) => s.activePreset);
  const stats = useStore((s) => s.stats);
  const favCount = useStore(getFavCount);
  const set = useStore((s) => s.set);
  const setFxKey = useStore((s) => s.setFxKey);
  const toggleFav = useStore((s) => s.toggleFav);
  const toggleTag = useStore((s) => s.toggleTag);
  const togglePinCurrent = useStore((s) => s.togglePinCurrent);
  const updateTrack = useStore((s) => s.updateTrack);

  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => setNoteOpen(false), [track?.id]);

  const discRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const bpmRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    canvasRefs.disc = discRef.current;
    canvasRefs.wave = waveRef.current;
    if (bpmRef.current) canvasRefs.bpm.add(bpmRef.current);
    const bpmEl = bpmRef.current;
    return () => {
      if (canvasRefs.disc === discRef.current) canvasRefs.disc = null;
      if (canvasRefs.wave === waveRef.current) canvasRefs.wave = null;
      if (bpmEl) canvasRefs.bpm.delete(bpmEl);
    };
  }, []);

  const waveSeek = (e: React.MouseEvent | React.TouchEvent) => {
    const wv = waveRef.current;
    if (!wv || !duration) return;
    const rect = wv.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const tt = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
    seek(tt);
  };

  const minutes = Math.floor(stats.seconds / 60);
  let lvlIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (minutes >= LEVELS[i].min) lvlIdx = i;
  const nextLvl = LEVELS[lvlIdx + 1];

  return (
    <div className="pgrid">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 4 }}>
        <div style={{ position: "relative", width: "min(48vw, 205px)", aspectRatio: "1" }}>
          <div
            ref={discRef}
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: `repeating-radial-gradient(circle at 50% 50%, #14161c 0 2px, #1c1f27 2px 4px), radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14), transparent 55%)`,
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{ width: "34%", height: "34%", borderRadius: "50%", background: `conic-gradient(from 0deg, ${CYAN}, ${MAG}, ${CYAN})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "22%", height: "22%", borderRadius: "50%", background: BG }} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", maxWidth: "88vw" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.24em", color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
            {track ? `${playingList.name} · ${String(current + 1).padStart(2, "0")}/${String(playingList.tracks.length).padStart(2, "0")} · ` : "NO SIGNAL"}
            {track && <span style={{ color: CYAN }}>BPM <span ref={bpmRef}>––</span></span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {track && (
              <button onClick={() => toggleFav(track.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: track.fav ? MAG : "rgba(255,255,255,0.3)" }}>
                {track.fav ? "♥" : "♡"}
              </button>
            )}
            <div style={{ fontSize: "clamp(16px, 4.6vw, 23px)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "72vw" }}>
              {track ? track.name : "Load music to begin"}
            </div>
          </div>
          {track && (
            <>
              <div className="hscroll" style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 7, overflowX: "auto", maxWidth: "88vw" }}>
                {TAGS.map((tg) => (
                  <button
                    key={tg}
                    onClick={() => toggleTag(track.id, tg)}
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", flexShrink: 0,
                      background: track.tags?.includes(tg) ? "rgba(83,233,255,0.18)" : "rgba(255,255,255,0.04)",
                      color: track.tags?.includes(tg) ? CYAN : "rgba(255,255,255,0.45)",
                      border: track.tags?.includes(tg) ? `1px solid ${CYAN}88` : BORDER,
                    }}
                  >{tg}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                {activePreset && activePreset !== "CLEAN" && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: CYAN, border: `1px solid ${CYAN}55`, borderRadius: 6, padding: "2px 7px" }}>{activePreset}</span>
                )}
                <button onClick={togglePinCurrent} style={{ fontFamily: MONO, fontSize: 10, cursor: "pointer", color: track.fxPin ? BG : MAG, background: track.fxPin ? MAG : "transparent", border: `1px solid ${MAG}66`, borderRadius: 6, padding: "2px 7px" }}>
                  {track.fxPin ? "📌 PINNED" : "📌 PIN FX"}
                </button>
                <button onClick={() => setNoteOpen((x) => !x)} style={{ fontFamily: MONO, fontSize: 10, cursor: "pointer", color: track.note ? BG : "rgba(255,255,255,0.6)", background: track.note ? CYAN : "transparent", border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 6, padding: "2px 7px" }}>
                  ✎ NOTE
                </button>
              </div>
              {noteOpen && (
                <textarea
                  value={track.note || ""}
                  onChange={(e) => updateTrack(track.id, { note: e.target.value })}
                  placeholder="Your note on this track… (e.g. 'drop at 1:32 goes crazy')"
                  style={{ marginTop: 8, width: "min(88vw, 420px)", height: 54, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", padding: "8px 10px", fontSize: 12, resize: "none" }}
                />
              )}
            </>
          )}
        </div>

        <div style={{ width: "100%", maxWidth: 620 }}>
          <canvas ref={waveRef} onMouseDown={waveSeek} onTouchStart={waveSeek} style={{ width: "100%", height: 50, cursor: "pointer", display: "block" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmt(progress)}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmt(duration)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <Toggle label="SHFL" on={shuffle} onChange={(v) => set({ shuffle: v })} />
          <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
          <button onClick={togglePlay} style={playBtn(60)}>{playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}</button>
          <button onClick={() => nextTrack()} style={skipBtn}><NextIcon /></button>
          <button
            onClick={() => set({ repeat: repeat === "off" ? "all" : repeat === "all" ? "one" : "off" })}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: repeat !== "off" ? CYAN : "rgba(255,255,255,0.06)", color: repeat !== "off" ? BG : "rgba(255,255,255,0.6)", border: BORDER,
            }}
          >{repeat === "one" ? "⟳1" : "⟳"}</button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => {
              if (loopA === null) set({ loopA: progress });
              else if (loopB === null && progress > loopA) set({ loopB: progress });
              else set({ loopA: null, loopB: null });
            }}
            style={chip(loopA !== null, MAG)}
          >
            {loopA === null ? "LOOP A" : loopB === null ? "SET B" : "A↔B ✕"}
          </button>
          <Toggle label="VOCAL CUT" on={fx.vocalCut} onChange={(v) => setFxKey("vocalCut", v)} color={MAG} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, width: 106 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>🔊</span>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => set({ volume: +e.target.value })} />
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: 640 }}><PresetRow /></div>
      </div>

      {/* side panel: up next + session pulse */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Module title="⏭ UP NEXT">
          {(() => {
            const list = playingList.tracks;
            if (!list.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>Queue is empty.</div>;
            const items: { tr: (typeof list)[number]; idx: number }[] = [];
            for (let k = 1; k <= 3; k++) {
              const idx = current + k;
              if (idx < list.length) items.push({ tr: list[idx], idx });
              else if (repeat === "all" && list.length > 1) items.push({ tr: list[idx % list.length], idx: idx % list.length });
            }
            if (!items.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>End of queue.</div>;
            return items.map(({ tr, idx }, k) => (
              <div
                key={`${tr.id}-${k}`}
                onClick={() => playAt(playPl, idx)}
                style={{
                  display: "flex", gap: 9, alignItems: "center", padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                  background: "rgba(255,255,255,0.03)", border: BORDER, marginBottom: 5,
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 10, color: k === 0 ? CYAN : "rgba(255,255,255,0.4)" }}>{k === 0 ? "▶" : `+${k}`}</span>
                <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "rgba(255,255,255,0.85)" }}>{tr.fav && "♥ "}{tr.name}</span>
              </div>
            ));
          })()}
        </Module>
        <Module title="📊 SESSION PULSE">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {([[stats.plays, "PLAYS", CYAN], [`${minutes}m`, "TIME", MAG], [favCount, "FAVS", CYAN]] as const).map(([v, l, col]) => (
              <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.04)", borderRadius: 9 }}>
                <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: col }}>{v}</div>
                <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(255,255,255,0.45)" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            {LEVELS[lvlIdx].name} · {nextLvl ? `${nextLvl.min - minutes}m to next rank` : "max rank"}
          </div>
        </Module>
      </div>
    </div>
  );
}
