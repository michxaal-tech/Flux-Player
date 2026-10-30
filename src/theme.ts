// Colour helpers shared by the instrument panels.

/** Translucent variant of any CSS color (vars included), e.g. mix(CYAN, 27). */
export const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;
