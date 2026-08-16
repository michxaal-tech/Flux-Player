import type { ThemeDraw } from "../themeTypes";
import { currentLyric } from "../lyricRenderer";
import { engine } from "../../audio/engine";

// Kinetic typography crawl built around synced lyrics: past lines drift up
// and dissolve, the current line burns bright center-stage and kicks with
// the beat, upcoming lines wait below in the depth haze. Without lyrics it
// becomes a bold type poster for the track itself.
export const MARQUEE: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beatE, bassV, TK, C1, C2, CMix, glow, noGlow, L, trackName }) => {
  // depth haze background bars
  for (let i = 0; i < 16; i++) {
    const fv = liveAudio ? freq[i * 11] / 255 : 0.12;
    c.fillStyle = CMix(i / 16, 0.035 + fv * 0.08 + beatE * 0.02, 45);
    const bw2 = w / 16;
    c.fillRect(i * bw2, 0, bw2 - 2, h);
  }

  const time = engine.audio.currentTime;
  const cur = L.lyricLines ? currentLyric(L.lyricLines, time) : null;
  c.textAlign = "center";
  c.textBaseline = "middle";

  const drawLine = (text: string, rel: number, alpha: number, scale: number, hot: boolean) => {
    if (!text) return;
    const size = Math.min(w * 0.075, h * 0.085) * scale;
    c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
    const fit = Math.min(1, (w * 0.9) / Math.max(1, c.measureText(text).width));
    c.save();
    c.translate(w / 2, h * 0.5 + rel * h * 0.19);
    c.scale(fit, fit);
    if (hot) {
      glow(26 + beatE * 30, C1());
      c.fillStyle = `rgba(255,255,255,${alpha})`;
      c.fillText(text, 0, 0);
      noGlow();
      // chromatic echo on the beat
      if (beatE > 0.2) {
        c.globalCompositeOperation = "lighter";
        c.fillStyle = C2(beatE * 0.5, 62);
        c.fillText(text, beatE * 7, 0);
        c.fillStyle = C1(beatE * 0.5, 62);
        c.fillText(text, -beatE * 7, 0);
        c.globalCompositeOperation = "source-over";
      }
    } else {
      c.fillStyle = `rgba(255,255,255,${alpha})`;
      c.fillText(text, 0, 0);
    }
    c.restore();
  };

  c.globalCompositeOperation = "source-over";
  if (cur && (cur.text || cur.next)) {
    const rise = Math.min(1, cur.age * 2.4); // new line slides up into place
    drawLine(cur.prev, -1.15 - rise * 0.35, 0.16, 0.62, false);
    drawLine(cur.text, (1 - rise) * 0.6, 0.55 + rise * 0.45, 0.95 + beatE * 0.05 + bassV * 0.03, true);
    drawLine(cur.next, 1.15, 0.3, 0.68, false);
    if (L.lyricLines) {
      const after = L.lyricLines[cur.index + 2]?.text ?? "";
      drawLine(after, 2.05, 0.14, 0.55, false);
    }
  } else {
    drawLine(trackName || "FLUX PRO", 0, 0.95, 1 + bassV * 0.04, true);
    c.font = `${Math.floor(h * 0.024)}px 'JetBrains Mono', monospace`;
    c.fillStyle = "rgba(255,255,255,0.4)";
    c.fillText(L.lyricLines ? "…" : "no lyrics — TUNE ▸ LYRICS ▸ FIND", w / 2, h * 0.6);
  }

  // beat baseline
  c.fillStyle = C2(0.35 + beatE * 0.5, 58);
  c.fillRect(w * 0.2, h * 0.88, w * 0.6, (1.5 + beatE * 3) * TK);
  c.globalCompositeOperation = "lighter";
};
