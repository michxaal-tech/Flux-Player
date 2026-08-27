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

/**
 * Sharp mode: this frame's theme is cheap enough to draw at nearly native
 * resolution.
 *
 * The phone complaint was two complaints — laggy *and* blurry — and they are
 * the same fact seen from both ends. The canvas was rendered at 1200px and CSS
 * stretched to a 1080x2400 screen, so every frame was upscaled about 2x, and
 * the fix for the lag (fewer pixels) is the cause of the blur. Tuning could
 * only trade one for the other.
 *
 * What breaks the trade is the *theme*. A theme that never calls `glow()` skips
 * the offscreen scene buffer, the bloom pass and the blit entirely (see the
 * `offscreen` decision in engine.ts) — several full-screen passes a frame that
 * simply do not happen. That buys back far more than the extra pixels cost, so
 * the mobile-native themes can be drawn close to native and be sharp *and*
 * fast. Legacy themes keep the old conservative ceilings.
 *
 * Set per frame by the engine before the canvas is sized.
 */
let sharp = false;

export function setSharp(on: boolean): void {
  sharp = on;
}

/** Longest backing-store edge allowed, before the adaptive resScale multiplies it. */
export function maxEdge(): number {
  if (typeof window !== "undefined" && (window as any).__fluxDesktop) return 2560;
  if (!isMobile()) return 1800;
  return sharp ? 2000 : 1200;
}

/** Cap on the device-pixel-ratio the backing store is drawn at. */
export function dprCap(): number {
  if (!isMobile()) return 2;
  return sharp ? 2.5 : 1.5;
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
