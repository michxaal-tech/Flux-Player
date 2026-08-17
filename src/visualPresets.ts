// Visual presets — save a whole look, recall it, and share it as a code.
//
// A "look" is now a large configuration: theme, palette, 3D projection and its
// depth, up to 34 stacked impacts, particle drift/shape/size, lyric animation
// and letter effect, drop escalation. Dialling one in takes real time and there
// was no way to keep it — close the tab and it was gone.
//
// Share codes are self-contained rather than a server lookup, because FLUX has
// no backend and audio never leaves the device; a look is small enough to fit
// entirely inside the string. Keys are shortened so a full look stays around
// 200 characters, and every field is re-validated on import — a pasted code is
// untrusted input, so it goes through the same clamping the AI layer uses.
import { DEFAULT_VIS_CFG, VIS_THEMES } from "./constants";
import { sanitizeVis } from "./ai/commands";
import { LIGHT_FX } from "./palette";
import { LYRIC_FX } from "./visualizer/lyricFx";
import { LYRIC_STYLES } from "./visualizer/lyricRenderer";
import { useStore } from "./store/useStore";
import type { VisCfg } from "./types";

export interface Look {
  theme: string;
  cfg: VisCfg;
  lyricStyle: string;
  lyricFx: string;
  lyricFxMatch: boolean;
}

export interface VisualPreset {
  name: string;
  look: Look;
}

/** Reads the current look out of the store. */
export function captureLook(): Look {
  const s = useStore.getState();
  return {
    theme: s.visTheme,
    cfg: { ...s.visCfg },
    lyricStyle: s.lyricStyle,
    lyricFx: s.lyricFx,
    lyricFxMatch: s.lyricFxMatch,
  };
}

/** Applies a look, filling any missing field from the defaults so an older
 * code (saved before a setting existed) still loads cleanly. */
export function applyLook(look: Look): void {
  const cfg = { ...DEFAULT_VIS_CFG, ...look.cfg };
  useStore.setState({
    visTheme: VIS_THEMES.includes(look.theme) ? look.theme : useStore.getState().visTheme,
    visCfg: cfg,
    lyricStyle: LYRIC_STYLES.includes(look.lyricStyle) ? look.lyricStyle : "DRIFT",
    lyricFx: LYRIC_FX.includes(look.lyricFx) ? look.lyricFx : "NONE",
    lyricFxMatch: !!look.lyricFxMatch,
  });
}

// ── share codes ──────────────────────────────────────────────────────────
// Short keys keep a full look inside a pasteable string. The map is explicit
// rather than derived so renaming a VisCfg field can never silently change what
// existing codes decode to.
const K: Record<string, string> = {
  palette: "p", h1: "h1", h2: "h2", glow: "g", trail: "tr", particles: "pc",
  pStyle: "ps", pShape: "ph", pSize: "pz", pScale: "px", speed: "sp",
  intensity: "in", zoom: "zm", spinV: "sv", bgWash: "bw", thick: "tk",
  mirror: "mi", shake: "sk", flash: "fl", impacts: "im", autoMode: "am",
  hiRes: "hr", fastBeats: "fb", syncMs: "sy", vis3d: "d3", vis3dAmt: "da",
  dropFx: "df",
  lightFx: "lf",
};
const UNK: Record<string, string> = Object.fromEntries(Object.entries(K).map(([a, b]) => [b, a]));

const b64url = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))),
};

/** Encodes a look as a share code. */
export function encodeLook(look: Look): string {
  const c: Record<string, unknown> = {};
  for (const [full, short] of Object.entries(K)) {
    const v = (look.cfg as unknown as Record<string, unknown>)[full];
    if (v !== undefined) c[short] = v;
  }
  const payload = {
    v: 1,
    t: look.theme,
    c,
    ls: look.lyricStyle,
    lf: look.lyricFx,
    lm: look.lyricFxMatch ? 1 : 0,
  };
  return `FLUX1-${b64url.enc(JSON.stringify(payload))}`;
}

/**
 * Decodes a share code, or returns null if it isn't one.
 *
 * Everything is re-validated: a code is untrusted text someone pasted, and a
 * bad value here would land straight in the render loop.
 */
export function decodeLook(code: string): Look | null {
  const trimmed = code.trim().replace(/^.*FLUX1-/, "");
  if (!trimmed) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64url.dec(trimmed)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const rawCfg = (payload.c ?? {}) as Record<string, unknown>;
  const expanded: Record<string, unknown> = {};
  for (const [short, v] of Object.entries(rawCfg)) {
    const full = UNK[short];
    if (full) expanded[full] = v;
  }
  // sanitizeVis clamps every numeric to its real slider range and drops
  // anything it doesn't recognise, which is exactly what a pasted code needs
  const { cfg, theme: sanTheme } = sanitizeVis({ ...expanded, theme: payload.t });

  // fields sanitizeVis doesn't cover yet
  const passthrough: Partial<VisCfg> = {};
  if (typeof expanded.pShape === "string") passthrough.pShape = expanded.pShape;
  if (typeof expanded.pSize === "string") passthrough.pSize = expanded.pSize;
  if (typeof expanded.vis3d === "string") passthrough.vis3d = expanded.vis3d;
  if (typeof expanded.lightFx === "string" && LIGHT_FX.includes(expanded.lightFx)) passthrough.lightFx = expanded.lightFx;
  if (Array.isArray(expanded.impacts)) {
    passthrough.impacts = (expanded.impacts as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 40);
  }

  const theme = typeof payload.t === "string" && VIS_THEMES.includes(payload.t)
    ? payload.t
    : sanTheme ?? DEFAULT_VIS_CFG.palette; // never used as a theme, just a guard
  return {
    theme: VIS_THEMES.includes(theme) ? theme : "RING",
    cfg: { ...DEFAULT_VIS_CFG, ...cfg, ...passthrough },
    lyricStyle: typeof payload.ls === "string" && LYRIC_STYLES.includes(payload.ls) ? payload.ls : "DRIFT",
    lyricFx: typeof payload.lf === "string" && LYRIC_FX.includes(payload.lf) ? payload.lf : "NONE",
    lyricFxMatch: payload.lm !== 0,
  };
}

/** Copies text to the clipboard, falling back to a hidden textarea where the
 * async clipboard API is unavailable (older iOS Safari, insecure origins). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
