/**
 * Which kind of machine is this, and what may the renderer spend on it?
 *
 * Three profiles, not two. The Electron desktop app and a laptop browser were
 * the only cases the ceilings were ever tuned for, and a phone GPU inside the
 * Android WebView fell into the "browser" bucket — so it got a laptop's
 * settings, which is how a canvas-2D visualiser with shadowBlur and full-screen
 * `lighter` compositing turns into a slideshow on a phone.
 *
 * Lives in its own module because both the engine and the lyric renderer need
 * it, and the lyric renderer importing the engine would be a cycle.
 */

// Memoised, and that is not an optimisation detail — it is the difference
// between "detected once" and "detected several times a frame". maxEdge() and
// dprCap() are both called from sizeCanvas, which runs per canvas per frame, so
// an unmemoised matchMedia() here builds a MediaQueryList (and can force a
// style recalc in the Android WebView) on every one of those calls.
let mobileMemo: boolean | null = null;

export function isMobile(): boolean {
  if (mobileMemo !== null) return mobileMemo;
  if (typeof window === "undefined") return false; // not cached: no window yet
  const o = (window as any).__fluxMobile;
  if (o != null) return (mobileMemo = !!o);
  if ((window as any).__fluxDesktop) return (mobileMemo = false);
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    return (mobileMemo = true);
  }
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) <= 820;
  return (mobileMemo = coarse && small);
}

/** Longest backing-store edge allowed, before the adaptive resScale multiplies it. */
export function maxEdge(): number {
  if (typeof window !== "undefined" && (window as any).__fluxDesktop) return 2560;
  return isMobile() ? 1200 : 1800;
}

/** Cap on the device-pixel-ratio the backing store is drawn at. */
export function dprCap(): number {
  return isMobile() ? 1.5 : 2;
}

/**
 * Ceiling on a single draw call's `shadowBlur`, in canvas units.
 *
 * A blurred fill is the most expensive thing a 2D canvas does, and the cost
 * climbs with the radius — so on a phone the radius, not the number of draws,
 * is what decides whether a text-heavy frame lands. Infinity elsewhere: the
 * desktop and browser looks are not changed by this at all.
 */
export function blurCap(): number {
  return isMobile() ? 10 : Infinity;
}
