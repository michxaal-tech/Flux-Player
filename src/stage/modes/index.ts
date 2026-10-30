// The stage modes. To add one: write a ModeDef in this folder, list it here,
// and add its id to ../modeIds.ts (the store validates looks against that list).
import type { ModeDef } from "../types";
import { veil } from "./veil";
import { ink } from "./ink";
import { caustic } from "./caustic";
import { orbit } from "./orbit";
import { signal } from "./signal";
import { ridge } from "./ridge";
import { words } from "./words";

export const MODES: ModeDef[] = [veil, ink, caustic, orbit, signal, ridge, words];
export const modeById = (id: string): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0];
