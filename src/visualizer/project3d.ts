// 3D plane projection — turns any 2D visualizer into a 3D one.
//
// The theme renders into an offscreen "scene" canvas exactly as it always has
// (trail buffer and all). This module then treats that canvas as a texture and
// maps it onto a surface in perspective before it reaches the screen. Because
// it works on the finished frame, every theme gets a 3D variant for free — and
// new themes do too, without knowing this file exists.
//
// There is no WebGL here on purpose: the whole renderer is 2D canvas, and
// mixing contexts would mean a second GPU path plus a readback per frame. A
// perspective quad can't be expressed as a single 2D transform (that needs a
// homography), so instead the texture is drawn as a stack of thin slices, each
// with its own affine transform. Slice count is fixed, not per-pixel, so cost
// is the same on a phone and a 5K display.

/** Projection modes, in picker order. OFF renders the flat 2D frame as before. */
export const MODES_3D = ["OFF", "FLOOR", "ROOM", "SPIN", "DEPTH"] as const;
export type Mode3D = (typeof MODES_3D)[number];

/** How far the plane's near edge extends past the screen. >1 rushes past you. */
const SPREAD = 2.35;
/** Depth ratio between the near edge and the far clip. Bigger = longer runway. */
const FAR = 9;
/** Target slice count. Fixed so a 5K canvas costs the same as a phone. */
const SLICES = 240;
/** Extruded-depth layer count for DEPTH mode. Each layer is a full-canvas
 * composite, so this is pure fill rate — 26 layers doubled frame time on its
 * own. Ten reads as the same solid tunnel because the far ones are nearly
 * transparent anyway. */
const LAYERS = 10;

export interface Project3DOpts {
  /** destination (visible) canvas context */
  c: CanvasRenderingContext2D;
  /** the rendered scene, used as a texture */
  src: CanvasImageSource;
  /** source pixel dimensions */
  sw: number;
  sh: number;
  /** destination pixel dimensions */
  w: number;
  h: number;
  mode: Mode3D;
  /** 0..1 user depth amount — how aggressive the perspective is */
  amt: number;
  /** engine time, advanced by cfg.speed */
  vt: number;
  bass: number;
  beatE: number;
  dropE: number;
  /** horizon glow colour, from the active palette */
  tint: string;
}

/**
 * Maps the scene onto a ground plane receding to a horizon.
 *
 * For destination row y below the horizon, let u = (y - hor) / (h - hor), so
 * u→0 at the horizon and u=1 at the bottom of the screen. On a flat plane seen
 * by a camera at fixed height, depth goes as z = 1/u — the reciprocal is where
 * all the foreshortening comes from. Texture row v is then linear in z, and
 * the horizontal extent of the plane shrinks as 1/z (i.e. proportional to u).
 *
 * Rows nearer the horizon than the far clip (u < 1/FAR) sample past the end of
 * the texture, so they're skipped and the sky pass covers them instead.
 *
 * @param flip draws the plane upward from the horizon instead (a ceiling)
 */
function drawPlane(o: Project3DOpts, hor: number, flip: boolean): void {
  const { c, src, sw, sh, w, h } = o;
  const span = flip ? hor : h - hor;
  if (span <= 1) return;

  const step = Math.max(1, Math.round(span / SLICES));
  const cx = w / 2;
  // scroll the texture toward the camera so the plane appears to move
  const scroll = (o.vt * 0.0016 * (0.4 + o.amt)) % 1;

  for (let s = 0; s < span; s += step) {
    // sample at the slice's midpoint so the strip isn't biased near/far
    const u = (s + step * 0.5) / span;
    if (u < 1 / FAR) continue; // beyond the far clip — sky territory

    const z = 1 / u;
    let v = 1 - (z - 1) / (FAR - 1); // 1 at the near edge, 0 at the far clip
    v = (v + scroll) % 1;
    if (v < 0) v += 1;

    const sy = v * sh;
    // source strip height: one destination slice covers dz worth of texture,
    // and dv/du = 1/((FAR-1)u²), so far slices pull in much more texture
    const srcH = Math.max(1, (step / span) * (sh / ((FAR - 1) * u * u)));
    if (sy + srcH > sh) continue; // would wrap the seam — drop the single slice

    const dw = w * u * SPREAD;
    const dy = flip ? hor - s - step : hor + s;

    // fade with distance so the far end dissolves into the horizon instead of
    // ending on a hard edge, and dim the ceiling so it reads as a reflection
    c.globalAlpha = Math.min(1, u * 3.2) * (flip ? 0.45 : 1);
    c.drawImage(src, 0, sy, sw, srcH, cx - dw / 2, dy, dw, step);
  }
  c.globalAlpha = 1;
}

/** A soft wash above the horizon: the scene squashed, faded and mirrored, so
 * the upper half is never bare black. */
function drawSky(o: Project3DOpts, hor: number): void {
  const { c, src, sw, sh, w } = o;
  if (hor <= 1) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = 0.22;
  // vertically flipped so it reads as the plane's reflection in the distance
  c.translate(0, hor);
  c.scale(1, -1);
  c.drawImage(src, 0, sh * 0.45, sw, sh * 0.55, 0, 0, w, hor * 1.5);
  c.restore();
  c.globalAlpha = 1;
}

/** The bright band where the plane meets the sky — sells the horizon line. */
function drawHorizonGlow(o: Project3DOpts, hor: number): void {
  const { c, w, h, tint } = o;
  const band = h * (0.02 + o.bass * 0.03 + o.dropE * 0.05);
  const g = c.createLinearGradient(0, hor - band, 0, hor + band);
  g.addColorStop(0, "transparent");
  g.addColorStop(0.5, tint);
  g.addColorStop(1, "transparent");
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = 0.5 + o.beatE * 0.4;
  c.fillStyle = g;
  c.fillRect(0, hor - band, w, band * 2);
  c.restore();
  c.globalAlpha = 1;
}

/**
 * The scene on a flat panel rotating about the vertical axis.
 *
 * Each texture column sits at world x0 ∈ [-1, 1]. Rotating by `a` about Y puts
 * it at (x0·cos a, _, camZ + x0·sin a), and the pinhole projection is
 * sx = cx + f·x/z with vertical scale f/z. Column edges are projected
 * individually and the strip is stretched between them, so the near half of
 * the panel is genuinely wider on screen than the far half.
 */
function drawSpin(o: Project3DOpts): void {
  const { c, src, sw, sh, w, h } = o;
  const N = Math.min(SLICES, Math.max(24, Math.round(sw / 6)));
  // ease the tumble so it lingers face-on rather than spinning at constant rate
  const a = Math.sin(o.vt * 0.004) * (0.6 + o.amt * 0.9) + o.beatE * 0.18;
  const ca = Math.cos(a), sa = Math.sin(a);
  // The panel has to fill the frame face-on, or most of the screen is bare
  // black and it reads as broken rather than as a rotating surface.
  const camZ = 2.05 - o.amt * 0.35 - o.dropE * 0.5; // drops pull the camera in
  const f = w * 0.98;
  const cx = w / 2, cy = h / 2;

  const px = (u: number): number => {
    const x0 = (u - 0.5) * 2;
    return camZ + x0 * sa;
  };

  c.save();
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const z0 = px(u0), z1 = px(u1);
    if (z0 <= 0.2 || z1 <= 0.2) continue; // behind the camera
    const sx0 = cx + (f * ((u0 - 0.5) * 2 * ca)) / z0;
    const sx1 = cx + (f * ((u1 - 0.5) * 2 * ca)) / z1;
    let dx = sx0, dw = sx1 - sx0;
    if (dw < 0) { dx = sx1; dw = -dw; }
    if (dw < 0.05) continue;
    const zm = (z0 + z1) * 0.5;
    const dh = (f * (h / w) * 1.5) / zm;
    // nearer columns are brighter, which is what makes the panel read as solid
    c.globalAlpha = Math.min(1, 2.2 / zm);
    c.drawImage(src, u0 * sw, 0, Math.max(1, sw / N), sh, dx, cy - dh / 2, dw + 0.6, dh);
  }
  c.restore();
  c.globalAlpha = 1;
}

/**
 * Extrudes the frame into a slab: the same image drawn at stepped depths from
 * far to near, each layer slightly rotated so the stack twists. Reads as a
 * volumetric tunnel of the visualizer receding away from you.
 */
function drawDepth(o: Project3DOpts): void {
  const { c, src, sw, sh, w, h } = o;
  const cx = w / 2, cy = h / 2;
  const twist = o.vt * 0.0009 + o.dropE * 0.3;
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let i = LAYERS - 1; i >= 0; i--) {
    const k = i / (LAYERS - 1); // 1 = furthest
    // reciprocal spacing: layers bunch up in the distance like real depth
    const z = 1 + k * (2.2 + o.amt * 3.4 + o.dropE * 2);
    const sc = 1 / z;
    const a = (1 - k) ** 1.3 * (0.5 + o.beatE * 0.18) + (i === 0 ? 0.5 : 0);
    if (a < 0.012) continue; // invisible layer, all cost and no picture
    c.save();
    c.translate(cx, cy);
    c.rotate(twist * k * (1 + o.amt));
    c.scale(sc, sc);
    c.globalAlpha = Math.min(1, a);
    c.drawImage(src, 0, 0, sw, sh, -w / 2, -h / 2, w, h);
    c.restore();
  }
  c.restore();
  c.globalAlpha = 1;
}

/** Draws the scene texture onto the visible canvas in the chosen projection. */
export function project3d(o: Project3DOpts): void {
  const { c, w, h, mode } = o;

  // the projection never covers every pixel (sky gaps, off-plane corners), so
  // start from opaque black — otherwise the previous frame shows through and
  // compounds into a smeared feedback loop
  c.save();
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#05060A";
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "lighter";

  if (mode === "SPIN") {
    drawSpin(o);
  } else if (mode === "DEPTH") {
    drawDepth(o);
  } else {
    // FLOOR sits the horizon high so most of the screen is plane; ROOM puts it
    // centre so floor and ceiling form a corridor. Bass lifts the camera.
    const base = mode === "ROOM" ? 0.5 : 0.34 - o.amt * 0.06;
    const hor = h * (base + o.bass * 0.02 - o.dropE * 0.04);
    if (mode === "ROOM") drawPlane(o, hor, true);
    else drawSky(o, hor);
    drawPlane(o, hor, false);
    drawHorizonGlow(o, hor);
  }
  c.restore();
}
