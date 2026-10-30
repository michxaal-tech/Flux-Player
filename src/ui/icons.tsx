// One icon family, drawn on a 24 grid with a 1.75 stroke and round joins, so
// every glyph in the interface has the same weight and voice.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 22, p: SVGProps<SVGSVGElement>) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const I = {
  prev: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M18 6.5v11a.8.8 0 0 1-1.25.66L9.5 13.3a1.6 1.6 0 0 1 0-2.6l7.25-4.86A.8.8 0 0 1 18 6.5Z" fill="currentColor" stroke="none" /><path d="M6 6v12" strokeWidth={2.2} /></svg>
  ),
  next: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M6 6.5v11a.8.8 0 0 0 1.25.66l7.25-4.86a1.6 1.6 0 0 0 0-2.6L7.25 5.84A.8.8 0 0 0 6 6.5Z" fill="currentColor" stroke="none" /><path d="M18 6v12" strokeWidth={2.2} /></svg>
  ),
  shuffle: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M3 7h3.2c1.7 0 3.3.9 4.2 2.4l3.2 5.2c.9 1.5 2.5 2.4 4.2 2.4H21" /><path d="M3 17h3.2c1.2 0 2.3-.4 3.2-1.2M14.6 8.2A4.9 4.9 0 0 1 17.8 7H21" /><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" /></svg>
  ),
  repeat: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19" /><path d="m16 3 3 3-3 3" /><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5" /><path d="m8 21-3-3 3-3" /></svg>
  ),
  heart: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" /></svg>
  ),
  lyrics: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M4 7h11M4 12h16M4 17h8" /><circle cx="18.5" cy="17" r="1.6" fill="currentColor" stroke="none" /></svg>
  ),
  queue: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M4 6h12M4 11h12M4 16h7" /><path d="M15 15.5v4.5l4-2.25-4-2.25Z" fill="currentColor" /></svg>
  ),
  stage: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><circle cx="12" cy="12" r="8" /><path d="M12 4c2.2 2.5 3 5 3 8s-.8 5.5-3 8M12 4c-2.2 2.5-3 5-3 8s.8 5.5 3 8M4.5 9.5h15M4.5 14.5h15" opacity=".55" /></svg>
  ),
  listen: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" /><path d="M12 6.2a5.8 5.8 0 0 1 5.8 5.8" opacity=".55" /></svg>
  ),
  library: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M5 4.5v15M9.5 4.5v15" /><path d="m14 5.2 4.6 14.1" /></svg>
  ),
  search: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.6 15.6 4.4 4.4" /></svg>
  ),
  sound: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M6 4v16M12 4v16M18 4v16" opacity=".4" /><circle cx="6" cy="14.5" r="2" fill="var(--bg)" /><circle cx="12" cy="8.5" r="2" fill="var(--bg)" /><circle cx="18" cy="12.5" r="2" fill="var(--bg)" /></svg>
  ),
  studio: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.2 0 1.7-.9 1.4-1.8-.4-1.2.3-2.3 1.6-2.3h1.7a3.5 3.5 0 0 0 3.5-3.6C20.2 7.6 16.5 3.8 12 3.8Z" /><circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none" /><circle cx="11.5" cy="7.6" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.8" cy="9" r="1.2" fill="currentColor" stroke="none" /></svg>
  ),
  settings: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>
  ),
  close: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  more: ({ size, ...p }: P) => (
    <svg {...base(size, p)}><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
  ),
  plus: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M12 5v14M5 12h14" /></svg>,
  check: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  drag: ({ size, ...p }: P) => (
    <svg {...base(size, p)}>{[8, 12, 16].map((y) => <g key={y}><circle cx="9.5" cy={y} r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy={y} r="1" fill="currentColor" stroke="none" /></g>)}</svg>
  ),
  trash: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7" /></svg>,
  edit: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M5 19h3.5L19 8.5 15.5 5 5 15.5V19Z" /><path d="m13.5 7 3.5 3.5" /></svg>,
  copy: ({ size, ...p }: P) => <svg {...base(size, p)}><rect x="8" y="8" width="11" height="11" rx="2.5" /><path d="M16 5.5A1.5 1.5 0 0 0 14.5 4h-8A2.5 2.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16" /></svg>,
  back: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M15 5 8 12l7 7" /></svg>,
  chevron: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="m9 5 7 7-7 7" /></svg>,
  down: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="m5 9 7 7 7-7" /></svg>,
  upload: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14" /></svg>,
  sparkle: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z" /><path d="M18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" /></svg>,
  reset: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4 4.5v4h4" /></svg>,
  playlist: ({ size, ...p }: P) => <svg {...base(size, p)}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></svg>,
  artist: ({ size, ...p }: P) => <svg {...base(size, p)}><circle cx="12" cy="9" r="3.6" /><path d="M5 19.5c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5" /></svg>,
  clock: ({ size, ...p }: P) => <svg {...base(size, p)}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>,
  note: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M9 18V6.5l10-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg>,
  globe: ({ size, ...p }: P) => <svg {...base(size, p)}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.4 2.3 3.5 5 3.5 8s-1.1 5.7-3.5 8c-2.4-2.3-3.5-5-3.5-8S9.6 6.3 12 4Z" /></svg>,
  minimize: ({ size, ...p }: P) => <svg {...base(size, p)}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>,
};

/** Speaker whose waves count follows the level (0 = muted). */
export function VolumeGlyph({ level, size = 22 }: { level: number; size?: number }) {
  const waves = level <= 0.001 ? 0 : level < 0.34 ? 1 : level < 0.67 ? 2 : 3;
  return (
    <svg {...base(size, {})}>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={["M15 10a3 3 0 0 1 0 4", "M17 8a6 6 0 0 1 0 8", "M19 6a9 9 0 0 1 0 12"][i]}
          style={{ opacity: i < waves ? 1 : 0, transform: `scale(${i < waves ? 1 : 0.6})`, transformOrigin: "13px 12px", transition: "opacity var(--t2) var(--ease-out), transform var(--t3) var(--ease-spring)" }}
        />
      ))}
      <path d="m15.5 9.5 5 5m0-5-5 5" style={{ opacity: waves ? 0 : 1, transition: "opacity var(--t2)" }} />
    </svg>
  );
}
