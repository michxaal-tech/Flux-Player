import type { ModeDef } from "../types";

// INK — pigment folding through water, like marbled endpapers.
//
// Quiet: a slow domain-warped fold that never repeats. Energy speeds and
// deepens the folding; the low end swells it outward from the centre. Hits
// drop a ripple into the surface (positions supplied by the engine), and the
// dial B draws fine veins along the folds — the marbling comb.
export const ink: ModeDef = {
  id: "ink",
  name: "Ink",
  line: "Pigment folding through water",
  reacts: "Energy deepens the folds · bass swells · hits drop ripples",
  dials: ["Scale", "Veins"],
  kind: "gl",
  frag: `
uniform vec4 uRip[4];
vec3 scene(vec2 uv) {
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  // ripples: rings travelling out from where the hits landed
  for (int i = 0; i < 4; i++) {
    vec4 r = uRip[i];
    if (r.w <= 0.0) continue;
    vec2 dv = p - r.xy;
    float d = length(dv);
    float ring = d - r.z * 0.55;
    float amp = r.w * exp(-ring * ring * 60.0) * exp(-r.z * 1.6);
    p += normalize(dv + 1e-4) * sin(ring * 40.0) * amp * 0.045;
  }
  p *= mix(1.1, 3.0, uA) * (1.0 - uBass * 0.08 - uDrop * 0.06);
  float t = uTime * 0.07;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  float warp = 3.2 + uEnergy * 2.4 + uLowMid * 1.2;
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + t * 1.3),
                fbm(p + warp * q + vec2(8.3, 2.8) - t * 1.1));
  float f = fbm(p + (2.5 + uEnergy) * r);
  float shade = clamp(f * f * 1.6 + length(q) * 0.35 - 0.1, 0.0, 1.0);
  // keep most of the surface in the deep half of the ramp so text reads over it;
  // the light tones are reserved for the crests
  vec3 col = pal(pow(shade, 1.7) * (0.55 + uLevel * 0.22));
  // veins: thin bright lines along iso-contours of the fold
  float vein = abs(fract(f * mix(6.0, 22.0, uB)) - 0.5);
  float line = smoothstep(0.06, 0.0, vein) * smoothstep(0.25, 0.7, length(r));
  col = mix(col, uPal[4], line * (0.18 + uHigh * 0.4) * uB);
  // a soft sheen where the pigment is thickest, brighter on hits
  col += uPal[3] * pow(clamp(length(r) - 0.5, 0.0, 1.0), 2.0) * (0.15 + uAccent * 0.5);
  return col;
}`,
  uniforms: (f, st) => {
    // up to four ripples; a new one on each strong accent, placed by a hash so
    // they scatter across the surface instead of always blooming dead centre
    const rips = (st.rips as number[][] | undefined) ?? [];
    st.rips = rips;
    st.n = ((st.n as number) ?? 0);
    if ((f.onBeat && f.grid > 0.5) || (f.onset && f.grid <= 0.5 && f.transient > 0.35)) {
      const n = (st.n as number) + 1;
      st.n = n;
      const h = Math.sin(n * 12.9898) * 43758.5453;
      const h2 = Math.sin(n * 78.233) * 12345.678;
      const asp = f.w / Math.max(1, f.h);
      rips.push([((h - Math.floor(h)) - 0.5) * asp * 0.8, ((h2 - Math.floor(h2)) - 0.5) * 0.7, 0, Math.min(1, 0.4 + f.accent)]);
      if (rips.length > 4) rips.shift();
    }
    for (const r of rips) r[2] += f.dt * (0.6 + f.energy * 0.6);
    const flat: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = rips[i];
      flat.push(...(r && r[2] < 2.5 ? r : [0, 0, 0, 0]));
    }
    return { uRip: flat };
  },
};
