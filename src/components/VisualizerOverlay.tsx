import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BG, BORDER, CYAN, IMPACTS, MAG, P_STYLES, PALETTES, STAGED_MARK, STAGED_THEMES, VIS_THEMES } from "../constants";
import { nextTrack, prevTrack, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { mix } from "../theme";
import { canvasRefs, live } from "../visualizer/live";
import { MODES_3D } from "../visualizer/project3d";
import { startVideoExport, stopVideoExport, videoExportSupported } from "../audio/videoRecorder";
import { fmt } from "../utils";
import { LYRIC_STYLES } from "../visualizer/lyricRenderer";
import { chip, NextIcon, PauseIcon, playBtn, PlayIcon, PrevIcon, skipBtn, Slider, Toggle } from "./ui";
import { vibeToVisuals } from "../ai/features";
import { AiPrompt } from "./ai/AiBits";

export function VisualizerOverlay() {
  const visTheme = useStore((s) => s.visTheme);
  const visCfg = useStore((s) => s.visCfg);
  const visPanel = useStore((s) => s.visPanel);
  const playing = useStore((s) => s.playing);
  const track = useStore(getCurrentTrack);
  const lyricsOn = useStore((s) => s.lyricsOn);
  const lyricAuto = useStore((s) => s.lyricAuto);
  const lyricStyle = useStore((s) => s.lyricStyle);
  const lyricStatus = useStore((s) => s.lyricStatus);
  const lyricAskArtist = useStore((s) => s.lyricAskArtist);
  const [artistText, setArtistText] = useState("");
  const set = useStore((s) => s.set);
  const setV = useStore((s) => s.setVisKey);
  const visChaos = useStore((s) => s.visChaos);
  const aiReady = useStore((s) => s.aiReady);
  const analyzedMode = useStore((s) => s.analyzedMode);
  const analyzeStatus = useStore((s) => s.analyzeStatus);
  const vidState = useStore((s) => s.vidState);
  const vidTime = useStore((s) => s.vidTime);
  const vidMsg = useStore((s) => s.vidMsg);
  const [vidSupported] = useState(videoExportSupported);
  const lrcInputRef = useRef<HTMLInputElement>(null);

  const [themeMenu, setThemeMenu] = useState(false);
  const visRef = useRef<HTMLCanvasElement>(null);
  const lyrRef = useRef<HTMLCanvasElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    canvasRefs.vis = visRef.current;
    canvasRefs.lyr = lyrRef.current;
    return () => {
      if (canvasRefs.vis === visRef.current) canvasRefs.vis = null;
      if (canvasRefs.lyr === lyrRef.current) canvasRefs.lyr = null;
    };
  }, []);

  const stepTheme = (dir: 1 | -1) => {
    const i = VIS_THEMES.indexOf(visTheme);
    set({ visTheme: VIS_THEMES[(i + dir + VIS_THEMES.length) % VIS_THEMES.length] });
  };

  return (
    <div
      className="overlayIn"
      // Swipe lives on the whole overlay rather than the canvas alone: the HUD
      // and transport rows sit on top of it, so anchoring the gesture to the
      // canvas made the strips they occupy dead to swiping.
      onTouchStart={(e) => {
        const el = e.target as HTMLElement;
        // a swipe that begins on a control belongs to that control
        if (el.closest("button, input, select, textarea, a, .dropin")) { touchStart.current = null; return; }
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const s0 = touchStart.current;
        touchStart.current = null;
        if (!s0) return;
        const dx = e.changedTouches[0].clientX - s0.x;
        const dy = e.changedTouches[0].clientY - s0.y;
        // horizontal swipe switches theme (swipe left → next)
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) stepTheme(dx < 0 ? 1 : -1);
      }}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "#05060A", touchAction: "pan-y" }}
    >
      <canvas
        ref={visRef}
        onClick={() => { set({ visPanel: false }); setThemeMenu(false); }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "pan-y" }}
      />
      {/* crisp lyric layer above the trail-faded vis canvas */}
      <canvas ref={lyrRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      {/* prev/next theme arrows — hidden until the edge is hovered */}
      <div className="viszone left">
        <button className="visarrow" onClick={() => stepTheme(-1)} aria-label="Previous theme">‹</button>
      </div>
      <div className="viszone right">
        <button className="visarrow" onClick={() => stepTheme(1)} aria-label="Next theme">›</button>
      </div>

      {/* Always-reachable exit. It used to be the last chip in the row below,
          which overflows the screen on a phone — so once you opened the
          visualizer there was no way back out. */}
      <button
        onClick={() => set({ visOpen: false })}
        aria-label="Close visualizer"
        style={{
          position: "absolute", top: 12, right: 12, zIndex: 8,
          width: 42, height: 42, borderRadius: 999, cursor: "pointer", fontSize: 17, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(10,12,18,0.82)", border: BORDER, color: "#fff",
          backdropFilter: "blur(14px)", pointerEvents: "auto",
        }}
      >✕</button>

      <div style={{ position: "absolute", top: 14, left: 16, right: 64, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap", pointerEvents: "none" }}>
        {/* compact theme picker: one chip + fluid dropdown, no chip clutter */}
        <div style={{ position: "relative", pointerEvents: "auto" }}>
          <button
            data-themechip
            onClick={() => setThemeMenu((x) => !x)}
            style={{ ...chip(themeMenu), display: "flex", alignItems: "center", gap: 9 }}
          >
            {STAGED_THEMES.has(visTheme) ? STAGED_MARK : "◉"} {visTheme}
            <span style={{ display: "inline-block", fontSize: 9, transform: themeMenu ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>▼</span>
          </button>
          {themeMenu && (
            <div
              className="dropin"
              style={{
                position: "absolute", top: 46, left: 0, width: "min(94vw, 540px)",
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2,
                background: "rgba(10,12,18,0.95)", border: BORDER, borderRadius: 14, padding: 8,
                backdropFilter: "blur(20px)", zIndex: 6, boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
              }}
            >
              {VIS_THEMES.map((v) => (
                <div
                  key={v}
                  data-th={v}
                  onClick={() => { set({ visTheme: v }); setThemeMenu(false); }}
                  style={{
                    padding: "9px 4px", borderRadius: 9, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                    cursor: "pointer", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden",
                    color: visTheme === v ? BG : "rgba(255,255,255,0.8)",
                    // staged themes get a faint tinted plate so the ◈ row reads
                    // as a family rather than as scattered stray glyphs
                    background: visTheme === v ? CYAN
                      : STAGED_THEMES.has(v) ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                    boxShadow: visTheme !== v && STAGED_THEMES.has(v) ? `inset 0 0 0 1px ${MAG}44` : "none",
                  }}
                  title={STAGED_THEMES.has(v) ? "Staged theme — effects layer in as the track builds, with a set-piece on drops" : undefined}
                >
                  {STAGED_THEMES.has(v) && (
                    <span style={{ color: visTheme === v ? BG : MAG, marginRight: 3 }}>{STAGED_MARK}</span>
                  )}
                  {v}
                </div>
              ))}
              {/* auto-advance mode — OFF keeps the current theme forever */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, padding: "8px 4px 2px", borderTop: BORDER, marginTop: 6 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>AUTO</span>
                {(["off", "cycle", "shuffle"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setV("autoMode", m)}
                    style={{ ...chip(visCfg.autoMode === m, m === "shuffle" ? MAG : CYAN), flex: 1, padding: "7px 4px", fontSize: 10, textAlign: "center" }}
                  >
                    {m === "off" ? "✕ OFF" : m === "cycle" ? "⟳ CYCLE" : "🔀 SHUFFLE"}
                  </button>
                ))}
              </div>
              <div style={{ gridColumn: "1 / -1", fontSize: 9, color: "rgba(255,255,255,0.35)", padding: "2px 4px 0" }}>
                CYCLE / SHUFFLE change the theme every ~16s while playing. OFF stays put.
              </div>
              <div style={{ gridColumn: "1 / -1", fontSize: 9, color: "rgba(255,255,255,0.35)", padding: "4px 4px 0" }}>
                <span style={{ color: MAG }}>{STAGED_MARK}</span> STAGED — effects layer in as instruments and vocals
                enter, with a big set-piece on every drop. Best with SYNC MODE → ANALYZED.
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", pointerEvents: "auto" }}>
          <button onClick={() => set({ lyricsOn: !lyricsOn })} style={chip(lyricsOn)} title="Lyrics on/off">♪</button>
          <button
            onClick={() => set({ lyricAuto: !lyricAuto })}
            style={{ ...chip(lyricAuto, MAG), fontSize: 10 }}
            title="Auto-search lyrics for every track"
          >⟳ AUTO</button>
          {vidSupported && (
            <button
              onClick={() => (vidState === "rec" ? stopVideoExport() : startVideoExport(true))}
              style={{ ...chip(vidState === "rec", "#FF4949"), fontSize: 10 }}
              title={vidState === "rec" ? "Stop and save the video" : "Record this song with the visualizer"}
            >
              {vidState === "rec" ? `⏹ ${fmt(vidTime)}` : "⏺ VIDEO"}
            </button>
          )}
          <button onClick={visChaos} style={chip(false, MAG)}>🎲</button>
          <button onClick={() => set({ visPanel: !visPanel })} style={chip(visPanel, MAG)}>⚙ TUNE</button>
        </div>
      </div>

      {(vidState === "rec" || !!vidMsg) && (
        <div
          style={{
            position: "absolute", top: 62, left: "50%", transform: "translateX(-50%)", zIndex: 7,
            display: "flex", alignItems: "center", gap: 9, padding: "9px 15px", borderRadius: 999,
            background: "rgba(10,12,18,0.92)", backdropFilter: "blur(14px)",
            border: `1px solid ${vidState === "rec" ? "rgba(255,73,73,0.5)" : mix(CYAN, 40)}`,
            fontSize: 11, color: "#fff", maxWidth: "88vw", textAlign: "center",
          }}
        >
          {vidState === "rec" && <span style={{ color: "#FF4949", animation: "fluxpulse 1s ease-in-out infinite" }}>●</span>}
          <span>
            {vidState === "rec"
              ? `Recording ${visTheme}${lyricsOn && track?.lyrics ? ` + ${lyricStyle}` : ""} — plays through in real time, stops at the end`
              : vidMsg}
          </span>
        </div>
      )}

      {visPanel && (
        <div className="dropin" style={{ position: "absolute", top: 62, right: 16, width: "min(88vw, 330px)", maxHeight: "68vh", overflowY: "auto", background: "rgba(10,12,18,0.93)", border: BORDER, borderRadius: 16, padding: 14, backdropFilter: "blur(20px)", zIndex: 5 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>COLOR PALETTE — {PALETTES.length - 1} + CUSTOM</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {PALETTES.map((p) => {
              const ph1 = p.h ? p.h[0] : visCfg.h1;
              const ph2 = p.h ? p.h[1] : visCfg.h2;
              return (
                <button
                  key={p.id}
                  onClick={() => setV("palette", p.id)}
                  style={{
                    padding: "7px 11px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                    background: visCfg.palette === p.id ? `linear-gradient(90deg, hsl(${ph1},${p.s}%,60%), hsl(${ph2},${p.s}%,60%))` : "rgba(255,255,255,0.06)",
                    color: visCfg.palette === p.id ? "#05060A" : "rgba(255,255,255,0.7)",
                    border: BORDER,
                  }}
                >{p.id}</button>
              );
            })}
          </div>
          {visCfg.palette === "CUSTOM" && (
            <div style={{ marginBottom: 6 }}>
              <Slider label="COLOR A" value={visCfg.h1} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h1", v)} color={`hsl(${visCfg.h1},100%,62%)`} />
              <Slider label="COLOR B" value={visCfg.h2} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h2", v)} color={`hsl(${visCfg.h2},100%,62%)`} />
            </div>
          )}

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>LIGHT</div>
          <Slider label="GLOW" value={visCfg.glow} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("glow", v)} />
          <Slider label="TRAILS" value={visCfg.trail} min={0} max={0.95} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("trail", v)} />
          <Slider label="BG WASH" value={visCfg.bgWash} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("bgWash", v)} />
          <Slider label="THICKNESS" value={visCfg.thick} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("thick", v)} />

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>MOTION</div>
          <Slider label="ANIM SPEED" value={visCfg.speed} min={0.2} max={2.2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("speed", v)} />
          <Slider label="REACTIVITY" value={visCfg.intensity} min={0.3} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("intensity", v)} />
          <Slider label="ZOOM" value={visCfg.zoom} min={0.6} max={1.6} step={0.02} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("zoom", v)} />
          <Slider label="SCENE SPIN" value={visCfg.spinV} min={-1} max={1} step={0.05} format={(v) => (Math.abs(v) < 0.05 ? "OFF" : v.toFixed(2))} onChange={(v) => setV("spinV", v)} />

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>3D SPACE</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {MODES_3D.map((m) => (
              <button
                key={m}
                data-3d={m}
                onClick={() => setV("vis3d", m)}
                style={{ ...chip((visCfg.vis3d ?? "OFF") === m, m === "OFF" ? CYAN : MAG), padding: "6px 11px", fontSize: 9.5 }}
              >{m === "OFF" ? "✕ OFF" : `▣ ${m}`}</button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "6px 0 4px" }}>
            Works with <em>every</em> theme — the visualizer is rendered as normal, then mapped
            into perspective. FLOOR lays it on a plane running to the horizon, ROOM makes a
            corridor of floor and ceiling, SPIN turns it on a panel, DEPTH extrudes it into a
            tunnel coming at you.
          </div>
          {(visCfg.vis3d ?? "OFF") !== "OFF" && (
            <Slider label="DEPTH" value={visCfg.vis3dAmt ?? 0.5} min={0} max={1} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("vis3dAmt", v)} color={MAG} />
          )}

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>PARTICLES</div>
          <Slider label="COUNT" value={visCfg.particles} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 150)}`} onChange={(v) => setV("particles", v)} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {P_STYLES.map((s) => (
              <button key={s} onClick={() => setV("pStyle", s)} style={{ ...chip(visCfg.pStyle === s), padding: "6px 11px", fontSize: 9.5 }}>{s}</button>
            ))}
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>SYNC MODE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Toggle label="ANALYZED" on={analyzedMode} onChange={(v) => set({ analyzedMode: v })} color={MAG} />
            <Toggle label="FAST BEATS" on={visCfg.fastBeats} onChange={(v) => setV("fastBeats", v)} />
            {analyzedMode && track && (
              <button
                onClick={async () => {
                  const { ensureAnalysis } = await import("../audio/analysis");
                  const a = await ensureAnalysis(track.fileId, true);
                  if (a) { live.anal = a; live.analBeat = 0; live.analHit = 0; }
                }}
                style={{ ...chip(false), padding: "6px 11px", fontSize: 9.5 }}
              >⟳ REANALYZE</button>
            )}
            {!!analyzeStatus && <span style={{ fontSize: 10, color: MAG }}>{analyzeStatus}</span>}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "5px 0 4px" }}>
            Reads the whole file once and builds a beat map, so beats land exactly and the
            visuals swell <em>into</em> drops instead of reacting after them. Runs off the main
            thread, so it never interrupts playback. Cached per track — REANALYZE rebuilds it if
            the timing ever looks wrong. FAST BEATS also flashes on drum fills and double-time
            passages instead of only the tempo grid.
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>IMPACT</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Toggle label="BEAT FLASH" on={visCfg.flash} onChange={(v) => setV("flash", v)} />
            <Toggle label="BEAT SHAKE" on={visCfg.shake} onChange={(v) => setV("shake", v)} />
            <Toggle label="MIRROR" on={visCfg.mirror} onChange={(v) => setV("mirror", v)} />
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", margin: "8px 0 5px" }}>
            Stack as many as you like — each fires on the beat.
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {IMPACTS.map((im) => {
              const on = (visCfg.impacts ?? []).includes(im);
              return (
                <button
                  key={im}
                  onClick={() => setV("impacts", on ? (visCfg.impacts ?? []).filter((x) => x !== im) : [...(visCfg.impacts ?? []), im])}
                  style={{ ...chip(on, MAG), padding: "6px 10px", fontSize: 9.5 }}
                >{im}</button>
              );
            })}
            {(visCfg.impacts ?? []).length > 0 && (
              <button onClick={() => setV("impacts", [])} style={{ ...chip(false), padding: "6px 10px", fontSize: 9.5 }}>✕ CLEAR</button>
            )}
            <Toggle label="MAX SHARPNESS" on={visCfg.hiRes} onChange={(v) => setV("hiRes", v)} />
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 4px" }}>BEAT SYNC</div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 6 }}>
            FLUX already compensates for the audio output delay it can measure. Add offset here if
            the visuals still run ahead of the sound — Bluetooth headphones usually need +150 to +250ms.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Slider
              label="OFFSET" value={visCfg.syncMs} min={-100} max={400} step={10}
              format={(v) => `${v > 0 ? "+" : ""}${v}ms`} onChange={(v) => setV("syncMs", v)}
            />
          </div>
          {aiReady && (
            <>
              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 8px" }}>✦ VIBE TO VISUALS</div>
              <AiPrompt
                placeholder="describe a look…"
                cta="✦ SET"
                run={vibeToVisuals}
                examples={["deep ocean trance", "80s arcade", "blood moon ritual", "soft dawn"]}
              />
            </>
          )}
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 8px" }}>♪ LYRICS</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            <Toggle label={lyricsOn ? "ON" : "OFF"} on={lyricsOn} onChange={(v) => set({ lyricsOn: v })} />
            {LYRIC_STYLES.map((s2) => (
              <button key={s2} onClick={() => set({ lyricStyle: s2 })} style={{ ...chip(lyricStyle === s2), padding: "6px 10px", fontSize: 9.5 }}>{s2}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={async () => {
                if (!track) return;
                const { fetchLyrics } = await import("../lyrics");
                fetchLyrics(track);
              }}
              style={{ ...chip(false, MAG), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}
            >🔍 FIND LYRICS</button>
            <button onClick={() => lrcInputRef.current?.click()} style={{ ...chip(false), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}>＋ .LRC FILE</button>
            <span style={{ fontSize: 9.5, color: CYAN }}>
              {lyricStatus || (track?.lyrics ? `${track.lyrics.length} lines loaded` : track ? "no lyrics yet" : "")}
            </span>
          </div>
          {lyricAskArtist && track && (
            <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 8 }}>
              <input
                value={artistText}
                onChange={(e) => setArtistText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && artistText.trim()) {
                    const { fetchLyrics } = await import("../lyrics");
                    fetchLyrics(track, artistText);
                  }
                }}
                placeholder="artist name…"
                style={{
                  flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER,
                  borderRadius: 9, padding: "8px 10px", fontSize: 11, color: "#fff", outline: "none",
                }}
              />
              <button
                onClick={async () => {
                  if (!artistText.trim()) return;
                  const { fetchLyrics } = await import("../lyrics");
                  fetchLyrics(track, artistText);
                }}
                style={{ ...chip(true, MAG), padding: "8px 12px", fontSize: 9.5, flexShrink: 0 }}
              >SEARCH ARTIST</button>
            </div>
          )}
          <input
            ref={lrcInputRef} type="file" accept=".lrc,.txt" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f && track) {
                const { importLrcFile } = await import("../lyrics");
                importLrcFile(track, f);
              }
              e.target.value = "";
            }}
          />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1.5 }}>
            🎲 randomizes the whole look. Theme auto-cycle/shuffle lives in the theme menu (top left).
            MARQUEE and NEONSIGN themes are built around lyrics.
          </div>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {visTheme !== "CLOCK" && (
          <div style={{ fontSize: "clamp(15px, 3.6vw, 22px)", fontWeight: 700, maxWidth: "84vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: `0 0 24px ${mix(CYAN, 60)}`, color: "#fff" }}>
            {track ? track.name : ""}
          </div>
        )}
        <div style={{ display: "flex", gap: 20, pointerEvents: "auto" }}>
          <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
          <button onClick={togglePlay} style={playBtn(52)}>{playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}</button>
          <button onClick={() => nextTrack()} style={skipBtn}><NextIcon /></button>
        </div>
      </div>
    </div>
  );
}
