import { useStore } from "../store/useStore";
import { DEFAULT_FX } from "../constants";
import { vibeToFx } from "../ai/features";
import { AiPrompt } from "./ai/AiBits";
import { PresetRow } from "./PresetRow";
import { Card, Chip, Knob, Switch } from "../ui/kit";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => `${v > 0 ? "+" : ""}${v} dB`;
const row = { display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-around" } as const;

/** The effects rack: every stage of the live audio chain, one card each. */
export function FXRackTab() {
  const aiReady = useStore((s) => s.aiReady);
  const fx = useStore((s) => s.fx);
  const amb = useStore((s) => s.amb);
  const setFxKey = useStore((s) => s.setFxKey);
  const set = useStore((s) => s.set);
  const D = DEFAULT_FX;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PresetRow />
      {aiReady && (
        <Card title="Vibe to FX" hint="Describe a sound and the rack is set for you.">
          <AiPrompt
            placeholder="a rainy tokyo rooftop at 3am…"
            cta="✦ BUILD"
            run={vibeToFx}
            examples={["underwater cathedral", "AM radio 1974", "sludgy phonk", "crisp club system"]}
          />
        </Card>
      )}
      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Time & pitch" right={<label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }} title="Tape: pitch follows speed, like slowing a record">Tape <Switch label="Tape mode" on={fx.vinyl} onChange={(v) => setFxKey("vinyl", v)} /></label>}>
          <div style={row}>
            <Knob label="Speed" value={fx.speed} min={0.5} max={1.5} center={1} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setFxKey("speed", v)} />
            <Knob label="Pitch" value={fx.pitch} min={-12} max={12} step={1} center={0} format={(v) => (v === 0 ? "off" : `${v > 0 ? "+" : ""}${v} st`)} onChange={(v) => setFxKey("pitch", v)} />
          </div>
          <div className="hscroll" style={{ display: "flex", gap: 6, marginTop: 16 }}>
            {([["Demon", -7], ["Deep", -3], ["Off", 0], ["Bright", 3], ["Chipmunk", 7]] as const).map(([lbl, st]) => (
              <Chip key={lbl} on={fx.pitch === st} onClick={() => setFxKey("pitch", st)}>{lbl}</Chip>
            ))}
          </div>
        </Card>
        <Card title="EQ">
          <div style={row}>
            <Knob label="Bass" value={fx.bass} min={-12} max={12} step={0.5} center={0} format={db} onChange={(v) => setFxKey("bass", v)} />
            <Knob label="Mid" value={fx.mid} min={-12} max={12} step={0.5} center={0} format={db} onChange={(v) => setFxKey("mid", v)} />
            <Knob label="Treble" value={fx.treble} min={-12} max={12} step={0.5} center={0} format={db} onChange={(v) => setFxKey("treble", v)} />
          </div>
        </Card>
        <Card title="Reverb">
          <div style={row}>
            <Knob label="Mix" value={fx.reverb} min={0} max={0.85} format={pct} onChange={(v) => setFxKey("reverb", v)} />
            <Knob label="Room" value={fx.size} min={0.6} max={5.5} step={0.1} reset={D.size} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => setFxKey("size", v)} />
          </div>
        </Card>
        <Card title="Echo">
          <div style={row}>
            <Knob label="Mix" value={fx.echoMix} min={0} max={0.7} format={pct} onChange={(v) => setFxKey("echoMix", v)} />
            <Knob label="Time" value={fx.echoTime} min={0.05} max={0.7} reset={D.echoTime} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(v) => setFxKey("echoTime", v)} />
            <Knob label="Feedback" value={fx.echoFb} min={0} max={0.8} reset={D.echoFb} format={pct} onChange={(v) => setFxKey("echoFb", v)} />
          </div>
        </Card>
        <Card title="Texture">
          <div style={row}>
            <Knob label="Crackle" value={fx.crackle} min={0} max={1} format={pct} onChange={(v) => setFxKey("crackle", v)} />
            <Knob label="Crush" value={fx.crush} min={0} max={0.8} format={pct} onChange={(v) => setFxKey("crush", v)} />
            <Knob label="Tone" value={fx.tone} min={400} max={20000} step={50} center={20000} format={(v) => (v >= 20000 ? "open" : `${(v / 1000).toFixed(1)}k`)} onChange={(v) => setFxKey("tone", v)} />
            <Knob label="Thin" value={fx.highpass} min={20} max={1200} step={10} format={(v) => (v <= 20 ? "off" : `${v} Hz`)} onChange={(v) => setFxKey("highpass", v)} />
          </div>
        </Card>
        <Card title="8D spin" right={<Switch label="8D spin" on={fx.spin} onChange={(v) => setFxKey("spin", v)} />}>
          <div style={{ ...row, opacity: fx.spin ? 1 : 0.45, transition: "opacity var(--t3)" }}>
            <Knob label="Orbit" value={fx.spinRate} min={0.1} max={1.6} step={0.05} reset={D.spinRate} format={(v) => v.toFixed(2)} onChange={(v) => setFxKey("spinRate", v)} />
          </div>
        </Card>
        <Card title="Ambience" hint="Synthesised under the music.">
          <div style={row}>
            <Knob label="Rain" value={amb.rain} min={0} max={1} format={pct} onChange={(v) => set({ amb: { ...amb, rain: v } })} />
            <Knob label="Fire" value={amb.fire} min={0} max={1} format={pct} onChange={(v) => set({ amb: { ...amb, fire: v } })} />
            <Knob label="Wind" value={amb.wind} min={0} max={1} format={pct} onChange={(v) => set({ amb: { ...amb, wind: v } })} />
          </div>
        </Card>
        <Card title="Output" right={<label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>Vocal cut <Switch label="Vocal cut" on={fx.vocalCut} onChange={(v) => setFxKey("vocalCut", v)} /></label>}>
          <div style={row}>
            <Knob label="Boost" value={fx.boost} min={0.5} max={2} step={0.05} center={1} format={pct} onChange={(v) => setFxKey("boost", v)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
