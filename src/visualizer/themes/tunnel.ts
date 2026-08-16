import type { ThemeDraw } from "../themeTypes";

export const TUNNEL: ThemeDraw = ({ c, cx, cy, R, t, vt, cfg, bassV, TK, C1, C2, glow, noGlow, L }) => {
  if (t % 7 === 0) L.tunnel.push({ z: 1, rot: vt * 0.01 });
  for (let i = L.tunnel.length - 1; i >= 0; i--) {
    const r = L.tunnel[i];
    r.z -= (0.006 + bassV * 0.028) * cfg.speed;
    if (r.z <= 0.03) { L.tunnel.splice(i, 1); continue; }
    const rad = ((R * 0.75) / r.z) * 0.14;
    c.save();
    c.translate(cx, cy);
    c.rotate(r.rot + vt * 0.002);
    c.beginPath();
    for (let s = 0; s <= 6; s++) {
      const ang = (s / 6) * Math.PI * 2;
      const rr = rad * (1 + (s % 2) * bassV * 0.25);
      s === 0 ? c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    c.strokeStyle = i % 2 ? C1((1 - r.z) * 0.85) : C2((1 - r.z) * 0.85);
    c.lineWidth = (1.5 + (1 - r.z) * 3.5 + bassV * 3) * TK;
    glow(18, C1());
    c.stroke();
    c.restore();
  }
  noGlow();
};
