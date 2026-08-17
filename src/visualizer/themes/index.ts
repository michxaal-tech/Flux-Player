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
};
