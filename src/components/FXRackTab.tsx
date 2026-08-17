import { useStore } from "../store/useStore";
import { BORDER, MAG } from "../constants";
import { vibeToFx } from "../ai/features";
import { AiPrompt } from "./ai/AiBits";
import { PresetRow } from "./PresetRow";
import { Module, Slider, Toggle } from "./ui";

export function FXRackTab() {
  const aiReady = useStore((s) => s.aiReady);
  const fx = useStore((s) => s.fx);
  const amb = useStore((s) => s.amb);
  const setFxKey = useStore((s) => s.setFxKey);
  const set = useStore((s) => s.set);

  return (
    <div>
      <PresetRow />
      {aiReady && (
        <div style={{ marginBottom: 10 }}>
          <Module title="✦ VIBE TO FX" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>DESCRIBE IT</span>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AiPrompt
                placeholder="a rainy tokyo rooftop at 3am…"
                cta="✦ BUILD"
                run={vibeToFx}
                examples={["underwater cathedral", "AM radio 1974", "sludgy phonk", "crisp club system"]}
              />
              <button
                onClick={() => useStore.getState().saveUserPreset()}
                style={{ padding: "9px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.7)" }}
              >＋ SAVE CURRENT AS PRESET</button>
            </div>
          </Module>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
        <Module title="⏱ TIME & PITCH" extra={<Toggle label="TAPE" on={fx.vinyl} onChange={(v) => setFxKey("vinyl", v)} />}>
          <Slider label="SPEED" value={fx.speed} min={0.5} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setFxKey("speed", v)} />
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>TAPE on → pitch follows speed (slowed / nightcore).</div>
        </Module>
        <Module title="🎙 PITCH" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>SPEED STAYS PUT</span>}>
          <div className="hscroll" style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8 }}>
            {([["DEMON", -7], ["DEEP", -3], ["OFF", 0], ["BRIGHT", 3], ["CHIPMUNK", 7]] as const).map(([lbl, st]) => (
              <button key={lbl} onClick={() => setFxKey("pitch", st)} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", flexShrink: 0, background: fx.pitch === st ? "var(--ac1)" : "rgba(255,255,255,0.06)", color: fx.pitch === st ? "#08090D" : "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.09)" }}>{lbl}</button>
            ))}
          </div>
          <Slider label="SEMITONES" value={fx.pitch} min={-12} max={12} step={1} format={(v) => (v === 0 ? "OFF" : `${v > 0 ? "+" : ""}${v} st`)} onChange={(v) => setFxKey("pitch", v)} />
        </Module>
        <Module title="🌊 REVERB">
          <Slider label="MIX" value={fx.reverb} min={0} max={0.85} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("reverb", v)} />
          <Slider label="ROOM SIZE" value={fx.size} min={0.6} max={5.5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setFxKey("size", v)} />
        </Module>
        <Module title="🔁 ECHO">
          <Slider label="MIX" value={fx.echoMix} min={0} max={0.7} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("echoMix", v)} />
          <Slider label="TIME" value={fx.echoTime} min={0.05} max={0.7} step={0.01} format={(v) => `${Math.round(v * 1000)}ms`} onChange={(v) => setFxKey("echoTime", v)} />
          <Slider label="FEEDBACK" value={fx.echoFb} min={0} max={0.8} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("echoFb", v)} />
        </Module>
        <Module title="🎚 EQ">
          <Slider label="BASS" value={fx.bass} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setFxKey("bass", v)} />
          <Slider label="MID" value={fx.mid} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setFxKey("mid", v)} />
          <Slider label="TREBLE" value={fx.treble} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v}dB`} onChange={(v) => setFxKey("treble", v)} />
        </Module>
        <Module title="🌀 8D SPIN" extra={<Toggle label={fx.spin ? "ON" : "OFF"} on={fx.spin} onChange={(v) => setFxKey("spin", v)} />}>
          <Slider label="ORBIT SPEED" value={fx.spinRate} min={0.1} max={1.6} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setFxKey("spinRate", v)} />
        </Module>
        <Module title="📻 TEXTURE">
          <Slider label="VINYL CRACKLE" value={fx.crackle} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("crackle", v)} />
          <Slider label="CRUSH" value={fx.crush} min={0} max={0.8} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("crush", v)} />
          <Slider label="TONE ▼" value={fx.tone} min={400} max={20000} step={50} format={(v) => (v >= 20000 ? "OPEN" : `${(v / 1000).toFixed(1)}k`)} onChange={(v) => setFxKey("tone", v)} />
          <Slider label="THIN ▲" value={fx.highpass} min={20} max={1200} step={10} format={(v) => (v <= 20 ? "OFF" : `${v}Hz`)} onChange={(v) => setFxKey("highpass", v)} />
        </Module>
        <Module title="🌧 AMBIENCE" extra={<span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>UNDER THE MUSIC</span>}>
          <Slider label="RAIN" value={amb.rain} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ amb: { ...amb, rain: v } })} />
          <Slider label="FIREPLACE" value={amb.fire} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ amb: { ...amb, fire: v } })} />
          <Slider label="WIND" value={amb.wind} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ amb: { ...amb, wind: v } })} />
        </Module>
        <Module title="🔈 OUTPUT" extra={<Toggle label="VOCAL CUT" on={fx.vocalCut} onChange={(v) => setFxKey("vocalCut", v)} color={MAG} />}>
          <Slider label="BOOST" value={fx.boost} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFxKey("boost", v)} />
        </Module>
      </div>
    </div>
  );
}
