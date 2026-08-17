import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BG, BORDER, CYAN, IMPACTS, MAG, NEW_ITEMS, P_SHAPES, P_SIZES, P_STYLES, PALETTES, STAGED_MARK, STAGED_THEMES, VIS_THEMES } from "../constants";
import { nextTrack, prevTrack, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { mix } from "../theme";
import { canvasRefs, live } from "../visualizer/live";
import { MODE_3D_HELP, MODES_3D } from "../visualizer/project3d";
import { DROP_LADDER } from "../visualizer/dropFx";
import { LYRIC_FX, LYRIC_FX_GROUPS } from "../visualizer/lyricFx";
import { startVideoExport, stopVideoExport, videoExportSupported } from "../audio/videoRecorder";
import { fmt } from "../utils";
import { LYRIC_STYLES } from "../visualizer/lyricRenderer";
import { chip, NewTag, NextIcon, PauseIcon, playBtn, PlayIcon, PrevIcon, skipBtn, Slider, Toggle } from "./ui";
import { vibeToVisuals } from "../ai/features";
import { AiPrompt } from "./ai/AiBits";

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
  const lyricFx = useStore((s) => s.lyricFx);
  const lyricFxMatch = useStore((s) => s.lyricFxMatch);
  const lyricPicks = useStore((s) => s.lyricPicks);
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
  const [panelTab, setPanelTab] = useState<string>("LOOK");
  const [fixOpen, setFixOpen] = useState(false);
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
                  {NEW_ITEMS.has(v) && <NewTag />}
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
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "12px 0 6px" }}>DROP FX</div>
          <Slider
            label="ESCALATION" value={visCfg.dropFx ?? 1} min={0} max={1} step={0.05}
            format={(v) => (v < 0.03 ? "OFF" : `${Math.min(DROP_LADDER.length, Math.round(DROP_LADDER.length * v))} EFFECTS`)}
            onChange={(v) => setV("dropFx", v)} color={MAG}
          />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "2px 0 4px" }}>
            Every drop in the track switches on one more effect, so the last chorus hits harder
            than the first — {DROP_LADDER.join(" → ").toLowerCase()}. Needs
            SYNC MODE → ANALYZED to land on the real drops; without it, it guesses from the low end.
            {analyzedMode && live.anal && (
              <> <span style={{ color: MAG }}>{live.anal.drops.length} drops</span> found in this track.</>
            )}
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
                >{im}{NEW_ITEMS.has(im) && <NewTag />}</button>
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
            Applies on top of whichever animation you picked above — colour ramps, per-letter
            motion, karaoke fills and text treatments.
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
                  onClick={() => set({ lyricFx: "NONE" })}
                  style={{ ...chip(lyricFx === "NONE"), padding: "6px 9px", fontSize: 9 }}
                >✕ NONE</button>
                {g.items.map((f) => (
                  <button
                    key={f}
                    data-lfx={f}
                    onClick={() => set({ lyricFx: f })}
                    style={{ ...chip(lyricFx === f, MAG), padding: "6px 9px", fontSize: 9 }}
                  >{f}</button>
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
        <div style={{ display: "flex", gap: 20, pointerEvents: "auto" }}>
          <button onClick={prevTrack} style={skipBtn}><PrevIcon /></button>
          <button onClick={togglePlay} style={playBtn(52)}>{playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}</button>
          <button onClick={() => nextTrack()} style={skipBtn}><NextIcon /></button>
        </div>
      </div>
    </div>
  );
}
