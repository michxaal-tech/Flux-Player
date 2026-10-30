import type { ModeDef } from "../types";

// VEIL — curtains of light hanging over a dark horizon.
//
// Quiet: the curtains sway and fold slowly, a few stars breathe behind them.
// The low end lifts the curtains' hems and thickens them; highs make fine
// threads shimmer along the rays. A trusted beat sends a band of brightness
// climbing each curtain; without one, onsets flicker the hems instead.
export const veil: ModeDef = {
  id: "veil",
  name: "Veil",
  line: "Curtains of light over a dark horizon",
  reacts: "Bass lifts the hems · highs shimmer · beats climb the folds",
  dials: ["Folds", "Height"],
  kind: "gl",
  frag: `
vec3 scene(vec2 uv) {
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  float t = uTime;
  // sky: ground at the bottom, a little of the deep tone overhead
  vec3 col = mix(uPal[0], uPal[1] * 0.55, smoothstep(0.0, 1.1, uv.y));
  // stars, only where the curtains aren't
  vec2 sp = p * 70.0;
  vec2 sg = floor(sp);
  vec2 so = hash22(sg) * 0.6 + 0.2;
  float sd = length(fract(sp) - so);
  float st = step(0.994, hash12(sg)) * smoothstep(0.12, 0.0, sd) * (0.5 + 0.5 * sin(t * 1.3 + hash12(sg + 3.0) * 40.0));
  col += uPal[4] * st * 0.55 * smoothstep(0.35, 0.9, uv.y);

  float folds = mix(2.5, 7.0, uA);
  float glow = 0.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = p.x + fi * 1.37;
    float tt = t * (0.045 + fi * 0.012);
    float base = 0.38 + uB * 0.18 + fi * 0.05
      + 0.10 * sin(x * 0.9 + tt * 3.0 + fi)
      + 0.08 * (fbm(vec2(x * 0.6, tt + fi * 7.0)) - 0.5)
      - uBass * (0.10 - fi * 0.015) - uDrop * 0.05;
    float d = uv.y - base;
    // vertical rays: noise stretched tall, slowly sliding sideways
    float warp = fbm(vec2(x * 1.3, tt * 0.8 + fi)) * 1.6;
    float ray = fbm(vec2(x * folds + warp, uv.y * 0.6 - tt * 0.5));
    ray = pow(smoothstep(0.3, 0.85, ray), 1.6);
    // shimmer threads ride the highs
    float thread = pow(noise(vec2(x * 60.0, uv.y * 4.0 - t * 0.9)), 6.0) * (uHigh * 1.2 + uAir * 0.8);
    float hang = smoothstep(-0.015, 0.03, d) * exp(-max(d, 0.0) * mix(5.5, 2.6, uB + uLevel * 0.3));
    // a band of brightness climbing the curtain on each beat (grid only)
    float climb = exp(-pow(d - uPhase * 0.55, 2.0) * 90.0) * uGrid * (1.0 - uPhase) * 1.3;
    float hem = exp(-pow(d, 2.0) * 1800.0) * (0.35 + uTransient * 1.2 * (1.0 - uGrid) + uAccent * 0.5);
    float e = hang * (ray * (0.65 + uLevel * 0.9) + thread) + hem * ray + climb * hang * ray;
    float w = 1.0 - fi * 0.18;
    light += mix(uPal[2], uPal[3], ray * 0.8 + fi * 0.1) * e * w;
    glow += e * w;
  }
  // keep the curtains coloured light rather than letting stacked layers burn
  // to white: compress the sum, then add only a touch of the spark tone
  light = light / (1.0 + light * 0.45);
  col += light * (1.1 + uEnergy * 0.45);
  col += uPal[4] * pow(min(glow, 1.4), 3.0) * 0.05;
  // ground mist
  float mist = fbm(vec2(p.x * 1.5 - t * 0.03, uv.y * 3.0)) * smoothstep(0.32, 0.0, uv.y);
  col = mix(col, uPal[1] * 0.8 + uPal[2] * 0.12, mist * 0.55);
  col *= 1.0 - smoothstep(0.12, 0.0, uv.y) * 0.65;
  return col;
}`,
};
