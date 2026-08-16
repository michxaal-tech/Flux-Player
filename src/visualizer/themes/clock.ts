import type { ThemeDraw } from "../themeTypes";

export const CLOCK: ThemeDraw = ({ c, w, h, cx, cy, R, vt, bassV, C1, C2, glow, noGlow, trackName }) => {
  for (let i = 0; i < 3; i++) {
    const ang = vt * 0.002 + i * 2.1;
    const bx = cx + Math.cos(ang) * w * 0.2;
    const by = cy + Math.sin(ang * 0.8) * h * 0.18;
    const rad = R * (0.3 + bassV * 0.15);
    const g = c.createRadialGradient(bx, by, 0, bx, by, rad);
    g.addColorStop(0, i % 2 ? C2(0.05 + bassV * 0.06) : C1(0.05 + bassV * 0.06));
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, rad, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = "source-over";
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.font = `700 ${Math.floor(R * 0.22)}px 'Space Grotesk', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  glow(30 + bassV * 40, C1());
  c.fillText(`${hh}:${mm}`, cx, cy - R * 0.02);
  noGlow();
  c.font = `400 ${Math.floor(R * 0.035)}px 'JetBrains Mono', monospace`;
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.fillText(trackName.slice(0, 40), cx, cy + R * 0.13);
  c.globalCompositeOperation = "lighter";
};
