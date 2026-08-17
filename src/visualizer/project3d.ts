// 3D projection — turns any 2D visualizer into a 3D one.
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
// homography), so the texture is drawn as a stack of thin slices, each with its
// own affine transform. Slice count is fixed, not per-pixel, so cost is the
// same on a phone and a 5K display.
//
// Two rules learned the hard way, both from projections that measured fine and
// looked wrong:
//
//  1. Never leave a hole. A surface that converges to a stump, or that skips
//     slices at a clip boundary, reads as a rendering bug rather than as depth.
//     Every mode here covers the full frame; perspective lives in how the
//     texture is *sampled*, not in the silhouette of the surface.
//  2. Never scroll the texture. The scene is not tileable, so translating it
//     puts a hard seam across the picture.

/** Projection modes, in picker order. OFF renders the flat 2D frame as before. */
export const MODES_3D = [
  "OFF", "FLOOR", "ROOM", "TUNNEL", "VORTEX", "SPIN", "CUBE", "DOME", "CYLINDER",
] as const;
export type Mode3D = (typeof MODES_3D)[number];

/** Human-readable one-liners for the picker. */
export const MODE_3D_HELP: Record<string, string> = {
  FLOOR: "the scene standing on a reflective plane running to the horizon",
  ROOM: "floor and ceiling both reflecting, forming a corridor",
  TUNNEL: "layers of the scene flying at you, one per beat",
  VORTEX: "the same tunnel, corkscrewing as it comes",
  SPIN: "the scene on a panel turning in space",
  CUBE: "two faces of a slowly tumbling box",
  DOME: "bowed onto a planetarium dome",
  CYLINDER: "wrapped around a turning cylinder",
};

/** Target slice count. Fixed so a 5K canvas costs the same as a phone. */
const SLICES = 200;
/** Tunnel layer count. Each layer is a full-canvas composite, so this is pure
 * fill rate — 26 doubled frame time on its own. */
const LAYERS = 12;

export interface Project3DOpts {
  /** destination (visible) canvas context */
  c: CanvasRenderingContext2D;
  /** the rendered scene, used as a texture. Its background is transparent. */
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
  /** musical time in beats — anything driven by this stays in phase at any BPM */
  flow: number;
  bass: number;
  beatE: number;
  dropE: number;
  /** background wash strength, 0..1 */
  wash: number;
  /** palette colours for the backdrop and horizon */
  C1: (a?: number, l?: number) => string;
  C2: (a?: number, l?: number) => string;
}

/**
 * A ground plane filling `yTop..yBot`, sampling the scene in perspective.
 *
 * A real ground plane of unbounded extent covers *every* pixel below the
 * horizon — the perspective shows up as the texture compressing toward the
 * horizon, not as the plane narrowing to a point. So each row is drawn at full
 * screen width and the foreshortening is done entirely in the sampling:
 *
 *  - vertically, `v = u^P` compresses the texture toward the far edge;
 *  - horizontally, near rows sample a *narrower* slice of the texture, because
 *    close to the camera you see less of the world across the same screen width.
 *
 * That second part is what actually produces converging perspective lines, and
 * it does it without any gaps.
 *
 * @param flip build the plane upward from yBot instead (a ceiling)
 */
function drawGround(o: Project3DOpts, yTop: number, yBot: number, flip: boolean, dim: number): void {
  const { c, src, sw, sh, w } = o;
  const span = yBot - yTop;
  if (span <= 2) return;

  const P = 1.5 + o.amt * 1.4;             // perspective exponent
  const near = 0.30 - o.amt * 0.12;        // how much of the texture the front row sees
  const step = Math.max(1, span / SLICES);

  for (let y = 0; y < span; y += step) {
    // u: 0 at the far (horizon) edge, 1 at the near edge
    const u0 = flip ? 1 - y / span : y / span;
    const u1 = flip ? 1 - (y + step) / span : (y + step) / span;
    const uNear0 = flip ? u0 : 1 - u0;      // 1 at the near edge either way
    const v0 = Math.pow(1 - uNear0, P);
    const v1 = Math.pow(1 - (flip ? u1 : 1 - u1), P);
    const vA = Math.min(v0, v1), vB = Math.max(v0, v1);
    const dv = Math.max(1 / sh, vB - vA);

    // narrower source window near the camera → converging perspective
    const half = (near + (0.5 - near) * (1 - uNear0)) * sw;
    const dy = flip ? yBot - y - step : yTop + y;

    // haze into the distance so the far edge dissolves instead of ending flat
    c.globalAlpha = Math.min(1, 0.25 + uNear0 * 1.5) * dim;
    c.drawImage(
      src,
      sw / 2 - half, vA * sh, half * 2, dv * sh,
      0, dy, w, step + 1.2,               // +1.2 overlaps slices so no hairlines
    );
  }
  c.globalAlpha = 1;
}

/** The scene standing upright above the horizon, full width, so the top of the
 * frame is the picture itself rather than a smear of it. */
function drawBackdrop(o: Project3DOpts, yTop: number, yBot: number): void {
  const { c, src, sw, sh, w } = o;
  if (yBot - yTop <= 2) return;
  c.globalAlpha = 1;
  c.drawImage(src, 0, 0, sw, sh, 0, yTop, w, yBot - yTop);
}

/** The bright band where a plane meets the backdrop. */
function drawHorizonGlow(o: Project3DOpts, hor: number): void {
  const { c, w, h } = o;
  const band = h * (0.015 + o.bass * 0.025 + o.dropE * 0.04);
  const g = c.createLinearGradient(0, hor - band, 0, hor + band);
  g.addColorStop(0, "transparent");
  g.addColorStop(0.5, o.C1(0.5 + o.beatE * 0.3, 72));
  g.addColorStop(1, "transparent");
  c.save();
  c.globalCompositeOperation = "lighter";
  c.fillStyle = g;
  c.fillRect(0, hor - band, w, band * 2);
  c.restore();
}

/**
 * The scene extruded into a tunnel: copies at stepped depths, near to far.
 *
 * Two things make it read as motion rather than a stack of copies. The layers
 * *travel* — the ladder scrolls toward the camera by one spacing per beat and
 * wraps at the front, so you are continually flying into it. And a brightness
 * pulse runs down the tunnel once per beat, which ties the depth to the music
 * rather than to the clock.
 *
 * Layer alpha is budgeted so the stack sums to at most 1. Without that the
 * centre of a centred composition saturates to flat white, which is what the
 * first version did.
 *
 * @param twistK extra rotation per layer — 0 is a straight tunnel, higher
 *               corkscrews it
 */
function drawTunnel(o: Project3DOpts, twistK: number): void {
  const { c, src, sw, sh, w, h } = o;
  const cx = w / 2, cy = h / 2;
  const spread = 2.4 + o.amt * 4.4 + o.dropE * 2.6;
  const travel = ((o.flow % 1) + 1) % 1;   // one layer-spacing per beat
  const twist = o.vt * 0.0009 + o.dropE * 0.4;

  // Alpha budget. The layers all overlap at the centre of a centred
  // composition, so under additive blending their alphas simply sum there —
  // and anything over 1 clips to flat white, which is what the first version
  // did. Every per-layer term (depth, travel pulse, edge fade) therefore goes
  // into the weight *before* normalising, so the total is the budget no matter
  // what the music is doing.
  const BUDGET = 0.86;
  const ks: number[] = [];
  const ws: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < LAYERS; i++) {
    const k = ((i - travel) / (LAYERS - 1) + 1) % 1;
    // a bright band travelling from the far end to the near end, once per beat
    const pulse = 0.5 + 0.5 * Math.cos((k + o.flow * 0.5) * Math.PI * 2);
    // fade in at the far end and out at the very front, so wrapping is invisible
    const edge = Math.min(1, (1 - k) * 5) * Math.min(1, k * 9 + 0.1);
    const wgt = (1 - k) ** 1.25 * edge * (0.55 + pulse * 0.45);
    ks.push(k);
    ws.push(wgt);
    weightSum += wgt;
  }
  // beats and drops brighten the whole tunnel, still capped short of clipping
  const push = Math.min(1, BUDGET * (1 + o.beatE * 0.16 + o.dropE * 0.3));
  const norm = weightSum > 0 ? push / weightSum : 0;

  c.save();
  c.globalCompositeOperation = "lighter";
  // far to near, so the nearest layer lands on top
  for (let i = LAYERS - 1; i >= 0; i--) {
    const k = ks[i];
    const z = 1 + k * spread;
    const sc = 1 / z;
    const a = ws[i] * norm;
    if (a < 0.012) continue; // invisible layer, all cost and no picture

    c.save();
    c.translate(cx, cy);
    c.rotate(twist * k * (1 + o.amt) + twistK * k);
    c.scale(sc, sc);
    c.globalAlpha = Math.min(1, a);
    c.drawImage(src, 0, 0, sw, sh, -w / 2, -h / 2, w, h);
    c.restore();
  }
  c.restore();
  c.globalAlpha = 1;
}

/**
 * The scene on a flat panel rotating about the vertical axis.
 *
 * Each texture column sits at world x0 ∈ [-1, 1]. Rotating by `a` about Y puts
 * it at (x0·cos a, _, camZ + x0·sin a), and the pinhole projection is
 * sx = cx + f·x/z with vertical scale f/z. Column edges are projected
 * individually and the strip stretched between them, so the near half of the
 * panel is genuinely wider on screen than the far half.
 *
 * @param faceOffset extra yaw, used to draw a second face for CUBE
 * @param dim        brightness multiplier for side faces
 */
function drawPanel(o: Project3DOpts, angle: number, faceOffset: number, dim: number): void {
  const { c, src, sw, sh, w, h } = o;
  const N = 96;
  const a = angle + faceOffset;
  const ca = Math.cos(a), sa = Math.sin(a);
  if (ca <= 0.02) return; // edge-on or facing away
  // the panel must fill the frame face-on, or most of the screen is bare and it
  // reads as broken rather than as a surface
  const camZ = 2.05 - o.amt * 0.35 - o.dropE * 0.5;
  const f = w * 0.98;
  const cx = w / 2, cy = h / 2;

  c.save();
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const x0 = (u0 - 0.5) * 2, x1 = (u1 - 0.5) * 2;
    const z0 = camZ + x0 * sa, z1 = camZ + x1 * sa;
    if (z0 <= 0.2 || z1 <= 0.2) continue; // behind the camera
    const sx0 = cx + (f * x0 * ca) / z0;
    const sx1 = cx + (f * x1 * ca) / z1;
    let dx = sx0, dw = sx1 - sx0;
    if (dw < 0) { dx = sx1; dw = -dw; }
    if (dw < 0.05) continue;
    const zm = (z0 + z1) * 0.5;
    const dh = (f * (h / w) * 1.5) / zm;
    // nearer columns are brighter, which is what makes the panel read as solid
    c.globalAlpha = Math.min(1, 2.2 / zm) * dim;
    c.drawImage(src, u0 * sw, 0, Math.max(1, sw / N), sh, dx, cy - dh / 2, dw + 0.8, dh);
  }
  c.globalAlpha = 1;
  c.restore();
}

/**
 * Bows the frame onto a curved surface — a dome (rows) or a cylinder (columns).
 *
 * Each slice is placed on a circular arc: its screen position follows sin(θ)
 * and its foreshortening follows cos(θ), so the middle bulges toward the camera
 * and the edges compress away, the way a projection on a curved screen does.
 */
function drawCurved(o: Project3DOpts, axis: "x" | "y"): void {
  const { c, src, sw, sh, w, h } = o;
  const N = SLICES >> 1;
  const bend = 0.42 + o.amt * 0.5 + o.dropE * 0.2;
  const turn = Math.sin(o.vt * 0.0032) * 0.35;
  const arc = Math.PI * bend;
  const norm = Math.sin(arc * 0.5) || 1;

  c.save();
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const t0 = (u0 - 0.5) * arc + turn * 0.4;
    const t1 = (u1 - 0.5) * arc + turn * 0.4;
    // position on the arc, renormalised so the surface still spans the frame
    const p0 = (Math.sin(t0) / norm) * 0.5 + 0.5;
    const p1 = (Math.sin(t1) / norm) * 0.5 + 0.5;
    const depth = Math.cos((t0 + t1) * 0.5);
    if (depth <= 0.04) continue; // curved away past the rim
    c.globalAlpha = Math.min(1, 0.4 + depth * 0.75);

    if (axis === "x") {
      const dx = p0 * w, dw = Math.max(0.8, (p1 - p0) * w);
      const dh = h * (0.6 + depth * 0.4);
      c.drawImage(src, u0 * sw, 0, Math.max(1, sw / N), sh, dx, (h - dh) / 2, dw + 0.8, dh);
    } else {
      const dy = p0 * h, dh = Math.max(0.8, (p1 - p0) * h);
      const dw = w * (0.6 + depth * 0.4);
      c.drawImage(src, 0, u0 * sh, sw, Math.max(1, sh / N), (w - dw) / 2, dy, dw, dh + 0.8);
    }
  }
  c.globalAlpha = 1;
  c.restore();
}

/** Paints the ground the projection sits on. The scene texture is transparent
 * where nothing was drawn, so without this the frame would show through. */
function drawBackground(o: Project3DOpts): void {
  const { c, w, h } = o;
  c.save();
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#05060A";
  c.fillRect(0, 0, w, h);
  if (o.wash > 0.01) {
    const g = c.createLinearGradient(0, 0, w, h);
    const k = o.wash * (0.08 + o.bass * 0.06 + o.dropE * 0.1);
    g.addColorStop(0, o.C1(k, 38));
    g.addColorStop(1, o.C2(k, 34));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  c.restore();
}

/** Draws the scene texture onto the visible canvas in the chosen projection. */
export function project3d(o: Project3DOpts): void {
  const { c, h, mode } = o;

  drawBackground(o);
  c.save();
  // Additive is only right when a mode stacks multiple copies of the frame on
  // top of each other. Every other mode is a 1:1 remap of a single surface, and
  // compositing those additively over the backdrop pushes an already-bright
  // theme past white — DOME and CYLINDER blew out their centres that way.
  c.globalCompositeOperation = mode === "TUNNEL" || mode === "VORTEX" ? "lighter" : "source-over";

  switch (mode) {
    case "TUNNEL":
      drawTunnel(o, 0);
      break;
    case "VORTEX":
      drawTunnel(o, 1.5 + o.amt * 2.5);
      break;
    case "SPIN":
      drawPanel(o, Math.sin(o.vt * 0.004) * (0.6 + o.amt * 0.9) + o.beatE * 0.18, 0, 1);
      break;
    case "CUBE": {
      // two faces of a box: the far one first so the near edge covers it
      const a = o.vt * 0.0038 + o.dropE * 1.2;
      drawPanel(o, a, Math.PI / 2, 0.62);
      drawPanel(o, a, 0, 1);
      break;
    }
    case "DOME":
      drawCurved(o, "y");
      break;
    case "CYLINDER":
      drawCurved(o, "x");
      break;
    default: {
      // FLOOR: the scene standing above a reflective plane.
      // ROOM: the same, mirrored above as well, so it becomes a corridor.
      const room = mode === "ROOM";
      const hor = h * (room ? 0.5 : 0.46 + o.bass * 0.015 - o.dropE * 0.03);
      if (room) {
        drawGround(o, 0, hor, true, 0.55);
      } else {
        drawBackdrop(o, 0, hor);
      }
      drawGround(o, hor, h, false, room ? 0.85 : 0.7);
      drawHorizonGlow(o, hor);
    }
  }

  c.restore();
  c.globalAlpha = 1;
}
