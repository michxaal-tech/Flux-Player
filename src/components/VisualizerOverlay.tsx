import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    canvasRefs.vis = visRef.current;
    return () => {
      if (canvasRefs.vis === visRef.current) canvasRefs.vis = null;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#05060A" }}>
      <canvas
        ref={visRef}
        onClick={() => { set({ visPanel: false }); setThemeMenu(false); }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

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
                position: "absolute", top: 46, left: 0, width: 200, maxHeight: "62vh", overflowY: "auto",
                background: "rgba(10,12,18,0.95)", border: BORDER, borderRadius: 14, padding: 6,
                backdropFilter: "blur(20px)", zIndex: 6, boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
              }}
            >
              {VIS_THEMES.map((v) => (
                <div
                  key={v}
                  onClick={() => { set({ visTheme: v }); setThemeMenu(false); }}
                  style={{
                    padding: "9px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                    cursor: "pointer", marginBottom: 1,
                    color: visTheme === v ? BG : "rgba(255,255,255,0.8)",
                    background: visTheme === v ? CYAN : "transparent",
                  }}
                >
                  {v}
                </div>
              ))}
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
            <Toggle label="AUTO-CYCLE" on={visCfg.autoCycle} onChange={(v) => setV("autoCycle", v)} color={MAG} />
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1.5 }}>
            🎲 randomizes the whole look. Auto-cycle rotates themes every ~16s.
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
