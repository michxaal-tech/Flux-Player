import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BG, BORDER, CYAN, MAG, P_STYLES, PALETTES, VIS_THEMES } from "../constants";
import { nextTrack, prevTrack, togglePlay } from "../audio/transport";
import { getCurrentTrack, useStore } from "../store/useStore";
import { mix } from "../theme";
import { canvasRefs } from "../visualizer/live";
import { chip, NextIcon, PauseIcon, playBtn, PlayIcon, PrevIcon, skipBtn, Slider, Toggle } from "./ui";

export function VisualizerOverlay() {
  const visTheme = useStore((s) => s.visTheme);
  const visCfg = useStore((s) => s.visCfg);
  const visPanel = useStore((s) => s.visPanel);
  const playing = useStore((s) => s.playing);
  const track = useStore(getCurrentTrack);
  const set = useStore((s) => s.set);
  const setV = useStore((s) => s.setVisKey);
  const visChaos = useStore((s) => s.visChaos);

  const [themeMenu, setThemeMenu] = useState(false);
  const visRef = useRef<HTMLCanvasElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    canvasRefs.vis = visRef.current;
    return () => {
      if (canvasRefs.vis === visRef.current) canvasRefs.vis = null;
    };
  }, []);

  const stepTheme = (dir: 1 | -1) => {
    const i = VIS_THEMES.indexOf(visTheme);
    set({ visTheme: VIS_THEMES[(i + dir + VIS_THEMES.length) % VIS_THEMES.length] });
  };

  const arrowStyle = (side: "left" | "right"): CSSProperties => ({
    position: "absolute", [side]: 10, top: "50%", transform: "translateY(-50%)",
    width: 38, height: 72, borderRadius: 12, cursor: "pointer", zIndex: 4,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.35)", fontSize: 26, lineHeight: "72px", textAlign: "center",
    backdropFilter: "blur(4px)", padding: 0, userSelect: "none",
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#05060A" }}>
      <canvas
        ref={visRef}
        onClick={() => { set({ visPanel: false }); setThemeMenu(false); }}
        onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const s0 = touchStart.current;
          touchStart.current = null;
          if (!s0) return;
          const dx = e.changedTouches[0].clientX - s0.x;
          const dy = e.changedTouches[0].clientY - s0.y;
          // horizontal swipe switches theme (swipe left → next)
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) stepTheme(dx < 0 ? 1 : -1);
        }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "pan-y" }}
      />

      {/* translucent prev/next theme arrows */}
      <button onClick={() => stepTheme(-1)} style={arrowStyle("left")} aria-label="Previous theme">‹</button>
      <button onClick={() => stepTheme(1)} style={arrowStyle("right")} aria-label="Next theme">›</button>

      <div style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {/* compact theme picker: one chip + fluid dropdown, no chip clutter */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setThemeMenu((x) => !x)}
            style={{ ...chip(themeMenu), display: "flex", alignItems: "center", gap: 9 }}
          >
            ◉ {visTheme}
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
                  onClick={() => { set({ visTheme: v }); setThemeMenu(false); }}
                  style={{
                    padding: "9px 4px", borderRadius: 9, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                    cursor: "pointer", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden",
                    color: visTheme === v ? BG : "rgba(255,255,255,0.8)",
                    background: visTheme === v ? CYAN : "rgba(255,255,255,0.03)",
                  }}
                >
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
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={visChaos} style={chip(false, MAG)}>🎲</button>
          <button onClick={() => set({ visPanel: !visPanel })} style={chip(visPanel, MAG)}>⚙ TUNE</button>
          <button onClick={() => set({ visOpen: false })} style={{ ...chip(false), fontSize: 14 }}>✕</button>
        </div>
      </div>

      {visPanel && (
        <div style={{ position: "absolute", top: 62, right: 16, width: "min(88vw, 330px)", maxHeight: "68vh", overflowY: "auto", background: "rgba(10,12,18,0.93)", border: BORDER, borderRadius: 16, padding: 14, backdropFilter: "blur(20px)", zIndex: 5 }}>
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

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>PARTICLES</div>
          <Slider label="COUNT" value={visCfg.particles} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 150)}`} onChange={(v) => setV("particles", v)} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {P_STYLES.map((s) => (
              <button key={s} onClick={() => setV("pStyle", s)} style={{ ...chip(visCfg.pStyle === s), padding: "6px 11px", fontSize: 9.5 }}>{s}</button>
            ))}
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", margin: "10px 0 8px" }}>IMPACT</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Toggle label="BEAT FLASH" on={visCfg.flash} onChange={(v) => setV("flash", v)} />
            <Toggle label="BEAT SHAKE" on={visCfg.shake} onChange={(v) => setV("shake", v)} />
            <Toggle label="MIRROR" on={visCfg.mirror} onChange={(v) => setV("mirror", v)} />
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1.5 }}>
            🎲 randomizes the whole look. Theme auto-cycle/shuffle lives in the theme menu (top left).
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
