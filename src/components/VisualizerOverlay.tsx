import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BG, BORDER, CYAN, IMPACTS, MAG, NEW_ITEMS, P_SHAPES, P_SIZES, P_STYLES, PALETTES, QUALITY_MODES, STAGED_MARK, STAGED_THEMES, VIS_THEMES } from "../constants";
import { isMobile } from "../visualizer/device";
import { MOBILE_THEMES } from "../visualizer/mobile";
import { nextTrack, prevTrack, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { mix } from "../theme";
import { canvasRefs, live } from "../visualizer/live";
import { MODE_3D_HELP, MODES_3D } from "../visualizer/project3d";
import { layersFor, MAX_SLOTS } from "../visualizer/dropLayers";
import { LIGHT_FX, stopsOf, swatchCss } from "../palette";
import { applyLook, captureLook, copyText, decodeLook, encodeLook } from "../visualPresets";
import { LYRIC_FX, LYRIC_FX_GROUPS } from "../visualizer/lyricFx";
import { startVideoExport, stopVideoExport, videoExportSupported } from "../audio/videoRecorder";
import { fmt } from "../utils";
import { LYRIC_STYLES } from "../visualizer/lyricRenderer";
import { chip, NewTag, NextIcon, PauseIcon, playBtn, PlayIcon, PrevIcon, skipBtn, Slider, Toggle } from "./ui";
import { vibeToVisuals } from "../ai/features";
import { AiPrompt } from "./ai/AiBits";
import { MiniTimeline } from "./Timeline";

/**
 * Live cost readout. Frame time and the adaptive resolution scale come straight
 * off the render loop, so the price of a theme plus its impact stack can be read
 * on the actual device instead of inferred from a developer machine.
 *
 * Polled rather than subscribed: these change every frame, and re-rendering the
 * panel at 60fps to display a number would itself cost more than it measures.
 */
/**
 * Live meters for what the engine is actually hearing.
 *
 * Every one of these already drives the visuals — the beat envelope, the
 * energy the themes branch on, the percussive-hit envelope, the drop swell —
 * but until now the only way to tell whether one was firing correctly was to
 * watch a theme and infer it. A flat PUNCH meter on a busy drum track says the
 * onset detector is the problem, which no amount of staring at a theme does.
 *
 * Polled at 20Hz rather than subscribed: these change every frame, and
 * re-rendering the panel that often to move a bar would cost more than the
 * thing it is measuring.
 */
const METERS: { key: "beatE" | "energy" | "hitE" | "dropE"; label: string; blurb: string }[] = [
  { key: "beatE", label: "BEAT", blurb: "the tempo grid — one pulse per beat" },
  { key: "energy", label: "BREATH", blurb: "how hard the passage is driving, over seconds" },
  { key: "hitE", label: "PUNCH", blurb: "every percussive onset, fills and all" },
  { key: "dropE", label: "DROP", blurb: "swells into a drop and decays out of it" },
];

function BeatMeters() {
  const [v, setV] = useState({ beatE: 0, energy: 0, hitE: 0, dropE: 0, bpm: 0 });
  useEffect(() => {
    const id = window.setInterval(
      () => setV({ beatE: live.beatE, energy: live.energy, hitE: live.hitE, dropE: live.dropE, bpm: live.bpm }),
      50
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <>
      <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>
        INTENSITY <NewTag />
        {v.bpm > 0 && <span style={{ float: "right", color: MAG, letterSpacing: "0.1em" }}>{Math.round(v.bpm)} BPM</span>}
      </div>
      <div style={{ display: "grid", gap: 5, marginBottom: 6 }}>
        {METERS.map((m) => {
          const amt = Math.max(0, Math.min(1, v[m.key]));
          return (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8 }} title={m.blurb}>
              <span style={{ fontSize: 9, letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", width: 52 }}>{m.label}</span>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${amt * 100}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${CYAN}, ${MAG})`,
                    // no CSS transition: these are sampled at 20Hz and a
                    // transition would smear a sharp hit into a slow swell,
                    // showing something the engine never did
                    opacity: 0.5 + amt * 0.5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 4 }}>
        What the engine is hearing right now, and what every beat effect below is driven by.
        BREATH moves over seconds rather than beats — it is how a theme knows a quiet passage
        from a driving one.
      </div>
    </>
  );
}

function PerfReadout() {
  const [s, setS] = useState({ ms: 16.7, res: 1, q: 1, target: 60 });
  useEffect(() => {
    const id = window.setInterval(() => setS({ ms: live.frameMs, res: live.resScale, q: live.quality, target: live.targetFps }), 400);
    return () => window.clearInterval(id);
  }, []);
  // Not clamped to 60 any more: the engine draws at the panel's rate where it
  // can, and a readout that could never say more than 60 would be reporting
  // the old cap rather than what is happening.
  const fps = s.ms > 0 ? Math.min(144, Math.round(1000 / s.ms)) : 60;
  // Judged against what the engine is aiming at, not against 60 — 60fps on a
  // 120Hz panel is half the frames, and green would be the wrong colour for it.
  const good = fps >= s.target * 0.86, ok = fps >= s.target * 0.6;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: BORDER, fontSize: 9.5 }}>
      <span style={{ letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>COST</span>
      <span style={{ fontWeight: 700, color: good ? CYAN : ok ? "#FFD166" : "#FF6B6B" }}>
        {fps} fps
      </span>
      <span style={{ color: "rgba(255,255,255,0.4)" }}>{s.ms.toFixed(1)}ms</span>
      {s.target > 70 && <span style={{ color: MAG }}>{s.target}Hz</span>}
      <span style={{ color: "rgba(255,255,255,0.4)" }}>
        {s.res >= 0.999 ? "full res" : `res ${Math.round(s.res * 100)}%`}
      </span>
      {s.q < 0.98 && (
        <span style={{ color: "rgba(255,255,255,0.4)" }}>quality {Math.round(s.q * 100)}%</span>
      )}
    </div>
  );
}

/** TUNE panel groups, in nav order. */
const PANEL_TABS = ["LOOK", "MOTION", "3D", "BEAT", "LYRICS"];

export function VisualizerOverlay() {
  const visTheme = useStore((s) => s.visTheme);
  const visCfg = useStore((s) => s.visCfg);
  const visPanel = useStore((s) => s.visPanel);
  const playing = useStore((s) => s.playing);
  const track = useStore(getCurrentTrack);
  const lyricsOn = useStore((s) => s.lyricsOn);
  const lyricAuto = useStore((s) => s.lyricAuto);
  const lyricStyle = useStore((s) => s.lyricStyle);
  const lyricFxs = useStore((s) => s.lyricFxs);
  const lyricFxMatch = useStore((s) => s.lyricFxMatch);
  const lyricPicks = useStore((s) => s.lyricPicks);
  const lyricStatus = useStore((s) => s.lyricStatus);
  const lyricAskArtist = useStore((s) => s.lyricAskArtist);
  const [artistText, setArtistText] = useState("");
  const set = useStore((s) => s.set);
  const favThemes = useStore((s) => s.favThemes);
  const visPresets = useStore((s) => s.visPresets);
  const saveVisPreset = useStore((s) => s.saveVisPreset);
  const deleteVisPreset = useStore((s) => s.deleteVisPreset);
  const toggleFavTheme = useStore((s) => s.toggleFavTheme);
  const setV = useStore((s) => s.setVisKey);
  const visChaos = useStore((s) => s.visChaos);
  const aiReady = useStore((s) => s.aiReady);
  const analyzedMode = useStore((s) => s.analyzedMode);
  const deepAnalyze = useStore((s) => s.deepAnalyze);
  const analyzeStatus = useStore((s) => s.analyzeStatus);
  const vidState = useStore((s) => s.vidState);
  const vidTime = useStore((s) => s.vidTime);
  const vidMsg = useStore((s) => s.vidMsg);
  const [vidSupported] = useState(videoExportSupported);
  const lrcInputRef = useRef<HTMLInputElement>(null);

  const [themeMenu, setThemeMenu] = useState(false);
  const [panelTab, setPanelTab] = useState<string>("LOOK");
  // manual drop-layer depth, for auditioning a theme's set without waiting for
  // the track to actually drop
  const [previewSlots, setPreviewSlots] = useState(-1);
  const [fixOpen, setFixOpen] = useState(false);
  const [lookName, setLookName] = useState("");
  const [lookMsg, setLookMsg] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [fixTitle, setFixTitle] = useState("");
  const [fixArtist, setFixArtist] = useState("");
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

  /** One entry in the theme grid. Rendered both in the favourites strip and in
   * the full list, so it lives here rather than being inlined twice. */
  const ThemeCell = ({ v, fav }: { v: string; fav?: boolean }) => {
    const on = visTheme === v;
    const starred = favThemes.includes(v);
    // Four columns on a phone leaves ~80px of text per cell. Rather than
    // truncating the long names (CONSTELLATION, SINGULARITY) — which makes them
    // unreadable — the type shrinks to fit. The ◈ prefix counts toward the
    // length since it takes the same room as two characters.
    const len = v.length + (STAGED_THEMES.has(v) ? 2 : 0);
    // Smaller across the board than it was: five columns instead of four means
    // roughly 108px a cell, and the long names (CONSTELLATION, SINGULARITY)
    // have to fit rather than ellipsis away into ambiguity.
    const fs = len > 12 ? 7.4 : len > 10 ? 8.1 : len > 8 ? 8.8 : 9.4;
    return (
      <div
        data-th={fav ? undefined : v}
        data-thfav={fav ? v : undefined}
        onClick={() => { set({ visTheme: v }); setThemeMenu(false); }}
        style={{
          position: "relative",
          // right padding clears the star's 18px column, and the long names
          // (CONSTELLATION, SINGULARITY) ellipsis rather than running under it
          padding: "7px 15px 7px 3px", borderRadius: 8, fontSize: fs, fontWeight: 700,
          letterSpacing: len > 10 ? "0" : "0.04em",
          cursor: "pointer", textAlign: "center", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
          color: on ? BG : "rgba(255,255,255,0.8)",
          // staged themes get a faint tinted plate so the ◈ row reads
          // as a family rather than as scattered stray glyphs
          background: on ? CYAN
            : STAGED_THEMES.has(v) ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
          boxShadow: !on && STAGED_THEMES.has(v) ? `inset 0 0 0 1px ${MAG}44` : "none",
        }}
        title={STAGED_THEMES.has(v) ? "Staged theme — effects layer in as the track builds, with a set-piece on drops" : undefined}
      >
        {STAGED_THEMES.has(v) && (
          <span style={{ color: on ? BG : MAG, marginRight: 3 }}>{STAGED_MARK}</span>
        )}
        {v}
        {NEW_ITEMS.has(v) && <NewTag />}
        <span
          data-star={v}
          role="button"
          aria-label={starred ? `Unfavourite ${v}` : `Favourite ${v}`}
          // the star must not also pick the theme, or favouriting closes the menu
          onClick={(e) => { e.stopPropagation(); toggleFavTheme(v); }}
          style={{
            position: "absolute", top: 0, right: 0, width: 16, height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, lineHeight: 1, cursor: "pointer",
            color: starred ? (on ? BG : MAG) : on ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)",
          }}
        >{starred ? "★" : "☆"}</span>
      </div>
    );
  };

  // Which themes this device is offered. On a phone the desktop set is not
  // shrunk down, it is simply not shown: those themes were written for a
  // machine with a GPU to spare, and the mobile-native set replaces them
  // wholesale. Web and desktop are untouched.
  const themeList = isMobile() ? MOBILE_THEMES : VIS_THEMES;

  const stepTheme = (dir: 1 | -1) => {
    const i = themeList.indexOf(visTheme);
    set({ visTheme: themeList[(i + dir + themeList.length) % themeList.length] });
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
                position: "absolute", top: 46, left: 0, width: "min(94vw, 620px)",
                // The menu is a column: a scrolling list of themes, then a
                // footer that stays put. It used to be one long grid with no
                // height limit at all, so with ninety themes the end of the
                // list was simply off the bottom of the screen and unreachable
                // — nothing to scroll, because nothing knew it had overflowed.
                display: "flex", flexDirection: "column",
                maxHeight: "min(72vh, 560px)",
                // Translucent enough to see the visuals moving through it.
                // The blur is what keeps the text legible over a bright frame;
                // without it this alpha would be unreadable on a pale theme.
                background: "rgba(10,12,18,0.55)", border: BORDER, borderRadius: 14, padding: 8,
                backdropFilter: "blur(26px) saturate(1.3)", WebkitBackdropFilter: "blur(26px) saturate(1.3)",
                zIndex: 6, boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
              }}
            >
            <div
              data-themescroll
              style={{
                display: "grid",
                // Five across at full width, and fewer as the window narrows,
                // rather than five everywhere — five columns on a phone is
                // 60px a cell, which no theme name fits in.
                gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
                gap: 2, overflowY: "auto", overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch", minHeight: 0, paddingRight: 2,
              }}
            >
              {/* Favourites are pinned above the full list. With 80 themes the
                  grid is a long scroll, so the ones you actually use need to be
                  reachable without hunting for them. */}
              {favThemes.length > 0 && (
                <>
                  <div style={{ gridColumn: "1 / -1", fontSize: 9, letterSpacing: "0.18em", color: MAG, padding: "1px 4px 4px" }}>
                    ★ FAVORITES <NewTag />
                  </div>
                  {favThemes.filter((v) => themeList.includes(v)).map((v) => (
                    <ThemeCell key={`fav-${v}`} v={v} fav />
                  ))}
                  <div style={{ gridColumn: "1 / -1", borderTop: BORDER, margin: "6px 0 2px" }} />
                  <div style={{ gridColumn: "1 / -1", fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.32)", padding: "1px 4px 4px" }}>
                    ALL THEMES
                  </div>
                </>
              )}
              {themeList.map((v) => (
                <ThemeCell key={v} v={v} />
              ))}
              {favThemes.length === 0 && (
                <div style={{ gridColumn: "1 / -1", fontSize: 9, color: "rgba(255,255,255,0.3)", padding: "6px 4px 0", lineHeight: 1.5 }}>
                  Tap a theme's ☆ to favourite it — favourites get pinned to the top of this list.
                </div>
              )}
            </div>
              {/* auto-advance mode — OFF keeps the current theme forever.
                  Outside the scrolling region: it is the one control here that
                  should not require scrolling ninety themes to reach. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px 2px", borderTop: BORDER, marginTop: 6, flexShrink: 0 }}>
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
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", padding: "2px 4px 0", flexShrink: 0 }}>
                CYCLE / SHUFFLE change the theme every ~16s while playing. OFF stays put.
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", padding: "4px 4px 0", flexShrink: 0 }}>
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
          {/* The panel used to be one long scroll of eleven sections, which
              meant hunting for anything past the fold. Grouping it means every
              control is at most one tap plus a short scroll away. */}
          <div style={{ display: "flex", gap: 3, marginBottom: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
            {PANEL_TABS.map((pt) => (
              <button
                key={pt}
                data-ptab={pt}
                onClick={() => setPanelTab(pt)}
                style={{
                  flex: 1, padding: "7px 2px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  background: panelTab === pt ? CYAN : "transparent",
                  color: panelTab === pt ? BG : "rgba(255,255,255,0.6)",
                }}
              >{pt}</button>
            ))}
          </div>

          {panelTab === "LOOK" && (<>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
            SAVED LOOKS <NewTag />
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 7 }}>
            Saves everything — theme, palette, 3D mode, impacts, particles, lyric effects. SHARE
            copies a code you can paste to someone else; it carries the whole look, no account needed.
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
            <button
              data-savelook
              onClick={() => { saveVisPreset({ name: lookName.trim() || `LOOK ${visPresets.length + 1}`, look: captureLook() }); setLookName(""); }}
              style={{ ...chip(false, MAG), padding: "7px 11px", fontSize: 9.5 }}
            >＋ SAVE THIS LOOK</button>
            <button
              onClick={async () => {
                const ok = await copyText(encodeLook(captureLook()));
                setLookMsg(ok ? "Code copied — paste it to anyone" : "Couldn't copy; long-press the box below");
                setTimeout(() => setLookMsg(""), 5000);
              }}
              style={{ ...chip(false), padding: "7px 11px", fontSize: 9.5 }}
            >⧉ SHARE</button>
            <button
              onClick={() => setCodeOpen((v) => !v)}
              style={{ ...chip(codeOpen), padding: "7px 11px", fontSize: 9.5 }}
            >⇥ LOAD CODE</button>
          </div>
          {codeOpen && (
            <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
              <input
                data-lookcode
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                placeholder="paste a FLUX1-… code"
                style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 9, padding: "8px 10px", fontSize: 11, color: "#fff", outline: "none" }}
              />
              <button
                onClick={() => {
                  const look = decodeLook(codeText);
                  if (!look) { setLookMsg("That doesn't look like a FLUX code"); setTimeout(() => setLookMsg(""), 5000); return; }
                  applyLook(look);
                  setCodeText("");
                  setCodeOpen(false);
                  setLookMsg(`✓ loaded — ${look.theme}`);
                  setTimeout(() => setLookMsg(""), 4000);
                }}
                style={{ ...chip(true, MAG), padding: "8px 12px", fontSize: 9.5, flexShrink: 0 }}
              >LOAD</button>
            </div>
          )}
          {visPresets.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
              {visPresets.map((pr, i) => (
                <span key={`${pr.name}-${i}`} style={{ position: "relative", display: "inline-flex" }}>
                  <button
                    data-look={pr.name}
                    onClick={() => applyLook(pr.look)}
                    style={{ ...chip(false), padding: "7px 20px 7px 10px", fontSize: 9.5 }}
                  >{pr.name}</button>
                  <span
                    role="button"
                    aria-label={`Delete ${pr.name}`}
                    onClick={(e) => { e.stopPropagation(); deleteVisPreset(i); }}
                    style={{ position: "absolute", right: 5, top: 0, height: "100%", display: "flex", alignItems: "center", fontSize: 10, cursor: "pointer", color: "rgba(255,255,255,0.4)" }}
                  >✕</span>
                </span>
              ))}
            </div>
          )}
          <input
            value={lookName}
            onChange={(e) => setLookName(e.target.value)}
            placeholder="name for the next save (optional)"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: BORDER, borderRadius: 9, padding: "7px 10px", fontSize: 11, color: "#fff", outline: "none", marginBottom: 6 }}
          />
          {!!lookMsg && <div style={{ fontSize: 10, color: MAG, marginBottom: 8 }}>{lookMsg}</div>}

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 8px" }}>COLOR PALETTE — {PALETTES.length - 1} + CUSTOM</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {PALETTES.map((p) => {
              const stops = stopsOf(p, visCfg.h1, visCfg.h2);
              const on = visCfg.palette === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setV("palette", p.id)}
                  style={{
                    position: "relative", overflow: "hidden",
                    padding: "7px 11px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                    background: on ? swatchCss(stops, p.s) : "rgba(255,255,255,0.06)",
                    color: on ? "#05060A" : "rgba(255,255,255,0.7)",
                    border: BORDER,
                  }}
                >
                  {p.id}{NEW_ITEMS.has(p.id) && <NewTag />}
                  {/* an unselected multi-stop palette still has to show that it
                      carries more than two colours, or the list reads flat */}
                  {!on && stops.length > 2 && (
                    <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2.5, background: swatchCss(stops, p.s, 90, 56) }} />
                  )}
                </button>
              );
            })}
          </div>
          {visCfg.palette === "CUSTOM" && (
            <div style={{ marginBottom: 6 }}>
              <Slider label="COLOR A" value={visCfg.h1} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h1", v)} color={`hsl(${visCfg.h1},100%,62%)`} />
              <Slider label="COLOR B" value={visCfg.h2} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setV("h2", v)} color={`hsl(${visCfg.h2},100%,62%)`} />
            </div>
          )}

          <Slider
            label="HUE SPIN" value={visCfg.hueSpin ?? 0} min={0} max={4} step={0.1}
            format={(v) => (v < 0.05 ? "OFF" : `${(36 / v).toFixed(0)}s / turn`)}
            onChange={(v) => setV("hueSpin", v)} color={MAG}
          />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "2px 0 6px" }}>
            Turns the whole palette around the colour wheel, so any palette cycles through every
            colour instead of sitting on one pairing. Works on the two-colour palettes too, not
            just the multi-stop ones. <NewTag />
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>LIGHT</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {LIGHT_FX.map((f) => (
              <button
                key={f}
                data-light={f}
                onClick={() => setV("lightFx", f)}
                style={{ ...chip((visCfg.lightFx ?? "NORMAL") === f, MAG), flex: 1, padding: "8px 6px", fontSize: 10 }}
              >{f}{NEW_ITEMS.has(f) && <NewTag />}</button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "0 0 8px" }}>
            {(visCfg.lightFx ?? "NORMAL") === "WAVE"
              ? "The WAVES look on whatever theme is running — white-hot cores inside a saturated bloom, everything translucent, and the colour picked by how bright each element is rather than by one flat hue. GLOW below sets how strong the bloom is; turn it down on the busier themes."
              : "Plain colour: the hue you picked, at the brightness each theme asks for."}
          </div>
          <Slider label="GLOW" value={visCfg.glow} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("glow", v)} />
          <Slider label="TRAILS" value={visCfg.trail} min={0} max={0.95} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("trail", v)} />
          <Slider label="BG WASH" value={visCfg.bgWash} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("bgWash", v)} />
          <Slider label="THICKNESS" value={visCfg.thick} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("thick", v)} />

          </>)}

          {panelTab === "MOTION" && (<>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>MOTION</div>
          <Slider label="ANIM SPEED" value={visCfg.speed} min={0.2} max={2.2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("speed", v)} />
          <Slider label="REACTIVITY" value={visCfg.intensity} min={0.3} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("intensity", v)} />
          <Slider label="ZOOM" value={visCfg.zoom} min={0.6} max={1.6} step={0.02} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("zoom", v)} />
          <Slider label="SCENE SPIN" value={visCfg.spinV} min={-1} max={1} step={0.05} format={(v) => (Math.abs(v) < 0.05 ? "OFF" : v.toFixed(2))} onChange={(v) => setV("spinV", v)} />

          </>)}

          {panelTab === "3D" && (<>
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
            into perspective.
            {(visCfg.vis3d ?? "OFF") !== "OFF" && MODE_3D_HELP[visCfg.vis3d] && (
              <> <span style={{ color: MAG }}>{visCfg.vis3d}</span> — {MODE_3D_HELP[visCfg.vis3d]}.</>
            )}
          </div>
          {(visCfg.vis3d ?? "OFF") !== "OFF" && (
            <Slider label="DEPTH" value={visCfg.vis3dAmt ?? 0.5} min={0} max={1} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setV("vis3dAmt", v)} color={MAG} />
          )}

          </>)}

          {panelTab === "BEAT" && (<>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>DROP LAYERS <NewTag /></div>
          <Slider
            label="ESCALATION" value={visCfg.dropFx ?? 1} min={0} max={1} step={0.05}
            format={(v) => (v < 0.03 ? "OFF" : `${Math.min(MAX_SLOTS, Math.round(MAX_SLOTS * v))} LAYERS`)}
            onChange={(v) => setV("dropFx", v)} color={MAG}
          />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "2px 0 4px" }}>
            Every drop adds a layer to the visual and <i>leaves it there</i>. When the track calms
            the newest layers thin out; when it lifts again they come back — so a song builds
            rather than flashing. Each theme has its own set: {visTheme} gets{" "}
            <span style={{ color: MAG }}>{layersFor(visTheme).join(" → ").toLowerCase()}</span>. Needs
            SYNC MODE → ANALYZED to land on the real drops; without it, it guesses from the low end.
            {analyzedMode && live.anal && (
              <> <span style={{ color: MAG }}>{live.anal.drops.length} drops</span> found in this track.</>
            )}
          </div>

          {/* Escalation is otherwise only visible by waiting for the track to
              drop, which makes the layer set impossible to audition. These jump
              straight to a depth; the next real drop takes over again. */}
          <div style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)", margin: "8px 0 5px" }}>PREVIEW DEPTH</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Array.from({ length: MAX_SLOTS + 1 }, (_, n) => (
              <button
                key={n}
                data-slots={n}
                onClick={() => {
                  // the slider is the ceiling, so previewing past it has to
                  // raise it or the depth would silently snap back
                  const need = n / MAX_SLOTS;
                  if ((visCfg.dropFx ?? 1) < need) setV("dropFx", need);
                  live.dropSlots = n;
                  live.dropAmts = new Array(n).fill(1);
                  setPreviewSlots(n);
                }}
                style={{ ...chip(previewSlots === n, MAG), padding: "6px 10px", fontSize: 9.5 }}
              >{n === 0 ? "NONE" : n}</button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, margin: "4px 0 0" }}>
            {previewSlots === 0
              ? "The theme with no layers earned yet."
              : <>Showing {previewSlots} {previewSlots === 1 ? "layer" : "layers"}: {layersFor(visTheme).slice(0, previewSlots).join(", ").toLowerCase()}.</>}
          </div>

          </>)}

          {panelTab === "MOTION" && (<>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>PARTICLES</div>
          <Slider label="COUNT" value={visCfg.particles} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 150)}`} onChange={(v) => setV("particles", v)} />
          <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.32)", margin: "2px 0 4px" }}>DRIFT</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {P_STYLES.map((s) => (
              <button key={s} onClick={() => setV("pStyle", s)} style={{ ...chip(visCfg.pStyle === s), padding: "6px 11px", fontSize: 9.5 }}>{s}</button>
            ))}
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.32)", margin: "2px 0 4px" }}>SHAPE</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {P_SHAPES.map((sh) => (
              <button
                key={sh}
                data-pshape={sh}
                onClick={() => setV("pShape", sh)}
                style={{ ...chip((visCfg.pShape ?? "MIXED") === sh, sh === "MIXED" ? CYAN : MAG), padding: "6px 10px", fontSize: 9 }}
              >{sh}</button>
            ))}
          </div>
          <Slider
            label="SIZE" value={visCfg.pScale ?? 1} min={0.3} max={3} step={0.05}
            format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setV("pScale", v)} color={MAG}
          />
          <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.32)", margin: "2px 0 4px" }}>SIZE SPREAD</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
            {P_SIZES.map((sz) => (
              <button
                key={sz}
                data-psize={sz}
                onClick={() => setV("pSize", sz)}
                style={{ ...chip((visCfg.pSize ?? "VARIED") === sz), padding: "6px 11px", fontSize: 9.5 }}
              >{sz}</button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 8 }}>
            MIXED gives every particle its own silhouette. A wider size spread reads as depth,
            since bigger particles look nearer.
          </div>

          </>)}

          {panelTab === "BEAT" && (<>
          <BeatMeters />
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
            {analyzedMode && track && (
              <button
                onClick={async () => {
                  const { ensureAnalysis } = await import("../audio/analysis");
                  const a = await ensureAnalysis(track.fileId, true, true);
                  if (a) { live.anal = a; live.analBeat = 0; live.analHit = 0; }
                }}
                style={{ ...chip(!!live.anal?.deep, MAG), padding: "6px 11px", fontSize: 9.5 }}
              >◆ DEEP<NewTag /></button>
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
            <Toggle label="AUTO DEEP" on={deepAnalyze} onChange={(v) => set({ deepAnalyze: v })} color={MAG} />
            {live.anal?.deep && (
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)" }}>
                this track:{" "}
                <span style={{ color: live.anal.deep.confidence > 0.72 ? CYAN : live.anal.deep.confidence > 0.5 ? "#FFD166" : "#FF6B6B" }}>
                  {Math.round(live.anal.deep.confidence * 100)}% confident
                </span>
                {live.anal.deep.tempoCurve.length > 4 && (() => {
                  const c = live.anal.deep.tempoCurve;
                  const lo = Math.min(...c), hi = Math.max(...c);
                  return hi - lo > 4 ? <> · tempo moves {Math.round(lo)}–{Math.round(hi)}</> : null;
                })()}
              </span>
            )}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "2px 0 4px" }}>
            <b style={{ color: "rgba(255,255,255,0.55)" }}>DEEP</b> hops four times as finely, tracks the beat
            with a search that can follow a tempo that <i>moves</i> instead of assuming one, fits each beat
            between frames, and then checks itself: it runs a second tracker on the low end alone and compares.
            Where the two agree the pulse is real, and where they don't it tells you rather than picking the
            prettier answer. It also measures each drop's build and decay instead of assuming 1.5s and 3s.
            Slower — a few seconds a track — so it's opt-in, or turn on AUTO DEEP and every track gets it.
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
                >{im}{NEW_ITEMS.has(im) && <NewTag />}</button>
              );
            })}
            {(visCfg.impacts ?? []).length > 0 && (
              <button onClick={() => setV("impacts", [])} style={{ ...chip(false), padding: "6px 10px", fontSize: 9.5 }}>✕ CLEAR</button>
            )}
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>QUALITY <NewTag /></div>
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            {QUALITY_MODES.map((q) => (
              <button
                key={q}
                data-quality={q}
                onClick={() => { setV("quality", q); if (visCfg.hiRes) setV("hiRes", false); }}
                style={{ ...chip((visCfg.quality ?? "AUTO") === q, MAG), flex: 1, padding: "8px 6px", fontSize: 10 }}
              >{q}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "2px 0 6px" }}>
            <Toggle label="120 FPS" on={visCfg.hiFps ?? true} onChange={(v) => setV("hiFps", v)} color={MAG} />
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 6 }}>
            Draws at your display's own refresh rate instead of capping at 60, on the displays that
            have one. It is tried and dropped on evidence: if frames start being missed it falls
            back to 60 rather than stuttering at 120, and waits longer each time before asking
            again. Only themes whose motion is written against the clock rather than the frame
            count are eligible — the rest stay at 60, because they would animate at double speed
            rather than look smoother.
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 4 }}>
            {(visCfg.quality ?? "AUTO") === "MAX"
              ? "Full resolution, full bloom, whatever it costs. Best on a desktop GPU."
              : (visCfg.quality ?? "AUTO") === "FAST"
                ? "Pinned low: smaller backing canvas, no bloom pass, fewer particles. Use this on a laptop or an older machine that stutters — it takes effect immediately rather than after the adaptive ramp."
                : "Follows the measured frame rate: drops resolution, the bloom pass and particle count when the device can't keep up, and creeps back when it can. Check COST below to see where it settled."}
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
          </>)}

          {panelTab === "LYRICS" && (<>
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

          {/* Letter effects are a separate dimension from the styles above: the
              styles animate a line in and out, these decide what the letters do
              while they sit there. Any pairing works. */}
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 4px" }}>
            LETTER FX — {LYRIC_FX.length - 1}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginBottom: 7 }}>
            Applies on top of whichever animation you picked above. One from each group at a
            time, and the groups stack — a colour ramp, a motion, a reveal and a texture all run
            together on the same letters.
          </div>
          {LYRIC_FX_GROUPS.map((g) => (
            <div key={g.name} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.32)" }}>{g.name}</div>
                {/* Several colour effects are defined by fixed hues — fire is
                    orange, ice is cyan — which is the point of picking them, but
                    it means they clash with the palette. Matching keeps each
                    effect's gradient and glow structure and only moves the hues
                    onto the current palette. */}
                {g.name === "COLOR" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 9, letterSpacing: "0.06em", color: lyricFxMatch ? MAG : "rgba(255,255,255,0.45)" }}>
                    <input
                      type="checkbox"
                      data-lfxmatch
                      checked={lyricFxMatch}
                      onChange={(e) => set({ lyricFxMatch: e.target.checked })}
                      style={{ accentColor: MAG, width: 13, height: 13, margin: 0 }}
                    />
                    MATCH THEME
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {/* every group carries its own NONE, so turning one off never
                    means scrolling back to a single switch somewhere else */}
                <button
                  data-lfx={`NONE-${g.name}`}
                  onClick={() => set({ lyricFxs: lyricFxs.filter((f) => !g.items.includes(f)) })}
                  style={{ ...chip(!g.items.some((i) => lyricFxs.includes(i))), padding: "6px 9px", fontSize: 9 }}
                >✕ NONE</button>
                {g.items.map((f) => (
                  <button
                    key={f}
                    data-lfx={f}
                    onClick={() => set({
                      // one per group, but groups stack: picking a colour keeps
                      // whatever motion and reveal are already running
                      lyricFxs: lyricFxs.includes(f)
                        ? lyricFxs.filter((v) => v !== f)
                        : [...lyricFxs.filter((v) => !g.items.includes(v)), f],
                    })}
                    style={{ ...chip(lyricFxs.includes(f), MAG), padding: "6px 9px", fontSize: 9 }}
                  >{f}{NEW_ITEMS.has(f) && <NewTag />}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={async () => {
                if (!track) return;
                const { fetchLyrics } = await import("../lyrics");
                fetchLyrics(track);
              }}
              style={{ ...chip(false, MAG), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}
            >🔍 FIND LYRICS</button>
            <button
              title="Read the lyrics stored inside the audio file itself — instant, offline, and how AI-generated tracks (Suno, Udio) carry their words"
              onClick={async () => {
                if (!track) return;
                const { lyricsFromTrackFile } = await import("../lyrics");
                lyricsFromTrackFile(track);
              }}
              style={{ ...chip(false, CYAN), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}
            >🏷 FROM FILE</button>
            <button
              title="Transcribe the singing with your own API key. Run stem separation first for a far better result."
              onClick={async () => {
                if (!track) return;
                const { transcribeTrack } = await import("../lyrics");
                transcribeTrack(track);
              }}
              style={{ ...chip(false, CYAN), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}
            >🎙 TRANSCRIBE</button>
            <button onClick={() => lrcInputRef.current?.click()} style={{ ...chip(false), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}>＋ .LRC FILE</button>
            <button
              onClick={() => { setFixOpen((v) => !v); if (track) { setFixTitle(track.name); setFixArtist(""); } }}
              style={{ ...chip(fixOpen), padding: "7px 11px", fontSize: 9.5, opacity: track ? 1 : 0.4 }}
            >✎ WRONG LYRICS?</button>
            {track?.lyrics && (
              <button
                onClick={async () => { const { clearLyrics } = await import("../lyrics"); if (track) clearLyrics(track); }}
                style={{ ...chip(false), padding: "7px 11px", fontSize: 9.5 }}
              >✕ CLEAR</button>
            )}
            <span style={{ fontSize: 9.5, color: CYAN }}>
              {lyricStatus || (track?.lyrics ? `${track.lyrics.length} lines loaded` : track ? "no lyrics yet" : "")}
            </span>
          </div>
          {/* Automatic matching goes off the filename, so a file named after
              something else lands on the wrong song with no way back. Searching
              by the real title and artist and picking from the candidates fixes
              it without leaving the app. */}
          {fixOpen && track && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: BORDER }}>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 7 }}>
                Type the song's real title and artist — the file name is often not either of them.
              </div>
              <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                <input
                  value={fixTitle}
                  onChange={(e) => setFixTitle(e.target.value)}
                  placeholder="song title"
                  style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 9, padding: "8px 10px", fontSize: 11, color: "#fff", outline: "none" }}
                />
                <input
                  value={fixArtist}
                  onChange={(e) => setFixArtist(e.target.value)}
                  placeholder="artist"
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    const { searchLyricPicks } = await import("../lyrics");
                    searchLyricPicks(fixTitle, fixArtist);
                  }}
                  style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 9, padding: "8px 10px", fontSize: 11, color: "#fff", outline: "none" }}
                />
              </div>
              <button
                data-lyricsearch
                onClick={async () => {
                  const { searchLyricPicks } = await import("../lyrics");
                  searchLyricPicks(fixTitle, fixArtist);
                }}
                style={{ ...chip(true, MAG), padding: "8px 12px", fontSize: 9.5, width: "100%" }}
              >🔍 SEARCH</button>
              {lyricPicks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {lyricPicks.map((pk, i) => (
                    <button
                      key={`${pk.artist}-${pk.title}-${i}`}
                      data-lyricpick={i}
                      onClick={async () => {
                        const { applyLyricPick } = await import("../lyrics");
                        applyLyricPick(track, pk);
                        setFixOpen(false);
                      }}
                      style={{
                        textAlign: "left", padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                        background: "rgba(255,255,255,0.05)", border: BORDER, color: "#fff",
                        display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center",
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                        <b>{pk.title}</b> <span style={{ opacity: 0.6 }}>— {pk.artist}</span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 9, opacity: 0.55 }}>
                        {fmt(pk.duration)} · {pk.lines}L
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <PerfReadout />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1.5 }}>
            🎲 randomizes the whole look. Theme auto-cycle/shuffle lives in the theme menu (top left).
            MARQUEE and NEONSIGN themes are built around lyrics.
          </div>
          </>)}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {visTheme !== "CLOCK" && (
          <div style={{ fontSize: "clamp(15px, 3.6vw, 22px)", fontWeight: 700, maxWidth: "84vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: `0 0 24px ${mix(CYAN, 60)}`, color: "#fff" }}>
            {track ? track.name : ""}
          </div>
        )}
        {/* Somewhere to move through the track from. Before this the overlay
            could skip to the next song or be closed, which is a lot of
            ceremony for "play that bit again". */}
        <MiniTimeline />
        <div style={{ display: "flex", gap: 20, pointerEvents: "auto" }}>
          <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
          <button onClick={togglePlay} style={playBtn(52)}>{playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}</button>
          <button onClick={() => nextTrack()} style={skipBtn}><NextIcon /></button>
        </div>
      </div>
    </div>
  );
}
