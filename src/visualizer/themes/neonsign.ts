import type { ThemeDraw } from "../themeTypes";
import { currentLyric } from "../lyricRenderer";
import { engine } from "../../audio/engine";

// Neon sign on a night wall: the current lyric line is bent into glowing
// tube letters that buzz, flicker on the beat, and re-strike when the line
// changes. Falls back to the track name as the sign.
export const NEONSIGN: ThemeDraw = ({ c, w, h, vt, beat, beatE, bassV, midV, TK, C1, C2, CMix, glow, noGlow, L, trackName }) => {
  const S = (L.scratch.neonsign ??= { flicker: 1, lastIdx: -99, strike: 1 });

  // wall
  c.globalCompositeOperation = "source-over";
  const wg = c.createLinearGradient(0, 0, 0, h);
  wg.addColorStop(0, "#0a0a10");
  wg.addColorStop(1, CMix(0.5, 1, 7));
  c.fillStyle = wg;
  c.fillRect(0, 0, w, h);
  // brick hints
  c.strokeStyle = "rgba(255,255,255,0.03)";
  c.lineWidth = 1;
  for (let y = 0; y < h; y += 26) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  for (let y = 0; y < h; y += 26) {
    for (let x = (y / 26) % 2 ? 0 : 30; x < w; x += 60) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 26);
      c.stroke();
    }
  }

  const time = engine.audio.currentTime;
  const cur = L.lyricLines ? currentLyric(L.lyricLines, time) : null;
  const text = cur?.text || trackName || "FLUX PRO";

  // re-strike animation when the line changes
  const idx = cur?.index ?? -1;
  if (idx !== S.lastIdx) {
    S.lastIdx = idx;
    S.strike = 0;
  }
  S.strike = Math.min(1, S.strike + 0.045);
  // buzz flicker: mostly on, dips at random + hard flash on the beat
  const buzz = Math.random() < 0.06 ? 0.45 + Math.random() * 0.3 : 1;
  const on = S.strike < 0.6 ? (Math.random() < S.strike * 1.4 ? 1 : 0.15) : buzz;
  const bright = on * (0.75 + midV * 0.15 + beatE * 0.35);

  const size = Math.min(w * 0.085, h * 0.11);
  c.font = `700 ${Math.floor(size)}px 'Space Grotesk', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const fit = Math.min(1, (w * 0.86) / Math.max(1, c.measureText(text).width));
  c.save();
  c.translate(w / 2, h * 0.44);
  c.scale(fit, fit);
  // halo wash on the wall
  glow(60, C1());
  c.strokeStyle = C1(bright * 0.25, 55);
  c.lineWidth = 12 * TK;
  c.strokeText(text, 0, 0);
  // outer tube
  glow(30 + beatE * 26, C1());
  c.strokeStyle = C1(bright, 62);
  c.lineWidth = 5 * TK;
  c.strokeText(text, 0, 0);
  // inner hot core
  glow(10, C2());
  c.strokeStyle = `rgba(255,255,255,${bright})`;
  c.lineWidth = 1.8 * TK;
  c.strokeText(text, 0, 0);
  noGlow();
  c.restore();

  // small secondary sign: next line (or BPM), in the second color
  const sub = cur?.next || `${L.bpm || "--"} BPM`;
  c.font = `700 ${Math.floor(size * 0.34)}px 'Space Grotesk', sans-serif`;
  const fit2 = Math.min(1, (w * 0.6) / Math.max(1, c.measureText(sub).width));
  c.save();
  c.translate(w / 2, h * 0.62);
  c.scale(fit2, fit2);
  glow(18 + beatE * 14, C2());
  c.strokeStyle = C2((beat ? 1 : 0.55 + bassV * 0.3) * 0.9, 60);
  c.lineWidth = 2.6 * TK;
  c.strokeText(sub, 0, 0);
  noGlow();
  c.restore();

  // ground puddle reflection
  const py = h * 0.86;
  const pg = c.createRadialGradient(w / 2, py, 0, w / 2, py, w * 0.32);
  pg.addColorStop(0, C1(bright * 0.14, 55));
  pg.addColorStop(1, "transparent");
  c.fillStyle = pg;
  c.beginPath();
  c.ellipse(w / 2, py, w * 0.32, h * 0.05, 0, 0, Math.PI * 2);
  c.fill();
  // hanging wires
  c.strokeStyle = "rgba(255,255,255,0.15)";
  c.lineWidth = 1.5 * TK;
  for (const sx of [w * 0.36, w * 0.64]) {
    c.beginPath();
    c.moveTo(sx, 0);
    c.quadraticCurveTo(sx + Math.sin(vt * 0.01) * 6, h * 0.16, w / 2 + (sx < w / 2 ? -w * 0.1 : w * 0.1), h * 0.36);
    c.stroke();
  }
  c.globalCompositeOperation = "lighter";
};
