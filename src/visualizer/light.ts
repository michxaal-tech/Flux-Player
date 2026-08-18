// A cached soft-light sprite, shared by the drop layers and by any theme that
// draws glowing points.
//
// Canvas `shadowBlur` is priced per draw call, so setting it inside a loop that
// paints a few dozen sparks is what turns a theme into a slideshow — it cost
// CROWN 429ms a frame and FIREWORKS 500ms before both were moved onto this.
// Rasterising the falloff once per colour and blitting it looks the same and
// costs what a plain image draw costs.

const spriteCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  const hit = spriteCache.get(color);
  if (hit) return hit;
  const R = 32;
  const cv = document.createElement("canvas");
  cv.width = cv.height = R * 2;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(0, 0, R * 2, R * 2);
  // bounded, so a drifting palette cannot grow this without limit
  // Bounded so a drifting palette cannot grow it without limit. Note the cache
  // only pays off when a caller reuses one colour across many points — give it
  // a per-point colour and it rebuilds a canvas per point, which is slower than
  // the shadowBlur it replaced.
  if (spriteCache.size > 48) spriteCache.clear();
  spriteCache.set(color, cv);
  return cv;
}

/** blit a soft light at (x, y) with radius r */
export function light(c: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, a: number): void {
  if (a <= 0.004 || r <= 0.2) return;
  const sp = glowSprite(color);
  c.globalAlpha = a > 1 ? 1 : a;
  c.drawImage(sp, x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

