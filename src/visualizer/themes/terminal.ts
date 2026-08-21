import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

const BLOCKS = ["░", "▒", "▓", "█"];
const HEADER = "> FLUX PRO v5 — AUDIO ANALYSIS RUNNING _";

// Retro CRT terminal: an ASCII spectrum wall typed in phosphor characters,
// scanlines, cursor blink. Beats glitch entire rows sideways and flash the
// phosphor. A totally different, flat "hacker" aesthetic — no glow.
export const TERMINAL: ThemeDraw = ({ c, w, h, t, fs, freq, liveAudio, vt, beat, beatE, bassV, trebV, C1, CMix, L }) => {
  const S = (L.scratch.terminal ??= { glitchRows: [] as { row: number; off: number; life: number }[] });

  // opaque CRT background
  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#030604";
  c.fillRect(0, 0, w, h);

  const cols = 46, rows = 20;
  const cw = w / cols, ch = h * 0.8 / rows;
  const fontPx = Math.floor(Math.min(cw * 1.6, ch * 0.95));
  c.font = `${fontPx}px 'JetBrains Mono', monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";

  if (beat) S.glitchRows.push({ row: Math.floor(Math.random() * rows), off: (Math.random() - 0.5) * cw * 6, life: 1 });
  for (let i = S.glitchRows.length - 1; i >= 0; i--) {
    S.glitchRows[i].life *= dk(0.82, fs);
    if (S.glitchRows[i].life < 0.05) S.glitchRows.splice(i, 1);
  }

  // header line
  c.fillStyle = C1(0.75, 60);
  c.textAlign = "left";
  c.font = `${Math.floor(fontPx * 0.9)}px 'JetBrains Mono', monospace`;
  const typed = HEADER.slice(0, Math.min(HEADER.length, Math.floor(vt / 4) % (HEADER.length + 30)));
  c.fillText(typed + (t % 40 < 20 ? "█" : " "), w * 0.03, h * 0.06);
  c.fillText(`  BPM ${L.bpm || "--"}  LVL ${"■".repeat(Math.round(bassV * 8)).padEnd(8, "·")}`, w * 0.03, h * 0.11);
  c.textAlign = "center";
  c.font = `${fontPx}px 'JetBrains Mono', monospace`;

  // ASCII spectrum wall
  const top = h * 0.16;
  for (let x = 0; x < cols; x++) {
    const fv = liveAudio ? freq[Math.floor((x / cols) * 190)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + x * 0.5);
    const lit = Math.round(fv * (1 + beatE * 0.5) * rows);
    for (let y = 0; y < rows; y++) {
      const on = rows - y <= lit;
      if (!on && Math.random() > 0.03) continue; // sparse dark cells flicker
      const gRow = S.glitchRows.find((g: { row: number }) => g.row === y);
      const gx = gRow ? gRow.off * gRow.life : 0;
      const heat = (rows - y) / rows;
      const chr = on ? BLOCKS[Math.min(3, Math.floor(fv * 4 + heat))] : "·";
      c.fillStyle = on
        ? CMix(heat * 0.7, 0.35 + heat * 0.5 + beatE * 0.25, 48 + heat * 18)
        : C1(0.12, 40);
      c.fillText(chr, x * cw + cw / 2 + gx, top + y * ch + ch / 2);
    }
  }

  // scanlines + phosphor flash
  c.fillStyle = `rgba(0,0,0,0.22)`;
  for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1.6);
  if (beatE > 0.4) {
    c.fillStyle = C1(beatE * 0.05, 60);
    c.fillRect(0, 0, w, h);
  }
  // treble static
  if (trebV > 0.15) {
    for (let i = 0; i < 30; i++) {
      c.fillStyle = C1(Math.random() * trebV * 0.5, 65);
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  c.globalCompositeOperation = "lighter";
};
