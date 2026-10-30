// Shared GLSL: the uniform block every shader mode sees, and the small library
// of noise and palette helpers they are written against.

export const HEADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uLevel, uEnergy, uSub, uBass, uLowMid, uMid, uHigh, uAir;
uniform float uTransient, uAccent, uGrid, uPhase, uBarPhase, uDrop;
uniform float uA, uB, uDrift, uCalm;
uniform vec3 uPal[5];
uniform sampler2D uSpec;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
// five-stop ramp, dark → light
vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(uPal[0], uPal[1], t);
  if (t < 2.0) return mix(uPal[1], uPal[2], t - 1.0);
  if (t < 3.0) return mix(uPal[2], uPal[3], t - 2.0);
  return mix(uPal[3], uPal[4], t - 3.0);
}
float spec(float x) { return texture(uSpec, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }
`;

export const FOOTER = `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = scene(uv);
  fragColor = vec4(max(c, 0.0), 1.0);
}`;

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * The compositor: two scenes, a designed transition between them, and the
 * finishing pass (grade, vignette, grain) every mode shares.
 *
 * The transition is a noise-shaped reveal that grows from the centre: the
 * incoming scene appears through the outgoing one along a soft organic front,
 * the front itself glows briefly in the accent colour, and both scenes drift a
 * few percent in scale so the change reads as moving *through* rather than
 * cutting between.
 */
export const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uA, uB;
uniform vec2 uRes;
uniform float uMix, uTime, uGrain, uVignette, uDim, uPaper, uSeed;
uniform vec3 uEdge, uPaperCol;
out vec4 fragColor;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  vec3 col;
  if (uMix >= 1.0) {
    col = texture(uA, uv).rgb;
  } else {
    float m = uMix * uMix * (3.0 - 2.0 * uMix);
    vec3 inc = texture(uA, 0.5 + c * (1.0 + 0.05 * (1.0 - m))).rgb;
    vec3 out_ = texture(uB, 0.5 + c * (1.0 - 0.06 * m)).rgb;
    float asp = uRes.x / uRes.y;
    float n = fbm(vec2(c.x * asp, c.y) * 3.2 + uSeed) * 0.75 + (1.0 - length(vec2(c.x * asp, c.y)) * 0.9) * 0.45;
    float front = m * 1.5 - 0.25;
    float k = smoothstep(front - 0.07, front + 0.07, 1.0 - n + 0.15);
    k = 1.0 - k;
    col = mix(out_, inc, k);
    float edge = 1.0 - abs(k - 0.5) * 2.0;
    col += uEdge * pow(edge, 3.0) * 0.55 * (1.0 - m);
  }
  // vignette + grade
  float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.85)));
  col *= mix(1.0, v, uVignette);
  // filmic shoulder so bright cores roll off instead of clipping
  col = col / (1.0 + col * 0.18);
  col *= uDim;
  // paper theme: the stage is printed lightly onto the page — the scene's
  // light becomes tinted shade on paper rather than light on black
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 printed = uPaperCol * (1.0 - lum * 0.35) + (col - lum) * 0.5;
  col = mix(col, printed, uPaper);
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
  col += g * uGrain;
  fragColor = vec4(col, 1.0);
}`;
