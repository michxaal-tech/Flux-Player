import type { ThemeDraw } from "../themeTypes";

// Top-down turntable: a spinning record whose grooves light up with the
// spectrum, a tracking tonearm, and stylus sparks on every beat. Made for a
// music app — the vinyl itself becomes the analyzer.
export const VINYL: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, beat, beatE, bassV, TK, C1, C2, CMix, glow, noGlow, L }) => {
  const S = (L.scratch.vinyl ??= { rot: 0, sparks: [] as { x: number; y: number; vx: number; vy: number; a: number }[] });
  S.rot += 0.02 * (1 + bassV * 0.4);
  const discR = R * 0.36 * (1 + beatE * 0.015);

  c.globalCompositeOperation = "source-over";
  // platter shadow + record body
  c.fillStyle = "#0a0a0f";
  c.beginPath();
  c.arc(cx, cy, discR * 1.08, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#101016";
  c.beginPath();
  c.arc(cx, cy, discR, 0, Math.PI * 2);
  c.fill();

  // grooves as spectrum: each ring is a frequency band, brightness = level
  c.globalCompositeOperation = "lighter";
  const RINGS = 42;
  for (let i = 0; i < RINGS; i++) {
    const p = i / RINGS;
    const rr = discR * (0.36 + p * 0.6);
    const fv = liveAudio ? freq[Math.floor((1 - p) * 180)] / 255 : 0.12 + 0.1 * Math.sin(S.rot + i);
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.strokeStyle = CMix(1 - p, 0.06 + fv * 0.6 + beatE * 0.1, 55 + fv * 15);
    c.lineWidth = (discR * 0.6) / RINGS * 0.65 * TK;
    c.stroke();
  }
  // rotating sheen
  c.save();
  c.translate(cx, cy);
  c.rotate(S.rot);
  const sheen = c.createLinearGradient(-discR, 0, discR, 0);
  sheen.addColorStop(0.42, "transparent");
  sheen.addColorStop(0.5, `rgba(255,255,255,${0.05 + beatE * 0.05})`);
  sheen.addColorStop(0.58, "transparent");
  c.fillStyle = sheen;
  c.beginPath();
  c.arc(0, 0, discR, 0, Math.PI * 2);
  c.fill();
  // label
  c.rotate(S.rot * 0.001);
  const lg = c.createRadialGradient(0, 0, 0, 0, 0, discR * 0.33);
  lg.addColorStop(0, C1(0.9, 60));
  lg.addColorStop(1, C2(0.85, 52));
  c.fillStyle = lg;
  c.beginPath();
  c.arc(0, 0, discR * 0.33, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#0a0a0f";
  c.beginPath();
  c.arc(0, 0, discR * 0.035, 0, Math.PI * 2);
  c.fill();
  // label text rotates with the record
  c.rotate(S.rot);
  c.fillStyle = "rgba(10,10,15,0.85)";
  c.font = `700 ${Math.floor(discR * 0.075)}px 'Space Grotesk', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("FLUX", 0, -discR * 0.12);
  c.font = `${Math.floor(discR * 0.05)}px 'JetBrains Mono', monospace`;
  c.fillText(`${L.bpm || "--"} BPM`, 0, discR * 0.13);
  c.restore();

  // tonearm: pivots top-right, stylus rides the groove radius set by the bass
  const px2 = cx + R * 0.52, py2 = cy - R * 0.42;
  const styR = discR * (0.5 + bassV * 0.35 + beatE * 0.08);
  const ang = Math.atan2(cy + styR * 0.35 - py2, cx - styR * 0.9 - px2);
  const sx = px2 + Math.cos(ang) * Math.hypot(cx - styR * 0.9 - px2, cy + styR * 0.35 - py2);
  const sy = py2 + Math.sin(ang) * Math.hypot(cx - styR * 0.9 - px2, cy + styR * 0.35 - py2);
  c.strokeStyle = "rgba(220,225,235,0.75)";
  c.lineWidth = 5 * TK;
  c.beginPath();
  c.moveTo(px2, py2);
  c.lineTo(sx, sy);
  c.stroke();
  c.fillStyle = "rgba(220,225,235,0.9)";
  c.beginPath();
  c.arc(px2, py2, 9 * TK, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = C2(0.9, 60);
  c.fillRect(sx - 5 * TK, sy - 3 * TK, 10 * TK, 8 * TK);

  // stylus sparks on the beat
  if (beat) {
    for (let k = 0; k < 8; k++) {
      const a2 = Math.random() * Math.PI * 2;
      S.sparks.push({ x: sx, y: sy + 6, vx: Math.cos(a2) * 1.6, vy: Math.sin(a2) * 1.6 - 1, a: 1 });
    }
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const sp = S.sparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += 0.08;
    sp.a *= 0.92;
    if (sp.a < 0.05) { S.sparks.splice(i, 1); continue; }
    c.fillStyle = C1(sp.a, 85);
    glow(10, C1());
    c.beginPath();
    c.arc(sp.x, sp.y, 1.6 * TK, 0, Math.PI * 2);
    c.fill();
  }
  noGlow();
};
