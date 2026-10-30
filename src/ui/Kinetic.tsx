// Kinetic type: titles that re-set themselves when they change.
//
// Each character arrives condensed and light and settles into the display
// cut — width and weight are real variable-font axes here, so the letters
// physically widen into place rather than fading. The outgoing title leaves in
// the direction of travel (next track: up; previous: down). Long titles move
// word by word so the stagger never drags.
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import { ease } from "./motion";

export function KineticText({
  text, dir = 1, style, className, as = "h2", weight = 760, stretch = 92, delay = 0,
}: {
  text: string; dir?: 1 | -1; style?: CSSProperties; className?: string; as?: "h1" | "h2" | "div" | "span";
  weight?: number; stretch?: number; delay?: number;
}) {
  const Tag = motion[as];
  const words = text.split(/(\s+)/);
  const perChar = text.length <= 32;
  let idx = 0;
  return (
    <div style={{ position: "relative", ...style }} className={className}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <Tag
          key={text}
          custom={dir}
          aria-label={text}
          style={{ margin: 0, font: "inherit", letterSpacing: "inherit", lineHeight: "inherit" }}
          initial="enter"
          animate="settle"
          exit="leave"
          variants={{
            leave: (d: number) => ({ opacity: 0, y: d * -18, filter: "blur(6px)", transition: { duration: 0.28, ease: ease.in } }),
          }}
        >
          {words.map((w, wi) => {
            if (/^\s+$/.test(w)) return <span key={wi}> </span>;
            const chars = perChar ? [...w] : [w];
            return (
              <span key={wi} aria-hidden style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                {chars.map((ch, ci) => {
                  const i = idx++;
                  return (
                    <motion.span
                      key={ci}
                      custom={dir}
                      variants={{
                        enter: (d: number) => ({ opacity: 0, y: d * 26, fontWeight: 300, fontStretch: "75%" }),
                        settle: {
                          opacity: 1, y: 0, fontWeight: weight, fontStretch: `${stretch}%`,
                          transition: { duration: 0.75, ease: ease.out, delay: delay + Math.min(i * (perChar ? 0.022 : 0.06), 0.5) },
                        },
                      }}
                      style={{ display: "inline-block", willChange: "transform" }}
                    >{ch}</motion.span>
                  );
                })}
              </span>
            );
          })}
        </Tag>
      </AnimatePresence>
    </div>
  );
}
