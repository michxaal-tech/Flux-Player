import { useEffect, useRef } from "react";
import { BORDER, CARD, CYAN, MAG, MONO } from "../constants";
import { brake, launch, stutterDown, stutterUp, tapCue } from "../audio/transport";
import { useStore } from "../store/useStore";
import { canvasRefs } from "../visualizer/live";
import { fmt } from "../utils";
import { bigBtn, Module, Slider } from "./ui";

export function DJTab() {
  const fx = useStore((s) => s.fx);
  const cues = useStore((s) => s.cues);
  const setFxKey = useStore((s) => s.setFxKey);
  const setCue = useStore((s) => s.setCue);

  const bpmRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bpmRef.current) canvasRefs.bpm.add(bpmRef.current);
    canvasRefs.level = levelRef.current;
    const bpmEl = bpmRef.current;
    return () => {
      if (bpmEl) canvasRefs.bpm.delete(bpmEl);
      if (canvasRefs.level === levelRef.current) canvasRefs.level = null;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: CARD, border: BORDER, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)" }}>LIVE BPM</div>
          <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: CYAN }}><span ref={bpmRef}>––</span></div>
        </div>
        <div style={{ flex: 1.4, background: CARD, border: BORDER, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>OUTPUT LEVEL</div>
          <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div ref={levelRef} style={{ height: "100%", width: "0%", background: `linear-gradient(90deg, ${CYAN}, ${MAG})`, transition: "width 60ms linear" }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Slider label="SPEED" value={fx.speed} min={0.5} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setFxKey("speed", v)} />
          </div>
        </div>
      </div>

      <Module title="🔥 HOT CUES">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {cues.map((cq, i) => (
            <div key={i} style={{ position: "relative" }}>
              <button
                onClick={() => tapCue(i)}
                style={{
                  ...bigBtn(cq !== null ? MAG : CYAN), width: "100%",
                  background: cq !== null ? "rgba(255,78,205,0.14)" : "rgba(255,255,255,0.05)",
                }}
              >
                {["A", "B", "C", "D"][i]}
                <div style={{ fontFamily: MONO, fontSize: 9.5, marginTop: 3, opacity: 0.8 }}>{cq !== null ? fmt(cq) : "SET"}</div>
              </button>
              {cq !== null && (
                <span
                  onClick={() => setCue(i, null)}
                  style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#222", border: BORDER, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >✕</span>
              )}
            </div>
          ))}
        </div>
      </Module>

      <Module title="⚡ PERFORMANCE FX">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
          {([["STUTTER ⅛", 90], ["STUTTER ¼", 160], ["STUTTER ½", 300]] as const).map(([lbl, ms]) => (
            <button
              key={lbl}
              onMouseDown={() => stutterDown(ms)}
              onMouseUp={stutterUp}
              onMouseLeave={stutterUp}
              onTouchStart={(e) => { e.preventDefault(); stutterDown(ms); }}
              onTouchEnd={stutterUp}
              style={bigBtn(CYAN)}
            >{lbl}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <button onClick={brake} style={bigBtn(MAG)}>🛑 TAPE BRAKE</button>
          <button onClick={launch} style={bigBtn(CYAN)}>🚀 SPIN UP</button>
        </div>
      </Module>

      <Module title="🎯 SPEED NUDGE">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[-0.1, -0.05, 0, 0.05, 0.1].map((d) => (
            <button
              key={d}
              onClick={() => setFxKey("speed", d === 0 ? 1 : Math.max(0.5, Math.min(1.5, +(fx.speed + d).toFixed(2))))}
              style={bigBtn(d === 0 ? MAG : CYAN)}
            >
              {d === 0 ? "RESET" : d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </Module>
    </div>
  );
}
