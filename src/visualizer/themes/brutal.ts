import type { ThemeDraw } from "../themeTypes";

// Brutalist poster: giant flat shapes, hard edges, stark typography, zero
// glow. The composition snaps to a new arrangement on every beat like pages
// of a Swiss design annual flipping to the music.
export const BRUTAL: ThemeDraw = ({ c, w, h, freq, liveAudio, beat, beatE, bassV, midV, TK, C1, C2, CMix, L }) => {
  const S = (L.scratch.brutal ??= { seed: 1, flip: 0 });
  if (beat) {
    S.seed = (S.seed * 16807) % 2147483647;
    S.flip = 1;
  }
  S.flip *= 0.88;
  // cheap deterministic PRNG from the seed so the layout is stable between beats
  const rnd = (i: number) => {
    let x = (S.seed + i * 374761393) % 2147483647;
    x = (x * 48271) % 2147483647;
    return x / 2147483647;
  };

  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#0b0b0e";
  c.fillRect(0, 0, w, h);

  // massive flat color field
  const fieldW = w * (0.3 + rnd(1) * 0.35);
  const fieldX = rnd(2) * (w - fieldW);
  c.fillStyle = CMix(rnd(3), 0.95, 50);
  c.fillRect(fieldX, 0, fieldW, h);

  // hard-edged circle, offset each beat, breathing with the bass
  const cr = Math.min(w, h) * (0.16 + rnd(4) * 0.1) * (1 + bassV * 0.12);
  const ccx = w * (0.2 + rnd(5) * 0.6), ccy = h * (0.2 + rnd(6) * 0.55);
  c.fillStyle = C2(0.95, 58);
  c.beginPath();
  c.arc(ccx, ccy, cr, 0, Math.PI * 2);
  c.fill();
  // punched hole
  c.fillStyle = "#0b0b0e";
  c.beginPath();
  c.arc(ccx + cr * 0.25, ccy - cr * 0.2, cr * 0.4, 0, Math.PI * 2);
  c.fill();

  // thick diagonal bar
  c.save();
  c.translate(w / 2, h / 2);
  c.rotate((rnd(7) - 0.5) * 0.9);
  c.fillStyle = C1(0.9, 62);
  c.fillRect(-w, -h * (0.03 + midV * 0.04), w * 2, h * (0.06 + midV * 0.08));
  c.restore();

  // strict flat spectrum strip along the bottom — data as design element
  const N = 32;
  const stripH = h * 0.16;
  for (let i = 0; i < N; i++) {
    const fv = liveAudio ? freq[Math.floor((i / N) * 190)] / 255 : 0.15;
    const bh = fv * stripH * (1 + beatE * 0.4);
    c.fillStyle = i % 2 ? "#e8e8e8" : CMix(i / N, 1, 60);
    c.fillRect((i / N) * w, h - bh, w / N - 3, bh);
  }

  // giant typography
  c.fillStyle = S.flip > 0.4 ? C1(1, 62) : "#e8e8e8";
  c.font = `700 ${Math.floor(h * 0.17)}px 'Space Grotesk', sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  const tx = w * (0.06 + rnd(8) * 0.12);
  const ty = h * (0.3 + rnd(9) * 0.4);
  c.fillText("FLUX", tx, ty);
  // offset "shadow" copy — flat, no blur
  c.fillStyle = C2(0.55, 55);
  c.fillText("FLUX", tx + 6 + beatE * 10, ty + 6 + beatE * 10);
  c.font = `700 ${Math.floor(h * 0.035)}px 'JetBrains Mono', monospace`;
  c.fillStyle = "#e8e8e8";
  c.fillText(`${L.bpm || "---"} BPM /// ${String(Math.round(bassV * 99)).padStart(2, "0")}`, tx + 4, ty + h * 0.05);

  // registration marks
  c.strokeStyle = "rgba(232,232,232,0.5)";
  c.lineWidth = 1.5 * TK;
  for (const [mx2, my2] of [[w * 0.05, h * 0.08], [w * 0.95, h * 0.08], [w * 0.05, h * 0.9], [w * 0.95, h * 0.9]] as const) {
    c.beginPath();
    c.moveTo(mx2 - 8, my2); c.lineTo(mx2 + 8, my2);
    c.moveTo(mx2, my2 - 8); c.lineTo(mx2, my2 + 8);
    c.stroke();
  }
  c.globalCompositeOperation = "lighter";
};
