"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type GlyphSonarMode = "auto" | "glow" | "ink";

export interface GlyphSonarHandle {
  ping: (x?: number, y?: number) => void;
}

export interface GlyphSonarProps {
  colors?: [string, string];
  backgroundColor?: string;
  mode?: GlyphSonarMode;
  charset?: string;
  fontFamily?: string;
  glyphSize?: number;
  spacing?: number;
  glyphWeight?: number;
  density?: number;
  scale?: number;
  drift?: number;
  driftAngle?: number;
  ambient?: number;
  autoPing?: boolean;
  interval?: number;
  originX?: number;
  originY?: number;
  pingSpeed?: number;
  range?: number;
  ringWidth?: number;
  persistence?: number;
  reveal?: number;
  glow?: number;
  intensity?: number;
  speed?: number;
  interactive?: boolean;
  clickPing?: boolean;
  echo?: boolean;
  echoStrength?: number;
  paused?: boolean;
  quality?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

interface Settings {
  colors: [string, string];
  backgroundColor: string;
  mode: GlyphSonarMode;
  charset: string;
  fontFamily: string;
  glyphSize: number;
  spacing: number;
  glyphWeight: number;
  density: number;
  scale: number;
  drift: number;
  driftAngle: number;
  ambient: number;
  autoPing: boolean;
  interval: number;
  originX: number;
  originY: number;
  pingSpeed: number;
  range: number;
  ringWidth: number;
  persistence: number;
  reveal: number;
  glow: number;
  intensity: number;
  speed: number;
  interactive: boolean;
  clickPing: boolean;
  echo: boolean;
  echoStrength: number;
  paused: boolean;
  quality: number;
  reduced: boolean;
}

interface Controller {
  sync: () => void;
  destroy: () => void;
  ping: (x: number, y: number) => void;
}

interface Ping {
  active: boolean;
  x: number;
  y: number;
  born: number;
  amplitude: number;
  speed: number;
  range: number;
  birth: number;
  echo: boolean;
  echoed: boolean;
}

const PINGS = 16;
const ATLAS_COLUMNS = 16;
const DEFAULT_CHARSET = " ·+×○◎◉";
const DEFAULT_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const WAVE_SPEED = 0.17;
const WAVE_RANGE = 0.75;
const ECHO_RANGE = 0.34;
const OBSTACLE = 26;

const subscribeToMotion = (notify: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

const readMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

let colorContext: CanvasRenderingContext2D | null = null;

const parseColor = (value: string, fallback: [number, number, number]): [number, number, number] => {
  if (!colorContext) colorContext = document.createElement("canvas").getContext("2d");
  if (!colorContext) return fallback;
  colorContext.fillStyle = "#010203";
  colorContext.fillStyle = value;
  const read = String(colorContext.fillStyle);
  if (read === "#010203" && value.trim().toLowerCase() !== "#010203") return fallback;
  if (read.startsWith("#")) {
    const hex = read.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }
  const parts = read.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return fallback;
  return [Number(parts[0]) / 255, Number(parts[1]) / 255, Number(parts[2]) / 255];
};

const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));

const toOklab = ([r, g, b]: [number, number, number]): [number, number, number] => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const passVertex = `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fieldFragment = `
precision highp float;
uniform vec2 uCell;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform vec2 uDrift;
uniform float uThreshold;
uniform float uAmbient;
uniform float uReveal;
uniform float uPersistence;
uniform float uWidth;
uniform float uFalloff;
uniform vec4 uPings[${PINGS}];
uniform vec4 uPingShape[${PINGS}];
uniform vec4 uObstacle;
out vec4 fragColor;

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * noise3(p);
    p = p * 2.03 + vec3(17.1, 3.7, 1.3);
    amplitude *= 0.5;
  }
  return sum / 0.9375;
}

void main() {
  vec2 center = gl_FragCoord.xy * uCell;
  float unit = min(uResolution.x, uResolution.y);
  vec2 q = center / unit * (4.2 / uScale) - uDrift * uTime;
  float z = uTime * 0.03;
  vec2 warp = vec2(fbm(vec3(q * 0.6, z + 3.1)), fbm(vec3(q * 0.6 + 7.3, z + 8.4))) - 0.5;
  float n = fbm(vec3(q + warp * 1.2, z * 1.3));
  float shoal = smoothstep(uThreshold, uThreshold + 0.08, n);
  float core = smoothstep(uThreshold, uThreshold + 0.26, n);
  float hidden = smoothstep(uThreshold - 0.2, uThreshold, n) * (1.0 - shoal);
  float speck = hash2(floor(gl_FragCoord.xy) + 17.0);
  float stipple = hash2(floor(gl_FragCoord.xy) * 1.37 + 71.0);

  float crest = 0.0;
  float tail = 0.0;
  for (int k = 0; k < ${PINGS}; k++) {
    vec4 ping = uPings[k];
    if (ping.w <= 0.0) continue;
    vec4 shape = uPingShape[k];
    float age = uTime - ping.z;
    if (age < 0.0) continue;
    vec2 rel = center - ping.xy;
    float dist = length(rel);
    if (dist > shape.y) continue;
    float radius = age * shape.x;
    float lag = radius - dist;
    if (lag < -uWidth * 3.0) continue;
    float fade = ping.w * (1.0 - smoothstep(shape.y * 0.5, shape.y, dist)) * inversesqrt(1.0 + dist / uFalloff) * smoothstep(0.0, shape.w, radius);
    float shadow = 1.0;
    if (shape.z < 0.5 && uObstacle.w > 0.001) {
      vec2 toward = uObstacle.xy - ping.xy;
      float reach = length(toward);
      if (reach > uObstacle.z * 2.5 && dist > reach - uObstacle.z) {
        vec2 dir = toward / reach;
        float side = abs(rel.x * dir.y - rel.y * dir.x);
        float beyond = max(dist - reach, 0.0);
        float spread = uObstacle.z * dist / reach;
        float soft = uObstacle.z * 0.3 + 0.35 * sqrt(beyond * uObstacle.z);
        float inside = 1.0 - smoothstep(spread - soft, spread + soft, side);
        float heal = mix(0.25, 1.0, exp(-beyond / (uObstacle.z * 16.0)));
        shadow = 1.0 - inside * heal * uObstacle.w * step(0.0, dot(rel, dir));
      }
    }
    float width = lag < 0.0 ? uWidth * 0.6 : uWidth;
    float x = lag / width;
    float front = exp(-x * x * x * x);
    float after = lag > 0.0 ? exp(-lag / max(shape.x * uPersistence, 1.0)) : 0.0;
    crest += front * fade * shadow;
    tail += after * (1.0 - front) * fade * shadow;
  }
  crest = min(crest, 1.4);
  tail = min(tail, 1.2);

  float shown = step(stipple, 0.22 + 0.6 * core);
  float rest = uAmbient * shoal * shown * (0.45 + 0.55 * core);
  float lit = shoal * (0.65 + 0.35 * core) * (crest * 1.5 + tail * 0.55);
  float ghost = hidden * uReveal * (crest * 0.5 + tail * 0.22);
  float water = (1.0 - shoal) * crest * (0.18 + 0.32 * step(0.72, speck));
  float value = clamp(rest + lit + ghost + water, 0.0, 1.0);
  float heat = clamp(crest * 1.4 + tail * 0.6, 0.0, 1.0);
  float struck = 0.6 + 0.4 * clamp(crest * 1.3, 0.0, 1.0);
  float open = 0.5 + 0.28 * clamp(crest, 0.0, 1.0);
  float tone = mix(0.12 + 0.3 * core, mix(open, struck, max(shoal, hidden * 0.6)), heat);
  fragColor = vec4(value, tone, 0.0, 1.0);
}
`;

const glyphFragment = `
precision highp float;
uniform sampler2D uField;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uCount;
uniform vec2 uCell;
uniform float uSpan;
uniform float uGamma;
uniform float uDither;
uniform float uInk;
uniform vec3 uLabA;
uniform vec3 uLabB;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 labToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ), 0.0);
}

float glyphCoverage(float index, vec2 g) {
  vec2 f = fract(g) - 0.5;
  vec2 texel = vec2(0.5 + f.x * uSpan, 0.5 - f.y * uSpan);
  float inside = step(0.0, texel.x) * step(texel.x, 1.0) * step(0.0, texel.y) * step(texel.y, 1.0);
  vec2 slot = vec2(mod(index, uAtlasGrid.x), floor(index / uAtlasGrid.x));
  vec2 uv = (slot + clamp(texel, 0.0, 1.0)) / uAtlasGrid;
  vec2 scale = vec2(uSpan) / uAtlasGrid;
  return textureGrad(uAtlas, uv, dFdx(g) * scale, dFdy(g) * scale).r * inside;
}

vec3 palette(float t) {
  vec3 deep = vec3(uLabA.x * 0.55, uLabA.yz * 0.85);
  vec3 top = uInk > 0.5
    ? vec3(uLabB.x * 0.72, uLabB.yz * 1.05)
    : vec3(min(uLabB.x * 1.08 + 0.05, 0.99), uLabB.yz * 0.35);
  vec3 lab = t < 0.45 ? mix(deep, uLabA, smoothstep(0.0, 0.45, t))
    : t < 0.85 ? mix(uLabA, uLabB, smoothstep(0.45, 0.85, t))
    : mix(uLabB, top, smoothstep(0.85, 1.0, t));
  return labToLinear(lab);
}

void main() {
  vec2 g = gl_FragCoord.xy / uCell;
  vec2 cellId = floor(g);
  vec4 field = texelFetch(uField, ivec2(cellId), 0);
  float dither = hash(cellId) - 0.5;
  float value = clamp(field.r + dither * uDither * step(0.015, field.r), 0.0, 1.0);
  float level = pow(value, uGamma);
  float index = floor(level * (uCount - 1.0) + 0.5);
  float energy = 0.0;
  vec3 color = vec3(0.0);
  if (index >= 1.0) {
    float cover = glyphCoverage(index, g);
    color = palette(clamp(field.g, 0.0, 1.0));
    energy = cover * (0.16 + 0.95 * level);
  }
  fragColor = vec4(color * energy, energy);
}
`;

const downFragment = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 a = texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  vec4 b = texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  vec4 d = texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = (a + b + c + d) * 0.125 + texture(uSource, vUv) * 0.5;
}
`;

const upFragment = `
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 sum = texture(uSource, vUv) * 4.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, -1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, 1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = texture(uBase, vUv) + sum / 16.0;
}
`;

const compositeFragment = `
precision highp float;
uniform sampler2D uLines;
uniform sampler2D uBloom;
uniform vec3 uBackground;
uniform float uGlow;
uniform float uExposure;
uniform float uMode;
uniform float uGrain;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 lines = texture(uLines, vUv);
  vec4 bloom = texture(uBloom, vUv);
  vec3 color;
  if (uMode < 0.5) {
    vec3 light = (lines.rgb + bloom.rgb * uGlow) * uExposure;
    vec3 exposed = 1.0 - exp(-light);
    float peak = max(exposed.r, max(exposed.g, exposed.b));
    exposed = mix(exposed, vec3(peak), smoothstep(0.75, 1.0, peak) * 0.35);
    color = uBackground + (1.0 - uBackground) * exposed;
  } else {
    float energy = lines.a + bloom.a * uGlow * 0.2;
    vec3 hue = (lines.rgb + bloom.rgb * uGlow * 0.2) / max(energy, 1e-4);
    float cover = clamp(1.0 - exp(-energy * uExposure * 1.4), 0.0, 0.95);
    color = mix(uBackground, clamp(hue * 0.85, 0.0, 1.0), cover);
  }
  float grain = hash(gl_FragCoord.xy + uGrain * 311.0) - 0.5;
  fragColor = vec4(encode(color) + grain * (1.2 / 255.0), 1.0);
}
`;

const drawShape = (context: CanvasRenderingContext2D, character: string, x: number, y: number, size: number, line: number) => {
  const r = (k: number) => k * size;
  const ring = (radius: number) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
  };
  const disc = (radius: number) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };
  const diamond = (half: number) => {
    context.beginPath();
    context.moveTo(x, y - half);
    context.lineTo(x + half, y);
    context.lineTo(x, y + half);
    context.lineTo(x - half, y);
    context.closePath();
  };
  const triangle = (half: number) => {
    context.beginPath();
    context.moveTo(x, y - half);
    context.lineTo(x + half * 0.92, y + half * 0.6);
    context.lineTo(x - half * 0.92, y + half * 0.6);
    context.closePath();
  };
  context.lineWidth = line;
  context.lineCap = "round";
  context.lineJoin = "round";
  switch (character) {
    case "·":
      disc(Math.max(r(0.065), line * 0.8));
      return true;
    case "•":
      disc(r(0.13));
      return true;
    case "●":
      disc(r(0.25));
      return true;
    case "+":
      context.beginPath();
      context.moveTo(x - r(0.2), y);
      context.lineTo(x + r(0.2), y);
      context.moveTo(x, y - r(0.2));
      context.lineTo(x, y + r(0.2));
      context.stroke();
      return true;
    case "×":
      context.beginPath();
      context.moveTo(x - r(0.16), y - r(0.16));
      context.lineTo(x + r(0.16), y + r(0.16));
      context.moveTo(x + r(0.16), y - r(0.16));
      context.lineTo(x - r(0.16), y + r(0.16));
      context.stroke();
      return true;
    case "○":
      ring(r(0.26));
      return true;
    case "□":
      context.beginPath();
      context.rect(x - r(0.23), y - r(0.23), r(0.46), r(0.46));
      context.stroke();
      return true;
    case "■":
      context.fillRect(x - r(0.21), y - r(0.21), r(0.42), r(0.42));
      return true;
    case "◇":
      diamond(r(0.3));
      context.stroke();
      return true;
    case "◆":
      diamond(r(0.28));
      context.fill();
      return true;
    case "△":
      triangle(r(0.3));
      context.stroke();
      return true;
    case "▲":
      triangle(r(0.28));
      context.fill();
      return true;
    case "◎":
      ring(r(0.28));
      disc(r(0.085));
      return true;
    case "◉":
      ring(r(0.28));
      disc(r(0.15));
      return true;
    default:
      return false;
  }
};

const buildAtlas = (charset: string, fontFamily: string, cell: number, weight: number) => {
  const ramp = Array.from(new Set(Array.from(charset))).slice(0, 180);
  if (!ramp.includes(" ")) ramp.unshift(" ");
  if (ramp.length < 2) ramp.push("·");
  const line = Math.max(1, Math.round(cell * 0.075 * weight));
  const offset = line % 2 === 1 ? 0.5 : 0;
  const font = `500 ${Math.round(cell * 0.78)}px ${fontFamily}`;
  const paint = (context: CanvasRenderingContext2D, character: string, x: number, y: number) => {
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    if (drawShape(context, character, x + offset, y + offset, cell, line)) return;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = font;
    context.fillText(character, x, y + cell * 0.04);
  };
  const measure = document.createElement("canvas");
  measure.width = cell;
  measure.height = cell;
  const probe = measure.getContext("2d", { willReadFrequently: true });
  const weightOf = (character: string) => {
    if (!probe || character === " ") return 0;
    probe.fillStyle = "#000000";
    probe.fillRect(0, 0, cell, cell);
    paint(probe, character, Math.floor(cell / 2), Math.floor(cell / 2));
    const data = probe.getImageData(0, 0, cell, cell).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    return sum;
  };
  const list = ramp
    .map((character) => ({ character, ink: weightOf(character) }))
    .sort((a, b) => a.ink - b.ink)
    .map((item) => item.character);
  const rows = Math.ceil(list.length / ATLAS_COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLUMNS * cell;
  canvas.height = rows * cell;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    list.forEach((character, index) => {
      if (character === " ") return;
      const x = (index % ATLAS_COLUMNS) * cell + Math.floor(cell / 2);
      const y = Math.floor(index / ATLAS_COLUMNS) * cell + Math.floor(cell / 2);
      paint(context, character, x, y);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, count: list.length, rows };
};

const createSonar = (root: HTMLDivElement, settingsRef: { current: Settings }): Controller | null => {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";
  root.prepend(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: "high-performance" });
  } catch {
    canvas.remove();
    return null;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    canvas.remove();
    return null;
  }
  renderer.autoClear = false;
  const texelType =
    renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float")
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const pingSlots = Array.from({ length: PINGS }, () => new THREE.Vector4(0, 0, 0, 0));
  const pingShapes = Array.from({ length: PINGS }, () => new THREE.Vector4(1, 1, 0, 0));
  const pings: Ping[] = Array.from({ length: PINGS }, () => ({
    active: false,
    x: 0,
    y: 0,
    born: 0,
    amplitude: 0,
    speed: WAVE_SPEED,
    range: WAVE_RANGE,
    birth: 0.08,
    echo: false,
    echoed: false,
  }));

  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms,
      vertexShader: passVertex,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });

  const fieldMaterial = pass(fieldFragment, {
    uCell: { value: new THREE.Vector2(11, 11) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uScale: { value: 1 },
    uDrift: { value: new THREE.Vector2() },
    uThreshold: { value: 0.55 },
    uAmbient: { value: 0.35 },
    uReveal: { value: 0.5 },
    uPersistence: { value: 1.4 },
    uWidth: { value: 8 },
    uFalloff: { value: 300 },
    uPings: { value: pingSlots },
    uPingShape: { value: pingShapes },
    uObstacle: { value: new THREE.Vector4(0, 0, 22, 0) },
  });
  const glyphMaterial = pass(glyphFragment, {
    uField: { value: null },
    uAtlas: { value: null },
    uAtlasGrid: { value: new THREE.Vector2(ATLAS_COLUMNS, 1) },
    uCount: { value: 2 },
    uCell: { value: new THREE.Vector2(11, 11) },
    uSpan: { value: 1 },
    uGamma: { value: 1 },
    uDither: { value: 0.05 },
    uInk: { value: 0 },
    uLabA: { value: new THREE.Vector3() },
    uLabB: { value: new THREE.Vector3() },
  });
  const downMaterial = pass(downFragment, { uSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const upMaterial = pass(upFragment, {
    uSource: { value: null },
    uBase: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
  const compositeMaterial = pass(compositeFragment, {
    uLines: { value: null },
    uBloom: { value: null },
    uBackground: { value: new THREE.Vector3() },
    uGlow: { value: 0.3 },
    uExposure: { value: 1.2 },
    uMode: { value: 0 },
    uGrain: { value: 0 },
  });

  const quad = new THREE.Mesh(plane, compositeMaterial);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  const target = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: texelType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

  let lineTarget: THREE.WebGLRenderTarget | null = null;
  let downTargets: THREE.WebGLRenderTarget[] = [];
  let upTargets: THREE.WebGLRenderTarget[] = [];
  let fieldTarget: THREE.WebGLRenderTarget | null = null;
  let fieldKey = "";
  let atlas: ReturnType<typeof buildAtlas> | null = null;
  let atlasKey = "";

  let destroyed = false;
  let raf = 0;
  let last = 0;
  let visible = true;
  let clock = 0;
  let nextAuto = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let grain = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, presence: 0, inside: false, placed: false };

  const release = () => {
    lineTarget?.dispose();
    downTargets.forEach((item) => item.dispose());
    upTargets.forEach((item) => item.dispose());
    lineTarget = null;
    downTargets = [];
    upTargets = [];
  };

  const draw = (material: THREE.ShaderMaterial, output: THREE.WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(output);
    renderer.render(quadScene, camera);
  };

  const glyphPixels = () =>
    clamp(settingsRef.current.glyphSize, 5, 40) * clamp(Math.min(width, height) / 520, 0.75, 1) * pixelRatio;

  const cellPixels = () => glyphPixels() * clamp(settingsRef.current.spacing, 0.7, 3);

  const diagonal = () => Math.hypot(width, height) * pixelRatio;

  const ensureAtlas = () => {
    const settings = settingsRef.current;
    const charset = String(settings.charset ?? "") || DEFAULT_CHARSET;
    const font = String(settings.fontFamily ?? "") || DEFAULT_FONT;
    const cell = Math.round(clamp(glyphPixels(), 8, 96));
    const weight = clamp(settings.glyphWeight, 0.4, 3);
    const key = `${charset}|${font}|${cell}|${weight}`;
    if (key === atlasKey && atlas) return;
    atlasKey = key;
    atlas?.texture.dispose();
    atlas = buildAtlas(charset, font, cell, weight);
    glyphMaterial.uniforms.uAtlas.value = atlas.texture;
    glyphMaterial.uniforms.uAtlasGrid.value.set(ATLAS_COLUMNS, atlas.rows);
    glyphMaterial.uniforms.uCount.value = atlas.count;
  };

  const ensureField = () => {
    const cell = cellPixels();
    const cols = Math.ceil((width * pixelRatio) / cell);
    const rows = Math.ceil((height * pixelRatio) / cell);
    const key = `${cols}|${rows}`;
    if (key === fieldKey && fieldTarget) return;
    fieldKey = key;
    fieldTarget?.dispose();
    fieldTarget = new THREE.WebGLRenderTarget(cols, rows, {
      type: texelType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
  };

  const fadeAt = (ping: Ping, distance: number) => {
    const reach = ping.range * diagonal();
    return (1 - smoothstep(reach * 0.5, reach, distance)) / Math.sqrt(1 + distance / (0.25 * diagonal()));
  };

  const spawn = (x: number, y: number, amplitude: number, echo: boolean, birth: number, at = clock) => {
    const settings = settingsRef.current;
    let slot = pings.findIndex((item) => !item.active);
    if (slot < 0) {
      slot = 0;
      for (let k = 1; k < PINGS; k++) if (pings[k].born < pings[slot].born) slot = k;
    }
    const range = clamp(settings.range, 0.1, 3) * (echo ? ECHO_RANGE : WAVE_RANGE);
    Object.assign(pings[slot], {
      active: true,
      x,
      y,
      born: at,
      amplitude,
      speed: WAVE_SPEED * clamp(settings.pingSpeed, 0.1, 4),
      range,
      birth,
      echo,
      echoed: echo,
    });
  };

  const origin = () => {
    const settings = settingsRef.current;
    return [clamp(settings.originX, -1, 2), clamp(settings.originY, -1, 2)] as const;
  };

  const seed = () => {
    const settings = settingsRef.current;
    if (!settings.autoPing) return;
    const interval = clamp(settings.interval, 0.6, 30);
    const [ox, oy] = origin();
    spawn(ox, oy, 1, false, 0.08, clock - interval * 1.42);
    spawn(ox, oy, 1, false, 0.08, clock - interval * 0.42);
    nextAuto = clock + interval * 0.58;
  };

  const apply = () => {
    const settings = settingsRef.current;
    const background = parseColor(settings.backgroundColor, [0.04, 0.04, 0.04]);
    const luminance = 0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2];
    const ink = settings.mode === "ink" || (settings.mode === "auto" && luminance > 0.5);
    const labA = toOklab(parseColor(settings.colors[0], [0.48, 0.36, 1]));
    const labB = toOklab(parseColor(settings.colors[1], [1, 0.62, 0.99]));
    const w = width * pixelRatio;
    const h = height * pixelRatio;
    const diag = diagonal();
    const cell = cellPixels();
    const angle = (clamp(settings.driftAngle, -360, 360) * Math.PI) / 180;
    const drift = clamp(settings.drift, 0, 5) * 0.03;
    const field = fieldMaterial.uniforms;
    field.uCell.value.set(cell, cell);
    field.uResolution.value.set(w, h);
    field.uTime.value = clock;
    field.uScale.value = clamp(settings.scale, 0.2, 5);
    field.uDrift.value.set(Math.cos(angle) * drift, -Math.sin(angle) * drift);
    field.uThreshold.value = 0.66 - clamp(settings.density, 0, 1) * 0.26;
    field.uAmbient.value = clamp(settings.ambient, 0, 1);
    field.uReveal.value = clamp(settings.reveal, 0, 1);
    field.uPersistence.value = clamp(settings.persistence, 0.05, 10);
    field.uWidth.value = Math.max(1, cell * 0.8 * clamp(settings.ringWidth, 0.2, 5));
    field.uFalloff.value = 0.25 * diag;
    pings.forEach((ping, k) => {
      if (!ping.active) {
        pingSlots[k].set(0, 0, 0, 0);
        return;
      }
      pingSlots[k].set(ping.x * w, (1 - ping.y) * h, ping.born, ping.amplitude);
      pingShapes[k].set(ping.speed * diag, ping.range * diag, ping.echo ? 1 : 0, Math.max(1, ping.birth * diag));
    });
    const shadow = settings.interactive && settings.echo && !settings.reduced ? pointer.presence : 0;
    field.uObstacle.value.set(pointer.sx, pointer.sy, OBSTACLE * pixelRatio, shadow * clamp(settings.echoStrength, 0, 1));
    const glyph = glyphMaterial.uniforms;
    glyph.uField.value = fieldTarget ? fieldTarget.texture : null;
    glyph.uCell.value.set(cell, cell);
    glyph.uSpan.value = cell / Math.max(1, glyphPixels());
    glyph.uGamma.value = 0.9;
    glyph.uDither.value = 0.12 / Math.sqrt(Math.max((atlas?.count ?? 8) / 8, 1));
    glyph.uInk.value = ink ? 1 : 0;
    glyph.uLabA.value.set(labA[0], labA[1], labA[2]);
    glyph.uLabB.value.set(labB[0], labB[1], labB[2]);
    const composite = compositeMaterial.uniforms;
    composite.uBackground.value.set(toLinear(background[0]), toLinear(background[1]), toLinear(background[2]));
    composite.uGlow.value = clamp(settings.glow, 0, 3);
    composite.uExposure.value = (ink ? 4 : 1.25) * clamp(settings.intensity, 0, 4);
    composite.uMode.value = ink ? 1 : 0;
    composite.uGrain.value = grain;
  };

  const render = () => {
    if (!lineTarget || !downTargets.length) return;
    ensureAtlas();
    ensureField();
    apply();
    if (fieldTarget) draw(fieldMaterial, fieldTarget);
    draw(glyphMaterial, lineTarget);
    let source = lineTarget;
    for (const item of downTargets) {
      downMaterial.uniforms.uSource.value = source.texture;
      downMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      draw(downMaterial, item);
      source = item;
    }
    let accumulated = downTargets[downTargets.length - 1];
    for (let k = downTargets.length - 2; k >= 0; k--) {
      upMaterial.uniforms.uSource.value = accumulated.texture;
      upMaterial.uniforms.uBase.value = downTargets[k].texture;
      upMaterial.uniforms.uTexel.value.set(1 / accumulated.width, 1 / accumulated.height);
      draw(upMaterial, upTargets[k]);
      accumulated = upTargets[k];
    }
    compositeMaterial.uniforms.uLines.value = lineTarget.texture;
    compositeMaterial.uniforms.uBloom.value = accumulated.texture;
    draw(compositeMaterial, null);
  };

  const listen = () => {
    const settings = settingsRef.current;
    const w = width * pixelRatio;
    const h = height * pixelRatio;
    const diag = diagonal();
    const radius = OBSTACLE * pixelRatio;
    const hearing = settings.interactive && settings.echo && pointer.presence > 0.5;
    for (const ping of pings) {
      if (!ping.active || ping.echoed) continue;
      const front = (clock - ping.born) * ping.speed * diag;
      const reach = Math.hypot(pointer.sx - ping.x * w, pointer.sy - (1 - ping.y) * h);
      if (reach < radius * 3 || front < reach) continue;
      ping.echoed = true;
      if (!hearing || front - reach > ping.speed * diag * 0.25) continue;
      const strength = ping.amplitude * fadeAt(ping, reach) * 0.62 * clamp(settings.echoStrength, 0, 2);
      if (strength > 0.04) spawn(pointer.sx / w, 1 - pointer.sy / h, strength, true, 0.02);
    }
  };

  const step = (dt: number) => {
    const settings = settingsRef.current;
    const goal = settings.interactive && settings.echo && pointer.inside && !settings.reduced ? 1 : 0;
    pointer.presence += (goal - pointer.presence) * (1 - Math.exp(-dt / (goal > pointer.presence ? 0.18 : 0.35)));
    if (!pointer.placed) {
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      pointer.placed = true;
    } else {
      const follow = 1 - Math.exp(-dt / 0.05);
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
    }
    if (settings.paused || settings.reduced) return;
    clock += dt * clamp(settings.speed, 0, 4);
    const interval = clamp(settings.interval, 0.6, 30);
    if (settings.autoPing) {
      if (nextAuto > clock + interval) nextAuto = clock + interval;
      if (clock >= nextAuto) {
        const [ox, oy] = origin();
        spawn(ox, oy, 1, false, 0.08, nextAuto);
        nextAuto = Math.max(nextAuto + interval, clock + interval * 0.25);
      }
    } else {
      nextAuto = clock + interval * 0.15;
    }
    const diag = diagonal();
    const persistence = clamp(settings.persistence, 0.05, 10);
    for (const ping of pings) {
      if (!ping.active) continue;
      const travelled = (clock - ping.born) * ping.speed * diag;
      if (travelled > ping.range * diag + ping.speed * diag * persistence * 4) ping.active = false;
    }
    listen();
    grain = (grain + 0.618034) % 1;
  };

  const tick = (now: number) => {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    render();
    const settings = settingsRef.current;
    const animating = !settings.paused && !settings.reduced;
    const settling = Math.abs(pointer.presence - (pointer.inside ? 1 : 0)) > 0.002;
    if (visible && !document.hidden && (animating || settling)) raf = requestAnimationFrame(tick);
  };

  function wake() {
    if (destroyed || raf || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  const resize = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * clamp(settingsRef.current.quality, 0.25, 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const w = Math.round(width * pixelRatio);
    const h = Math.round(height * pixelRatio);
    release();
    lineTarget = target(w, h);
    const levels = clamp(Math.floor(Math.log2(Math.min(w, h) / 8)), 3, 6);
    for (let k = 1; k <= levels; k++) {
      downTargets.push(target(w >> k, h >> k));
      upTargets.push(target(w >> k, h >> k));
    }
    render();
    wake();
  };

  const locate = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    return [(event.clientX - rect.left) * pixelRatio, (rect.height - (event.clientY - rect.top)) * pixelRatio] as const;
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const [x, y] = locate(event);
    pointer.x = x;
    pointer.y = y;
    if (!pointer.inside) {
      pointer.sx = x;
      pointer.sy = y;
    }
    pointer.inside = true;
    wake();
  };

  const onDown = (event: PointerEvent) => {
    const settings = settingsRef.current;
    if (event.button !== 0 || !settings.interactive || !settings.clickPing || settings.paused || settings.reduced) return;
    const [x, y] = locate(event);
    spawn(x / (width * pixelRatio), 1 - y / (height * pixelRatio), 1.15, false, 0.025);
    wake();
  };

  const onLeave = () => {
    pointer.inside = false;
    wake();
  };

  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("pointercancel", onLeave);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  const intersection = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    },
    { rootMargin: "80px" },
  );
  intersection.observe(root);
  const onVisibility = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => event.preventDefault();
  canvas.addEventListener("webglcontextlost", onLost);
  seed();
  resize();

  return {
    sync: () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2) * clamp(settingsRef.current.quality, 0.25, 1);
      if (Math.abs(ratio - pixelRatio) > 1e-3) resize();
      else render();
      wake();
    },
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointercancel", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      resizeObserver.disconnect();
      intersection.disconnect();
      release();
      fieldTarget?.dispose();
      atlas?.texture.dispose();
      plane.dispose();
      [fieldMaterial, glyphMaterial, downMaterial, upMaterial, compositeMaterial].forEach((item) => item.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
    ping: (x: number, y: number) => {
      const settings = settingsRef.current;
      if (settings.paused || settings.reduced) return;
      spawn(clamp(x, -1, 2), clamp(y, -1, 2), 1.15, false, 0.025);
      wake();
    },
  };
};

const GlyphSonar = forwardRef<GlyphSonarHandle, GlyphSonarProps>(function GlyphSonar(
  {
    colors = ["#7C5CFF", "#FF9FFC"],
    backgroundColor = "#0A0A0A",
    mode = "auto",
    charset = DEFAULT_CHARSET,
    fontFamily = DEFAULT_FONT,
    glyphSize = 11,
    spacing = 1,
    glyphWeight = 1,
    density = 0.5,
    scale = 1,
    drift = 1,
    driftAngle = 20,
    ambient = 0.35,
    autoPing = true,
    interval = 3.4,
    originX = 0.5,
    originY = 0.5,
    pingSpeed = 1,
    range = 1,
    ringWidth = 1,
    persistence = 0.6,
    reveal = 0.5,
    glow = 0.12,
    intensity = 1,
    speed = 1,
    interactive = true,
    clickPing = true,
    echo = true,
    echoStrength = 1,
    paused = false,
    quality = 1,
    className,
    style,
    children,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const reduced = useSyncExternalStore(subscribeToMotion, readMotion, () => false);
  const settingsRef = useRef<Settings>({
    colors,
    backgroundColor,
    mode,
    charset,
    fontFamily,
    glyphSize,
    spacing,
    glyphWeight,
    density,
    scale,
    drift,
    driftAngle,
    ambient,
    autoPing,
    interval,
    originX,
    originY,
    pingSpeed,
    range,
    ringWidth,
    persistence,
    reveal,
    glow,
    intensity,
    speed,
    interactive,
    clickPing,
    echo,
    echoStrength,
    paused,
    quality,
    reduced,
  });

  useEffect(() => {
    settingsRef.current = {
      colors,
      backgroundColor,
      mode,
      charset,
      fontFamily,
      glyphSize,
      spacing,
      glyphWeight,
      density,
      scale,
      drift,
      driftAngle,
      ambient,
      autoPing,
      interval,
      originX,
      originY,
      pingSpeed,
      range,
      ringWidth,
      persistence,
      reveal,
      glow,
      intensity,
      speed,
      interactive,
      clickPing,
      echo,
      echoStrength,
      paused,
      quality,
      reduced,
    };
    controllerRef.current?.sync();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = createSonar(root, settingsRef);
    controllerRef.current = controller;
    return () => {
      controller?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      ping: (x?: number, y?: number) =>
        controllerRef.current?.ping(x ?? settingsRef.current.originX, y ?? settingsRef.current.originY),
    }),
    [],
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate h-full min-h-[240px] w-full overflow-hidden", className)}
      style={{ backgroundColor, ...style }}
    >
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
});

GlyphSonar.displayName = "GlyphSonar";

export { GlyphSonar };
export default GlyphSonar;
