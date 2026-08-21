// One file per theme — add a new theme by creating a file and registering it here.
import type { ThemeDraw } from "../themeTypes";
import { RING } from "./ring";
import { KALEIDO } from "./kaleido";
import { HELIX } from "./helix";
import { WAVES } from "./waves";
import { LASERS } from "./lasers";
import { GRID } from "./grid";
import { ORB } from "./orb";
import { RIPPLES } from "./ripples";
import { SPIRAL } from "./spiral";
import { FIREFLIES } from "./fireflies";
import { CITY } from "./city";
import { VORTEX } from "./vortex";
import { SCOPE } from "./scope";
import { AURORA } from "./aurora";
import { DOTGRID } from "./dotgrid";
import { BARS } from "./bars";
import { NEBULA } from "./nebula";
import { TUNNEL } from "./tunnel";
import { STARFIELD } from "./starfield";
import { TIDE } from "./tide";
import { NOVA } from "./nova";
import { HALO } from "./halo";
import { COMETS } from "./comets";
import { FIREWORKS } from "./fireworks";
import { LANTERNS } from "./lanterns";
import { JELLY } from "./jelly";
import { CRYSTAL } from "./crystal";
import { BLOOM } from "./bloom";
import { ECLIPSE } from "./eclipse";
import { GALAXY } from "./galaxy";
import { SILK } from "./silk";
import { LIQUID } from "./liquid";
import { TERMINAL } from "./terminal";
import { GLITCH } from "./glitch";
import { PIXEL } from "./pixel";
import { BRUTAL } from "./brutal";
import { VINYL } from "./vinyl";
import { THUNDER } from "./thunder";
import { KOI } from "./koi";
import { CASSETTE } from "./cassette";
import { MARQUEE } from "./marquee";
import { NEONSIGN } from "./neonsign";
import { MURMUR } from "./murmur";
import { INKFLOW } from "./inkflow";
import { SHATTER } from "./shatter";
import { SERPENT } from "./serpent";
import { BLOOMRAIL } from "./bloomrail";
import { MAGNETIC } from "./magnetic";
import { ORACLE } from "./oracle";
import { AURORAFALL } from "./aurorafall";
import { GRAVITY } from "./gravity";
import { CIRCUITRY } from "./circuitry";
import { PRISM } from "./prism";
import { REACTOR } from "./reactor";
import { ORIGAMI } from "./origami";
import { SANDSTORM } from "./sandstorm";
import { CATHEDRAL } from "./cathedral";
import { BIOLUME } from "./bioluminescence";
import { MECHANISM } from "./mechanism";
import { WORMHOLE } from "./wormhole";
import { GRAFFITI } from "./graffiti";
import { CONSTELLATION } from "./constellation";
import { VHS } from "./vhs";
import { LAVALAMP } from "./lavalamp";
import { SAMURAI } from "./samurai";
import { QUANTUM } from "./quantum";
import { TOPOGRAPH } from "./topograph";
import { CLOCK } from "./clock";
// staged themes — layered arrangements that build with the track (see STAGED_THEMES)
import { ASCENSION } from "./ascension";
import { LEVIATHAN } from "./leviathan";
import { CATHODE } from "./cathode";
import { CITADEL } from "./citadel";
import { SYNAPSE } from "./synapse";
// natively 3D themes — real perspective projection, not the project3d wrapper
import { VOXEL } from "./voxel";
import { TESSERACT } from "./tesseract";
import { MONOLITH } from "./monolith";
import { ORRERY } from "./orrery";
import { CANYON } from "./canyon";
import { GYROSCOPE } from "./gyroscope";
import { SINGULARITY } from "./singularity";
// escalation themes — the drop-layer system is their whole structure: each
// drop adds another tier/shell/plane that stays for the rest of the track
import { STRATA } from "./strata";
import { CROWN } from "./crown";
import { CASCADE } from "./cascade";
import { FISSION } from "./fission";
import { PARALLAX } from "./parallax";

// Set-piece themes: each is built around what its drops do, not around a
// swell. Written against the clock so they can run at the panel rate.
import { HORIZON } from "./horizon";
import { RUPTURE } from "./rupture";
import { WARPGATE } from "./warpgate";
import { INFERNO } from "./inferno";
import { MAELSTROM } from "./maelstrom";

export const themes: Record<string, ThemeDraw> = {
  RING, KALEIDO, HELIX, WAVES, LASERS, GRID, ORB, RIPPLES, SPIRAL, FIREFLIES,
  CITY, VORTEX, SCOPE, AURORA, DOTGRID, BARS, NEBULA, TUNNEL, STARFIELD,
  TIDE, NOVA, HALO, COMETS, FIREWORKS, LANTERNS, JELLY, CRYSTAL, BLOOM,
  ECLIPSE, GALAXY, SILK, LIQUID, TERMINAL, GLITCH, PIXEL, BRUTAL,
  VINYL, THUNDER, KOI, CASSETTE,
  MURMUR, INKFLOW, SHATTER, SERPENT, BLOOMRAIL, MAGNETIC, ORACLE, AURORAFALL, GRAVITY, CIRCUITRY,
  PRISM, REACTOR, ORIGAMI, SANDSTORM, CATHEDRAL, BIOLUME, MECHANISM, WORMHOLE, GRAFFITI, CONSTELLATION, VHS, LAVALAMP,
  SAMURAI, QUANTUM, TOPOGRAPH,
  MARQUEE, NEONSIGN, CLOCK,
  ASCENSION, LEVIATHAN, CATHODE, CITADEL, SYNAPSE,
  VOXEL, TESSERACT,
  MONOLITH, ORRERY, CANYON, GYROSCOPE, SINGULARITY,
  STRATA, CROWN, CASCADE, FISSION, PARALLAX,
  HORIZON, RUPTURE, WARPGATE, INFERNO, MAELSTROM,
};

/**
 * Themes that may be drawn at the panel's full rate.
 *
 * The engine caps everything else at 60 (see the governor in engine.ts),
 * because a theme that does `p.x += p.vx` once per frame travels twice as far
 * per second when the frames arrive twice as often — it does not look
 * smoother, it looks fast-forwarded.
 *
 * A name goes on this list only when *two* independent things agree.
 *
 * `npm run fps` measures the motion, and on its own it is not enough: it
 * compares whole frames, so it can miss one small element running at double
 * speed. It passed twenty-three themes, of which eighteen turned out to
 * contain plainly unscaled per-frame state when the code was read — `e.a *=
 * 0.9`, `sh.r += R * 0.016`, and so on.
 *
 * So the second requirement is that the theme has no unscaled per-frame state
 * left in it at all: travel scaled by `fs`, decays through `dk`, approaches
 * through `ak`. Reading the code catches what the measurement misses, and the
 * measurement catches what reading it does not — a theme whose scaling is
 * complete but wrong.
 *
 * The list is therefore short and will grow slowly, which is the right way
 * round: a theme left at 60 is merely less smooth, and a theme wrongly listed
 * animates at double speed for everyone who picks it.
 */
export const TIME_NORMALISED = new Set<string>([
  "CITY", "COMETS", "GLITCH", "GRID", "HELIX", "ORB",
  "PIXEL", "RING", "SPIRAL", "TIDE",
]);

// A limitation worth writing down rather than working around: the check cannot
// certify a theme whose motion is mostly discrete events. HORIZON, RUPTURE,
// WARPGATE, INFERNO and MAELSTROM are built around what happens *at* a drop,
// and the two runs it compares take different amounts of wall clock by
// construction — so a drop lands inside one of them and not the other, and the
// ratio comes out at 0.07 or 1.48 depending on which. That is the measurement
// failing, not the theme, but "the measurement cannot tell" is not a licence to
// assume the answer, so they stay at 60 until it can.

// Debug handle, companion to `__flux`: lets a test enumerate the theme list
// rather than carrying its own copy of it, which would silently skip any
// theme added after the test was written.
if (typeof window !== "undefined") (window as any).__fluxThemes = themes;
