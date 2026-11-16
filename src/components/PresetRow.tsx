import { PRESETS } from "../constants";
import { useStore } from "../store/useStore";
import { Chip } from "../ui/kit";
import { I } from "../ui/icons";

const nice = (n: string) => n.toLowerCase().replace(/(^|[\s+'])\S/g, (c) => c.toUpperCase());

/** Sound presets: the built-in ones, the user's own, save and randomise. */
export function PresetRow() {
  const activePreset = useStore((s) => s.activePreset);
  const userPresets = useStore((s) => s.userPresets);
  const applyPreset = useStore((s) => s.applyPreset);
  const saveUserPreset = useStore((s) => s.saveUserPreset);
  const deleteUserPreset = useStore((s) => s.deleteUserPreset);
  const chaos = useStore((s) => s.chaos);

  return (
    <div className="hscroll" style={{ display: "flex", gap: 8, paddingBottom: 2, alignItems: "center" }}>
      {PRESETS.map((p) => (
        <Chip key={p.name} on={activePreset === p.name} onClick={() => applyPreset(p)}>{nice(p.name)}</Chip>
      ))}
      {userPresets.map((p, i) => (
        <span key={p.name} style={{ display: "inline-flex", flexShrink: 0, alignItems: "center" }}>
          <Chip on={activePreset === p.name} onClick={() => applyPreset(p)}>★ {nice(p.name)}</Chip>
          <button className="icon-btn" aria-label={`Delete preset ${p.name}`} onClick={() => deleteUserPreset(i)} style={{ width: 26, height: 26, marginLeft: -2 }}><I.close size={13} /></button>
        </span>
      ))}
      <span style={{ width: 1, height: 20, background: "var(--line-2)", flexShrink: 0 }} />
      <Chip onClick={saveUserPreset} title="Save the current settings as a preset">+ Save FX</Chip>
      <Chip on={activePreset === "??"} onClick={chaos} title="Randomise everything">Chaos</Chip>
    </div>
  );
}
