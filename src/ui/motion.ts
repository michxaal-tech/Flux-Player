// Flux's motion vocabulary.
//
// Three families, each with a job:
//   • springs — anything a hand touches or that answers input directly. They
//     retarget from wherever they are, so a second click mid-flight bends the
//     motion instead of restarting it.
//   • glides  — what the system moves on its own (views, panels arriving):
//     a long, decisive deceleration with no bounce.
//   • reveals — content appearing: masks and clip-paths that uncover rather
//     than fade, so things arrive with a direction and an origin.
import type { Transition } from "framer-motion";
import { useStore } from "../store/useStore";

export const spring = {
  /** buttons, toggles, thumbs — immediate, barely any overshoot */
  snap: { type: "spring", stiffness: 620, damping: 40, mass: 0.7 } as Transition,
  /** indicators and pills sliding between choices — a little life */
  slide: { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as Transition,
  /** larger objects: artwork, sheets */
  soft: { type: "spring", stiffness: 210, damping: 28, mass: 1 } as Transition,
  /** playful: the like heart, a confirmation tick */
  pop: { type: "spring", stiffness: 520, damping: 18, mass: 0.7 } as Transition,
};

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  io: [0.65, 0, 0.35, 1] as [number, number, number, number],
  in: [0.55, 0, 0.75, 0.06] as [number, number, number, number],
};

export const glide = (d = 0.55): Transition => ({ duration: d, ease: ease.out });

/** Scales a duration by the interface-motion preference. */
export function useMotionScale(): number {
  const m = useStore((s) => s.ui.motion);
  return m === "full" ? 1 : m === "calm" ? 0.6 : 0;
}

export function motionScale(): number {
  const m = document.documentElement.dataset.motion;
  return m === "minimal" ? 0 : m === "calm" ? 0.6 : 1;
}
