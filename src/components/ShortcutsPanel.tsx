import { motion } from "framer-motion";
import { SHORTCUTS } from "../hooks/useKeyboard";
import { useStore } from "../store/useStore";
import { I } from "../ui/icons";
import { spring } from "../ui/motion";

export function ShortcutsPanel() {
  const set = useStore((s) => s.set);
  const close = () => set({ shortcutsOpen: false });
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgb(var(--scrim) / 0.7)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <motion.div
        role="dialog" aria-label="Keyboard shortcuts"
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={spring.soft}
        onClick={(e) => e.stopPropagation()}
        className="scroll"
        style={{ width: "min(100%, 460px)", maxHeight: "82vh", background: "var(--bg-raise)", border: "1px solid var(--line)", borderRadius: 24, padding: 24, boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Keyboard shortcuts</div>
            <div className="display" style={{ fontSize: 30, marginTop: 6 }}>Keys</div>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={close}><I.close size={20} /></button>
        </div>
        {SHORTCUTS.map((sc, i) => (
          <motion.div key={sc.keys} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.015 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 14 }}>{sc.does}</span>
            <kbd className="mono" style={{ fontSize: 12, padding: "4px 9px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--line)", whiteSpace: "nowrap" }}>{sc.keys}</kbd>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
