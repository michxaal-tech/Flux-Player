import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { brake, launch, stutterDown, stutterUp, tapCue } from "../audio/transport";
import { useStore } from "../store/useStore";
import { sig } from "../flux/signals";
import { fmt } from "../utils";
import { Card, Knob } from "../ui/kit";
import { I } from "../ui/icons";
import { spring } from "../ui/motion";

/** A performance pad: big, tactile, lights while held or set. */
function Pad({ children, lit, onClick, hold, sub }: { children: ReactNode; lit?: boolean; onClick?: () => void; hold?: [() => void, () => void]; sub?: ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94, backgroundColor: "rgb(var(--accent-rgb) / 0.3)" }}
      transition={spring.pop}
      onClick={onClick}
      onPointerDown={hold ? (e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hold[0](); } : undefined}
      onPointerUp={hold?.[1]}
      onPointerCancel={hold?.[1]}
      style={{
        height: 84, width: "100%", borderRadius: 18, display: "grid", placeItems: "center", alignContent: "center", gap: 2,
        background: lit ? "rgb(var(--accent-rgb) / 0.16)" : "var(--surface-2)", color: lit ? "var(--accent)" : "var(--text)",
        border: `1px solid ${lit ? "rgb(var(--accent-rgb) / 0.5)" : "var(--line)"}`, fontWeight: 700, fontSize: 17, touchAction: "none",
        fontFamily: "var(--font-display)",
      }}
    >
      {children}
      {sub && <span className="mono" style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{sub}</span>}
    </motion.button>
  );
}

/** The deck: tempo, level, hot cues and performance moves. */
export function DJTab() {
  const fx = useStore((s) => s.fx);
  const cues = useStore((s) => s.cues);
  const setFxKey = useStore((s) => s.setFxKey);
  const setCue = useStore((s) => s.setCue);

  const bpmRef = useRef<HTMLSpanElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const beat = useRef<HTMLSpanElement>(null);
  // tempo and level straight from the shared signals, written to the DOM on
  // each frame rather than through React state
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const ok = sig.bpm > 0 && sig.confidence > 0.3;
      if (bpmRef.current) {
        const txt = ok ? String(Math.round(sig.bpm * (fx.speed || 1))) : "···";
        if (bpmRef.current.textContent !== txt) bpmRef.current.textContent = txt;
      }
      if (srcRef.current) {
        const t = !sig.playing ? "paused" : ok ? (sig.tempoSource === "analysis" ? "from the track analysis" : "listening…") : "no steady beat";
        if (srcRef.current.textContent !== t) srcRef.current.textContent = t;
      }
      if (beat.current) beat.current.style.transform = `scale(${ok ? 0.6 + sig.pulse * 0.9 : 0.6})`;
      const m = meter.current;
      if (m) {
        const lit = Math.round(sig.level * m.children.length);
        for (let i = 0; i < m.children.length; i++) (m.children[i] as HTMLElement).style.opacity = i < lit ? "1" : "0.16";
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fx.speed]);

  return (
    <div className="stagger" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
      <Card style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span ref={beat} style={{ width: 8, height: 8, borderRadius: 8, background: "var(--accent)", display: "inline-block", transition: "transform 70ms linear" }} /> Tempo
            </div>
            <div className="display" style={{ fontSize: 76, lineHeight: 1, marginTop: 6 }}><span ref={bpmRef}>···</span><span style={{ fontSize: 18, marginLeft: 8, color: "var(--text-3)", letterSpacing: 0 }}>BPM</span></div>
            <div ref={srcRef} className="faint" style={{ fontSize: 13, marginTop: 4 }} />
          </div>
          <Knob label="Speed" size={84} value={fx.speed} min={0.5} max={1.5} center={1} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setFxKey("speed", v)} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Output level</div>
          <div ref={meter} style={{ display: "grid", gridTemplateColumns: "repeat(28, 1fr)", gap: 3, height: 18 }}>
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} style={{ borderRadius: 3, background: i > 23 ? "var(--danger)" : "var(--accent)", opacity: 0.16, transition: "opacity 60ms linear" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[-0.1, -0.05, 0, 0.05, 0.1].map((d) => (
            <button key={d} className="btn" data-size="sm" style={{ padding: 0 }} onClick={() => setFxKey("speed", d === 0 ? 1 : Math.max(0.5, Math.min(1.5, +(fx.speed + d).toFixed(2))))}>
              {d === 0 ? "Reset" : d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Hot cues" hint="Tap an empty pad to mark this moment; tap it again to jump back.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {cues.map((cq, i) => (
            <div key={i} style={{ position: "relative" }}>
              <Pad lit={cq !== null} onClick={() => tapCue(i)} sub={cq !== null ? fmt(cq) : "set"}>{["A", "B", "C", "D"][i]}</Pad>
              {cq !== null && (
                <button className="icon-btn" aria-label={`Clear cue ${["A", "B", "C", "D"][i]}`} onClick={() => setCue(i, null)} style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "var(--bg-raise)", border: "1px solid var(--line-2)" }}><I.close size={12} /></button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Performance" hint="Hold a stutter pad to loop a slice; brake and spin-up bend the tape.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
          {([["⅛", 90], ["¼", 160], ["½", 300]] as const).map(([lbl, ms]) => (
            <Pad key={lbl} hold={[() => stutterDown(ms), stutterUp]} sub="stutter">{lbl}</Pad>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <Pad onClick={brake} sub="slow to a stop">Tape brake</Pad>
          <Pad onClick={launch} sub="wind back up">Spin up</Pad>
        </div>
      </Card>
    </div>
  );
}
