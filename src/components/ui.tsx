import type { CSSProperties, ReactNode } from "react";
import { BG, CYAN, MAG } from "../constants";
import { mix } from "../theme";
import { Chip, Slider as KitSlider } from "../ui/kit";

// These are the shared atoms of the tool panels (sources, AI, Revoice). They
// keep their original call signatures and are drawn with the interface kit, so
// every panel follows the same design without each one being rewritten.

/** "⏱ TIME & PITCH" → "Time & pitch": the old emoji-and-caps titles, set quietly. */
export const tidy = (t: string) => {
  const s = t.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase().replace(/\b(ai|fx|bpm|midi|dj|lrc)\b/g, (m) => m.toUpperCase()) : s;
};

export function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 560 }}>{tidy(label)}</span>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{format(value)}</span>
      </div>
      <KitSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} format={format} />
    </div>
  );
}

export function Toggle({
  label, on, onChange,
}: {
  label: string; on: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return <Chip on={on} onClick={() => onChange(!on)}>{tidy(label)}</Chip>;
}

export function Module({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span className="card-title">{tidy(title)}</span>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** "NEW" marker, rendered inline inside a chip's label. */
export function NewTag() {
  return (
    <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", background: "var(--accent)", color: "var(--on-accent)", verticalAlign: "middle" }}>NEW</span>
  );
}

export const chip = (active: boolean, _color?: string): CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "var(--on-accent)" : "var(--text)",
  border: `1px solid ${active ? "transparent" : "var(--line)"}`,
});

export const bigBtn = (_color?: string): CSSProperties => ({
  padding: "13px 16px", borderRadius: 14, fontSize: 14, fontWeight: 650, cursor: "pointer",
  background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", textAlign: "center",
});

// crisp SVG transport icons
export const PlayIcon = ({ size = 22, color = BG }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block", marginLeft: size * 0.08 }}>
    <path d="M8 5.6v12.8c0 .9 1 1.5 1.8 1l10-6.4c.7-.5.7-1.5 0-2l-10-6.4C9 4.1 8 4.7 8 5.6z" />
  </svg>
);

export const PauseIcon = ({ size = 22, color = BG }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
    <rect x="6.2" y="4.8" width="4.2" height="14.4" rx="1.8" />
    <rect x="13.6" y="4.8" width="4.2" height="14.4" rx="1.8" />
  </svg>
);

export const PrevIcon = ({ size = 17, color = "rgba(255,255,255,0.88)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
    <rect x="4.5" y="5" width="2.6" height="14" rx="1.3" />
    <path d="M19.5 6v12c0 1-1.1 1.5-1.9 1L9.3 13c-.7-.5-.7-1.5 0-2l8.3-6c.8-.5 1.9 0 1.9 1z" />
  </svg>
);

export const NextIcon = ({ size = 17, color = "rgba(255,255,255,0.88)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
    <path d="M4.5 6v12c0 1 1.1 1.5 1.9 1l8.3-6c.7-.5.7-1.5 0-2l-8.3-6c-.8-.5-1.9 0-1.9 1z" />
    <rect x="16.9" y="5" width="2.6" height="14" rx="1.3" />
  </svg>
);

export const skipBtn: CSSProperties = {
  width: 42, height: 42, borderRadius: "50%", cursor: "pointer",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.13)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

export const playBtn = (size: number): CSSProperties => ({
  width: size, height: size, borderRadius: "50%", border: "none", cursor: "pointer",
  background: `linear-gradient(145deg, ${CYAN}, ${MAG})`,
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: `0 0 32px ${mix(CYAN, 45)}, inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.25)`,
});
