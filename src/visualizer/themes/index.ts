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
import { CLOCK } from "./clock";

export const themes: Record<string, ThemeDraw> = {
  RING, KALEIDO, HELIX, WAVES, LASERS, GRID, ORB, RIPPLES, SPIRAL, FIREFLIES,
  CITY, VORTEX, SCOPE, AURORA, DOTGRID, BARS, NEBULA, TUNNEL, STARFIELD,
  TIDE, NOVA, HALO, COMETS, FIREWORKS, LANTERNS, JELLY, CRYSTAL, BLOOM,
  ECLIPSE, GALAXY, SILK, LIQUID, TERMINAL, GLITCH, PIXEL, BRUTAL,
  VINYL, THUNDER, KOI, CASSETTE, MARQUEE, NEONSIGN, CLOCK,
};
