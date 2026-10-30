// The play/pause control.
//
// One shape, not two icons: the triangle is cut into two quads that are the
// same four-point polygons as the pause bars, so a spring can carry every
// vertex between them. A click mid-morph simply retargets the spring — the
// glyph bends back from wherever it is. Pressing squashes the disc; releasing
// rings a ripple outward. Outside the disc a thin halo breathes with the
// music while it plays; the button itself never moves with the music.
import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { sig } from "../flux/signals";
import { spring } from "./motion";

const PAUSE = [
  [[6.4, 5], [10.4, 5], [10.4, 19], [6.4, 19]],
  [[13.6, 5], [17.6, 5], [17.6, 19], [13.6, 19]],
];
const PLAY = [
  [[7.5, 4.6], [13.4, 8.3], [13.4, 15.7], [7.5, 19.4]],
  [[13.4, 8.3], [19.4, 12], [19.4, 12], [13.4, 15.7]],
];

function pathAt(p: number): string {
  return [0, 1].map((k) => PAUSE[k].map(([x, y], i) => {
    const [x2, y2] = PLAY[k][i];
    return `${i ? "L" : "M"}${(x + (x2 - x) * p).toFixed(2)} ${(y + (y2 - y) * p).toFixed(2)}`;
  }).join(" ") + "Z").join(" ");
}

export function PlayButton({ playing, onToggle, size = 72, busy }: { playing: boolean; onToggle: () => void; size?: number; busy?: boolean }) {
  const p = useSpring(playing ? 0 : 1, { stiffness: 380, damping: 26, mass: 0.8 });
  useEffect(() => { p.set(playing ? 0 : 1); }, [playing, p]);
  const d = useTransform(p, pathAt);
  const [ripples, setRipples] = useState<number[]>([]);
  const halo = useRef<HTMLDivElement>(null);

  // ambient halo: driven per frame from the shared signals, written straight to the DOM
  useEffect(() => {
    let raf = 0;
    let v = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const target = sig.playing ? Math.min(1, sig.level * 0.9 + sig.transient * 0.5) : 0;
      v += (target - v) * 0.18;
      const el = halo.current;
      if (el) {
        el.style.transform = `scale(${1 + v * 0.16})`;
        el.style.opacity = String(0.15 + v * 0.55);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        ref={halo}
        aria-hidden
        style={{
          position: "absolute", inset: -6, borderRadius: "50%", border: "1.5px solid var(--accent)",
          opacity: 0.15, pointerEvents: "none", willChange: "transform, opacity",
        }}
      />
      {ripples.map((id) => (
        <motion.div
          key={id}
          aria-hidden
          initial={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 1.75, opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setRipples((r) => r.filter((x) => x !== id))}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)", pointerEvents: "none" }}
        />
      ))}
      <motion.button
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        onClick={() => { onToggle(); setRipples((r) => [...r.slice(-2), Date.now()]); }}
        whileTap={{ scale: 0.88 }}
        whileHover={{ scale: 1.04 }}
        transition={spring.pop}
        style={{
          position: "relative", width: size, height: size, borderRadius: "50%", border: 0,
          background: "var(--accent)", color: "var(--on-accent)", display: "grid", placeItems: "center",
          boxShadow: "0 14px 34px -10px rgb(var(--accent-rgb) / 0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
          transition: "background-color var(--t4) var(--ease-out)",
        }}
      >
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" aria-hidden>
          <motion.path d={d} fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
        {busy && (
          <motion.span
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", inset: 3, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--on-accent)", opacity: 0.6 }}
          />
        )}
      </motion.button>
    </div>
  );
}
