// FLUX WRAPPED rendered to a canvas so it can be saved/shared as an image.
import { useEffect, useRef, useState } from "react";
import { BORDER, MONO, SANS } from "../../constants";
import { stopsOf } from "../../palette";
import type { Wrapped } from "../../ai/features";
import { useStore } from "../../store/useStore";
import { PALETTES } from "../../constants";
import { mix } from "../../theme";

const W = 720, H = 1100;

export function WrappedCard({ data, onClose }: { data: Wrapped; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const visCfg = useStore((s) => s.visCfg);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d")!;
    const pal = PALETTES.find((p) => p.id === visCfg.palette) ?? PALETTES[0];
    // a still image takes the two ends of the ramp; there is nothing to cycle
    const stops = stopsOf(pal, visCfg.h1, visCfg.h2);
    const h1 = stops[0];
    const h2 = stops[stops.length - 1];
    const s = pal.s;
    const c1 = (a = 1, l = 62) => `hsla(${h1}, ${s}%, ${l}%, ${a})`;
    const c2 = (a = 1, l = 62) => `hsla(${h2}, ${s}%, ${l}%, ${a})`;

    // backdrop
    c.fillStyle = "#08090D";
    c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1(0.22, 40));
    g.addColorStop(0.5, "rgba(8,9,13,0)");
    g.addColorStop(1, c2(0.26, 42));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // glow orbs
    for (const [x, y, r, col] of [[130, 180, 240, c1], [600, 880, 300, c2]] as const) {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, (col as (a: number, l: number) => string)(0.3, 65));
      rg.addColorStop(1, "transparent");
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    let y = 92;
    c.textAlign = "left";
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.font = `600 20px ${MONO}`;
    c.fillText("F L U X", 56, y);
    y += 66;
    c.fillStyle = "#fff";
    c.font = `700 62px ${SANS}`;
    c.fillText(data.title || "FLUX WRAPPED", 56, y);

    // headline (wrapped)
    y += 58;
    c.font = `600 27px ${SANS}`;
    c.fillStyle = c1(1, 72);
    y = wrapText(c, data.headline ?? "", 56, y, W - 112, 36);

    // stats
    y += 34;
    for (const st of (data.stats ?? []).slice(0, 5)) {
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.font = `500 16px ${MONO}`;
      c.fillText((st.label ?? "").toUpperCase().slice(0, 34), 56, y);
      c.fillStyle = "#fff";
      c.font = `700 34px ${SANS}`;
      c.fillText(String(st.value ?? "").slice(0, 26), 56, y + 40);
      y += 78;
    }

    // top tracks
    if (data.topTracks?.length) {
      y += 8;
      c.fillStyle = c2(1, 70);
      c.font = `600 16px ${MONO}`;
      c.fillText("ON REPEAT", 56, y);
      y += 34;
      c.font = `600 22px ${SANS}`;
      data.topTracks.slice(0, 5).forEach((t, i) => {
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.fillText(`${i + 1}`, 56, y);
        c.fillStyle = "#fff";
        c.fillText(String(t).slice(0, 40), 92, y);
        y += 36;
      });
    }

    // personality
    if (data.personality) {
      y += 22;
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.font = `400 20px ${SANS}`;
      y = wrapText(c, data.personality, 56, y, W - 112, 30);
    }

    c.fillStyle = "rgba(255,255,255,0.28)";
    c.font = `500 15px ${MONO}`;
    c.fillText("made with FLUX", 56, H - 44);

    cv.toBlob((b) => b && setUrl(URL.createObjectURL(b)), "image/png");
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visCfg.palette, visCfg.h1, visCfg.h2]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <canvas ref={ref} style={{ width: "100%", borderRadius: 12, border: BORDER, display: "block" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <a
          href={url ?? undefined}
          download="flux-wrapped.png"
          style={{
            flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, fontSize: 10.5,
            fontWeight: 700, letterSpacing: "0.08em", textDecoration: "none",
            background: mix("#fff", 8), border: BORDER, color: "#fff", opacity: url ? 1 : 0.4,
          }}
        >⬇ SAVE IMAGE</a>
        <button
          onClick={onClose}
          style={{ padding: "10px 16px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: BORDER, color: "rgba(255,255,255,0.6)" }}
        >CLOSE</button>
      </div>
    </div>
  );
}

function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, y);
      y += lh;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) { c.fillText(line, x, y); y += lh; }
  return y;
}
