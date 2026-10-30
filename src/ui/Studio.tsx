// Studio — every way to shape how Flux looks and moves.
//
// The live stage behind this view *is* the preview: every change lands on it
// the moment it is made. Looks and modes show stills rendered by the stage
// itself, in the current colours, so a thumbnail is what you'll actually get.
//
// Sections follow the questions people ask — what does it look like, what
// colour, how much does it move, how hard does it hit, how are the words set,
// how does the interface itself behave — and each can be reset on its own.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore, getCurrentTrack, BUILTIN_PRESETS } from "../store/useStore";
import { DEFAULT_LOOK, DEFAULT_LYRICS, DEFAULT_UI, PALETTES, type Look, type LookPreset } from "../flux/look";
import { MODES, modeById } from "../stage/modes";
import { resolvePalette, stage, stageInfo } from "../stage/engine";
import { sig } from "../flux/signals";
import { artNow } from "../flux/art";
import { I } from "./icons";
import { Field, Segmented, Slider, Switch, useMenuButton, type MenuItem } from "./kit";
import { ease, spring } from "./motion";

type Sec = "looks" | "style" | "color" | "motion" | "intensity" | "lyrics" | "interface";
const SECS: { id: Sec; label: string }[] = [
  { id: "looks", label: "Looks" }, { id: "style", label: "Style" }, { id: "color", label: "Colour" },
  { id: "motion", label: "Motion" }, { id: "intensity", label: "Intensity" }, { id: "lyrics", label: "Lyrics" },
  { id: "interface", label: "Interface" },
];

export function Studio({ wide }: { wide: boolean }) {
  const [sec, setSec] = useState<Sec>("looks");
  const [dir, setDir] = useState(1);
  const go = (s: Sec) => {
    setDir(SECS.findIndex((x) => x.id === s) >= SECS.findIndex((x) => x.id === sec) ? 1 : -1);
    setSec(s);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(380px, 460px) 1fr" : "1fr", height: "100%", minHeight: 0 }}>
      {!wide && <div style={{ height: "30vh" }} aria-hidden />}
      <div
        style={{
          background: "rgb(var(--scrim) / 0.88)", borderRadius: wide ? 26 : "26px 26px 0 0", padding: "24px 22px",
          boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)", display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0, gap: 18,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Studio</div>
          <motion.h1 className="display" initial={{ clipPath: "inset(0 0 100% 0)", y: 16 }} animate={{ clipPath: "inset(0 0 -10% 0)", y: 0 }} transition={{ duration: 0.7, ease: ease.out }} style={{ margin: 0, fontSize: 44 }}>
            Make it yours
          </motion.h1>
        </div>
        <div className="hscroll" style={{ margin: "0 -4px", padding: "0 4px" }}>
          <Segmented size="sm" label="Studio section" value={sec} onChange={go} options={SECS} />
        </div>
        <div className="scroll" style={{ minHeight: 0, margin: "0 -8px", padding: "0 8px 12px", position: "relative" }}>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={sec}
              custom={dir}
              variants={{
                in: (d: number) => ({ x: d * 36, opacity: 0 }),
                at: { x: 0, opacity: 1 },
                out: (d: number) => ({ x: d * -36, opacity: 0, transition: { duration: 0.16 } }),
              }}
              initial="in" animate="at" exit="out"
              transition={{ duration: 0.36, ease: ease.out }}
              style={{ display: "grid", gap: 22 }}
            >
              {sec === "looks" && <Looks />}
              {sec === "style" && <StyleSec />}
              {sec === "color" && <ColorSec />}
              {sec === "motion" && <MotionSec />}
              {sec === "intensity" && <IntensitySec />}
              {sec === "lyrics" && <LyricsSec />}
              {sec === "interface" && <InterfaceSec />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {wide && <MonitorCaption />}
    </div>
  );
}

/** Label in the empty monitor area naming what's on stage. */
function MonitorCaption() {
  const look = useStore((s) => s.look);
  const m = modeById(look.style.mode);
  return (
    <div style={{ alignSelf: "end", justifySelf: "end", padding: 24, textAlign: "right", pointerEvents: "none" }}>
      <AnimatePresence mode="wait">
        <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: ease.out }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>On stage</div>
          <div className="display" style={{ fontSize: 34, color: "#fff", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>{m.name}</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, maxWidth: 320, textShadow: "0 1px 10px rgba(0,0,0,0.6)" }}>{m.reacts}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SecHead({ title, onReset, children }: { title: string; onReset?: () => void; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
        {children && <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>{children}</div>}
      </div>
      {onReset && <button className="btn" data-size="sm" data-variant="ghost" aria-label={`Reset ${title.toLowerCase()}`} onClick={onReset}><I.reset size={15} /> Reset</button>}
    </div>
  );
}

function More({ children, label = "More controls" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="btn" data-size="sm" data-variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ paddingLeft: 6 }}>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snap} style={{ display: "grid" }}><I.chevron size={15} /></motion.span>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: ease.out }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ display: "grid", gap: 20, paddingTop: 14 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A still of a look, rendered by the stage in the look's real colours. */
function Thumb({ look, ratio = 1.6, radius = 12 }: { look: Look; ratio?: number; radius?: number }) {
  const [url, setUrl] = useState("");
  const trackId = useStore((s) => getCurrentTrack(s)?.id);
  const key = JSON.stringify([look.style, look.color, look.color.source === "artwork" ? trackId : ""]);
  useEffect(() => {
    let alive = true;
    void stage.thumbnail(look, 320, Math.round(320 / ratio)).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pal = resolvePalette(look);
  return (
    <div style={{ position: "relative", aspectRatio: `${ratio}`, borderRadius: radius, overflow: "hidden", background: `linear-gradient(135deg, ${pal[1]}, ${pal[2]})` }}>
      <AnimatePresence>
        {url && (
          <motion.img
            key={url}
            src={url}
            alt=""
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: ease.out }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Looks ──────────────────────────────────────────────────────────────────
function Looks() {
  const mine = useStore((s) => s.lookPresets);
  const from = useStore((s) => s.lookFrom);
  const save = useStore((s) => s.saveLookPreset);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const modified = !from;
  return (
    <>
      <SecHead title="Looks">Complete visual setups. Pick one, then make it yours.</SecHead>
      <AnimatePresence initial={false} mode="popLayout">
        {modified && !naming && (
          <motion.div
            key="mod"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px 10px 14px", borderRadius: 14, background: "rgb(var(--accent-rgb) / 0.12)" }}
          >
            <span style={{ fontSize: 13.5 }}>You've changed the current look.</span>
            <button className="btn" data-size="sm" data-variant="accent" onClick={() => { setName(""); setNaming(true); }}>Save as look</button>
          </motion.div>
        )}
        {naming && (
          <motion.form
            key="name"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={spring.snap}
            onSubmit={(e) => { e.preventDefault(); save(name || "My look"); setNaming(false); }}
            style={{ display: "flex", gap: 8 }}
          >
            <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this look" aria-label="Look name" onKeyDown={(e) => { if (e.key === "Escape") setNaming(false); }} />
            <button className="btn" data-variant="accent" type="submit">Save</button>
          </motion.form>
        )}
      </AnimatePresence>
      {!modified && !naming && (
        <button className="btn" data-size="sm" onClick={() => { setName(""); setNaming(true); }} style={{ justifySelf: "start" }}><I.plus size={15} /> Save current as a new look</button>
      )}
      {mine.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Yours</div>
          <PresetGrid presets={mine} />
        </div>
      )}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Curated</div>
        <PresetGrid presets={BUILTIN_PRESETS} />
      </div>
    </>
  );
}

function PresetGrid({ presets }: { presets: LookPreset[] }) {
  return (
    <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
      <AnimatePresence initial={false}>
        {presets.map((p, i) => <PresetCard key={p.id} p={p} i={i} />)}
      </AnimatePresence>
    </motion.div>
  );
}

function PresetCard({ p, i }: { p: LookPreset; i: number }) {
  const from = useStore((s) => s.lookFrom);
  const apply = useStore((s) => s.applyLookPreset);
  const dup = useStore((s) => s.duplicateLookPreset);
  const del = useStore((s) => s.deleteLookPreset);
  const rename = useStore((s) => s.renameLookPreset);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const on = from === p.id;
  const menu = useMenuButton((): MenuItem[] => [
    { label: "Duplicate", icon: <I.copy size={16} />, onSelect: () => dup(p) },
    ...(p.builtin ? [] : [
      { label: "Rename", icon: <I.edit size={16} />, onSelect: () => { setName(p.name); setEditing(true); } },
      { label: "Update with current", icon: <I.reset size={16} />, onSelect: () => useStore.setState((s) => ({ lookPresets: s.lookPresets.map((x) => (x.id === p.id ? { ...x, look: s.look } : x)), lookFrom: p.id })) },
      { label: "Delete", icon: <I.trash size={16} />, danger: true, onSelect: () => del(p.id) },
    ]),
  ], 200);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, transition: { ...spring.soft, delay: Math.min(i, 10) * 0.035 } }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
      style={{ position: "relative" }}
    >
      <motion.button
        onClick={() => apply(p)}
        aria-label={`Apply look: ${p.name}`}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.96 }}
        aria-pressed={on}
        style={{ display: "block", width: "100%", padding: 0, border: 0, background: "none", textAlign: "left", color: "inherit", borderRadius: 14 }}
      >
        <div style={{ position: "relative" }}>
          <Thumb look={p.look} />
          {on && (
            <motion.div layoutId="look-ring" transition={spring.slide} style={{ position: "absolute", inset: -4, borderRadius: 16, border: "2px solid var(--accent)" }} />
          )}
        </div>
      </motion.button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); rename(p.id, name); setEditing(false); }}>
              <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { rename(p.id, name); setEditing(false); }} aria-label="Look name" style={{ height: 30, fontSize: 13 }} />
            </form>
          ) : (
            <>
              <div style={{ fontWeight: 650, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              <div className="faint" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.note ?? modeById(p.look.style.mode).name}</div>
            </>
          )}
        </div>
        <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`Options for ${p.name}`} onClick={menu.toggle}><I.more size={16} /></button>
      </div>
      {menu.menu}
    </motion.div>
  );
}

// ── Style ──────────────────────────────────────────────────────────────────
function StyleSec() {
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const m = modeById(look.style.mode);
  return (
    <>
      <SecHead title="Visual style" onReset={() => setLook("style", { ...DEFAULT_LOOK.style, mode: look.style.mode })}>Seven compositions, each moving its own way.</SecHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
        {MODES.map((md, i) => {
          const on = md.id === look.style.mode;
          return (
            <motion.button
              key={md.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
              aria-pressed={on}
              aria-label={`Style: ${md.name}`}
              onClick={() => setLook("style", { mode: md.id })}
              style={{ padding: 0, border: 0, background: "none", textAlign: "left", color: "inherit" }}
            >
              <div style={{ position: "relative" }}>
                <Thumb look={{ ...look, style: { ...look.style, mode: md.id } }} ratio={1.25} />
                {on && <motion.div layoutId="mode-ring" transition={spring.slide} style={{ position: "absolute", inset: -4, borderRadius: 16, border: "2px solid var(--accent)" }} />}
              </div>
              <div style={{ fontWeight: 650, fontSize: 14, marginTop: 8 }}>{md.name}</div>
              <div className="faint" style={{ fontSize: 12, lineHeight: 1.3 }}>{md.line}</div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "grid", gap: 18 }}>
          <div className="muted" style={{ fontSize: 13.5 }}><b style={{ color: "var(--text)" }}>{m.name}</b> — {m.reacts}.</div>
          <Field label={m.dials[0]}><Slider label={m.dials[0]} value={look.style.a} onChange={(v) => setLook("style", { a: v })} format={(v) => `${Math.round(v * 100)}`} /></Field>
          <Field label={m.dials[1]}><Slider label={m.dials[1]} value={look.style.b} onChange={(v) => setLook("style", { b: v })} format={(v) => `${Math.round(v * 100)}`} /></Field>
          {!stageInfo.gl && m.kind === "gl" && <div className="faint" style={{ fontSize: 13 }}>This browser can't run shader modes; a simpler composition stands in.</div>}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ── Colour ─────────────────────────────────────────────────────────────────
function Swatch({ colors, on, onClick, label }: { colors: string[]; on: boolean; onClick: () => void; label: string }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={on}
      title={label}
      style={{ position: "relative", padding: 0, border: 0, background: "none", color: "inherit", display: "grid", gap: 6, justifyItems: "center" }}
    >
      <div style={{ position: "relative", width: 56, height: 56 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {colors.map((c, i) => <motion.span key={i} animate={{ backgroundColor: c }} transition={{ duration: 0.6 }} />)}
        </div>
        {on && <motion.div layoutId="swatch-ring" transition={spring.slide} style={{ position: "absolute", inset: -4, borderRadius: 22, border: "2px solid var(--accent)" }} />}
      </div>
      <span style={{ fontSize: 12, color: on ? "var(--text)" : "var(--text-2)" }}>{label}</span>
    </motion.button>
  );
}

function ColorSec() {
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const track = useStore((s) => getCurrentTrack(s));
  return (
    <>
      <SecHead title="Colour" onReset={() => setLook("color", DEFAULT_LOOK.color)}>Follow the record, or choose a palette.</SecHead>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Swatch label="Artwork" colors={artNow(track).palette} on={look.color.source === "artwork"} onClick={() => setLook("color", { source: "artwork" })} />
        {PALETTES.map((p) => <Swatch key={p.id} label={p.name} colors={p.c} on={look.color.source === p.id} onClick={() => setLook("color", { source: p.id })} />)}
      </div>
      <Field label="Warmth" hint="Leans every colour toward amber or toward blue.">
        <Slider label="Warmth" value={look.color.warmth} min={-1} max={1} center={0} onChange={(v) => setLook("color", { warmth: v })} format={(v) => (Math.abs(v) < 0.02 ? "neutral" : v > 0 ? `warm ${Math.round(v * 100)}` : `cool ${Math.round(-v * 100)}`)} />
      </Field>
      <Field label="Vividness">
        <Slider label="Vividness" value={look.color.vivid} min={0} max={1.4} onChange={(v) => setLook("color", { vivid: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Field>
    </>
  );
}

// ── Motion ─────────────────────────────────────────────────────────────────
function MotionSec() {
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  return (
    <>
      <SecHead title="Scene motion" onReset={() => setLook("motion", DEFAULT_LOOK.motion)}>How the stage moves on its own.</SecHead>
      <Field label="Speed" hint="How fast the scene drifts. Music still drives the accents.">
        <Slider label="Speed" value={look.motion.speed} min={0.2} max={2} onChange={(v) => setLook("motion", { speed: v })} format={(v) => `${v.toFixed(2)}×`} />
      </Field>
      <Field label="Quiet breathing" hint="How much the scene keeps moving in silence and between songs.">
        <Slider label="Quiet breathing" value={look.motion.drift} onChange={(v) => setLook("motion", { drift: v })} format={(v) => `${Math.round(v * 100)}`} />
      </Field>
      <hr className="hairline" />
      <SecHead title="Interface motion" onReset={() => setUi({ motion: DEFAULT_UI.motion })}>Separate from the stage: how menus, views and controls animate.</SecHead>
      <Segmented
        stretch
        label="Interface motion"
        value={ui.motion}
        onChange={(v) => setUi({ motion: v })}
        options={[{ id: "full", label: "Full" }, { id: "calm", label: "Calm" }, { id: "minimal", label: "Minimal" }]}
      />
      <div className="faint" style={{ fontSize: 13 }}>
        {ui.motion === "full" ? "Every transition choreographed." : ui.motion === "calm" ? "Shorter, gentler transitions; no tilt or overshoot." : "Near-instant changes. Follows the system's reduced-motion setting too."}
      </div>
    </>
  );
}

// ── Intensity ──────────────────────────────────────────────────────────────
function BeatReadout() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const bar = el.querySelector<HTMLElement>("[data-bar]");
      const dot = el.querySelector<HTMLElement>("[data-dot]");
      const txt = el.querySelector<HTMLElement>("[data-txt]");
      if (bar) bar.style.transform = `scaleX(${sig.confidence.toFixed(3)})`;
      if (dot) { dot.style.transform = `scale(${0.6 + (sig.confidence > 0.45 ? sig.pulse : sig.transient) * 0.9})`; }
      if (txt) {
        const s = !sig.playing ? "Paused" : sig.tempoSource === "analysis" ? `${Math.round(sig.bpm)} BPM · from the track analysis` : sig.tempoSource === "live" ? `${Math.round(sig.bpm)} BPM · listening (provisional)` : sig.live ? "No steady pulse — following energy" : "No audio to read";
        if (txt.textContent !== s) txt.textContent = s;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={ref} style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span data-dot style={{ width: 12, height: 12, borderRadius: 12, background: "var(--accent)", transition: "transform 70ms linear" }} />
        <span data-txt style={{ fontSize: 13.5 }} />
      </div>
      <div style={{ height: 4, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
        <div data-bar style={{ height: "100%", background: "var(--accent)", transformOrigin: "left", transition: "transform 200ms linear" }} />
      </div>
      <div className="faint" style={{ fontSize: 12 }}>Beat confidence — the stage only locks to the beat above the midpoint.</div>
    </div>
  );
}

function IntensitySec() {
  const look = useStore((s) => s.look);
  const setLook = useStore((s) => s.setLook);
  const syncMs = useStore((s) => s.syncMs);
  return (
    <>
      <SecHead title="Intensity" onReset={() => { setLook("intensity", DEFAULT_LOOK.intensity); }}>How strongly the stage answers the music.</SecHead>
      <Field label="Reactivity" hint="How far loudness and frequency bands move the scene.">
        <Slider label="Reactivity" value={look.intensity.react} max={1.5} onChange={(v) => setLook("intensity", { react: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Field>
      <Field label="Accents" hint="Brightness and motion on beats (or on hits when the beat isn't steady).">
        <Slider label="Accents" value={look.intensity.accents} onChange={(v) => setLook("intensity", { accents: v })} format={(v) => `${Math.round(v * 100)}`} />
      </Field>
      <Field label="Rhythm">
        <Segmented
          stretch
          label="Rhythm lock"
          value={look.intensity.rhythm}
          onChange={(v) => setLook("intensity", { rhythm: v })}
          options={[{ id: "auto", label: "Auto" }, { id: "beat", label: "Beat" }, { id: "energy", label: "Energy" }]}
        />
      </Field>
      <div className="faint" style={{ fontSize: 13, marginTop: -10 }}>
        {look.intensity.rhythm === "auto" ? "Locks to the beat when it's trustworthy; follows energy and hits when it isn't." : look.intensity.rhythm === "beat" ? "Prefers the beat grid, accepting less certain tempos." : "Never snaps to a grid — pure energy and transients."}
      </div>
      <BeatReadout />
      <More>
        <Field label="Texture" hint="Film grain and vignette over the stage.">
          <Slider label="Texture" value={look.intensity.texture} onChange={(v) => setLook("intensity", { texture: v })} format={(v) => `${Math.round(v * 100)}`} />
        </Field>
        <Field label="Audio/visual offset" hint="Measured output latency is already compensated. Add more for Bluetooth headphones or a TV that delays sound." right={<button className="btn" data-size="sm" data-variant="ghost" onClick={() => useStore.setState({ syncMs: 0 })}>Reset</button>}>
          <Slider label="A/V offset" value={syncMs} min={0} max={400} step={5} onChange={(v) => useStore.setState({ syncMs: v })} format={(v) => `+${Math.round(v)} ms`} />
        </Field>
      </More>
    </>
  );
}

// ── Lyrics ─────────────────────────────────────────────────────────────────
function LyricsSec() {
  const p = useStore((s) => s.lyricPrefs);
  const set = useStore((s) => s.setLyricPrefs);
  const auto = useStore((s) => s.lyricAuto);
  return (
    <>
      <SecHead title="Lyrics" onReset={() => set(DEFAULT_LYRICS)}>How the words are set, everywhere they appear.</SecHead>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 560 }}>Show lyrics</span><Switch label="Show lyrics" on={p.show} onChange={(v) => set({ show: v })} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 560 }}>Find lyrics automatically<div className="faint" style={{ fontSize: 12.5, fontWeight: 400 }}>From the file's own tags first, then lrclib.net</div></span>
        <Switch label="Find lyrics automatically" on={auto} onChange={(v) => useStore.setState({ lyricAuto: v })} />
      </div>
      <Field label="Size"><Slider label="Lyric size" value={p.size} min={0.8} max={1.4} onChange={(v) => set({ size: v })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
      <Field label="Alignment"><Segmented stretch label="Alignment" value={p.align} onChange={(v) => set({ align: v })} options={[{ id: "left", label: "Left" }, { id: "center", label: "Centre" }]} /></Field>
      <Field label="Active word" hint="Used when the lyrics carry word timing; otherwise the whole line lights.">
        <Segmented stretch label="Highlight" value={p.highlight} onChange={(v) => set({ highlight: v })} options={[{ id: "fill", label: "Fill" }, { id: "glow", label: "Glow" }, { id: "lift", label: "Lift" }]} />
      </Field>
      <More>
        <Field label="Stage contrast" hint="Darkens the stage behind lyrics so they read over any mode.">
          <Slider label="Stage contrast" value={p.scrim} onChange={(v) => set({ scrim: v })} format={(v) => `${Math.round(v * 100)}`} />
        </Field>
        <Field label="Lyric timing offset" hint="Nudge if a lyric source runs early or late. Positive shows lines later.">
          <Slider label="Lyric offset" value={p.offsetMs} min={-1500} max={1500} step={50} center={0} onChange={(v) => set({ offsetMs: v })} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} ms`} />
        </Field>
      </More>
    </>
  );
}

// ── Interface ──────────────────────────────────────────────────────────────
const ACCENTS = ["#ff7a3d", "#ffd23f", "#5fe0c8", "#9fd4ff", "#ff9fae", "#c8f04a", "#f0e6d6"];

function InterfaceSec() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const quality = useStore((s) => s.quality);
  const track = useStore((s) => getCurrentTrack(s));
  const fpsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t = setInterval(() => { if (fpsRef.current) fpsRef.current.textContent = `${stageInfo.fps} fps · ${Math.round(stageInfo.scale * 100)}% resolution`; }, 500);
    return () => clearInterval(t);
  }, []);
  const themes: { id: typeof ui.theme; label: string; bg: string; fg: string }[] = [
    { id: "ink", label: "Ink", bg: "#0f0d0b", fg: "#f4eee4" },
    { id: "night", label: "Night", bg: "#080a10", fg: "#e9eef7" },
    { id: "paper", label: "Paper", bg: "#f2eee6", fg: "#1b1713" },
  ];
  return (
    <>
      <SecHead title="Interface" onReset={() => setUi({ ...DEFAULT_UI, motion: ui.motion })}>The room around the music — independent of the stage look.</SecHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {themes.map((t) => (
          <motion.button key={t.id} whileTap={{ scale: 0.96 }} whileHover={{ y: -2 }} aria-pressed={ui.theme === t.id} onClick={() => setUi({ theme: t.id })} style={{ padding: 0, border: 0, background: "none", color: "inherit", textAlign: "left" }}>
            <div style={{ position: "relative", aspectRatio: "1.3", borderRadius: 14, background: t.bg, border: "1px solid var(--line)", padding: 10, display: "grid", alignContent: "end", gap: 4 }}>
              <span style={{ width: "70%", height: 8, borderRadius: 4, background: t.fg }} />
              <span style={{ width: "40%", height: 6, borderRadius: 4, background: t.fg, opacity: 0.5 }} />
              <span style={{ position: "absolute", top: 10, right: 10, width: 16, height: 16, borderRadius: 16, background: "var(--accent)" }} />
              {ui.theme === t.id && <motion.div layoutId="theme-ring" transition={spring.slide} style={{ position: "absolute", inset: -4, borderRadius: 18, border: "2px solid var(--accent)" }} />}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 8 }}>{t.label}</div>
          </motion.button>
        ))}
      </div>
      <Field label="Accent">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => setUi({ accent: "artwork" })} aria-pressed={ui.accent === "artwork"} className="btn" data-size="sm" style={ui.accent === "artwork" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
            <span style={{ width: 14, height: 14, borderRadius: 14, background: artNow(track).accent }} /> From artwork
          </motion.button>
          {ACCENTS.map((c) => (
            <motion.button key={c} whileTap={{ scale: 0.86 }} aria-label={`Accent ${c}`} aria-pressed={ui.accent === c} onClick={() => setUi({ accent: c })} style={{ position: "relative", width: 28, height: 28, borderRadius: 28, border: 0, background: c }}>
              {ui.accent === c && <motion.span layoutId="accent-ring" transition={spring.slide} style={{ position: "absolute", inset: -4, borderRadius: 32, border: "2px solid var(--text)" }} />}
            </motion.button>
          ))}
        </div>
      </Field>
      <Field label="Stage behind the interface" hint="How much of the live scene shows through on every view. Off keeps a plain background.">
        <Slider label="Backdrop" value={ui.backdrop} onChange={(v) => setUi({ backdrop: v })} format={(v) => (v < 0.02 ? "off" : `${Math.round(v * 100)}%`)} />
      </Field>
      <Field label="Rendering quality" right={<span ref={fpsRef} className="mono faint" style={{ fontSize: 11 }} />}>
        <Segmented stretch size="sm" label="Quality" value={quality} onChange={(v) => useStore.setState({ quality: v })} options={[{ id: "auto", label: "Auto" }, { id: "high", label: "High" }, { id: "balanced", label: "Balanced" }, { id: "saver", label: "Saver" }]} />
      </Field>
      <div className="faint" style={{ fontSize: 13, marginTop: -10 }}>
        {quality === "auto" ? "Adapts resolution to hold a smooth frame rate." : quality === "high" ? "Full resolution, reduced only if frames drop badly." : quality === "balanced" ? "Three-quarter resolution — lighter on laptops." : "Half resolution at 30 fps — kindest to batteries."}
      </div>
    </>
  );
}
