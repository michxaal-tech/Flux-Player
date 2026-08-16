// Global accent theming driven by the visualizer palette.
// The whole UI uses CSS vars (--ac1/--ac2, see constants CYAN/MAG); canvases
// can't read CSS vars, so they use the ac1/ac2 helpers which track the same
// palette via the mutable `accent` record.
import { PALETTES } from "./constants";
import type { VisCfg } from "./types";

export const accent = { h1: 187, h2: 317, s: 100 };

export const ac1 = (a = 1, l = 62) => `hsla(${accent.h1}, ${accent.s}%, ${l}%, ${a})`;
export const ac2 = (a = 1, l = 62) => `hsla(${accent.h2}, ${accent.s}%, ${l}%, ${a})`;

/** Translucent variant of any CSS color (vars included), e.g. mix(CYAN, 27). */
export const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export function applyAccentTheme(cfg: VisCfg): void {
  const pal = PALETTES.find((p) => p.id === cfg.palette) || PALETTES[0];
  accent.h1 = pal.h ? pal.h[0] : cfg.h1;
  accent.h2 = pal.h ? pal.h[1] : cfg.h2;
  accent.s = pal.s;
  const root = document.documentElement.style;
  root.setProperty("--ac1", ac1());
  root.setProperty("--ac2", ac2());
}
