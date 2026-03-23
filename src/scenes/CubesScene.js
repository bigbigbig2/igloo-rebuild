import * as THREE from 'three';
import { CubeSceneLabels } from '../effects/CubeSceneLabels.js';
import { CubePlexus } from '../effects/CubePlexus.js';
import { MouseFrostMap } from '../effects/MouseFrostMap.js';
import { CubeTransmissionMaterial } from '../materials/CubeTransmissionMaterial.js';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const SMOKE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SMOKE_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tNoise;
  uniform float uTime;
  uniform float uProgress;

  void main() {
    vec2 st = vUv;
    st.y *= 0.75;
    st *= 1.5;
    vec2 offset = vec2(0.0, uTime * 0.075);
    float noise = texture2D(tNoise, st + offset).r;
    noise *= texture2D(tNoise, st * 0.5 + offset).r;
    float grad = 1.0 - clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
    noise *= grad;
    noise *= length(vUv - 0.5);
    noise *= 6.5;

    float scrollDist = clamp(1.0 - abs(uProgress) * 20.0, 0.0, 1.0);
    float alpha = noise * scrollDist;

    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`;

const CUBES_BG_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const CUBES_BG_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform vec2 uResolution;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform sampler2D tPerlin;
  uniform sampler2D tDotPattern;
  uniform sampler2D tBlue;
  uniform vec2 uBlueOffset;
  uniform float uDotStrength;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec4 getBlueNoise(vec2 fragCoord) {
    float invSize = 1.0 / 128.0;
    return texture2D(tBlue, fragCoord * invSize + uBlueOffset);
  }

  float sampleSoftPerlin(vec2 uv, vec2 offset) {
    vec2 blur = vec2(0.0025, 0.0025);
    float value = texture2D(tPerlin, uv + offset).r;
    value += texture2D(tPerlin, uv + offset + blur * vec2(1.0, -1.0)).r;
    value += texture2D(tPerlin, uv + offset + blur * vec2(-1.2, 0.8)).r;
    value += texture2D(tPerlin, uv + offset + blur * vec2(0.6, 1.3)).r;
    return value * 0.25;
  }

  void main() {
    vec2 screenUv = vUv;
    screenUv.x *= max(uAspect, 0.0001);
    screenUv *= 0.3;

    float t = uTime * 0.075;
    vec2 offset1 = vec2(-t, t * 0.25);
    vec2 offset2 = vec2(t, -t * 0.5);
    offset1.y -= uProgress * 0.25;
    offset1.y -= uProgress * 0.4;

    float perlin = sampleSoftPerlin(screenUv, offset1);
    perlin += sampleSoftPerlin(screenUv * 0.5, offset2);
    perlin *= 0.5;

    float grad = smoothstep(0.08, 0.92, perlin);
    vec3 color = mix(uColor1, uColor2, grad * 0.82);

    vec2 dotUv = screenUv * 45.0;
    dotUv += vec2(0.0, -uProgress * 10.0);
    float dots = texture2D(tDotPattern, dotUv).r;
    float dotId = hash12(floor(dotUv));
    float dotFade = 1.0 - abs(fract(dotId + uTime * 0.1) - 0.5) * 2.0;
    color += dots * dotFade * uDotStrength;

    vec3 blueNoise = getBlueNoise(gl_FragCoord.xy).rgb;
    color += blueNoise * 0.05;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const BLURRYTEXT_VERTEX_SHADER = /* glsl */ `
  attribute vec3 centr;

  varying vec2 vUv;
  varying float vAlpha;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform sampler2D tPerlin;

  void main() {
    vec3 localPosition = position - centr;
    vec3 offset = centr;
    float aspect = max(uAspect, 0.0001);

    offset.x /= aspect;

    float depth = offset.z * 0.5 + 0.5;

    localPosition.x /= aspect;
    localPosition *= 2.5;
    localPosition *= mix(1.0, 2.0, depth);

    offset.y = fract((offset.y * 0.5 + 0.5) + uProgress * 1.25 * depth) * 2.0 - 1.0;
    offset *= 1.7;

    vec3 pos = localPosition + offset;

    vAlpha = texture2D(tPerlin, pos.xz * 3.0 + uTime * 0.075 + offset.z * 10.0).r;
    vAlpha = smoothstep(0.1, 0.6, vAlpha);
    vUv = uv;

    gl_Position = vec4(pos, 1.0);
  }
`;

const BLURRYTEXT_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform sampler2D tMap;

  void main() {
    float alpha = texture2D(tMap, vUv).r * vAlpha * 1.2;
    gl_FragColor = vec4(uColor, alpha * uOpacity);
  }
`;

const BACKGROUND_SHAPES_VERTEX_SHADER = /* glsl */ `
  attribute vec3 centr;
  attribute float primrand;

  varying vec2 vUv;
  varying vec3 vPos;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;

  mat4 rotation3D(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(
      oc * axis.x * axis.x + c,
      oc * axis.x * axis.y - axis.z * s,
      oc * axis.z * axis.x + axis.y * s,
      0.0,
      oc * axis.x * axis.y + axis.z * s,
      oc * axis.y * axis.y + c,
      oc * axis.y * axis.z - axis.x * s,
      0.0,
      oc * axis.z * axis.x - axis.y * s,
      oc * axis.y * axis.z + axis.x * s,
      oc * axis.z * axis.z + c,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0
    );
  }

  void main() {
    vUv = uv;
    vPos = position;

    mat4 viewMatrixCopy = viewMatrix;
    viewMatrixCopy[0] = vec4(1.0, 0.0, 0.0, 0.0);
    viewMatrixCopy[1] = vec4(0.0, 1.0, 0.0, 0.0);
    viewMatrixCopy[2] = vec4(0.0, 0.0, 1.0, 0.0);
    viewMatrixCopy[3] = vec4(0.0, 0.0, -5.0, 1.0);

    vec3 customPos = position;
    customPos -= centr;
    customPos = (
      rotation3D(
        vec3(0.0, 0.0, 1.0),
        uProgress * 5.0 * mix(0.1, 0.5, primrand) + uTime * 0.2 * primrand
      ) * vec4(customPos, 1.0)
    ).xyz;

    vec3 offset = centr * vec3(clamp(uAspect * 0.5, 0.65, 1.0), 1.0, 1.0);
    offset.y -= 5.0;
    customPos += offset;
    customPos.y += uProgress * 10.0;

    gl_Position = projectionMatrix * viewMatrixCopy * modelMatrix * vec4(customPos, 1.0);
  }
`;

const BACKGROUND_SHAPES_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;

  uniform sampler2D tMap;
  uniform float uAlpha;
  uniform float uTime;

  void main() {
    float alpha = texture2D(tMap, vUv).r;

    float idleAnimation = sin((vPos.x + vPos.y) * 5.0 + uTime * 3.0) * 0.5 + 0.5;
    idleAnimation *= cos(vPos.y * 10.0 + alpha * 3.0 + uTime * 2.0) * 0.5 + 0.5;
    idleAnimation *= sin(vPos.y * 2.0 + uTime * 2.0) * 0.5 + 0.5;
    alpha = idleAnimation * 0.9 * alpha + 0.1 * alpha;
    alpha *= 0.65;

    gl_FragColor = vec4(vec3(1.0), alpha * uAlpha);
  }
`;

function pseudoRandom(seed) {
  return (Math.sin(seed * 12.9898) * 43758.5453123) % 1;
}

function ensureScreenSpaceAttributes(sourceGeometry) {
  if (!sourceGeometry) {
    return null;
  }

  let geometry = sourceGeometry;
  const hasCentr = Boolean(geometry.getAttribute('centr'));
  const hasPrimrand = Boolean(geometry.getAttribute('primrand'));

  if (hasCentr && hasPrimrand) {
    return geometry;
  }

  if (geometry.index) {
    geometry = geometry.toNonIndexed();
  }

  const position = geometry.getAttribute('position');
  const vertexCount = position?.count ?? 0;

  if (!position || vertexCount === 0) {
    return geometry;
  }

  if (!hasCentr) {
    const centroids = new Float32Array(vertexCount * 3);
    const triangleCount = Math.floor(vertexCount / 3);

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const offset = triangleIndex * 3;
      const ax = position.getX(offset + 0);
      const ay = position.getY(offset + 0);
      const az = position.getZ(offset + 0);
      const bx = position.getX(offset + 1);
      const by = position.getY(offset + 1);
      const bz = position.getZ(offset + 1);
      const cx = position.getX(offset + 2);
      const cy = position.getY(offset + 2);
      const cz = position.getZ(offset + 2);
      const centerX = (ax + bx + cx) / 3;
      const centerY = (ay + by + cy) / 3;
      const centerZ = (az + bz + cz) / 3;

      for (let pointIndex = 0; pointIndex < 3; pointIndex += 1) {
        const target = (offset + pointIndex) * 3;
        centroids[target + 0] = centerX;
        centroids[target + 1] = centerY;
        centroids[target + 2] = centerZ;
      }
    }

    for (let index = triangleCount * 3; index < vertexCount; index += 1) {
      const target = index * 3;
      centroids[target + 0] = position.getX(index);
      centroids[target + 1] = position.getY(index);
      centroids[target + 2] = position.getZ(index);
    }

    geometry.setAttribute('centr', new THREE.Float32BufferAttribute(centroids, 3));
  }

  if (!hasPrimrand) {
    const primrand = new Float32Array(vertexCount);
    const triangleCount = Math.floor(vertexCount / 3);

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const value = Math.abs(pseudoRandom(triangleIndex + 1));
      const offset = triangleIndex * 3;
      primrand[offset + 0] = value;
      primrand[offset + 1] = value;
      primrand[offset + 2] = value;
    }

    for (let index = triangleCount * 3; index < vertexCount; index += 1) {
      primrand[index] = 0.5;
    }

    geometry.setAttribute('primrand', new THREE.Float32BufferAttribute(primrand, 1));
  }

  return geometry;
}

const FLOOR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vPosOriginal;
  varying float vGlow;

  void main() {
    vUv = uv;
    vGlow = 0.0;
    vPosOriginal = position;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tMap;
  uniform sampler2D tPerlin;
  uniform float uAlpha;
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;

  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vPosOriginal;
  varying float vGlow;

  float noise3(vec3 p) {
    return sin(p.x) * sin(p.y) * sin(p.z);
  }

  float falloffsmooth(float value, float start, float end, float edge, float progress) {
    float center = mix(start, end, progress);
    return smoothstep(center + edge, center, value);
  }

  void main() {
    float posLen = length(vPos.xz);
    vec3 color = texture2D(tMap, vUv).rgb;
    color *= mix(0.65, 1.0, vPos.x * 0.5 + 0.5);
    color += (vPos.x + 1.0) * 0.02;

    vec2 screenUv = vUv;
    float diagonalGradient = (screenUv.x + screenUv.y) * 0.5;
    diagonalGradient *= noise3(vec3(screenUv * 6.0, uTime * 0.614)) * 0.5 + 0.5;
    diagonalGradient *= noise3(vec3(screenUv * 12.0, uTime * 0.17)) * 0.5 + 0.5;
    vec3 bg = mix(uColor1, uColor2, diagonalGradient);

    float perlin = texture2D(tPerlin, vPos.xz * 0.12 + vec2(-uTime * 0.04, -uTime * 0.02)).r;
    color = mix(bg, color, 0.72);
    color += vec3(perlin) * 0.06;

    float radialGradient = smoothstep(1.4, 1.6, posLen);
    float alpha = falloffsmooth(posLen * 3.0, 0.0, 6.0, 3.0, uAlpha);
    alpha *= smoothstep(1.99, 1.3, posLen);

    float shadow = min(1.0, length(vPos * 1.5 + vec3(1.15, 0.0, -0.55)));
    shadow = pow(shadow, 2.0);
    shadow += sin(uTime * 3.3 + vPos.z * 5.0) * 0.1 + 0.1;
    shadow += sin(uTime * 3.1 + vPos.x * 4.0) * 0.1 + 0.1;
    shadow = mix(0.5, 1.0, shadow);
    color *= mix(vec3(0.5, 0.7, 1.0) * 0.1, vec3(1.0), shadow);

    vec3 blue = vec3(0.5, 0.7, 1.0) * (1.0 - radialGradient);
    float glowModulation = smoothstep(0.087, -0.1, vPosOriginal.y);
    float animatedGlow = smoothstep(0.087, 0.05, vPosOriginal.y);
    animatedGlow *= sin(vPos.z * 5.0 + posLen * 10.0 - uTime * 0.75) * 0.5 + 0.5;
    color += blue * glowModulation * (0.35 + vGlow * 0.65);
    color += blue * animatedGlow * 0.5;

    gl_FragColor = vec4(color, alpha);
  }
`;

const ROOM_RING_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform float uTime;

  vec2 rotate(vec2 value, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, s, -s, c) * value;
  }

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.xz = rotate(transformed.xz, -uTime * 0.2);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const ROOM_RING_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform float uAlpha;

  void main() {
    float dist = length(vUv - 0.5);
    float alpha = smoothstep(0.5, 0.3, dist);
    alpha *= smoothstep(0.3, 0.4, dist);
    alpha *= smoothstep(0.03, 0.1, abs(vUv.x - 0.5));
    alpha *= mix(1.0, 0.8, sin(dist * 12.0 + vUv.x * 2.0 + vUv.y) * 0.5 + 0.5);
    gl_FragColor = vec4(vec3(2.0), alpha * uAlpha);
  }
`;

const FORCEFIELD_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vEye;

  void main() {
    vUv = uv;
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalMatrix * normal;
    vEye = -(modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FORCEFIELD_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vEye;

  uniform float uTime;
  uniform float uAlpha;
  uniform sampler2D tTriangles;

  float noise3(vec3 p) {
    return sin(p.x) * sin(p.y) * sin(p.z);
  }

  void main() {
    vec2 uv = vUv;
    uv.x *= 2.0;

    float t = uTime * 0.5;
    float noise = noise3(vPos * 4.0 + vec3(0.0, t * 0.45, -t * 0.13)) * 0.5 + 0.5;
    noise *= noise3(vPos * 2.0 + vec3(t * 0.3, -t * 0.27, t * 0.2)) * 0.5 + 0.5;
    noise = sin(noise * 15.0 - t * 7.0) * 0.5 + 0.5;
    noise = pow(noise, 4.0);

    float triangles = texture2D(tTriangles, uv * 6.0 + vec2(noise * 0.05)).r;
    float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vEye)));
    float softEdge = 1.0 - smoothstep(0.65, 0.99, fresnel);
    fresnel = mix(fresnel, 1.0, 0.25);
    float fadeTop = 1.0 - smoothstep(0.5, 1.0, vUv.y);
    float alpha = (noise * triangles * 2.0 + noise * 0.03) * fresnel * softEdge * fadeTop;
    gl_FragColor = vec4(vec3(1.0), alpha * uAlpha);
  }
`;

const TEXT_CYLINDER_VERTEX_SHADER = /* glsl */ `
  attribute float aRand;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vRand;

  void main() {
    vUv = uv;
    vPos = position;
    vRand = aRand;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TEXT_CYLINDER_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  varying float vRand;

  uniform sampler2D tMap;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uOpacityScale;
  uniform float uHeightFade;
  uniform float uPulseScale;
  uniform float uSpeed;
  uniform float uRadialStart;
  uniform float uRadialEnd;

  void main() {
    float alpha = texture2D(tMap, vUv).r;

    if (uHeightFade > 0.5) {
      alpha *= clamp(vPos.y * 2.0, 0.0, 1.0);
    }

    alpha *= sin(uTime * uSpeed + vRand * 10.0 + (vPos.x * 2.0 + vPos.z * 2.0 + vPos.y * uPulseScale)) * 0.5 + 0.5;
    alpha *= smoothstep(uRadialEnd, uRadialStart, length(vPos.xz));
    gl_FragColor = vec4(vec3(1.0), alpha * uAlpha * uOpacityScale);
  }
`;

const DEFAULT_CUBES_LOOK_SETTINGS = Object.freeze({
  lutIntensity: 0.12,
  bloomStrength: 0.18,
  bloomRadius: 0.55,
  bloomThreshold: 0.78,
  bgDotStrength: 0.35,
  backgroundShapeAlphaScale: 0.48,
  blurryTextOpacityScale: 0.26,
  smokeOpacityScale: 0.72
});

const DEFAULT_CUBES_LABEL_DEBUG_SETTINGS = Object.freeze({
  textScaleMultiplier: 0.5
});

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function createTransmissionFallbackTexture() {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const dark = new THREE.Color('#6a6f7d');
  const light = new THREE.Color('#e1e6f1');
  const accent = new THREE.Color('#cbd6e5');
  const color = new THREE.Color();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(width - 1, 1);
      const v = y / Math.max(height - 1, 1);
      const diagonal = clamp01((u + v) * 0.5);
      const centerGlow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.42) * 1.85);
      const band = Math.sin((u * 3.4 + v * 2.1) * Math.PI) * 0.04;

      color.copy(dark).lerp(light, diagonal);
      color.lerp(accent, centerGlow * 0.18);
      color.multiplyScalar(1 + band);

      const offset = (y * width + x) * 4;
      data[offset + 0] = Math.round(clamp01(color.r) * 255);
      data[offset + 1] = Math.round(clamp01(color.g) * 255);
      data[offset + 2] = Math.round(clamp01(color.b) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'cubes-transmission-fallback';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  return texture;
}

function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }

  const normalized = clamp01((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

function getStaggerProgress(progress, index, step = 0.13, duration = 0.42) {
  return clamp01((progress - index * step) / duration);
}

function getCubeAssetConfig(project) {
  const geometryKey = project.cubeGeometryKey ?? project.cubeKey ?? 'cube1';

  return {
    geometryKey,
    normalKey: project.cubeNormalKey ?? `${geometryKey}-normal`,
    roughnessKey: project.cubeRoughnessKey ?? `${geometryKey}-roughness`
  };
}

function getInnerObjectAssetConfig(project) {
  const geometryKey = project.innerGeometryKey ?? project.detailGeometryKey ?? project.modelKey ?? 'abstract';
  const textureKey = project.innerTextureKey ?? project.detailTextureKey ?? project.textureKey ?? null;

  return {
    geometryKey,
    textureKey,
    scale: project.innerObjectScale ?? project.detailObjectScale ?? 1
  };
}

function withRandomAttribute(geometry, attributeName = 'aRand') {
  if (!geometry || geometry.getAttribute(attributeName)) {
    return geometry;
  }

  const count = geometry.getAttribute('position')?.count ?? 0;
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = Math.random();
  }

  geometry.setAttribute(attributeName, new THREE.BufferAttribute(values, 1));
  return geometry;
}

function createTransmissionTarget() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter
  });

  target.texture.colorSpace = THREE.SRGBColorSpace;
  return target;
}

function createSmokeMaterial(noiseTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tNoise: { value: noiseTexture },
      uTime: { value: 0 },
      uProgress: { value: 100 }
    },
    vertexShader: SMOKE_VERTEX_SHADER,
    fragmentShader: SMOKE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
}

function createFullscreenTriangleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -1, -1, 0,
        3, -1, 0,
        -1, 3, 0
      ],
      3
    )
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [
        0, 0,
        2, 0,
        0, 2
      ],
      2
    )
  );
  return geometry;
}

function configureRepeatingTexture(texture, {
  minFilter = THREE.LinearFilter,
  magFilter = THREE.LinearFilter
} = {}) {
  if (!texture) {
    return texture;
  }

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = minFilter;
  texture.magFilter = magFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createRoomRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 }
    },
    vertexShader: ROOM_RING_VERTEX_SHADER,
    fragmentShader: ROOM_RING_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createForcefieldMaterial(trianglesTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      tTriangles: { value: trianglesTexture }
    },
    vertexShader: FORCEFIELD_VERTEX_SHADER,
    fragmentShader: FORCEFIELD_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createTextCylinderMaterial(atlasTexture, options = {}) {
  const {
    opacityScale = 0.18,
    heightFade = 1,
    pulseScale = 0,
    speed = 2,
    radialStart = 10,
    radialEnd = 3
  } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: atlasTexture },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uOpacityScale: { value: opacityScale },
      uHeightFade: { value: heightFade },
      uPulseScale: { value: pulseScale },
      uSpeed: { value: speed },
      uRadialStart: { value: radialStart },
      uRadialEnd: { value: radialEnd }
    },
    vertexShader: TEXT_CYLINDER_VERTEX_SHADER,
    fragmentShader: TEXT_CYLINDER_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

/**
 * CubesScene 是首页 portfolio section 的核心交互场景。
 *
 * 它承担了三层职责：
 * 1. 首页中段的 cube stack 演出
 * 2. 项目 hover / pick / click 的交互入口
 * 3. 首页到 detail scene 的视觉 handoff 桥梁
 *
 * 这里既有 3D 场景编排，也有 transmission capture、鼠标霜冻效果、
 * 以及给 WebGL HUD 提供的屏幕锚点计算。
 */
export class CubesScene extends SceneBase {
  constructor({ assets, projects, clickLabel = 'Click to explore' }) {
    super({
      name: 'cubes',
      background: '#d3dbe8'
    });

    // -------- 运行时状态 --------
    this.assets = assets;
    this.projects = projects;
    this.clickLabel = clickLabel;
    this.lookDebugSettings = { ...DEFAULT_CUBES_LOOK_SETTINGS };
    this.labelDebugSettings = { ...DEFAULT_CUBES_LABEL_DEBUG_SETTINGS };
    this.time = 0;
    this.cubes = [];
    this.cubeGroups = [];
    this.innerObjects = [];
    this.smokeMeshes = [];
    this.smokeMaterials = [];
    this.plexusSystems = [];
    this.labelSystems = [];
    this.cubeBaseStates = [];
    this.transmissionMaterials = [];
    this.frostMaps = [];
    this.detailFocusHash = null;
    this.detailFocusIndex = -1;
    this.detailFocusProgress = 0;
    this.hoveredProjectHash = null;
    this.hoveredProjectIndex = -1;
    this.pointerProjectIndex = -1;
    this.backgroundShapesEnabled = true;
    this.backgroundShapesVisible = false;
    this.blurryTextVisible = false;
    this.backgroundShapes = null;
    this.backgroundShapesBasePosition = new THREE.Vector3();
    this.blurryText = null;
    this.blurryTextBasePosition = new THREE.Vector3();
    this.roomBackground = null;
    this.floorFog = null;
    this.roomRing = null;
    this.forcefield = null;
    this.textCylinders = [];
    this.raycaster = new THREE.Raycaster();
    this.anchorWorldPosition = new THREE.Vector3();
    this.anchorClipPosition = new THREE.Vector3();
    this.anchorQuaternion = new THREE.Quaternion();
    this.anchorScale = new THREE.Vector3();
    this.uiBoundsCenterWorld = new THREE.Vector3();
    this.uiBoundsEdgeWorldX = new THREE.Vector3();
    this.uiBoundsEdgeWorldY = new THREE.Vector3();
    this.uiBoundsCenterClip = new THREE.Vector3();
    this.uiBoundsEdgeClipX = new THREE.Vector3();
    this.uiBoundsEdgeClipY = new THREE.Vector3();
    this.labelWorldPosition = new THREE.Vector3();
    this.uiCameraRight = new THREE.Vector3();
    this.uiCameraUp = new THREE.Vector3();
    this.projectGroup = new THREE.Group();
    this.labelsGroup = new THREE.Group();
    this.verticalOffset = 5.75;
    this.environment = assets.get('texture', 'cubes-environment');
    this.blueNoise = configureRepeatingTexture(
      assets.get('texture', 'blue-noise'),
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter
      }
    );
    this.perlinData = configureRepeatingTexture(
      assets.get('texture', 'perlin-data') ?? assets.get('texture', 'detail-perlin')
    );
    this.dotPattern = configureRepeatingTexture(
      assets.get('texture', 'dot-pattern')
    );
    this.windNoise = assets.get('texture', 'wind-noise') ?? this.blueNoise;
    this.trianglesTexture = assets.get('texture', 'triangles-tiling') ?? null;
    this.transmissionFallbackTexture = createTransmissionFallbackTexture();
    this.baseCameraPosition = new THREE.Vector3(0, 0, 4.45);
    this.baseCameraFov = this.camera.fov;
    this.transmissionTarget = createTransmissionTarget();
    this.transmissionState = {
      capturing: false
    };
    this.pointerTarget = new THREE.Vector2();
    this.pointerCurrent = new THREE.Vector2();
    this.pointerTargetStrength = 0;
    this.pointerStrength = 0;
    this.scrollVelocity = 0;
    this.shardMix = 0;
    this.lastProgress = this.progress;
    this.blueOffset = new THREE.Vector2();
    this.parentWorldQuaternion = new THREE.Quaternion();
    this.cameraWorldQuaternion = new THREE.Quaternion();
    this.inverseParentQuaternion = new THREE.Quaternion();
    this.uiAnchorLocalA = new THREE.Vector3();
    this.uiAnchorLocalB = new THREE.Vector3();
    this.uiAnchorLocalC = new THREE.Vector3();
    this.uiAnchorWorldA = new THREE.Vector3();
    this.uiAnchorWorldB = new THREE.Vector3();
    this.uiAnchorWorldC = new THREE.Vector3();
    this.uiAnchorClipA = new THREE.Vector3();
    this.uiAnchorClipB = new THREE.Vector3();
    this.uiAnchorClipC = new THREE.Vector3();
    this.uiFrameLocal = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.uiFrameWorld = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.uiFrameClip = Array.from({ length: 10 }, () => new THREE.Vector3());

    this.root.add(this.projectGroup);
    this.labelsGroup.name = 'cubes-texts';
    this.add(this.labelsGroup);

    // -------- 基础灯光 --------
    const ambient = new THREE.AmbientLight('#f0f4ff', 1.4);
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(3, 5, 6);
    this.add(ambient, keyLight);

    // -------- 屏幕空间背景层与辅助层 --------
    this.roomBackground = new THREE.Mesh(
      createFullscreenTriangleGeometry(),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uAspect: { value: 1 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uColor1: { value: new THREE.Color('#6a6f7d') },
          uColor2: { value: new THREE.Color('#e1e6f1') },
          tPerlin: { value: this.perlinData ?? null },
          tDotPattern: { value: this.dotPattern ?? null },
          tBlue: { value: this.blueNoise },
          uBlueOffset: { value: this.blueOffset.clone() },
          uDotStrength: { value: this.lookDebugSettings.bgDotStrength }
        },
        vertexShader: CUBES_BG_VERTEX_SHADER,
        fragmentShader: CUBES_BG_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.roomBackground.name = 'bg';
    this.roomBackground.frustumCulled = false;
    this.roomBackground.renderOrder = -99;
    this.roomBackground.updateMatrixWorld(true);
    this.roomBackground.matrixAutoUpdate = false;
    this.add(this.roomBackground);

    const backgroundShapesGeometry = ensureScreenSpaceAttributes(
      prepareGeometry(assets.get('geometry', 'background-shapes'), {
        center: false,
        scaleToSize: false,
        recomputeNormals: false
      })
    );
    if (backgroundShapesGeometry) {
      this.backgroundShapes = new THREE.Mesh(
        backgroundShapesGeometry,
        new THREE.ShaderMaterial({
          uniforms: {
            tMap: { value: assets.get('texture', 'shapes-blurred') ?? null },
            uTime: { value: 0 },
            uProgress: { value: 0 },
            uAspect: { value: 1 },
            uAlpha: { value: 0 }
          },
          vertexShader: BACKGROUND_SHAPES_VERTEX_SHADER,
          fragmentShader: BACKGROUND_SHAPES_FRAGMENT_SHADER,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          toneMapped: false
        })
      );
      this.backgroundShapes.name = 'background_shapes';
      this.backgroundShapes.frustumCulled = false;
      this.backgroundShapes.renderOrder = 9;
      this.backgroundShapes.matrixAutoUpdate = false;
      this.backgroundShapes.updateMatrix();
      this.add(this.backgroundShapes);
    }

    const blurryTextGeometry = ensureScreenSpaceAttributes(
      prepareGeometry(assets.get('geometry', 'blurrytext'), {
        center: false,
        scaleToSize: false,
        recomputeNormals: false
      })
    );
    if (blurryTextGeometry) {
      this.blurryText = new THREE.Mesh(
        blurryTextGeometry,
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uProgress: { value: 0 },
            uAspect: { value: 1 },
            uColor: { value: new THREE.Color('#ffffff') },
            uOpacity: { value: 0 },
            tMap: { value: assets.get('texture', 'blurrytext-atlas') ?? null },
            tPerlin: { value: assets.get('texture', 'detail-perlin') ?? null }
          },
          vertexShader: BLURRYTEXT_VERTEX_SHADER,
          fragmentShader: BLURRYTEXT_FRAGMENT_SHADER,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          toneMapped: false
        })
      );
      this.blurryText.name = 'blurrytext';
      this.blurryText.frustumCulled = false;
      this.blurryText.renderOrder = 5;
      this.blurryText.matrixAutoUpdate = false;
      this.blurryText.updateMatrix();
      this.add(this.blurryText);
    }

    // -------- 项目立方体栈 --------
    // 每个项目都会生成：
    // - 外层 transmission cube
    // - 内层对象
    // - 配套烟雾平面
    // - 一张独立的鼠标霜冻贴图
    this.roomRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.045, 24, 120),
      createRoomRingMaterial()
    );
    this.roomRing.name = 'cubes-room-ring';
    this.roomRing.rotation.x = Math.PI * 0.5;
    this.roomRing.renderOrder = 7;
    this.roomRing.visible = false;
    this.add(this.roomRing);

    this.forcefield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.38, 4),
      createForcefieldMaterial(this.trianglesTexture)
    );
    this.forcefield.name = 'cubes-forcefield';
    this.forcefield.renderOrder = 6;
    this.forcefield.visible = false;
    this.forcefield.scale.set(1.25, 0.86, 1.25);
    this.add(this.forcefield);

    const textCylinderGeometry = new THREE.CylinderGeometry(1.9, 1.9, 3.65, 80, 1, true);
    const textCylinderConfigs = [
      {
        opacityScale: 0.18,
        heightFade: 1,
        pulseScale: 2.4,
        speed: 2.15,
        radialStart: 3.2,
        radialEnd: 1.2,
        position: new THREE.Vector3(0, -0.15, 0),
        scale: new THREE.Vector3(1.08, 1, 1.08),
        rotationY: 0
      },
      {
        opacityScale: 0.11,
        heightFade: 0,
        pulseScale: 4.5,
        speed: 1.65,
        radialStart: 4.1,
        radialEnd: 1.95,
        position: new THREE.Vector3(0, 0.18, 0),
        scale: new THREE.Vector3(1.34, 1.18, 1.34),
        rotationY: Math.PI * 0.24
      }
    ];

    textCylinderConfigs.forEach((config, index) => {
      const mesh = new THREE.Mesh(
        textCylinderGeometry.clone(),
        createTextCylinderMaterial(
          assets.get('texture', 'blurrytext-atlas') ?? null,
          config
        )
      );
      mesh.name = `cubes-text-cylinder-${index}`;
      mesh.renderOrder = 8 + index;
      mesh.visible = false;
      mesh.position.copy(config.position);
      mesh.scale.copy(config.scale);
      mesh.rotation.y = config.rotationY;
      this.textCylinders.push(mesh);
      this.add(mesh);
    });

    projects.forEach((project, index) => {
      const assetConfig = getCubeAssetConfig(project);
      const innerAssetConfig = getInnerObjectAssetConfig(project);
      const centeredProgress = (index + 1) / (projects.length + 1);
      const geometry = prepareGeometry(assets.get('geometry', assetConfig.geometryKey), {
        size: 1.74
      }) || new THREE.BoxGeometry(1.35, 1.35, 1.35);
      geometry.computeBoundingSphere?.();
      const innerGeometry = prepareGeometry(assets.get('geometry', innerAssetConfig.geometryKey), {
        size: 0.82 * innerAssetConfig.scale
      }) || new THREE.IcosahedronGeometry(0.35, 2);
      const cubeGroup = new THREE.Group();
      const mouseFrost = new MouseFrostMap({
        size: 512,
        advectTexture: this.windNoise
      });
      const material = new CubeTransmissionMaterial({
        blueNoiseTexture: this.blueNoise,
        mouseFrostTexture: mouseFrost.finalTarget.texture,
        trianglesTexture: this.trianglesTexture,
        roughnessMap: assets.get('texture', assetConfig.roughnessKey) ?? null,
        normalMap: assets.get('texture', assetConfig.normalKey) ?? null,
        envMap: this.environment ?? null
      });

      material.emissive.set('#ffffff');
      material.emissiveIntensity = 0;
      material.opacity = 1;
      material.side = THREE.FrontSide;
      if (material.envMapRotation) {
        material.envMapRotation.y = Math.PI;
      }

      const cubeMesh = new THREE.Mesh(geometry, material);
      cubeMesh.geometry.computeBoundingBox?.();
      cubeMesh.rotation.x = 0;
      cubeMesh.rotation.y = 0;
      cubeMesh.name = project.cubeKey ?? `cube-${index}`;
      cubeMesh.userData.project = project;
      cubeMesh.renderOrder = 3;

      const innerMesh = new THREE.Mesh(
        innerGeometry,
        new THREE.MeshBasicMaterial({
          map: assets.get('texture', innerAssetConfig.textureKey) ?? null,
          color: '#ffffff',
          transparent: true,
          opacity: 1
        })
      );
      innerMesh.name = `${project.innerObjectKey ?? project.hash}-inner-${index}`;
      innerMesh.visible = false;
      innerMesh.renderOrder = 10;
      innerMesh.rotation.x = -0.2;
      innerMesh.rotation.y = 0.45;

      const smokeMaterial = createSmokeMaterial(this.windNoise);
      const smokeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.5), smokeMaterial);
      smokeMesh.name = `cube-smoke-${index}`;
      smokeMesh.renderOrder = 15;
      smokeMesh.frustumCulled = false;
      smokeMesh.position.y = -0.35;
      const plexus = new CubePlexus({
        color: project.accent,
        radius: geometry.boundingSphere?.radius ?? 0.82,
        treadmillDist: 3,
        totalPoints: 18,
        maxConnectionsPerPoint: 3
      });
      plexus.group.position.y = -0.02;
      const labels = new CubeSceneLabels({
        parent: this.labelsGroup,
        cube: cubeMesh,
        project,
        clickLabel: this.clickLabel,
        index,
        debugSettings: this.labelDebugSettings
      });

      cubeGroup.position.y = -(index + 1) * this.verticalOffset;
      cubeGroup.name = `cube-group-${index}`;
      cubeGroup.add(cubeMesh, innerMesh, smokeMesh, plexus.group);

      this.projectGroup.add(cubeGroup);
      this.cubeGroups.push(cubeGroup);
      this.cubes.push(cubeMesh);
      this.innerObjects.push(innerMesh);
      this.smokeMeshes.push(smokeMesh);
      this.smokeMaterials.push(smokeMaterial);
      this.plexusSystems.push(plexus);
      this.labelSystems.push(labels);
      this.frostMaps.push(mouseFrost);
      this.transmissionMaterials.push(material);
      this.cubeBaseStates.push({
        position: cubeGroup.position.clone(),
        scale: cubeGroup.scale.clone(),
        cubeRotation: cubeMesh.rotation.clone(),
        innerRotation: innerMesh.rotation.clone(),
        innerScale: innerMesh.scale.clone(),
        centeredProgress,
        runtimeRand: Math.random()
      });
    });

    this.camera.position.copy(this.baseCameraPosition);
    this.camera.lookAt(0, 0, 0);
  }

  getLookDebugSettings() {
    return { ...this.lookDebugSettings };
  }

  getLookDebugDefaults() {
    return { ...DEFAULT_CUBES_LOOK_SETTINGS };
  }

  getLabelDebugSettings() {
    return { ...this.labelDebugSettings };
  }

  getLabelDebugDefaults() {
    return { ...DEFAULT_CUBES_LABEL_DEBUG_SETTINGS };
  }

  setLookDebugSetting(key, value) {
    if (!(key in this.lookDebugSettings) || !Number.isFinite(value)) {
      return;
    }

    this.lookDebugSettings[key] = value;

    if (key === 'bgDotStrength' && this.roomBackground) {
      this.roomBackground.material.uniforms.uDotStrength.value = value;
    }
  }

  resetLookDebugSettings() {
    this.lookDebugSettings = { ...DEFAULT_CUBES_LOOK_SETTINGS };

    if (this.roomBackground) {
      this.roomBackground.material.uniforms.uDotStrength.value =
        this.lookDebugSettings.bgDotStrength;
    }
  }

  setLabelDebugSetting(key, value) {
    if (!(key in this.labelDebugSettings)) {
      return;
    }

    if (typeof this.labelDebugSettings[key] === 'boolean') {
      this.labelDebugSettings[key] = Boolean(value);
      return;
    }

    if (!Number.isFinite(value)) {
      return;
    }

    this.labelDebugSettings[key] = value;
  }

  resetLabelDebugSettings() {
    this.labelDebugSettings = { ...DEFAULT_CUBES_LABEL_DEBUG_SETTINGS };
    this.labelSystems.forEach((labels) => {
      labels.debugSettings = this.labelDebugSettings;
    });
  }

  getColorCorrectionState() {
    return {
      profile: 'cubes',
      lutIntensity: this.lookDebugSettings.lutIntensity,
      bloomStrength: this.lookDebugSettings.bloomStrength,
      bloomRadius: this.lookDebugSettings.bloomRadius,
      bloomThreshold: this.lookDebugSettings.bloomThreshold
    };
  }

  getInitialAutoCenterProgress() {
    return this.cubeBaseStates[0]?.centeredProgress ?? (1 / (this.projects.length + 1));
  }

  getFinalAutoCenterProgress() {
    return this.cubeBaseStates[this.cubeBaseStates.length - 1]?.centeredProgress
      ?? this.getInitialAutoCenterProgress();
  }

  getAutoCenterProgress() {
    // 非 detail 聚焦状态下，会自动吸附到“离当前 progress 最近的 cube”。
    if (this.detailFocusIndex >= 0) {
      return this.cubeBaseStates[this.detailFocusIndex]?.centeredProgress
        ?? this.getInitialAutoCenterProgress();
    }

    let closestProgress = this.getInitialAutoCenterProgress();
    let closestDistance = Infinity;

    this.cubeBaseStates.forEach((state) => {
      const distance = Math.abs(state.centeredProgress - this.progress);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestProgress = state.centeredProgress;
      }
    });

    return closestProgress;
  }

  getAutoCenterOffset() {
    let closestDistance = Infinity;
    let closestDelta = 0;

    this.cubeBaseStates.forEach((state) => {
      const delta = state.centeredProgress - this.progress;
      const distance = Math.abs(delta);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestDelta = delta;
      }
    });

    return closestDelta * (this.projects.length + 1);
  }

  ensureTransmissionTarget(width = 1, height = 1) {
    // transmission capture 依赖单独离屏目标，尺寸变化时才重建。
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));

    if (
      this.transmissionTarget.width === nextWidth
      && this.transmissionTarget.height === nextHeight
    ) {
      return;
    }

    this.transmissionTarget.setSize(nextWidth, nextHeight);
  }

  setTransmissionCaptureState(capturing) {
    // transmission 采样时需要“只看内层对象，不看外壳 cube 本身”，
    // 所以这里通过显隐切换场景层，先 capture 再恢复。
    if (this.transmissionState.capturing === capturing) {
      return;
    }

    this.transmissionState.capturing = capturing;
    const fallbackWidth = this.transmissionFallbackTexture?.image?.width ?? 1;
    const fallbackHeight = this.transmissionFallbackTexture?.image?.height ?? 1;

    this.cubes.forEach((cube) => {
      cube.visible = true;
      cube.material.side = capturing ? THREE.BackSide : THREE.FrontSide;
      cube.material.needsUpdate = true;

      if (capturing) {
        cube.material.setTransmissionTexture(
          this.transmissionFallbackTexture,
          fallbackWidth,
          fallbackHeight
        );
      }
    });
    this.innerObjects.forEach((innerObject) => {
      innerObject.visible = capturing;
    });
    this.smokeMeshes.forEach((smokeMesh) => {
      smokeMesh.visible = !capturing;
    });
    this.plexusSystems.forEach((plexus) => {
      plexus.setVisible(!capturing);
    });

    if (this.backgroundShapes) {
      this.backgroundShapes.visible = !capturing && this.backgroundShapesEnabled && this.backgroundShapesVisible;
    }

    if (this.labelsGroup) {
      this.labelsGroup.visible = !capturing;
    }

    if (this.blurryText) {
      this.blurryText.visible = !capturing && this.blurryTextVisible;
    }

    if (this.roomRing) {
      this.roomRing.visible = !capturing;
    }

    if (this.forcefield) {
      this.forcefield.visible = !capturing;
    }

    this.textCylinders.forEach((mesh) => {
      mesh.visible = !capturing;
    });
  }

  updateTransmissionUniforms(width, height) {
    // 每个 cube 的 transmission 材质都共享同一张 capture 结果，
    // 但仍要同步各自的分辨率与噪声偏移。
    this.transmissionMaterials.forEach((material, index) => {
      material.setTransmissionTexture(this.transmissionTarget.texture, width, height);
      material.setResolution(width, height);
      material.setBlueOffset(this.blueOffset.x, this.blueOffset.y);
      material.setMouseFrostTexture(this.frostMaps[index]?.finalTarget.texture ?? null);
    });
  }

  updateInteractiveEffects(renderer) {
    // 鼠标霜冻图属于每个项目自己的交互特效，逐帧独立更新。
    this.frostMaps.forEach((frostMap) => {
      frostMap.update(renderer, this.time);
    });
  }

  prepareForRender(renderer, renderState = {}) {
    // 在正式参与首页 composite 前，先完成 transmission capture pass。
    const width = renderState.renderWidth ?? renderState.width ?? 1;
    const height = renderState.renderHeight ?? renderState.height ?? 1;
    const previousTarget = renderer.getRenderTarget();

    this.blueOffset.set(
      (this.blueOffset.x + 0.61803398875) % 1,
      (this.blueOffset.y + 0.41421356237) % 1
    );

    this.updateInteractiveEffects(renderer);
    this.ensureTransmissionTarget(width, height);
    this.setTransmissionCaptureState(true);

    renderer.setRenderTarget(this.transmissionTarget);
    renderer.clear(true, true, true);
    renderer.render(this, this.camera);
    renderer.setRenderTarget(previousTarget);

    this.setTransmissionCaptureState(false);
    this.updateTransmissionUniforms(this.transmissionTarget.width, this.transmissionTarget.height);
  }


  setDetailFocus(projectHash = null, progress = 0) {
    this.detailFocusHash = projectHash;
    this.detailFocusProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const nextIndex = this.projects.findIndex((project) => project.hash === projectHash);

    if (nextIndex >= 0 && nextIndex !== this.detailFocusIndex && this.detailFocusProgress > 0.02) {
      this.plexusSystems[nextIndex]?.triggerPulse(1);
    }

    this.detailFocusIndex = nextIndex;
  }

  setHoveredProject(projectHash = null) {
    this.hoveredProjectHash = projectHash;
    this.hoveredProjectIndex = this.projects.findIndex((project) => project.hash === projectHash);
  }

  setPointer(pointer = null) {
    if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
      this.pointerTarget.set(pointer.x, pointer.y);
      this.pointerTargetStrength = 1;
      return;
    }

    this.pointerTarget.set(0, 0);
    this.pointerTargetStrength = 0;
  }

  setPointerHit(hit = null) {
    // 只有拿到 uv 的命中结果时，霜冻图才知道鼠标在 cube 表面的哪个位置。
    const previousIndex = this.pointerProjectIndex;
    const nextIndex = hit?.index ?? -1;

    this.pointerProjectIndex = nextIndex;

    if (!hit || !hit.uv || nextIndex < 0) {
      return;
    }

    const stackSpan = this.verticalOffset * (this.cubeGroups.length + 1);
    const scrollOffset = this.progress * stackSpan;
    const focusOffset = this.detailFocusIndex >= 0
      ? (
        (this.cubeBaseStates[this.detailFocusIndex]?.centeredProgress ?? this.progress) - this.progress
      ) * stackSpan * this.detailFocusProgress
      : 0;
    const runtimeScrollDistance = (this.cubeBaseStates[nextIndex]?.position.y ?? 0) + focusOffset + scrollOffset;

    if (this.detailFocusProgress > 0.02 || Math.abs(runtimeScrollDistance) >= 2) {
      return;
    }

    this.frostMaps[nextIndex]?.setPointer(hit.uv, {
      entered: previousIndex !== nextIndex
    });
  }

  pickProjectHit(normalizedPointer) {
    // 对 cubes 数组做射线拾取，返回 project、uv、point 等完整命中信息。
    if (!normalizedPointer) {
      return null;
    }

    this.camera.updateMatrixWorld();
    this.updateMatrixWorld(true);
    this.raycaster.setFromCamera(normalizedPointer, this.camera);

    const [intersection] = this.raycaster.intersectObjects(this.cubes, false);
    const project = intersection?.object?.userData?.project ?? null;

    if (!project) {
      return null;
    }

    const index = this.projects.findIndex((entry) => entry.hash === project.hash);

    return {
      project,
      index,
      uv: intersection.uv?.clone?.() ?? null,
      point: intersection.point?.clone?.() ?? null
    };
  }

  pickProject(normalizedPointer) {
    return this.pickProjectHit(normalizedPointer)?.project ?? null;
  }

  getDetailAnchor(projectHash = this.detailFocusHash) {
    // detail scene 通过这里拿到被选中 cube 的屏幕位置、旋转和缩放，
    // 从而实现首页对象到 detail 对象的镜头接续。
    const index = this.projects.findIndex((project) => project.hash === projectHash);
    const cube = index >= 0 ? this.cubes[index] : null;

    if (!cube) {
      return null;
    }

    this.camera.updateMatrixWorld();
    this.updateMatrixWorld(true);
    cube.updateMatrixWorld(true);

    cube.getWorldPosition(this.anchorWorldPosition);
    this.anchorClipPosition.copy(this.anchorWorldPosition).project(this.camera);
    cube.getWorldQuaternion(this.anchorQuaternion);
    cube.getWorldScale(this.anchorScale);

    return {
      ndc: {
        x: this.anchorClipPosition.x,
        y: this.anchorClipPosition.y,
        z: this.anchorClipPosition.z
      },
      quaternion: {
        x: this.anchorQuaternion.x,
        y: this.anchorQuaternion.y,
        z: this.anchorQuaternion.z,
        w: this.anchorQuaternion.w
      },
      scale: Math.max(this.anchorScale.x, this.anchorScale.y, this.anchorScale.z),
      focusProgress: this.detailFocusProgress
    };
  }

  getCenteredProjectIndex() {
    return this.cubeBaseStates.reduce((closestIndex, state, index, states) => {
      if (closestIndex < 0) {
        return index;
      }

      const currentDistance = Math.abs(state.centeredProgress - this.progress);
      const previousDistance = Math.abs(states[closestIndex].centeredProgress - this.progress);
      return currentDistance < previousDistance ? index : closestIndex;
    }, -1);
  }

  getOverlayProjectIndex() {
    return this.hoveredProjectIndex >= 0 ? this.hoveredProjectIndex : this.getCenteredProjectIndex();
  }

  getAudioState() {
    return {
      shardMix: this.shardMix
    };
  }

  getOverlayPresentation() {
    return {
      useSceneLabels: true,
      visible: false,
      project: null
    };
    // 给 WebGLUiScene 输出当前激活项目的屏幕锚点与框线点位。
    const { enterProgress, exitProgress } = this.getSectionHandoffState();
    const activeIndex = this.getOverlayProjectIndex();
    const centeredIndex = this.getCenteredProjectIndex();
    const project = activeIndex >= 0 ? this.projects[activeIndex] : null;
    const cube = activeIndex >= 0 ? this.cubes[activeIndex] : null;
    const state = activeIndex >= 0 ? this.cubeBaseStates[activeIndex] : null;

    if (!project || !cube || !state) {
      return null;
    }

    const isCentered = activeIndex === centeredIndex;
    const hoverReveal = this.hoveredProjectIndex === activeIndex ? 1 : 0;
    const centeredReveal = isCentered ? 0.84 : 0;
    const reveal = Math.max(
      1 - smoothWindow(Math.abs(state.centeredProgress - this.progress), 0.14, 0.72),
      hoverReveal,
      centeredReveal
    ) * enterProgress
      * (1 - exitProgress * 0.92)
      * (1 - this.detailFocusProgress);

    if (reveal <= 0.001) {
      return null;
    }

    const bounds = cube.geometry.boundingBox;
    const sphere = cube.geometry.boundingSphere;
    if (!bounds || !sphere) {
      return null;
    }

    this.camera.updateMatrixWorld();
    this.updateMatrixWorld(true);
    cube.updateMatrixWorld(true);

    this.uiBoundsCenterWorld.copy(sphere.center).applyMatrix4(cube.matrixWorld);
    this.camera.matrixWorld.extractBasis(this.uiCameraRight, this.uiCameraUp, this.anchorWorldPosition);

    cube.getWorldScale(this.anchorScale);
    const sphereRadius = sphere.radius * Math.max(this.anchorScale.x, this.anchorScale.y, this.anchorScale.z);

    this.uiBoundsEdgeWorldX.copy(this.uiBoundsCenterWorld).addScaledVector(this.uiCameraRight, sphereRadius * 0.9);
    this.uiBoundsEdgeWorldY.copy(this.uiBoundsCenterWorld).addScaledVector(this.uiCameraUp, sphereRadius * 1.05);

    this.uiBoundsCenterClip.copy(this.uiBoundsCenterWorld).project(this.camera);
    this.uiBoundsEdgeClipX.copy(this.uiBoundsEdgeWorldX).project(this.camera);
    this.uiBoundsEdgeClipY.copy(this.uiBoundsEdgeWorldY).project(this.camera);

    if (
      !Number.isFinite(this.uiBoundsCenterClip.x)
      || !Number.isFinite(this.uiBoundsCenterClip.y)
      || !Number.isFinite(this.uiBoundsEdgeClipX.x)
      || !Number.isFinite(this.uiBoundsEdgeClipY.y)
    ) {
      return null;
    }

    const centerX = this.uiBoundsCenterClip.x;
    const centerY = this.uiBoundsCenterClip.y;
    const halfWidth = Math.max(Math.abs(this.uiBoundsEdgeClipX.x - centerX), 0.1);
    const halfHeight = Math.max(Math.abs(this.uiBoundsEdgeClipY.y - centerY), 0.14);
    const frameHalfWidth = halfWidth * 1.12;
    const frameHalfHeight = halfHeight * 1.08;
    const frameAnchors = [
      { x: centerX - frameHalfWidth * 0.46, y: centerY + frameHalfHeight },
      { x: centerX + frameHalfWidth * 0.4, y: centerY + frameHalfHeight },
      { x: centerX + frameHalfWidth, y: centerY + frameHalfHeight * 0.26 },
      { x: centerX + frameHalfWidth * 0.9, y: centerY - frameHalfHeight * 0.66 },
      { x: centerX + frameHalfWidth * 0.16, y: centerY - frameHalfHeight },
      { x: centerX - frameHalfWidth * 0.5, y: centerY - frameHalfHeight * 0.88 },
      { x: centerX - frameHalfWidth, y: centerY - frameHalfHeight * 0.08 },
      { x: centerX - frameHalfWidth * 0.9, y: centerY + frameHalfHeight * 0.56 },
      { x: centerX - frameHalfWidth * 0.46, y: centerY + frameHalfHeight }
    ];

    this.uiAnchorClipA.set(
      centerX - frameHalfWidth * 0.02,
      centerY + frameHalfHeight * 0.34,
      0
    );
    this.uiAnchorClipB.set(
      centerX + frameHalfWidth * 0.4,
      centerY - frameHalfHeight * 0.4,
      0
    );
    this.uiAnchorClipC.set(
      centerX + frameHalfWidth * 0.38,
      centerY + frameHalfHeight * 0.08,
      0
    );

    return {
      visible: true,
      reveal,
      sticky: isCentered,
      hover: this.hoveredProjectIndex === activeIndex ? 1 : 0,
      index: activeIndex,
      project: {
        ...project
      },
      titleAnchor: {
        x: this.uiAnchorClipA.x,
        y: this.uiAnchorClipA.y
      },
      dateAnchor: {
        x: this.uiAnchorClipB.x,
        y: this.uiAnchorClipB.y
      },
      tempAnchor: {
        x: this.uiAnchorClipC.x,
        y: this.uiAnchorClipC.y
      },
      screenBox: {
        centerX,
        centerY,
        halfWidth,
        halfHeight
      },
      frameAnchors
    };
  }

  getSectionHandoffState() {
    // CubesScene 既要承接 Igloo -> Cubes 的进入，
    // 也要处理 Cubes -> Entry 的离场，所以单独拆了 handoff 状态。
    return {
      isIncomingFromIgloo: false,
      isOutgoingToEntry: false,
      enterProgress: 1,
      exitProgress: 0
    };
  }

  update(delta) {
    this.time += delta;

    const safeDelta = Math.max(delta, 1 / 240);
    const rawScrollVelocity = Math.abs((this.progress - this.lastProgress) / safeDelta);
    this.lastProgress = this.progress;
    this.scrollVelocity = THREE.MathUtils.lerp(
      this.scrollVelocity,
      rawScrollVelocity,
      1 - Math.exp(-safeDelta * 8)
    );
    this.pointerCurrent.lerp(this.pointerTarget, 1 - Math.exp(-safeDelta * 7));
    this.pointerStrength = THREE.MathUtils.lerp(
      this.pointerStrength,
      this.pointerTargetStrength,
      1 - Math.exp(-safeDelta * 9)
    );

    const stackSpan = this.verticalOffset * (this.cubeGroups.length + 1);
    const scrollOffset = this.progress * stackSpan;
    const cameraTrackY = -scrollOffset;
    const focusProgress = this.detailFocusProgress;
    const focusCurve = THREE.MathUtils.smootherstep(focusProgress, 0, 1);
    const focusZoomCurve = Math.pow(focusProgress, 1.65);
    const focusOffset = this.detailFocusIndex >= 0
      ? (
        (this.cubeBaseStates[this.detailFocusIndex]?.centeredProgress ?? this.progress) - this.progress
      ) * stackSpan * focusProgress
      : 0;
    const motionBlurAmount = THREE.MathUtils.clamp(this.scrollVelocity * 0.1, 0, 1);
    const pointerInfluence = this.pointerStrength * (1 - focusCurve);
    const centeredIndex = this.getCenteredProjectIndex();

    this.projectGroup.position.x = this.pointerCurrent.x * 0.08 * pointerInfluence;
    this.projectGroup.position.y = focusOffset;
    this.projectGroup.position.z = 0;
    this.root.rotation.x = this.pointerCurrent.y * 0.02 * pointerInfluence;
    this.root.rotation.y = this.pointerCurrent.x * 0.025 * pointerInfluence;

    if (this.roomBackground) {
      this.roomBackground.material.uniforms.uTime.value = this.time;
      this.roomBackground.material.uniforms.uProgress.value = this.progress;
      this.roomBackground.material.uniforms.uAspect.value = this.camera.aspect;
      this.roomBackground.material.uniforms.uResolution.value.set(
        Math.max(this.width ?? 1, 1),
        Math.max(this.height ?? 1, 1)
      );
      this.roomBackground.material.uniforms.uBlueOffset.value.copy(this.blueOffset);
      this.roomBackground.material.uniforms.uDotStrength.value = this.lookDebugSettings.bgDotStrength;
    }

    const backgroundPresence = THREE.MathUtils.lerp(1, 0.22, focusCurve);
    this.backgroundShapesVisible = this.lookDebugSettings.backgroundShapeAlphaScale > 0.0001 && backgroundPresence > 0.01;
    this.blurryTextVisible = this.lookDebugSettings.blurryTextOpacityScale > 0.0001 && backgroundPresence > 0.01;

    if (this.backgroundShapes) {
      this.backgroundShapes.visible = this.backgroundShapesEnabled && this.backgroundShapesVisible;
      this.backgroundShapes.material.uniforms.uTime.value = this.time;
      this.backgroundShapes.material.uniforms.uProgress.value = this.progress;
      this.backgroundShapes.material.uniforms.uAspect.value = this.camera.aspect;
      this.backgroundShapes.material.uniforms.uAlpha.value = this.lookDebugSettings.backgroundShapeAlphaScale * backgroundPresence;
    }

    if (this.blurryText) {
      this.blurryText.visible = this.blurryTextVisible;
      this.blurryText.material.uniforms.uTime.value = this.time;
      this.blurryText.material.uniforms.uProgress.value = this.progress;
      this.blurryText.material.uniforms.uAspect.value = this.camera.aspect;
      this.blurryText.material.uniforms.uOpacity.value = this.lookDebugSettings.blurryTextOpacityScale * backgroundPresence;
    }

    if (this.roomRing) {
      this.roomRing.visible = false;
      this.roomRing.material.uniforms.uAlpha.value = 0;
    }

    if (this.forcefield) {
      this.forcefield.visible = false;
      this.forcefield.material.uniforms.uAlpha.value = 0;
    }

    this.textCylinders.forEach((mesh) => {
      mesh.visible = false;
      mesh.material.uniforms.uAlpha.value = 0;
    });

    this.cubeGroups.forEach((cubeGroup, index) => {
      const cube = this.cubes[index];
      const innerObject = this.innerObjects[index];
      const smokeMaterial = this.smokeMaterials[index];
      const plexus = this.plexusSystems[index];
      const material = cube.material;
      const baseState = this.cubeBaseStates[index];
      const isFocused = this.detailFocusIndex === index;
      const runtimeRand = baseState.runtimeRand ?? 0.5;
      const firstRuntimeRand = this.cubeBaseStates[0]?.runtimeRand ?? 0.5;
      const rotationSign = (((index + firstRuntimeRand) * 242.45353) % 1) < 0.5 ? -1 : 1;
      const rotationScaleX = THREE.MathUtils.lerp(0.1, 0.2, (runtimeRand * 12.3423) % 1);
      const rotationScaleY = THREE.MathUtils.lerp(0.1, 0.3, (runtimeRand * 123.5343) % 1);
      const rotationScaleZ = THREE.MathUtils.lerp(0.1, 0.25, (runtimeRand * 54.654) % 1);
      const scrollProgressDifference = baseState.centeredProgress - this.progress;
      const runtimeScrollDistance = baseState.position.y + focusOffset - cameraTrackY;
      const frostEnergy = Math.abs(runtimeScrollDistance) < 2 && focusProgress < 0.02
        ? (this.frostMaps[index]?.soundVelocity ?? 0)
        : 0;
      const idleRotationAmplitude = 0.1 * (1 - focusCurve);
      const idleRotationDirection = Math.sign(runtimeRand - 0.5) || 1;
      const rotationX = (-14 * rotationSign * (1 - rotationScaleY)) * scrollProgressDifference
        + Math.sin(this.time * 0.3 + runtimeRand * 42.987) * idleRotationAmplitude * idleRotationDirection;
      const rotationY = (11 * rotationSign * (1 - rotationScaleX)) * scrollProgressDifference
        + Math.sin(this.time * 0.3 + runtimeRand * 12.423) * idleRotationAmplitude * idleRotationDirection;
      const rotationZ = (6 * rotationSign * (1 - rotationScaleZ)) * scrollProgressDifference
        + Math.sin(this.time * 0.3 + runtimeRand * 2.53) * idleRotationAmplitude * idleRotationDirection;
      const focusSpread = this.detailFocusIndex >= 0 ? Math.sign(index - this.detailFocusIndex) : 0;
      const focusFade = focusCurve > 0
        ? THREE.MathUtils.lerp(1, isFocused ? 1 : 0.16, focusCurve)
        : 1;

      cubeGroup.position.x = this.detailFocusIndex >= 0
        ? THREE.MathUtils.lerp(0, focusSpread * 0.26, focusCurve)
        : 0;
      cubeGroup.position.y = baseState.position.y + THREE.MathUtils.lerp(0, isFocused ? 0 : -0.2 - index * 0.08, focusCurve);
      cubeGroup.position.z = THREE.MathUtils.lerp(0, isFocused ? 0 : -0.55, focusCurve);
      cubeGroup.scale.setScalar(THREE.MathUtils.lerp(1, isFocused ? 1 : 0.82, focusCurve));

      cube.rotation.x = rotationX;
      cube.rotation.y = rotationY;
      cube.rotation.z = rotationZ;

      material.opacity = focusFade;
      material.emissiveIntensity = 0;

      innerObject.rotation.x = baseState.innerRotation.x + Math.sin(this.time * 0.8 + index) * 0.08 * (1 - focusProgress);
      innerObject.rotation.y += delta * (0.18 + index * 0.025);
      innerObject.rotation.z = baseState.innerRotation.z + Math.sin(this.time * 0.6 + index * 1.7) * 0.06;
      innerObject.position.y = Math.sin(this.time * 1.1 + index) * 0.04 * (1 - focusProgress);
      innerObject.scale.copy(baseState.innerScale);
      innerObject.material.opacity = focusFade;

      smokeMaterial.uniforms.uTime.value = this.time;
      smokeMaterial.uniforms.uProgress.value = scrollProgressDifference;

      plexus?.update({
        delta: safeDelta,
        time: this.time,
        visibility: Math.abs(runtimeScrollDistance) < 1.25 ? focusFade : 0,
        hover: 0,
        focus: isFocused ? focusCurve : 0,
        scrollSpeed: motionBlurAmount
      });
    });

    const shardTarget = centeredIndex >= 0
      ? (this.frostMaps[centeredIndex]?.soundVelocity ?? 0) * 0.5
      : 0;
    this.shardMix = THREE.MathUtils.lerp(this.shardMix, shardTarget, 1 - Math.exp(-safeDelta * 5));

    this.camera.position.x = this.pointerCurrent.x * 0.1 * pointerInfluence;
    this.camera.position.y = cameraTrackY;
    this.camera.position.z = this.baseCameraPosition.z + THREE.MathUtils.lerp(0, -3.5, focusZoomCurve);
    this.camera.fov = 45 - 5 * motionBlurAmount;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(
      this.pointerCurrent.x * 0.05 * pointerInfluence,
      cameraTrackY + this.pointerCurrent.y * 0.05 * pointerInfluence,
      0
    );
    this.camera.updateMatrixWorld();
    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
    this.camera.matrixWorld.extractBasis(this.uiCameraRight, this.uiCameraUp, this.anchorWorldPosition);

    this.labelSystems.forEach((labels, index) => {
      const cubeGroup = this.cubeGroups[index];
      const baseState = this.cubeBaseStates[index];
      const isFocused = this.detailFocusIndex === index;
      const runtimeScrollDistance = baseState.position.y + focusOffset - cameraTrackY;
      const presence = focusProgress > 0
        ? THREE.MathUtils.lerp(1, isFocused ? 1 : 0.15, focusProgress)
        : 1;

      cubeGroup.updateMatrixWorld(true);
      cubeGroup.getWorldPosition(this.labelWorldPosition);
      labels.update({
        delta: safeDelta,
        time: this.time,
        scrollDistance: runtimeScrollDistance,
        presence,
        cameraQuaternion: this.cameraWorldQuaternion,
        cameraRight: this.uiCameraRight,
        cameraUp: this.uiCameraUp,
        viewportHeight: this.height ?? 1080
      });
    });

    this.cubeGroups.forEach((cubeGroup, index) => {
      const smokeMesh = this.smokeMeshes[index];
      const frostEnergy = this.frostMaps[index]?.soundVelocity ?? 0;
      cubeGroup.updateMatrixWorld();
      cubeGroup.getWorldQuaternion(this.parentWorldQuaternion);
      this.inverseParentQuaternion.copy(this.parentWorldQuaternion).invert();
      smokeMesh.quaternion.copy(this.inverseParentQuaternion.multiply(this.cameraWorldQuaternion));
      smokeMesh.material.opacity = (0.88 + frostEnergy * 0.12)
        * this.lookDebugSettings.smokeOpacityScale
        * THREE.MathUtils.lerp(1, 0.45, focusProgress);
    });
  }

  dispose() {
    // transmission target、交互 frost map、辅助几何和材质都需要显式释放。
    this.transmissionTarget.dispose();
    this.transmissionFallbackTexture?.dispose?.();
    this.frostMaps.forEach((frostMap) => frostMap.dispose());
    this.plexusSystems.forEach((plexus) => plexus.dispose());
    this.labelSystems.forEach((labels) => labels.dispose());
    this.smokeMeshes.forEach((smokeMesh) => {
      smokeMesh.geometry.dispose();
    });
    this.smokeMaterials.forEach((material) => material.dispose());

    const disposableGeometries = new Set();
    const disposableMaterials = new Set();

    [this.roomBackground, this.floorFog, this.backgroundShapes, this.blurryText, this.roomRing, this.forcefield, ...this.textCylinders]
      .filter(Boolean)
      .forEach((mesh) => {
        if (mesh.geometry) {
          disposableGeometries.add(mesh.geometry);
        }

        if (mesh.material) {
          disposableMaterials.add(mesh.material);
        }
      });

    disposableGeometries.forEach((geometry) => geometry.dispose());
    disposableMaterials.forEach((material) => material.dispose());
  }

  setSize(width, height) {
    super.setSize(width, height);

    // 与其他首页 scene 保持一致，使用 zoom 修正超宽屏效果。
    if (this.camera.isPerspectiveCamera) {
      this.camera.zoom = Math.min(1.08, (width / height) * 1.32);
      this.camera.updateProjectionMatrix();
    }
  }
}
