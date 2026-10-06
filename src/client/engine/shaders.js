export const LIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iM3;
layout(location=6) in vec4 iCol;
layout(location=7) in vec4 iExt;
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uOutline;
uniform float uTime;
out vec3 vN;
out vec3 vW;
out vec4 vC;
out float vE;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec3 s = max(abs(iExt.xyz), vec3(1e-4));
  vec3 n = normalize(mat3(M) * (aNor / (s * s)));
  vec4 w = M * vec4(aPos, 1.0);
  if (uOutline > 0.0) {
    float d = length(uCam - w.xyz);
    w.xyz += n * uOutline * clamp(d * 0.014, 0.7, 2.6);
  }
  vN = n; vW = w.xyz; vC = iCol; vE = iExt.w;
  gl_Position = uVP * w;
}`;

export const LIT_FS = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vW;
in vec4 vC;
in float vE;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOutline;
out vec4 o;
void main(){
  float fd = length(uCam - vW);
  float fogT = smoothstep(uFogNear, uFogFar, fd);
  if (uOutline > 0.0) {
    o = vec4(mix(vC.rgb * 0.22 + vec3(0.02, 0.02, 0.05), uFog, fogT), vC.a);
    return;
  }
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW);
  float ndl = dot(N, uSun);
  float lit = smoothstep(-0.02, 0.06, ndl) * 0.6 + smoothstep(0.42, 0.55, ndl) * 0.22 + 0.18 * max(ndl, 0.0);
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(-0.2, 0.4, N.y + 0.3);
  vec3 H = normalize(uSun + V);
  float spec = smoothstep(0.86, 0.9, pow(max(dot(N, H), 0.0), 18.0)) * 0.22;
  vec3 col = vC.rgb * (amb * 0.62 + uSunCol * lit * 0.78);
  col += rim * 0.32 * mix(uSky, vec3(1.0), 0.4) + spec * uSunCol;
  col += vC.rgb * vE;
  col = mix(col, uFog, fogT);
  o = vec4(col, vC.a);
}`;

export const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
uniform mat4 uVP;
out vec3 vW;
out vec3 vN;
void main(){
  vW = aPos; vN = aNor;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vW;
in vec3 vN;
uniform sampler2D uTex;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uMapSize;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
void main(){
  vec2 uv = vW.xz / uMapSize + 0.5;
  vec3 base = texture(uTex, uv).rgb;
  float n1 = noise(vW.xz * 0.9);
  float n2 = noise(vW.xz * 3.7);
  float n3 = noise(vW.xz * 0.12);
  base *= 0.82 + 0.22 * n1 + 0.1 * n2 - 0.06 * n3;
  vec3 N = normalize(vN);
  float ndl = max(dot(N, uSun), 0.0);
  float lit = 0.35 + 0.65 * smoothstep(0.0, 0.5, ndl);
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 col = base * (amb * 0.55 + uSunCol * lit * 0.62);
  float fd = length(uCam - vW);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, fd));
  o = vec4(col, 1.0);
}`;

export const WATER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
out vec3 vW;
void main(){ vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;

export const WATER_FS = `#version 300 es
precision highp float;
in vec3 vW;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
void main(){
  vec2 p = vW.xz;
  float t = uTime;
  float w1 = noise(p * 0.35 + vec2(t * 0.25, t * 0.18));
  float w2 = noise(p * 0.9 - vec2(t * 0.4, -t * 0.3));
  vec3 N = normalize(vec3((w1 - 0.5) * 0.6 + (w2 - 0.5) * 0.3, 1.0, (w2 - 0.5) * 0.6));
  vec3 V = normalize(uCam - vW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(N, H), 0.0), 90.0);
  float d = abs(vW.x - vW.z) / 1.4142;
  float shore = smoothstep(7.5, 9.5, d);
  vec3 deep = vec3(0.06, 0.32, 0.42), shallow = vec3(0.22, 0.62, 0.62);
  vec3 col = mix(deep, shallow, 0.4 + 0.6 * w1 * (1.0 - shore * 0.5));
  col = mix(col, uSky * 1.1, fres * 0.55);
  col += vec3(1.0, 0.95, 0.85) * spec * 1.2;
  float foam = smoothstep(0.62, 0.8, noise(p * 1.6 + t * 0.6)) * shore;
  col += foam * 0.5;
  float a = mix(0.72, 0.25, shore) + spec * 0.3 + foam * 0.3;
  float fd = length(uCam - vW);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, fd));
  o = vec4(col * a, a);
}`;

export const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vP;
void main(){ vP = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform mat4 uInvVP;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uFog;
uniform vec3 uZenith;
out vec4 o;
void main(){
  vec4 a = uInvVP * vec4(vP, -1.0, 1.0);
  vec4 b = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 dir = normalize(b.xyz / b.w - a.xyz / a.w);
  float h = dir.y;
  vec3 col = mix(uFog, uZenith, smoothstep(-0.05, 0.55, h));
  float sun = max(dot(dir, uSun), 0.0);
  col += vec3(1.0, 0.85, 0.6) * (pow(sun, 300.0) * 2.5 + pow(sun, 12.0) * 0.25);
  // soft clouds band
  float c = sin(dir.x * 6.0 + dir.z * 3.0) * sin(dir.z * 5.0 - dir.x * 2.0);
  col = mix(col, vec3(1.0, 0.97, 0.94), smoothstep(0.55, 0.95, c) * smoothstep(0.05, 0.25, h) * 0.25);
  o = vec4(col, 1.0);
}`;

export const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA;
layout(location=2) in vec4 iB;
layout(location=3) in vec4 iC;
uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vUv;
out vec4 vCol;
out float vShape;
out float vAdd;
out float vAux;
void main(){
  float c = cos(iC.x), s = sin(iC.x);
  vec2 corner = aCorner;
  float shape = floor(iC.y + 0.5);
  if (shape == 6.0) corner.y *= 3.5;
  vec2 p = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iA.w;
  vec3 w = iC.z > 0.5 ? iA.xyz + vec3(p.x, 0.0, p.y) : iA.xyz + uRight * p.x + uUp * p.y;
  gl_Position = uVP * vec4(w, 1.0);
  vUv = aCorner; vCol = iB; vShape = shape; vAdd = fract(iC.w); vAux = floor(iC.w) / 100.0;
}`;

export const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
in float vShape;
in float vAdd;
in float vAux;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  float d = length(vUv);
  float a = 0.0;
  if (vShape < 0.5) a = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d));
  else if (vShape < 1.5) { float w = max(vAux, 0.06); a = smoothstep(w, 0.0, abs(d - (1.0 - w))) ; }
  else if (vShape < 2.5) { vec2 q = abs(vUv); a = max(exp(-q.x * 14.0) * exp(-q.y * 2.5), exp(-q.y * 14.0) * exp(-q.x * 2.5)) + exp(-d * d * 12.0); }
  else if (vShape < 3.5) a = 1.0 - smoothstep(0.75, 1.0, d);
  else if (vShape < 4.5) { float n = hash(floor(vUv * 3.0 + 7.0)); a = (1.0 - smoothstep(0.35 + n * 0.3, 1.0, d)) * 0.8; }
  else if (vShape < 5.5) a = (1.0 - smoothstep(0.2, 1.0, d)) * 0.9;
  else a = exp(-vUv.x * vUv.x * 6.0) * (1.0 - smoothstep(0.6, 1.0, abs(vUv.y)));
  a *= vCol.a;
  if (a < 0.003) discard;
  o = vec4(vCol.rgb * a, a * (1.0 - vAdd));
}`;

export const DECAL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec4 uXf; // x, z, angle, y
uniform vec2 uSize;
out vec2 vUv;
void main(){
  vec2 p = aPos.xz * uSize;
  float c = cos(uXf.z), s = sin(uXf.z);
  vec2 r = vec2(p.x * c + p.y * s, -p.x * s + p.y * c);
  vUv = aPos.xz * 2.0;
  gl_Position = uVP * vec4(uXf.x + r.x, uXf.w, uXf.y + r.y, 1.0);
}`;

export const DECAL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform int uType;
uniform vec4 uColor;
uniform vec4 uP;
uniform float uTime;
out vec4 o;
void main(){
  vec2 uv = vUv; // -1..1
  float d = length(uv);
  float a = 0.0;
  vec3 col = uColor.rgb;
  if (uType == 0) { // range ring
    a = smoothstep(0.035, 0.0, abs(d - 0.97)) * 0.9 + (1.0 - smoothstep(0.9, 1.0, d)) * 0.06;
  } else if (uType == 1) { // telegraph circle with progress fill
    float edge = smoothstep(0.05, 0.0, abs(d - 0.96));
    float fill = (1.0 - smoothstep(uP.x - 0.02, uP.x, d)) * 0.45;
    float base = (1.0 - smoothstep(0.95, 1.0, d)) * 0.16;
    a = edge * 0.95 + fill + base;
  } else if (uType == 2) { // line skillshot (uv.y: -1 start .. 1 end)
    float t = uv.y * 0.5 + 0.5;
    float side = smoothstep(0.08, 0.0, abs(abs(uv.x) - 0.9));
    float body = (1.0 - smoothstep(0.85, 1.0, abs(uv.x))) * 0.2;
    float chev = smoothstep(0.1, 0.0, abs(fract(t * uP.y - uTime * 1.6 - abs(uv.x) * 0.15) - 0.5)) * 0.35 * step(abs(uv.x), 0.85);
    float tip = smoothstep(0.96, 1.0, t);
    a = (side * 0.9 + body + chev) * (1.0 - tip * 0.6) * smoothstep(0.0, 0.05, t);
    if (uP.x > 0.0) a = max(a, (1.0 - smoothstep(uP.x - 0.02, uP.x, t)) * 0.45 * (1.0 - smoothstep(0.85, 1.0, abs(uv.x))));
  } else if (uType == 3) { // cone with apex at the centre, half angle uP.y, radius 1
    float r = d;
    float ang = abs(atan(uv.x, uv.y));
    float inside = step(ang, uP.y) * step(r, 1.0);
    float edge = (smoothstep(0.03, 0.0, abs(r - 0.98)) + smoothstep(0.04, 0.0, abs(ang - uP.y) * r)) * step(ang, uP.y + 0.02) * step(r, 1.0);
    float fill = (1.0 - smoothstep(uP.x - 0.02, uP.x, r)) * 0.4;
    a = inside * (0.14 + fill) + edge * 0.9;
  } else if (uType == 4) { // soft target circle
    a = smoothstep(0.08, 0.0, abs(d - 0.85)) * 0.9 + (1.0 - smoothstep(0.8, 1.0, d)) * 0.2;
    float spin = atan(uv.y, uv.x) + uTime * 2.0;
    a *= 0.6 + 0.4 * step(0.0, sin(spin * 4.0));
  } else if (uType == 5) { // selection ring under a unit
    a = smoothstep(0.12, 0.0, abs(d - 0.82)) * 0.95;
    float spin = atan(uv.y, uv.x) + uTime * 1.2;
    a *= 0.55 + 0.45 * step(0.0, sin(spin * 3.0));
  }
  a *= uColor.a;
  if (a < 0.004) discard;
  o = vec4(col * a, a);
}`;

export const POST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(max(c.r, c.g), c.b);
  o = vec4(c * smoothstep(0.78, 1.0, l), 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.227;
  c += texture(uTex, vUv + uDir * 1.385).rgb * 0.316;
  c += texture(uTex, vUv - uDir * 1.385).rgb * 0.316;
  c += texture(uTex, vUv + uDir * 3.231).rgb * 0.07;
  c += texture(uTex, vUv - uDir * 3.231).rgb * 0.07;
  o = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStr;
uniform float uVignette;
uniform vec3 uTint;
uniform float uTintAmt;
out vec4 o;
void main(){
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStr;
  // gentle filmic curve + saturation
  c = c / (1.0 + c * 0.12) * 1.08;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.12);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * uVignette;
  c = mix(c, uTint, uTintAmt);
  o = vec4(c, 1.0);
}`;

export const OVERLAY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uVignette;
out vec4 o;
void main(){
  vec2 d = vUv - 0.5;
  float v = dot(d, d) * uVignette;
  o = vec4(uTint * uTintAmt, max(uTintAmt, 0.0)) + vec4(0.0, 0.0, 0.0, v);
}`;
