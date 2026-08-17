// Renders cached AI cover art. The SVG is sanitized at save time
// (src/ai/covers.ts) — nothing unsanitized ever reaches this component.
import { useEffect, useState } from "react";
import { BORDER, MAG } from "../../constants";
import { coverArt } from "../../ai/features";
import { loadCover } from "../../ai/covers";
import { useStore } from "../../store/useStore";
import { mix } from "../../theme";

export function Cover({
  kind, id, subject, size = 46, canMake = true,
}: {
  kind: "track" | "playlist";
  id: string;
  subject: string;
  size?: number;
  canMake?: boolean;
}) {
  const rev = useStore((s) => s.coverRev);
  const aiReady = useStore((s) => s.aiReady);
  const busy = useStore((s) => s.aiBusy);
  const [svg, setSvg] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCover(kind, id).then((s) => alive && setSvg(s));
    return () => { alive = false; };
  }, [kind, id, rev]);

  const make = async () => {
    if (busy || making) return;
    setMaking(true);
    try { await coverArt(kind, id, subject); } catch { /* surfaced by the busy chip */ }
    setMaking(false);
  };

  const box = {
    width: size, height: size, borderRadius: 9, flexShrink: 0, overflow: "hidden",
    border: BORDER, background: "rgba(255,255,255,0.04)",
    display: "flex", alignItems: "center", justifyContent: "center",
  } as const;

  if (svg) {
    return (
      <div
        style={box}
        title={`${subject} — AI cover`}
        // sanitized at save time: scripts, handlers and external refs removed
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  if (!aiReady || !canMake) return <div style={box} />;
  return (
    <button
      onClick={make}
      title="Generate AI cover art"
      style={{ ...box, cursor: making ? "wait" : "pointer", color: mix(MAG, 70), fontSize: size * 0.34 }}
    >{making ? "…" : "✦"}</button>
  );
}
