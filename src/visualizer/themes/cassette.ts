import type { ThemeDraw } from "../themeTypes";

// Cassette deck close-up: spinning tape reels whose speed rides the music,
// analog VU needles that slam on the bass, and a wobbling tape path. Retro
// hardware aesthetic — dials and needles instead of glow.
export const CASSETTE: ThemeDraw = ({ c, w, h, freq, liveAudio, vt, beat, beatE, bassV, midV, TK, C1, C2, CMix, L }) => {
  const S = (L.scratch.cassette ??= { rot: 0, needleL: 0, needleR: 0 });
  S.rot += 0.03 + bassV * 0.12 + beatE * 0.15;
  // needle ballistics: fast attack, slow fall
  const targetL = Math.min(1, bassV * 1.6 + beatE * 0.4);
  const targetR = Math.min(1, midV * 2 + beatE * 0.35);
  S.needleL += (targetL - S.needleL) * (targetL > S.needleL ? 0.5 : 0.06);
  S.needleR += (targetR - S.needleR) * (targetR > S.needleR ? 0.5 : 0.06);

  c.globalCompositeOperation = "source-over";
  // deck face
  const cw2 = Math.min(w * 0.86, h * 1.2);
  const x0 = (w - cw2) / 2, y0 = h * 0.16, ch2 = h * 0.56;
  c.fillStyle = "#101014";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#17171d";
  c.fillRect(x0, y0, cw2, ch2);
  c.strokeStyle = "rgba(255,255,255,0.12)";
  c.lineWidth = 2 * TK;
  c.strokeRect(x0, y0, cw2, ch2);
  // cassette window
  const wx = x0 + cw2 * 0.14, wy = y0 + ch2 * 0.16, ww = cw2 * 0.72, wh = ch2 * 0.5;
  c.fillStyle = "#0b0b10";
  c.fillRect(wx, wy, ww, wh);
  c.strokeStyle = CMix(0.5, 0.4, 40);
  c.strokeRect(wx, wy, ww, wh);

  // reels — tape amount shifts slowly with playhead-ish drift
  const fill = 0.5 + Math.sin(vt * 0.002) * 0.3;
  const reelY = wy + wh / 2;
  const hubR = wh * 0.16;
  const maxTape = wh * 0.42;
  const reels = [
    { x: wx + ww * 0.28, tape: hubR + maxTape * (1 - fill) },
    { x: wx + ww * 0.72, tape: hubR + maxTape * fill },
  ];
  for (const [ri, reel] of reels.entries()) {
    // tape wound on the reel
    c.fillStyle = "#241d16";
    c.beginPath();
    c.arc(reel.x, reelY, reel.tape, 0, Math.PI * 2);
    c.fill();
    // hub with teeth
    c.save();
    c.translate(reel.x, reelY);
    c.rotate(S.rot * (ri === 0 ? 1 : 0.8));
    c.fillStyle = "#e8e8ea";
    c.beginPath();
    c.arc(0, 0, hubR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#17171d";
    for (let t2 = 0; t2 < 6; t2++) {
      c.save();
      c.rotate((t2 / 6) * Math.PI * 2);
      c.fillRect(hubR * 0.45, -hubR * 0.14, hubR * 0.5, hubR * 0.28);
      c.restore();
    }
    c.restore();
  }
  // tape path between reels, wobbling with the music
  c.strokeStyle = "#3a2f22";
  c.lineWidth = 3 * TK;
  c.beginPath();
  c.moveTo(reels[0].x, reelY + reels[0].tape);
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    const tx = reels[0].x + (reels[1].x - reels[0].x) * p;
    const ty = wy + wh * 0.94 + Math.sin(p * 9 + vt * 0.1) * (1 + midV * 5 + beatE * 4);
    c.lineTo(tx, ty);
  }
  c.lineTo(reels[1].x, reelY + reels[1].tape);
  c.stroke();
  // label strip with track spectrum
  c.fillStyle = CMix(0.5, 0.25, 30);
  c.fillRect(wx, wy - ch2 * 0.1, ww, ch2 * 0.08);
  const N = 40;
  for (let i = 0; i < N; i++) {
    const fv = liveAudio ? freq[Math.floor((i / N) * 180)] / 255 : 0.15;
    c.fillStyle = CMix(i / N, 0.9, 55 + beatE * 10);
    const bh2 = fv * ch2 * 0.07 * (1 + beatE * 0.4);
    c.fillRect(wx + (i / N) * ww + 1, wy - ch2 * 0.02 - bh2, ww / N - 2, bh2);
  }

  // twin VU meters
  const vuY = y0 + ch2 * 0.78, vuW = cw2 * 0.34, vuH = ch2 * 0.17;
  ([[x0 + cw2 * 0.12, S.needleL, "L"], [x0 + cw2 * 0.54, S.needleR, "R"]] as const).forEach(([vx, val, lbl]) => {
    c.fillStyle = "#0d0d12";
    c.fillRect(vx, vuY, vuW, vuH);
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.strokeRect(vx, vuY, vuW, vuH);
    // scale ticks
    for (let t2 = 0; t2 <= 10; t2++) {
      const ta = Math.PI * (0.78 - (t2 / 10) * 0.56);
      const cx2 = vx + vuW / 2, cy2 = vuY + vuH * 0.95;
      const r1 = vuH * 0.75, r2 = vuH * 0.85;
      c.strokeStyle = t2 >= 8 ? C2(0.8, 55) : "rgba(255,255,255,0.35)";
      c.lineWidth = 1.2 * TK;
      c.beginPath();
      c.moveTo(cx2 + Math.cos(ta) * r1, cy2 - Math.sin(ta) * r1);
      c.lineTo(cx2 + Math.cos(ta) * r2, cy2 - Math.sin(ta) * r2);
      c.stroke();
    }
    // needle
    const na = Math.PI * (0.78 - val * 0.56);
    c.strokeStyle = val > 0.78 ? C2(1, 60) : C1(0.9, 65);
    c.lineWidth = 2 * TK;
    c.beginPath();
    c.moveTo(vx + vuW / 2, vuY + vuH * 0.95);
    c.lineTo(vx + vuW / 2 + Math.cos(na) * vuH * 0.8, vuY + vuH * 0.95 - Math.sin(na) * vuH * 0.8);
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.font = `700 ${Math.floor(vuH * 0.22)}px 'JetBrains Mono', monospace`;
    c.textAlign = "left";
    c.fillText(`VU ${lbl}`, vx + 4, vuY + vuH * 0.28);
  });

  // transport readout
  c.fillStyle = C1(0.85, 60);
  c.font = `700 ${Math.floor(h * 0.028)}px 'JetBrains Mono', monospace`;
  c.textAlign = "center";
  c.fillText(`◉ REC   ▶ PLAY   ${L.bpm || "--"} BPM`, w / 2, y0 + ch2 + h * 0.07);
  // rec light blinks on the beat
  c.fillStyle = beatE > 0.3 ? C2(1, 60) : "rgba(120,40,50,0.5)";
  c.beginPath();
  c.arc(w / 2 - Math.floor(h * 0.028) * 5.4, y0 + ch2 + h * 0.061, h * 0.008 + beatE * 3, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "lighter";
};
