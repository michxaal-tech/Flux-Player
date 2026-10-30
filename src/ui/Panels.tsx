// Sound and Settings: the instrument panels (FX rack, deck, Revoice, sources,
// AI, recorder, export) set into the new interface. Those panels are dense
// tools with their own layouts, so they live on a dark "hardware" surface in
// every theme, and switch between each other with the same sliding motion as
// everything else.
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FXRackTab } from "../components/FXRackTab";
import { DJTab } from "../components/DJTab";
import { Revoice } from "../components/Revoice";
import { MeTab } from "../components/MeTab";
import { ConnectionsPanel } from "../components/ConnectionsPanel";
import { useStore } from "../store/useStore";
import { Segmented, Switch } from "./kit";
import { ease } from "./motion";
import { I } from "./icons";

function Title({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div>
        <motion.h1 className="display" initial={{ clipPath: "inset(0 0 100% 0)", y: 18 }} animate={{ clipPath: "inset(0 0 -10% 0)", y: 0 }} transition={{ duration: 0.7, ease: ease.out }} style={{ margin: 0, fontSize: "clamp(40px, 6vw, 72px)" }}>{title}</motion.h1>
      </div>
      {right}
    </header>
  );
}

function Swap({ k, dir, children }: { k: string; dir: number; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={k}
        custom={dir}
        variants={{ in: (d: number) => ({ opacity: 0, x: d * 40 }), at: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: d * -40, transition: { duration: 0.16 } }) }}
        initial="in" animate="at" exit="out"
        transition={{ duration: 0.4, ease: ease.out }}
        className="instrument"
      >{children}</motion.div>
    </AnimatePresence>
  );
}

export function Sound() {
  const [tab, setTab] = useState<"fx" | "deck" | "revoice">("fx");
  const [dir, setDir] = useState(1);
  const order = ["fx", "deck", "revoice"];
  return (
    <div>
      <Title
        eyebrow="Shape the sound"
        title="Sound"
        right={<Segmented label="Sound section" value={tab} onChange={(v) => { setDir(order.indexOf(v) > order.indexOf(tab) ? 1 : -1); setTab(v); }} options={[{ id: "fx", label: "Effects" }, { id: "deck", label: "Deck" }, { id: "revoice", label: "Revoice" }]} />}
      />
      <Swap k={tab} dir={dir}>
        {tab === "fx" && <FXRackTab />}
        {tab === "deck" && <DJTab />}
        {tab === "revoice" && <Revoice />}
      </Swap>
    </div>
  );
}

export function Settings() {
  const [tab, setTab] = useState<"general" | "sources">("general");
  const analyzed = useStore((s) => s.analyzedMode);
  const deep = useStore((s) => s.deepAnalyze);
  const smooth = useStore((s) => s.smooth);
  return (
    <div>
      <Title
        eyebrow="Preferences, sources, your data"
        title="Settings"
        right={<Segmented label="Settings section" value={tab} onChange={setTab} options={[{ id: "general", label: "General" }, { id: "sources", label: "Sources" }]} />}
      />
      {tab === "general" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: ease.out }} style={{ display: "grid", gap: 16, marginBottom: 18 }}>
          <div style={{ display: "grid", gap: 14, padding: 20, borderRadius: 22, background: "var(--surface)", border: "1px solid var(--line)" }}>
            <Row label="Analyse tracks for exact beats" hint="Decodes each local track once, on this device, to find its beat grid, sections and drops. The stage and tempo readout use it; without it they rely on listening live, which is less certain.">
              <Switch label="Analyse tracks" on={analyzed} onChange={(v) => useStore.setState({ analyzedMode: v })} />
            </Row>
            <Row label="Deep analysis" hint="Slower, triple-checked beat tracking — better for music whose tempo moves.">
              <Switch label="Deep analysis" on={deep} onChange={(v) => useStore.setState({ deepAnalyze: v })} />
            </Row>
            <Row label="Crossfade between tracks" hint="A short fade when you skip, instead of a hard cut.">
              <Switch label="Crossfade" on={smooth} onChange={(v) => useStore.setState({ smooth: v })} />
            </Row>
            <Row label="Replay the opening" hint="Show the full intro sequence on the next launch.">
              <button className="btn" data-size="sm" onClick={() => useStore.setState({ introSeen: false })}><I.reset size={15} /> Reset</button>
            </Row>
          </div>
        </motion.div>
      )}
      <Swap k={tab} dir={tab === "general" ? -1 : 1}>
        {tab === "general" ? <MeTab /> : <ConnectionsPanel />}
      </Swap>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div className="faint" style={{ fontSize: 13, maxWidth: 560 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
