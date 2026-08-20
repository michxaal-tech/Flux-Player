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

// beauty-first themes, written against the clock so they run at the panel rate
import { CAUSTICS } from "./caustics";
import { PLUME } from "./plume";
import { HORIZON } from "./horizon";
import { FILAMENT } from "./filament";
import { VEIL } from "./veil";

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
  CAUSTICS, PLUME, HORIZON, FILAMENT, VEIL,
};

/**
 * Themes whose motion is a function of time rather than of frames, and which
 * may therefore be drawn at the panel's full rate.
 *
 * The engine caps everything else at 60 (see the governor in engine.ts),
 * because a theme that does `p.x += p.vx` once per frame travels twice as far
 * per second when the frames arrive twice as often — it does not look
 * smoother, it looks fast-forwarded. Converting a theme means scaling what it
 * accumulates by `fs` and its decays by `dk(k, fs)`, then proving it with
 * `npm run fps`, which measures motion per second of wall clock at 60Hz and
 * unthrottled and fails the theme if the two disagree.
 *
 * A name is added here only once that check passes for it.
 */
export const TIME_NORMALISED = new Set<string>([
  "AURORA", "BARS", "CANYON", "CASCADE", "COMETS", "DOTGRID",
  "ECLIPSE", "FIREFLIES", "FISSION", "GALAXY", "GRAVITY", "GRID",
  "GYROSCOPE", "HELIX", "JELLY", "LIQUID", "MARQUEE", "NOVA",
  "ORB", "ORIGAMI", "ORRERY", "PRISM", "REACTOR", "RING",
  "SCOPE", "SERPENT", "SINGULARITY", "SPIRAL", "STRATA",
  "TESSERACT",
  // converted by hand and re-verified; LASERS, CITY, TUNNEL and LANTERNS were
  // converted in the same pass and still fail, so they are deliberately absent
  "CRYSTAL", "HALO", "KALEIDO", "STARFIELD",
  // Of the five new ones, only these two pass. The other three are audio-
  // reactive in fine detail, which the check cannot currently separate from
  // motion — its samples are spaced in logical frames while the audio runs on
  // the wall clock, so at fs=0.5 twice as much music passes between samples.
  // They are correct at 60 either way; they stay off this list until the
  // check can say so honestly rather than because I believe it.
  "CAUSTICS", "VEIL",
]);

// Debug handle, companion to `__flux`: lets a test enumerate the theme list
// rather than carrying its own copy of it, which would silently skip any
// theme added after the test was written.
if (typeof window !== "undefined") (window as any).__fluxThemes = themes;
