// Album artwork, and the generated sleeve for tracks that have none.
//
// Loading never shows an empty box: the sleeve's colours are known before the
// image is, so the square starts as the generated design and the real cover
// *develops* over it — a circular reveal from the centre that sharpens from a
// soft blur, like a print coming up in the tray.
import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { artNow, hasArt, loadArt, onArt, type Art } from "../flux/art";
import type { Track } from "../types";
import { ease } from "./motion";

export function useArt(tr: Track | null | undefined): Art {
  const [rev, bump] = useState(0);
  useEffect(() => onArt(() => bump((n) => n + 1)), []);
  // re-checked on every art change too: when the cache is cleared (a new AI
  // cover), every visible row reloads its own art, not just the playing one
  useEffect(() => {
    if (tr && !hasArt(tr)) void loadArt(tr);
  }, [tr?.id, tr?.fileId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return artNow(tr);
}

export function Sleeve({ art, title, style }: { art: Art; title: string; style?: CSSProperties }) {
  const [g, d, m, b, s] = art.palette;
  const kind = art.seed % 4;
  const initial = (title.replace(/^[^\p{L}\p{N}]+/u, "")[0] ?? "F").toUpperCase();
  const rot = (art.seed >> 4) % 4;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", display: "block", ...style }} aria-hidden>
      <rect width="100" height="100" fill={d} />
      {kind === 0 && (
        <g>
          <circle cx={30 + (art.seed % 40)} cy="58" r="34" fill={m} />
          {[44, 52, 60].map((r, i) => <circle key={r} cx={30 + (art.seed % 40)} cy="58" r={r} fill="none" stroke={b} strokeWidth="0.6" opacity={0.7 - i * 0.2} />)}
          <circle cx={30 + (art.seed % 40)} cy="58" r="5" fill={s} />
        </g>
      )}
      {kind === 1 && (
        <g transform={`rotate(${rot * 90 - 30} 50 50)`}>
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="-30" y={-20 + i * 24} width="160" height="12" fill={i % 2 ? b : m} opacity={0.9} />)}
          <circle cx="50" cy="50" r="22" fill={g} />
          <circle cx="50" cy="50" r="4" fill={s} />
        </g>
      )}
      {kind === 2 && (
        <g transform={`rotate(${rot * 90} 50 50)`}>
          <path d="M0 100 A100 100 0 0 1 100 0 L100 100 Z" fill={m} />
          <path d="M30 100 A70 70 0 0 1 100 30 L100 100 Z" fill={b} />
          <path d="M60 100 A40 40 0 0 1 100 60 L100 100 Z" fill={s} />
          <rect x="10" y="10" width="18" height="18" fill={g} />
        </g>
      )}
      {kind === 3 && (
        <g>
          <circle cx="78" cy="22" r="34" fill={m} opacity="0.9" />
          <text
            x="8" y="92" fill={b}
            style={{ font: "800 96px var(--font-display)", fontVariationSettings: '"opsz" 96, "wdth" 78', letterSpacing: "-0.06em" }}
          >{initial}</text>
          <rect x="10" y="10" width="22" height="3.5" fill={s} />
        </g>
      )}
    </svg>
  );
}

export function Artwork({
  track, radius = 12, shadow, className, style, title,
}: {
  track: Track | null | undefined; radius?: number; shadow?: boolean; className?: string; style?: CSSProperties; title?: string;
}) {
  const art = useArt(track);
  const [loaded, setLoaded] = useState<string | null>(null);
  const url = art.url;
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.src = url;
    img.decode().then(() => alive && setLoaded(url)).catch(() => alive && setLoaded(null));
    return () => { alive = false; };
  }, [url]);
  const show = !!url && loaded === url;
  return (
    <div
      className={className}
      style={{
        position: "relative", overflow: "hidden", borderRadius: radius, aspectRatio: "1 / 1",
        background: art.palette[1], isolation: "isolate",
        boxShadow: shadow ? `0 30px 70px -24px ${art.palette[1]}, 0 18px 40px -20px rgba(0,0,0,0.7)` : undefined,
        transition: "box-shadow var(--t4) var(--ease-out)",
        ...style,
      }}
    >
      <Sleeve art={art} title={title ?? track?.name ?? "Flux"} />
      {url && (
        <motion.img
          key={url}
          src={url}
          alt=""
          draggable={false}
          initial={false}
          animate={show
            ? { clipPath: "circle(75% at 50% 50%)", filter: "blur(0px)", scale: 1 }
            : { clipPath: "circle(0% at 50% 50%)", filter: "blur(12px)", scale: 1.06 }}
          transition={{ duration: 0.9, ease: ease.out }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {/* a sliver of light across the sleeve's top edge, like a printed card */}
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.04)", pointerEvents: "none" }} />
    </div>
  );
}
