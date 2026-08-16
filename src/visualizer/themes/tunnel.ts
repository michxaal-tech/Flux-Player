import type { ThemeDraw } from "../themeTypes";

// Hex tunnel. Beat: warp-speed kick and a white-hot ring slams down the tunnel.
export const TUNNEL: ThemeDraw = ({ c, cx, cy, R, t, vt, beat, beatE, cfg, bassV, TK, C1, C2, glow, noGlow, L }) => {
  if (t % 7 === 0) L.tunnel.push({ z: 1, rot: vt * 0.01, hot: false });
  if (beat) L.tunnel.push({ z: 1, rot: vt * 0.01, hot: true });
  for (let i = L.tunnel.length - 1; i >= 0; i--) {
    const r = L.tunnel[i];
    r.z -= (0.006 + bassV * 0.028) * (1 + beatE * 1.8) * cfg.speed;
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
    if (r.hot) {
      c.strokeStyle = `hsla(0, 0%, 100%, ${(1 - r.z) * 0.95})`;
      c.lineWidth = (3 + (1 - r.z) * 5 + beatE * 3) * TK;
      glow(30, C1());
    } else {
      c.strokeStyle = i % 2 ? C1((1 - r.z) * 0.85) : C2((1 - r.z) * 0.85);
      c.lineWidth = (1.5 + (1 - r.z) * 3.5 + bassV * 3 + beatE * 2) * TK;
      glow(18 * (1 + beatE), C1());
    }
    c.stroke();
    c.restore();
  }
  noGlow();
};
