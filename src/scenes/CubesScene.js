import * as THREE from 'three';
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
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform sampler2D tPerlin;
  uniform sampler2D tDotPattern;
  uniform sampler2D tBlue;
  uniform vec2 uBlueOffset;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec4 getBlueNoise(vec2 fragCoord) {
    return texture2D(tBlue, fract(fragCoord / 128.0 + uBlueOffset));
  }

  void main() {
    vec2 screenUv = vUv;
    screenUv.x *= uAspect;
    screenUv *= 0.3;

    float t = uTime * 0.075;
    vec2 offset1 = vec2(-t, t * 0.25);
    vec2 offset2 = vec2(t, -t * 0.5);
    offset1.y -= uProgress * 0.65;

    float perlin = texture2D(tPerlin, screenUv + offset1).r;
    perlin += texture2D(tPerlin, screenUv * 0.5 + offset2).r;
    perlin *= 0.5;

    vec3 color = mix(uColor1, uColor2, perlin);
    vec2 dotUv = screenUv * 45.0;
    dotUv += vec2(0.0, -uProgress * 10.0);
    float dots = texture2D(tDotPattern, dotUv).r;
    float dotId = hash12(floor(dotUv));
    float dotFade = 1.0 - abs(fract(dotId + uTime * 0.1) - 0.5) * 2.0;
    color += dots * dotFade * 0.45;

    color += getBlueNoise(gl_FragCoord.xy).rgb * 0.05;
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

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
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
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
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
  constructor({ assets, projects }) {
    super({
      name: 'cubes',
      background: '#d7dde8'
    });

    // -------- 运行时状态 --------
    this.assets = assets;
    this.projects = projects;
    this.time = 0;
    this.cubes = [];
    this.cubeGroups = [];
    this.innerObjects = [];
    this.smokeMeshes = [];
    this.smokeMaterials = [];
    this.plexusSystems = [];
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
    this.projectGroup = new THREE.Group();
    this.verticalOffset = 5.75;
    this.environment = assets.get('texture', 'cubes-environment');
    this.blueNoise = assets.get('texture', 'blue-noise');
    this.windNoise = assets.get('texture', 'wind-noise') ?? this.blueNoise;
    this.trianglesTexture = assets.get('texture', 'triangles-tiling') ?? null;
    this.baseCameraPosition = new THREE.Vector3(0, 0, 5);
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

    // -------- 基础灯光 --------
    const ambient = new THREE.AmbientLight('#f0f4ff', 1.4);
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(3, 5, 6);
    this.add(ambient, keyLight);

    // -------- 屏幕空间背景层与辅助层 --------
    this.roomBackground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uAspect: { value: 1 },
          uColor1: { value: new THREE.Color('#c9d0df') },
          uColor2: { value: new THREE.Color('#545b6b') },
          tPerlin: { value: assets.get('texture', 'detail-perlin') ?? null },
          tDotPattern: { value: assets.get('texture', 'dot-pattern') ?? null },
          tBlue: { value: this.blueNoise },
          uBlueOffset: { value: this.blueOffset.clone() }
        },
        vertexShader: CUBES_BG_VERTEX_SHADER,
        fragmentShader: CUBES_BG_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.roomBackground.frustumCulled = false;
    this.roomBackground.renderOrder = -99;
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
        size: 1.6
      }) || new THREE.BoxGeometry(1.35, 1.35, 1.35);
      geometry.computeBoundingSphere?.();
      const innerGeometry = prepareGeometry(assets.get('geometry', innerAssetConfig.geometryKey), {
        size: 0.72 * innerAssetConfig.scale
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

      material.emissive.set(project.accent);
      material.emissiveIntensity = 0.04;
      material.opacity = 1;

      const cubeMesh = new THREE.Mesh(geometry, material);
      cubeMesh.geometry.computeBoundingBox?.();
      cubeMesh.rotation.x = 0.45;
      cubeMesh.rotation.y = 0.6;
      cubeMesh.name = project.cubeKey ?? `cube-${index}`;
      cubeMesh.userData.project = project;
      cubeMesh.renderOrder = 3;

      const innerMesh = new THREE.Mesh(
        innerGeometry,
        new THREE.MeshBasicMaterial({
          map: assets.get('texture', innerAssetConfig.textureKey) ?? null,
          color: '#ffffff',
          transparent: true,
          opacity: 0.9
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
        radius: geometry.boundingSphere?.radius ?? 0.82
      });
      plexus.group.position.y = -0.02;

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
      this.frostMaps.push(mouseFrost);
      this.transmissionMaterials.push(material);
      this.cubeBaseStates.push({
        position: cubeGroup.position.clone(),
        scale: cubeGroup.scale.clone(),
        cubeRotation: cubeMesh.rotation.clone(),
        innerRotation: innerMesh.rotation.clone(),
        innerScale: innerMesh.scale.clone(),
        centeredProgress
      });
    });

    this.camera.position.copy(this.baseCameraPosition);
    this.camera.lookAt(0, 0, 0);
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
    this.cubes.forEach((cube) => {
      cube.visible = !capturing;
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
    // detail 打开时，CubesScene 不会立刻消失，而是先把被选中的项目做聚焦 / 退场。
    this.detailFocusHash = projectHash;
    this.detailFocusProgress = THREE.MathUtils.clamp(progress, 0, 1);
    this.detailFocusIndex = this.projects.findIndex((project) => project.hash === projectHash);
  }

  setHoveredProject(projectHash = null) {
    this.hoveredProjectHash = projectHash;
    this.hoveredProjectIndex = this.projects.findIndex((project) => project.hash === projectHash);
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
    const previousIndex = this.hoveredProjectIndex;
    this.hoveredProjectHash = projectHash;
    this.hoveredProjectIndex = this.projects.findIndex((project) => project.hash === projectHash);

    if (this.hoveredProjectIndex >= 0 && this.hoveredProjectIndex !== previousIndex) {
      this.plexusSystems[this.hoveredProjectIndex]?.triggerPulse(0.85);
    }
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

  getOverlayPresentation() {
    // 给 WebGLUiScene 输出当前激活项目的屏幕锚点与框线点位。
    const { enterProgress, exitProgress } = this.getSectionHandoffState();
    const activeIndex = this.hoveredProjectIndex >= 0
      ? this.hoveredProjectIndex
      : this.cubeBaseStates.reduce((closestIndex, state, index, states) => {
        if (closestIndex < 0) {
          return index;
        }

        const currentDistance = Math.abs(state.centeredProgress - this.progress);
        const previousDistance = Math.abs(states[closestIndex].centeredProgress - this.progress);
        return currentDistance < previousDistance ? index : closestIndex;
      }, -1);
    const project = activeIndex >= 0 ? this.projects[activeIndex] : null;
    const cube = activeIndex >= 0 ? this.cubes[activeIndex] : null;
    const state = activeIndex >= 0 ? this.cubeBaseStates[activeIndex] : null;

    if (!project || !cube || !state) {
      return null;
    }

    const reveal = (1 - smoothWindow(Math.abs(state.centeredProgress - this.progress), 0.08, 0.42))
      * enterProgress
      * (1 - exitProgress * 0.92)
      * (1 - this.detailFocusProgress);

    if (reveal <= 0.001) {
      return null;
    }

    const bounds = cube.geometry.boundingBox;
    if (!bounds) {
      return null;
    }

    this.camera.updateMatrixWorld();
    this.updateMatrixWorld(true);
    cube.updateMatrixWorld(true);

    this.uiAnchorLocalA.set(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, 0.35),
      THREE.MathUtils.lerp(bounds.max.y, bounds.min.y, 0.15),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, 0.93)
    );
    this.uiAnchorLocalB.set(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, 0.7),
      THREE.MathUtils.lerp(bounds.max.y, bounds.min.y, 0.75),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, 0.95)
    );
    this.uiAnchorLocalC.set(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, 0.7),
      THREE.MathUtils.lerp(bounds.max.y, bounds.min.y, 0.15),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, 0.93)
    );

    this.uiAnchorWorldA.copy(this.uiAnchorLocalA).applyMatrix4(cube.matrixWorld);
    this.uiAnchorWorldB.copy(this.uiAnchorLocalB).applyMatrix4(cube.matrixWorld);
    this.uiAnchorWorldC.copy(this.uiAnchorLocalC).applyMatrix4(cube.matrixWorld);
    this.uiAnchorClipA.copy(this.uiAnchorWorldA).project(this.camera);
    this.uiAnchorClipB.copy(this.uiAnchorWorldB).project(this.camera);
    this.uiAnchorClipC.copy(this.uiAnchorWorldC).project(this.camera);

    const frameFactors = [
      [0.18, 0.92, 0.9],
      [0.34, 1.06, 0.96],
      [0.68, 1.04, 0.94],
      [0.96, 0.82, 0.9],
      [1.08, 0.56, 0.88],
      [0.92, 0.18, 0.92],
      [0.72, -0.04, 0.9],
      [0.28, 0.02, 0.92],
      [-0.06, 0.26, 0.86],
      [0.02, 0.72, 0.84]
    ];

    frameFactors.forEach((factor, index) => {
      this.uiFrameLocal[index].set(
        THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, factor[0]),
        THREE.MathUtils.lerp(bounds.max.y, bounds.min.y, factor[1]),
        THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, factor[2])
      );
      this.uiFrameWorld[index].copy(this.uiFrameLocal[index]).applyMatrix4(cube.matrixWorld);
      this.uiFrameClip[index].copy(this.uiFrameWorld[index]).project(this.camera);
    });

    return {
      visible: true,
      reveal,
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
      frameAnchors: this.uiFrameClip.map((point) => ({
        x: point.x,
        y: point.y
      }))
    };
  }

  getSectionHandoffState() {
    // CubesScene 既要承接 Igloo -> Cubes 的进入，
    // 也要处理 Cubes -> Entry 的离场，所以单独拆了 handoff 状态。
    const isIncomingFromIgloo = this.transitionState?.role === 'next' && this.transitionState?.previousKey === 'igloo';
    const isOutgoingToEntry = this.transitionState?.role === 'current' && this.transitionState?.nextKey === 'entry';
    const enterProgress = isIncomingFromIgloo
      ? THREE.MathUtils.smoothstep(this.transitionState.enterProgress ?? 0, 0, 1)
      : 1;
    const exitProgress = isOutgoingToEntry
      ? THREE.MathUtils.smoothstep(this.transitionState.exitProgress ?? 0, 0, 1)
      : 0;

    return {
      isIncomingFromIgloo,
      isOutgoingToEntry,
      enterProgress,
      exitProgress
    };
  }

  update(delta) {
    // -------- 全局 section 级状态 --------
    this.time += delta;
    const safeDelta = Math.max(delta, 1 / 240);
    const rawScrollVelocity = Math.abs((this.progress - this.lastProgress) / safeDelta);
    this.lastProgress = this.progress;
    this.scrollVelocity = THREE.MathUtils.lerp(this.scrollVelocity, rawScrollVelocity, 1 - Math.exp(-safeDelta * 8));
    this.pointerCurrent.lerp(this.pointerTarget, 1 - Math.exp(-safeDelta * 7));
    this.pointerStrength = THREE.MathUtils.lerp(
      this.pointerStrength,
      this.pointerTargetStrength,
      1 - Math.exp(-safeDelta * 9)
    );

    const stackSpan = this.verticalOffset * (this.cubeGroups.length + 1);
    const scrollOffset = this.progress * stackSpan;
    const focusOffset = this.detailFocusIndex >= 0
      ? (
        (this.cubeBaseStates[this.detailFocusIndex]?.centeredProgress ?? this.progress) - this.progress
      ) * stackSpan * this.detailFocusProgress
      : 0;
    const hoverEnabled = this.detailFocusIndex < 0;
    const hoverPresence = hoverEnabled && this.hoveredProjectIndex >= 0 ? 1 : 0;
    const { enterProgress, exitProgress } = this.getSectionHandoffState();
    const entryLift = 1 - enterProgress;
    const cameraTrackY = -scrollOffset;
    const motionBlurAmount = THREE.MathUtils.clamp(this.scrollVelocity * 0.1, 0, 1);
    const pointerInfluence = this.pointerStrength
      * enterProgress
      * (1 - exitProgress * 0.82)
      * (1 - this.detailFocusProgress * 0.92);

    this.projectGroup.position.x = this.pointerCurrent.x * 0.18 * pointerInfluence;
    this.projectGroup.position.y = focusOffset;
    this.projectGroup.position.z = this.pointerCurrent.y * -0.12 * pointerInfluence;
    this.root.rotation.x = this.pointerCurrent.y * 0.05 * pointerInfluence;
    this.root.rotation.y = this.pointerCurrent.x * 0.075 * pointerInfluence;

    // -------- 背景层动画 --------
    if (this.roomBackground) {
      this.roomBackground.material.uniforms.uTime.value = this.time;
      this.roomBackground.material.uniforms.uProgress.value = this.progress;
      this.roomBackground.material.uniforms.uAspect.value = this.camera.aspect;
      this.roomBackground.material.uniforms.uBlueOffset.value.copy(this.blueOffset);
    }

    // -------- 每个项目 cube 的排布、聚焦、hover 与离场动画 --------
    this.cubeGroups.forEach((cubeGroup, index) => {
      const cube = this.cubes[index];
      const innerObject = this.innerObjects[index];
      const smokeMaterial = this.smokeMaterials[index];
      const plexus = this.plexusSystems[index];
      const material = cube.material;
      const baseState = this.cubeBaseStates[index];
      const isFocused = this.detailFocusIndex === index;
      const isHovered = hoverEnabled && this.hoveredProjectIndex === index;
      const focusProgress = this.detailFocusProgress;
      const hoverProgress = isHovered ? 1 : 0;
      const frostEnergy = this.frostMaps[index]?.soundVelocity ?? 0;
      const centerPresence = 1 - smoothWindow(Math.abs(baseState.centeredProgress - this.progress), 0.1, 0.45);
      const detailHandoffProgress = isFocused
        ? THREE.MathUtils.smoothstep(focusProgress, 0.34, 0.98)
        : 0;
      const entryStagger = getStaggerProgress(enterProgress, index);
      const exitStagger = getStaggerProgress(exitProgress, index, 0.11, 0.34);
      const spreadDirection = this.detailFocusIndex >= 0 ? Math.sign(index - this.detailFocusIndex) : 0;
      const restingX = Math.sin(this.progress * Math.PI + index) * 0.32;
      const focusedX = isFocused ? 0 : spreadDirection * 1.15;
      const settledX = THREE.MathUtils.lerp(restingX, focusedX, focusProgress);
      const baseScale = THREE.MathUtils.lerp(index === 0 ? 1.08 : 1, isFocused ? 1.4 : 0.72, focusProgress);
      const detailOpacity = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(THREE.MathUtils.lerp(1, isFocused ? 1 : 0.18, focusProgress), 1, hoverProgress * 0.35),
        isFocused ? 0.06 : 0.18,
        detailHandoffProgress
      );
      const detailZ = THREE.MathUtils.lerp(0, isFocused ? 0.8 : -0.9, focusProgress)
        + hoverProgress * 0.45
        + detailHandoffProgress * 0.38;
      const enteredX = THREE.MathUtils.lerp(settledX + 1.2 - index * 0.1, settledX, entryStagger);
      const enteredY = baseState.position.y + THREE.MathUtils.lerp(1.45 + index * 0.22, 0, entryStagger);
      const enteredZ = THREE.MathUtils.lerp(-1.55 - index * 0.18, detailZ, entryStagger);
      const targetExitX = (index - 1) * 0.22;
      const targetExitY = -1.15 - index * 1.55;
      const targetExitZ = -2.8 - index * 0.6;
      const finalScale = baseScale
        * THREE.MathUtils.lerp(0.78, 1, entryStagger)
        * THREE.MathUtils.lerp(1, 1.14, hoverProgress)
        * THREE.MathUtils.lerp(1, 1.06, frostEnergy)
        * THREE.MathUtils.lerp(1, 0.88, detailHandoffProgress)
        * THREE.MathUtils.lerp(1, 0.52, exitStagger);
      const enteredOpacity = THREE.MathUtils.lerp(0.02, detailOpacity, entryStagger);
      const enteredEmissive = Math.max(
        THREE.MathUtils.lerp(0.02, THREE.MathUtils.lerp(0.04, isFocused ? 0.18 : 0.26, focusProgress) + detailHandoffProgress * 0.08, entryStagger),
        THREE.MathUtils.lerp(0.04, 0.3, hoverProgress)
      );
      const exitGlow = smoothWindow(exitStagger, 0.08, 0.34) * (1 - smoothWindow(exitStagger, 0.4, 0.82));
      const rotationMultiplier = (isFocused
        ? THREE.MathUtils.lerp(1, 0.14, detailHandoffProgress)
        : 1) * THREE.MathUtils.lerp(0.55, 1, entryStagger) * THREE.MathUtils.lerp(1, 0.22, exitStagger);

      cube.rotation.x += delta * (0.2 + index * 0.03) * rotationMultiplier;
      cube.rotation.y += delta * (0.25 + index * 0.03) * rotationMultiplier;
      cube.rotation.z = THREE.MathUtils.lerp(baseState.cubeRotation.z, spreadDirection * 0.08, focusProgress) + Math.sin(this.time * 0.5 + index) * 0.05 * rotationMultiplier;

      innerObject.rotation.x = baseState.innerRotation.x + Math.sin(this.time * 0.8 + index) * 0.08 * (1 - detailHandoffProgress);
      innerObject.rotation.y += delta * (0.18 + index * 0.025) * THREE.MathUtils.lerp(0.75, 1.2, hoverProgress);
      innerObject.rotation.z = baseState.innerRotation.z + Math.sin(this.time * 0.6 + index * 1.7) * 0.06;
      innerObject.position.y = Math.sin(this.time * 1.1 + index) * 0.04 * (1 - detailHandoffProgress);
      innerObject.scale.copy(baseState.innerScale).multiplyScalar(
        THREE.MathUtils.lerp(0.92, 1.08, hoverProgress) * THREE.MathUtils.lerp(1, 0.86, detailHandoffProgress)
      );
      innerObject.material.opacity = THREE.MathUtils.lerp(0.72, 1, hoverProgress) * THREE.MathUtils.lerp(1, 0.35, detailHandoffProgress);

      cubeGroup.position.x = THREE.MathUtils.lerp(enteredX, targetExitX, exitStagger);
      cubeGroup.position.y = THREE.MathUtils.lerp(enteredY, targetExitY, exitStagger);
      cubeGroup.position.z = THREE.MathUtils.lerp(enteredZ, targetExitZ, exitStagger);
      cubeGroup.scale.setScalar(finalScale);

      material.opacity = THREE.MathUtils.lerp(enteredOpacity * THREE.MathUtils.lerp(0.12, 1, centerPresence), 0.02, exitStagger);
      material.emissiveIntensity = (THREE.MathUtils.lerp(enteredEmissive, 0.08, exitStagger) + exitGlow * 0.22)
        * THREE.MathUtils.lerp(0.35, 1, centerPresence)
        + frostEnergy * THREE.MathUtils.lerp(0.08, 0.34, hoverProgress * 0.65 + centerPresence * 0.35);

      smokeMaterial.uniforms.uTime.value = this.time;
      smokeMaterial.uniforms.uProgress.value = baseState.centeredProgress - this.progress;
      plexus?.update({
        delta: safeDelta,
        time: this.time,
        visibility: centerPresence * enterProgress * (1 - exitProgress * 0.94) * (1 - detailHandoffProgress * 0.72),
        hover: hoverProgress,
        focus: isFocused ? focusProgress : 0,
        scrollSpeed: motionBlurAmount
      });
    });

    // -------- 背景 shapes / blurry text 辅助层 --------
    const backgroundPresence = enterProgress
      * (1 - exitProgress * 0.92)
      * (1 - this.detailFocusProgress * 0.82);

    this.backgroundShapesVisible = backgroundPresence > 0.01;
    this.blurryTextVisible = backgroundPresence > 0.01;

    if (this.backgroundShapes) {
      this.backgroundShapes.visible = this.backgroundShapesEnabled && this.backgroundShapesVisible;
      this.backgroundShapes.material.uniforms.uTime.value = this.time;
      this.backgroundShapes.material.uniforms.uProgress.value = this.progress;
      this.backgroundShapes.material.uniforms.uAspect.value = this.camera.aspect;
      this.backgroundShapes.material.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.18, 0.34, enterProgress)
        * (1 - exitProgress * 0.88)
        * (1 - this.detailFocusProgress * 0.82);
    }

    if (this.blurryText) {
      this.blurryText.visible = this.blurryTextVisible;
      this.blurryText.material.uniforms.uTime.value = this.time;
      this.blurryText.material.uniforms.uProgress.value = this.progress;
      this.blurryText.material.uniforms.uAspect.value = this.camera.aspect;
      this.blurryText.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.08, 0.16, enterProgress)
        * (1 - exitProgress * 0.92)
        * (1 - this.detailFocusProgress * 0.78);
    }

    // -------- 相机与 billboarding 烟雾 --------
    const spatialLayerPresence = backgroundPresence * THREE.MathUtils.lerp(1, 0.42, motionBlurAmount);

    if (this.roomRing) {
      this.roomRing.visible = spatialLayerPresence > 0.01;
      this.roomRing.position.set(
        this.pointerCurrent.x * 0.12 * pointerInfluence,
        cameraTrackY - 0.95 + this.pointerCurrent.y * 0.06 * pointerInfluence,
        -0.2
      );
      this.roomRing.scale.setScalar(THREE.MathUtils.lerp(1.18, 1.38, hoverPresence * 0.45 + this.detailFocusProgress * 0.55));
      this.roomRing.material.uniforms.uTime.value = this.time;
      this.roomRing.material.uniforms.uAlpha.value = spatialLayerPresence
        * THREE.MathUtils.lerp(0.08, 0.24, hoverPresence * 0.55 + this.detailFocusProgress * 0.45);
    }

    if (this.forcefield) {
      this.forcefield.visible = spatialLayerPresence > 0.01;
      this.forcefield.position.set(
        this.pointerCurrent.x * 0.1 * pointerInfluence,
        cameraTrackY - 0.08,
        -0.15
      );
      this.forcefield.rotation.y = this.time * 0.12;
      this.forcefield.rotation.z = this.pointerCurrent.x * 0.08 * pointerInfluence;
      this.forcefield.scale.set(
        THREE.MathUtils.lerp(1.2, 1.34, this.detailFocusProgress),
        THREE.MathUtils.lerp(0.82, 1.05, hoverPresence * 0.4 + this.detailFocusProgress * 0.6),
        THREE.MathUtils.lerp(1.2, 1.34, this.detailFocusProgress)
      );
      this.forcefield.material.uniforms.uTime.value = this.time;
      this.forcefield.material.uniforms.uAlpha.value = spatialLayerPresence
        * THREE.MathUtils.lerp(0.03, 0.1, hoverPresence * 0.55 + this.detailFocusProgress * 0.45);
    }

    this.textCylinders.forEach((mesh, index) => {
      const opacityBias = index === 0 ? 0.16 : 0.1;
      mesh.visible = spatialLayerPresence > 0.01;
      mesh.position.y = cameraTrackY + (index === 0 ? -0.12 : 0.16);
      mesh.position.x = this.pointerCurrent.x * 0.08 * pointerInfluence * (index === 0 ? 1 : -0.6);
      mesh.rotation.y += delta * (index === 0 ? 0.05 : -0.04);
      mesh.material.uniforms.uTime.value = this.time;
      mesh.material.uniforms.uAlpha.value = spatialLayerPresence
        * THREE.MathUtils.lerp(opacityBias, opacityBias + 0.1, hoverPresence * 0.55 + this.detailFocusProgress * 0.45);
    });

    this.camera.position.x = this.pointerCurrent.x * 0.35 * pointerInfluence;
    this.camera.position.y = cameraTrackY;
    this.camera.position.z = THREE.MathUtils.lerp(5.6 + entryLift * 1.1, 7.9, exitProgress)
      + motionBlurAmount * 0.5
      - hoverPresence * 0.18
      - this.detailFocusProgress * 0.22;
    this.camera.fov = THREE.MathUtils.lerp(
      this.baseCameraFov,
      this.baseCameraFov + motionBlurAmount * 14 - hoverPresence * 2.1 - this.detailFocusProgress * 3.2,
      0.28
    );
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(
      this.pointerCurrent.x * 0.22 * pointerInfluence,
      cameraTrackY + this.pointerCurrent.y * 0.18 * pointerInfluence,
      0
    );
    this.camera.updateMatrixWorld();
    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);

    this.cubeGroups.forEach((cubeGroup, index) => {
      const smokeMesh = this.smokeMeshes[index];
      const frostEnergy = this.frostMaps[index]?.soundVelocity ?? 0;
      cubeGroup.updateMatrixWorld();
      cubeGroup.getWorldQuaternion(this.parentWorldQuaternion);
      this.inverseParentQuaternion.copy(this.parentWorldQuaternion).invert();
      smokeMesh.quaternion.copy(this.inverseParentQuaternion.multiply(this.cameraWorldQuaternion));
      smokeMesh.material.opacity = THREE.MathUtils.lerp(0.65, 1.2, this.hoveredProjectIndex === index ? 1 : 0)
        + frostEnergy * 0.35;
    });
  }

  dispose() {
    // transmission target、交互 frost map、辅助几何和材质都需要显式释放。
    this.transmissionTarget.dispose();
    this.frostMaps.forEach((frostMap) => frostMap.dispose());
    this.plexusSystems.forEach((plexus) => plexus.dispose());
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
      this.camera.zoom = Math.min(1, (width / height) * 1.25);
      this.camera.updateProjectionMatrix();
    }
  }
}
