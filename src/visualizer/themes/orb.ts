import type { ThemeDraw } from "../themeTypes";

const LAT = 12, LON = 24;
const spherePts: { x: number; y: number; z: number; la: number; lo: number }[] = [];
for (let la = 0; la <= LAT; la++)
  for (let lo = 0; lo < LON; lo++) {
    const phi = (la / LAT) * Math.PI, th2 = (lo / LON) * Math.PI * 2;
    spherePts.push({ x: Math.sin(phi) * Math.cos(th2), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(th2), la, lo });
  }

export const ORB: ThemeDraw = ({ c, cx, cy, R, freq, liveAudio, vt, bassV, TK, CMix }) => {
  const rad = R * (0.24 + bassV * 0.07);
  const rotY = vt * 0.008, rotX = Math.sin(vt * 0.004) * 0.5 + 0.35;
  c.globalCompositeOperation = "lighter";
  const proj = spherePts.map((p) => {
    const x = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
    let z = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
    const y = p.y * Math.cos(rotX) - z * Math.sin(rotX);
    z = p.y * Math.sin(rotX) + z * Math.cos(rotX);
    const wob = 1 + (liveAudio ? (freq[(p.la * 24 + p.lo) % 200] / 255) * bassV * 0.5 : 0);
    const persp = 1.6 / (1.6 - z * 0.5);
    return { sx: cx + x * rad * persp * wob, sy: cy + y * rad * persp * wob, z, lo: p.lo };
  });
  for (let lo = 0; lo < LON; lo += 2) {
    c.beginPath();
    for (let la = 0; la <= LAT; la++) {
      const p = proj[la * LON + lo];
      la === 0 ? c.moveTo(p.sx, p.sy) : c.lineTo(p.sx, p.sy);
    }
    c.strokeStyle = CMix(lo / LON, 0.35);
    c.lineWidth = 1 * TK;
    c.stroke();
  }
  for (const p of proj) {
    const a = (p.z + 1) / 2;
    c.fillStyle = CMix(p.lo / LON, 0.15 + a * 0.75, 74);
    c.beginPath();
    c.arc(p.sx, p.sy, (1 + a * (1.6 + bassV * 3)) * TK, 0, Math.PI * 2);
    c.fill();
  }
};
