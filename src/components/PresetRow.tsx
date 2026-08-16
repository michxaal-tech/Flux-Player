import { BORDER, MAG, PRESETS } from "../constants";
import { useStore } from "../store/useStore";
import { chip } from "./ui";

export function PresetRow() {
  const activePreset = useStore((s) => s.activePreset);
  const userPresets = useStore((s) => s.userPresets);
  const applyPreset = useStore((s) => s.applyPreset);
  const saveUserPreset = useStore((s) => s.saveUserPreset);
  const deleteUserPreset = useStore((s) => s.deleteUserPreset);
  const chaos = useStore((s) => s.chaos);

  return (
    <div className="hscroll" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 8 }}>
      <button onClick={saveUserPreset} style={chip(false, MAG)}>＋ SAVE FX</button>
      {userPresets.map((p, i) => (
        <span key={p.name} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => applyPreset(p)} style={chip(activePreset === p.name, MAG)}>★ {p.name}</button>
          <span
            onClick={() => deleteUserPreset(i)}
            style={{
              position: "absolute", top: -5, right: -4, width: 15, height: 15, borderRadius: "50%",
              background: "#222", border: BORDER, fontSize: 8, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
            }}
          >✕</span>
        </span>
      ))}
      {PRESETS.map((p) => (
        <button key={p.name} onClick={() => applyPreset(p)} style={chip(activePreset === p.name)}>{p.name}</button>
      ))}
      <button onClick={chaos} style={chip(activePreset === "??", MAG)}>🎲 CHAOS</button>
    </div>
  );
}
