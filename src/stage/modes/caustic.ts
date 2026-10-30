import type { ModeDef } from "../types";

// CAUSTIC — light refracted through moving water onto the floor of a pool.
//
// The network of bright lines is the edge set of a warped cellular field, laid
// twice at two depths. Quiet: it wanders and breathes. The low end bulges the
// surface (the lines swim outward); a trusted beat pulls the light into sharp
// focus for a moment, then lets it soften; highs split the light into colour
// at the edges, the way real caustics fringe.
export const caustic: ModeDef = {
  id: "caustic",
  name: "Caustic",
  line: "Refracted light on the floor of a pool",
  reacts: "Bass bulges the surface · beats focus the light · highs split colour",
  dials: ["Scale", "Depth"],
  kind: "gl",
  frag: `
// Caustics are where refracted light converges: thin, uneven filaments that
// flare where they cross. Two layers of ridged noise (1 - |2n - 1| peaks along
// thin curves), warped by a slow flow, give the filaments; their product gives
// the bright crossings. Raising the exponent narrows the lines — "focus".
float ridged(vec2 p) { return 1.0 - abs(noise(p) * 2.0 - 1.0); }
float web(vec2 p, float t, float focus) {
  vec2 w = vec2(fbm(p * 0.5 + t * 0.12), fbm(p * 0.5 - t * 0.1 + 5.0)) - 0.5;
  vec2 q = p + w * 1.6;
  float a = ridged(q + vec2(t * 0.25, -t * 0.18));
  float b = ridged(q * 1.63 + vec2(-t * 0.21, t * 0.16) + 3.7);
  float k = mix(9.0, 22.0, focus);
  return pow(a, k) * 0.55 + pow(b, k * 1.1) * 0.45 + pow(a * b, k * 0.45) * 1.1;
}
vec3 scene(vec2 uv) {
  float asp = uRes.x / uRes.y;
  vec2 c = (uv - vec2(0.5, 0.55)) * vec2(asp, 1.0);
  // bulge from the low end: sample nearer the centre → lines swim outward
  float r = length(c);
  c *= 1.0 - (uBass * 0.12 + uDrop * 0.08) * exp(-r * 1.4);
  float sc = mix(1.6, 4.2, uA);
  float t = uTime * 0.55;
  float focus = clamp(uGrid * pow(1.0 - uPhase, 3.0) * 0.9 + uTransient * (1.0 - uGrid) * 0.7 + uLevel * 0.25, 0.0, 1.0);
  float disp = 0.006 + (uHigh + uAir) * 0.018;
  vec3 l;
  vec2 p = c * sc;
  l.r = web(p * (1.0 + disp), t, focus);
  l.g = web(p, t, focus);
  l.b = web(p * (1.0 - disp), t, focus);
  vec2 p2 = c * sc * 0.62 + 9.0;
  float deep = web(p2, t * 0.8 + 3.0, focus * 0.6);
  // floor: deep tone with soft tiled shading, receding with depth
  float depth = mix(0.25, 0.9, uB);
  vec3 floorc = mix(uPal[0], uPal[1], 0.55 + 0.25 * fbm(c * 2.0 + t * 0.05));
  float fade = exp(-r * mix(0.6, 1.6, depth));
  vec3 col = floorc;
  col += uPal[2] * deep * 0.35 * fade;
  // two depths of web: the far one dim and soft, the near one sharp
  // light arrives in broad drifting patches, so the web is bright in places
  // and nearly gone in others instead of an even net
  float patch = smoothstep(0.25, 0.75, fbm(c * 0.9 + vec2(t * 0.05, -t * 0.04)));
  col += mix(uPal[3], uPal[4], clamp(l.g, 0.0, 1.0)) * l * (0.6 + uLevel * 0.7) * fade * (0.25 + patch * 1.1);
  col += uPal[2] * 0.08 * (1.0 + sin(c.x * 3.0 + t * 0.2) * sin(c.y * 2.0 - t * 0.15));
  // god rays falling from the surface
  float ray = fbm(vec2(c.x * 3.0 + c.y * 0.6 + t * 0.08, 0.0)) ;
  col += uPal[3] * pow(ray, 4.0) * smoothstep(-0.6, 0.6, c.y) * 0.18 * (0.5 + uEnergy);
  return col;
}`,
};
