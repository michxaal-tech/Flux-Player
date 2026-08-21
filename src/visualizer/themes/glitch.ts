import type { ThemeDraw } from "../themeTypes";
import { dk } from "../rate";

// VHS glitch art: flat color panels and a raw waveform trace, torn apart on
// every beat by horizontal slice displacement, chromatic offset and static.
// Hard-edged and analog-broken — the opposite of the glow themes.
export const GLITCH: ThemeDraw = ({ c, fs, w, h, freq, wave, liveAudio, vt, beat, beatE, bassV, trebV, TK, C1, C2, CMix, L }) => {
  const S = (L.scratch.glitch ??= { tears: [] as { y: number; hgt: number; off: number; life: number }[] });

  c.globalCompositeOperation = "source-over";
  c.fillStyle = "#050507";
  c.fillRect(0, 0, w, h);

  // flat spectrum panels, hard edges, no glow
  const N = 24;
  const bw2 = w / N;
  for (let i = 0; i < N; i++) {
    const fv = liveAudio ? freq[Math.floor((i / N) * 190)] / 255 : 0.12 + 0.1 * Math.sin(vt * 0.03 + i);
    const bh = fv * h * 0.62 * (1 + beatE * 0.35);
    c.fillStyle = CMix(i / N, 0.85, 52 + beatE * 8);
    c.fillRect(i * bw2, h * 0.82 - bh, bw2 - 2, bh);
    // panel id tag
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(i * bw2, h * 0.82 - bh, bw2 - 2, 2);
  }
  // baseline
  c.fillStyle = C2(0.9);
  c.fillRect(0, h * 0.82, w, 3 * TK);

  // raw waveform trace across the top
  c.strokeStyle = C1(0.8, 66);
  c.lineWidth = 1.6 * TK;
  c.beginPath();
  for (let i = 0; i < 1024; i += 8) {
    const x = (i / 1024) * w;
    const y = h * 0.18 + ((wave[i] - 128) / 128) * h * 0.1 * (1 + beatE);
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.stroke();

  // beat: spawn slice tears
  if (beat) {
    for (let k = 0; k < 4; k++)
      S.tears.push({
        y: Math.random() * h,
        hgt: h * (0.02 + Math.random() * 0.07),
        off: (Math.random() - 0.5) * w * 0.16,
        life: 1,
      });
  }
  // apply tears: self-copy displaced slices + chromatic ghosts
  for (let i = S.tears.length - 1; i >= 0; i--) {
    const tr = S.tears[i];
    tr.life *= dk(0.86, fs);
    if (tr.life < 0.06) { S.tears.splice(i, 1); continue; }
    const off = tr.off * tr.life;
    const cv = c.canvas;
    const sy = (tr.y / h) * cv.height;
    const sh2 = (tr.hgt / h) * cv.height;
    c.drawImage(cv, 0, sy, cv.width, sh2, off, tr.y, w, tr.hgt);
    // chromatic ghost edges
    c.globalCompositeOperation = "lighter";
    c.fillStyle = C1(tr.life * 0.25, 55);
    c.fillRect(off > 0 ? 0 : w + off, tr.y, Math.abs(off), tr.hgt);
    c.globalCompositeOperation = "source-over";
  }

  // rolling interference band
  const bandY = (vt * 1.6) % (h * 1.4) - h * 0.2;
  c.fillStyle = `rgba(255,255,255,${0.03 + beatE * 0.05})`;
  c.fillRect(0, bandY, w, h * 0.06);

  // static noise, heavier with treble and on the beat
  const grains = Math.floor(40 + trebV * 160 + beatE * 120);
  for (let i = 0; i < grains; i++) {
    c.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.18)" : CMix(Math.random(), 0.25, 60);
    c.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
  }

  // tracking text
  c.font = `${Math.floor(h * 0.02)}px 'JetBrains Mono', monospace`;
  c.textAlign = "right";
  c.fillStyle = "rgba(255,255,255,0.45)";
  c.fillText(`PLAY ▶  ${L.bpm ? L.bpm + " BPM" : "SYNC…"}`, w * 0.97, h * 0.06);
  c.globalCompositeOperation = "lighter";
};
