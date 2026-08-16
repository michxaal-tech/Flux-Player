import type { CSSProperties, ReactNode } from "react";
import { BG, BORDER, CARD, CYAN, MAG, MONO } from "../constants";

export function Slider({
  label, value, min, max, step, format, onChange, color = CYAN,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export function Toggle({
  label, on, onChange, color = CYAN,
}: {
  label: string; on: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
        background: on ? color : "rgba(255,255,255,0.06)", color: on ? BG : "rgba(255,255,255,0.6)",
        border: on ? `1px solid ${color}` : BORDER,
      }}
    >
      {label}
    </button>
  );
}

export function Module({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ background: CARD, border: BORDER, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.85)" }}>{title}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}

export const chip = (active: boolean, color = CYAN): CSSProperties => ({
  padding: "9px 15px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  background: active ? color : "rgba(255,255,255,0.06)", color: active ? BG : "rgba(255,255,255,0.75)",
  border: active ? `1px solid ${color}` : BORDER,
});

export const bigBtn = (color = CYAN): CSSProperties => ({
  padding: "16px 10px", borderRadius: 12, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
  background: "rgba(255,255,255,0.05)", color, border: `1px solid ${color}44`, textAlign: "center",
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
  boxShadow: "0 0 32px rgba(83,233,255,0.45), inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.25)",
});
