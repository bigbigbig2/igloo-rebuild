import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const FOG_COLOR = '#c6ccd6';
const FOG_NEAR = 22;
const FOG_FAR = 90;
const SKY_COLOR_A = '#d1d6e3';
const SKY_COLOR_B = '#afb6c7';
const SKY_INTRO_COLOR = '#b3bac9';

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

function createLayerMaterial({
  map,
  triangles,
  accent = '#9eb8e6',
  brightness = 1,
  triangleStrength = 0.25,
  opacity = 1,
  blending = THREE.NormalBlending,
  side = THREE.FrontSide
}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uWhiten: { value: 0 },
      uBrightness: { value: brightness },
      uTriangleStrength: { value: triangleStrength },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uAccent: { value: new THREE.Color(accent) },
      uHasMap: { value: map ? 1 : 0 },
      uHasTriangles: { value: triangles ? 1 : 0 },
      tMap: { value: map ?? null },
      tTriangles: { value: triangles ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      varying float vFogDepth;

      void main() {
        vUv = uv;
        vPos = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uWhiten;
      uniform float uBrightness;
      uniform float uTriangleStrength;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uHasMap;
      uniform float uHasTriangles;
      uniform vec3 uAccent;
      uniform sampler2D tMap;
      uniform sampler2D tTriangles;

      varying vec2 vUv;
      varying vec3 vPos;
      varying float vFogDepth;

      void main() {
        vec3 baseSample = texture2D(tMap, vUv).rgb;
        vec3 baseColor = mix(vec3(1.0), baseSample, uHasMap) * uBrightness;
        float triangle = texture2D(tTriangles, vUv * 2.8 + vec2(uTime * 0.018, -uTime * 0.012)).r;
        triangle *= uHasTriangles;
        float flicker = sin(uTime * 1.3 + vPos.x * 0.8 + vPos.z * 0.65) * 0.5 + 0.5;
        vec3 color = baseColor + uAccent * triangle * flicker * uTriangleStrength;
        float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
        color = mix(color, uFogColor * 1.04 + smoothstep(0.45, 1.0, baseColor.r) * 0.08, fogFactor);
        color = mix(color, vec3(0.965, 0.975, 1.0), uWhiten * 0.78);
        float alpha = mix(uOpacity, uOpacity * 0.45, fogFactor);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: blending === THREE.NormalBlending,
    depthTest: true,
    blending,
    side
  });
}

function createMountainMaterial({ map, triangles, noise }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor1: { value: new THREE.Color(SKY_COLOR_A) },
      uColor2: { value: new THREE.Color(SKY_COLOR_B) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uProgress: { value: 1 },
      uProgress2: { value: 1 },
      uTriangleAlpha: { value: 1 },
      uAlpha: { value: 1 },
      tMap: { value: map ?? null },
      tTriangles: { value: triangles ?? null },
      tNoise: { value: noise ?? null },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec4 vMvPos;

      void main() {
        vUv = uv;
        vPos = position;
        vMvPos = modelViewMatrix * vec4(position, 1.0);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * vMvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec2 uResolution;
      uniform sampler2D tMap;
      uniform sampler2D tTriangles;
      uniform sampler2D tNoise;
      uniform float uProgress;
      uniform float uProgress2;
      uniform float uTriangleAlpha;
      uniform float uAlpha;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec4 vMvPos;
      varying vec3 vWorldPos;

      float falloff(float value, float start, float end, float width, float progress) {
        float edge = mix(start, end, clamp(progress, 0.0, 1.0));
        return smoothstep(edge - width, edge, value) * (1.0 - smoothstep(edge, edge + width, value));
      }

      float falloffSmooth(float value, float start, float end, float width, float progress) {
        float edge = mix(start, end, clamp(progress, 0.0, 1.0));
        return smoothstep(edge - width, edge + width, value);
      }

      void main() {
        vec2 safeResolution = max(uResolution, vec2(1.0));
        vec2 screenUv = gl_FragCoord.xy / safeResolution;
        float grad = pow((screenUv.x + screenUv.y) * 0.5, 2.0);
        vec3 fogColor = mix(uColor2, uColor1, grad);

        vec3 color = texture2D(tMap, vUv).rgb;
        float alpha = 1.0;

        float distanceFog = clamp(-vMvPos.z * 0.005, 0.0, 1.0);
        float fog = clamp(1.0 - vWorldPos.y * 0.05 - 0.5, 0.0, 1.0);
        fog += distanceFog * 0.75;

        if (uProgress2 < 0.999) {
          vec3 originalColor = color;
          float noiseSample = texture2D(tNoise, vWorldPos.xz * 0.07).r;
          float trianglesSample = texture2D(tTriangles, vWorldPos.xz * 0.25).r;
          vec3 blue = vec3(0.3, 0.45, 1.0);
          float inputGradient = length(vWorldPos.xz) + noiseSample * 3.5;

          float backgroundMask = smoothstep(32.0, 36.0, inputGradient);
          float foregroundMask = 1.0 - backgroundMask;

          alpha = backgroundMask * uAlpha;

          vec3 terrainShockwaveColor = vec3(0.0);
          float terrainShockwaveAlpha = 0.0;
          float terrainFalloff = 1.0 - falloffSmooth(inputGradient, 0.0, 32.0, 8.0, uProgress2);
          float terrainFalloff2 = 1.0 - falloffSmooth(inputGradient, 0.0, 32.0, 3.0, uProgress2);
          terrainShockwaveColor += terrainFalloff * trianglesSample * blue * 3.0;
          terrainShockwaveColor += terrainFalloff2 * blue;
          terrainShockwaveAlpha += falloff(inputGradient, -0.1, 31.9, 0.1, uProgress2);

          vec3 triangleShockwaveColor = vec3(0.0);
          float triangleShockwaveAlpha = 0.0;
          float triangleFalloff = 1.0 - falloffSmooth(inputGradient, 0.0, 32.0, 10.0, uProgress);
          triangleShockwaveColor += blue;
          triangleShockwaveAlpha += falloff(inputGradient, 1.0, 33.0, 0.1, uProgress);
          triangleShockwaveAlpha *= triangleFalloff;
          triangleShockwaveAlpha *= trianglesSample * uTriangleAlpha;

          color += terrainShockwaveColor * foregroundMask;
          alpha += terrainShockwaveAlpha * foregroundMask;

          color += triangleShockwaveColor * (1.0 - terrainShockwaveAlpha) * foregroundMask;
          alpha += triangleShockwaveAlpha * (1.0 - terrainShockwaveAlpha) * foregroundMask;

          float endMix = smoothstep(0.8, 1.0, uProgress2);
          color = mix(color, originalColor, endMix);
        }

        alpha = clamp(alpha, 0.0, 1.0);
        alpha *= 1.0 - smoothstep(0.7, 0.9, length(vPos.xz) * 0.1085);
        color = clamp(color, vec3(0.0), vec3(1.0));
        color = mix(color, fogColor * 1.1 + smoothstep(0.5, 1.0, color.r), clamp(fog, 0.0, 1.0));

        alpha *= uAlpha;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true,
  });
}

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 1 },
      uWhiten: { value: 0 },
      uColor1: { value: new THREE.Color(SKY_COLOR_A) },
      uColor2: { value: new THREE.Color(SKY_COLOR_B) },
      uIntroColor: { value: new THREE.Color(SKY_INTRO_COLOR) }
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;

      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uWhiten;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uIntroColor;

      varying vec3 vPos;

      void main() {
        float grad = smoothstep(-0.2, 0.85, normalize(vPos).y * 0.5 + 0.5);
        vec3 color = mix(uColor2, uColor1, grad);
        color = mix(uIntroColor, color, uProgress);
        color = mix(color, vec3(0.96, 0.97, 0.985), uWhiten * 0.92);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
}

function createIglooBaseMaterial({
  map,
  groundGlow,
  wind
}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uWhiten: { value: 0 },
      tMap: { value: map ?? null },
      tGroundGlow: { value: groundGlow ?? null },
      tWind: { value: wind ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vPos = position;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      uniform float uWhiten;
      uniform sampler2D tMap;
      uniform sampler2D tGroundGlow;
      uniform sampler2D tWind;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;

      void main() {
        vec3 terrainColor = texture2D(tMap, vUv).rgb;

        vec3 glow = texture2D(tGroundGlow, vUv).rgb;
        float glowStrength = sin(vPos.x - uTime + 3.2) * 0.5 + 0.5;
        terrainColor += glow * glowStrength * terrainColor.r;

        float verticalGrad = 1.0 - clamp(vPos.y * 0.3 + 1.1, 0.0, 1.0);
        float windA = texture2D(tWind, vWorldPos.xz * 0.15 + vUv * 0.1 + vec2(-uTime * 0.15, -uTime * 0.15)).r;
        float windB = texture2D(tWind, vWorldPos.xz * 0.17 + vUv * 0.1 + vec2(-uTime * 0.15, -uTime * 0.15)).r;
        float wind = windA * windB * verticalGrad;
        terrainColor = mix(terrainColor, vec3(1.0), wind * 2.8);
        terrainColor = mix(terrainColor, vec3(0.965, 0.972, 0.985), uWhiten * 0.9);

        float alpha = 1.0 - smoothstep(0.8, 1.0, length(vPos.xz) * 0.1085);
        alpha = clamp(alpha, 0.0, 1.0) * uAlpha;

        gl_FragColor = vec4(clamp(terrainColor, vec3(0.0), vec3(1.0)), alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true
  });
}

function createIglooShellMaterial({
  map,
  explodedMap,
  triangles,
  noise
}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uWhiten: { value: 0 },
      uDisplacementMix: { value: 0 },
      tMap: { value: map ?? null },
      tMapExploded: { value: explodedMap ?? null },
      tTriangles: { value: triangles ?? null },
      tNoise: { value: noise ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vPos = position;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      uniform float uWhiten;
      uniform float uDisplacementMix;
      uniform sampler2D tMap;
      uniform sampler2D tMapExploded;
      uniform sampler2D tTriangles;
      uniform sampler2D tNoise;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 color = texture2D(tMap, vUv).rgb;
        vec3 exploded = texture2D(tMapExploded, vUv).rgb + 0.05;
        vec3 blue = vec3(0.5, 0.7, 1.0);

        color = mix(color, exploded, clamp(uDisplacementMix, 0.0, 1.0));

        float trianglesMask = texture2D(tTriangles, vUv * 5.0 + vec2(uTime * 0.012, -uTime * 0.009)).r;
        float noiseMask = texture2D(tNoise, vUv * 2.0 + vec2(uTime * 0.018, uTime * 0.011)).r;
        float idlePulse = sin(vPos.x - uTime + 3.2) * 0.5 + 0.5;

        color += pow(trianglesMask, 2.0) * blue * (0.08 + noiseMask * 0.08) * idlePulse;
        color += max(0.0, smoothstep(0.0, 2.0, vPos.x * 0.5 - vPos.z * 0.5)) * blue * 0.08;
        color += (vPos.x * 0.1 + 0.4) * 0.15 * min(vPos.y + 0.5, 1.0);
        color += (1.0 - smoothstep(-1.5, 1.0, vPos.y)) * vec3(0.8, 0.9, 1.0) * 0.1;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDir), 0.0), 2.0);
        color += blue * fresnel * 0.12;
        color = mix(color, vec3(0.95, 0.962, 0.985), uWhiten * 0.72);

        gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), uAlpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true
  });
}

function createCloudMaterial({ map, noise, tint = '#8ed9ff', opacity = 0.16 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uWhiten: { value: 0 },
      uTint: { value: new THREE.Color(tint) },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uHasMap: { value: map ? 1 : 0 },
      uHasNoise: { value: noise ? 1 : 0 },
      tMap: { value: map ?? null },
      tNoise: { value: noise ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFogDepth;

      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uWhiten;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uHasMap;
      uniform float uHasNoise;
      uniform vec3 uTint;
      uniform sampler2D tMap;
      uniform sampler2D tNoise;

      varying vec2 vUv;
      varying float vFogDepth;

      void main() {
        vec2 flowUv = vUv * 1.45 + vec2(uTime * 0.008, -uTime * 0.004);
        vec2 flow = (texture2D(tNoise, flowUv).rg - 0.5) * 0.18 * uHasNoise;
        float cloud = texture2D(tMap, vUv * 1.15 + flow).r;
        cloud = mix(1.0, cloud, uHasMap);

        float fadeX = smoothstep(0.0, 0.22, vUv.x) * smoothstep(0.0, 0.22, 1.0 - vUv.x);
        float fadeY = smoothstep(0.0, 0.18, vUv.y) * smoothstep(0.0, 0.18, 1.0 - vUv.y);
        float radial = 1.0 - smoothstep(0.38, 0.92, length(vUv - 0.5) * 1.7);
        float alpha = smoothstep(0.22, 0.9, cloud) * fadeX * fadeY * radial * uOpacity;
        vec3 color = uTint * mix(0.42, 1.0, cloud);
        float fogFactor = smoothstep(uFogNear * 0.8, uFogFar, vFogDepth);
        color = mix(color, uFogColor, fogFactor);
        color = mix(color, vec3(0.97, 0.978, 0.99), uWhiten * 0.94);
        alpha *= 1.0 - fogFactor * 0.6;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

function createPointMaterial({ color = '#ffffff', opacity = 0.3, size = 44 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: opacity },
      uWhiten: { value: 0 },
      uSize: { value: size },
      uJitter: { value: 0.3 },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;

      uniform float uTime;
      uniform float uSize;
      uniform float uJitter;

      varying float vSeed;
      varying float vFogDepth;

      void main() {
        vSeed = aSeed;

        vec3 transformed = position;
        transformed.x += sin(uTime * 0.6 + aSeed * 12.0 + position.y * 0.14) * 0.22 * uJitter;
        transformed.y += sin(uTime * 0.45 + aSeed * 9.0) * 0.08 * uJitter;
        transformed.z += cos(uTime * 0.52 + aSeed * 7.0 + position.x * 0.11) * 0.18 * uJitter;

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * (0.75 + fract(aSeed * 19.17) * 0.85) / max(1.0, -mvPosition.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      uniform float uWhiten;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uColor;

      varying float vSeed;
      varying float vFogDepth;

      void main() {
        vec2 centeredUv = gl_PointCoord - 0.5;
        float dist = length(centeredUv);
        float alpha = smoothstep(0.5, 0.0, dist);
        float sparkle = 0.68 + 0.32 * sin(vSeed * 41.0 + uTime * 2.2);
        float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
        vec3 color = mix(uColor * sparkle, uFogColor, fogFactor);
        color = mix(color, vec3(0.98, 0.985, 1.0), uWhiten * 0.9);
        gl_FragColor = vec4(color, alpha * uAlpha * (1.0 - fogFactor * 0.45));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
}

function addSeedAttribute(geometry) {
  const prepared = geometry.clone();
  const count = prepared.getAttribute('position')?.count ?? 0;
  const seeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    seeds[index] = Math.random();
  }

  prepared.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return prepared;
}

function createSnowField(count = 180) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const radius = 2.5 + Math.random() * 10.5;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.random() * 8.8;
    const z = -2 + (Math.random() - 0.5) * 18;

    positions[index * 3 + 0] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    basePositions[index * 3 + 0] = x;
    basePositions[index * 3 + 1] = y;
    basePositions[index * 3 + 2] = z;
    seeds[index] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  return { geometry, basePositions, seeds };
}

export class IglooScene extends SceneBase {
  constructor({ assets }) {
    super({
      name: 'igloo',
      background: '#c7ccd5'
    });

    this.assets = assets;
    this.shaderMaterials = [];
    this.mountains = [];
    this.terrainChunks = [];
    this.terrainPatches = [];
    this.smokeLayers = [];
    this.floorBaseColor = new THREE.Color('#c1c7d2');
    this.introProgress = 1;
    this.initialScrollAutocenter = 0.495;
    this.finalScrollAutocenter = 0.495;
    this.introCameraPosition = new THREE.Vector3(-14, 21, 14);
    this.introCameraTarget = new THREE.Vector3(0, 0.95, 0);
    this.timelineStartCameraPosition = new THREE.Vector3(-13.25, 2.5, 13.25);
    this.timelineStartCameraTarget = new THREE.Vector3(0, 1, 0);
    this.timelineEndCameraPosition = new THREE.Vector3(-15.25, 2.5, 23.25);
    this.timelineEndCameraTarget = new THREE.Vector3(0, 1, 0);
    this._cameraPositionA = new THREE.Vector3();
    this._cameraTargetA = new THREE.Vector3();
    this.presentationState = this.computePresentationState(0);

    this.camera.fov = 30;
    this.camera.far = 1020;
    this.camera.updateProjectionMatrix();

    const ambient = new THREE.AmbientLight('#f3f6fb', 1.35);
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.2);
    keyLight.position.set(8, 10, 4);
    this.fillLight = new THREE.PointLight('#dcecff', 4.5, 26, 2);
    this.fillLight.position.set(-1.2, 1.45, 2.6);
    this.add(ambient, keyLight, this.fillLight);

    const iglooGeometry = prepareGeometry(assets.get('geometry', 'igloo-shell'), {
      center: false,
      scaleToSize: false
    }) || new THREE.SphereGeometry(1.5, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const iglooOutlineGeometry = prepareGeometry(assets.get('geometry', 'igloo-outline'), {
      center: false,
      scaleToSize: false,
      recomputeNormals: false
    });
    const iglooCageGeometry = prepareGeometry(assets.get('geometry', 'igloo-cage'), {
      center: false,
      scaleToSize: false,
      recomputeNormals: false
    });
    const mountainGeometry = prepareGeometry(assets.get('geometry', 'mountain'), {
      center: false,
      scaleToSize: false
    });
    const patchGeometry = prepareGeometry(assets.get('geometry', 'igloo-patch'), {
      center: false,
      scaleToSize: false
    });
    const groundGeometry = prepareGeometry(assets.get('geometry', 'ground'), {
      center: false,
      scaleToSize: false
    }) || new THREE.CircleGeometry(5, 64);
    const introParticleGeometry = assets.get('geometry', 'intro-particles')
      ? addSeedAttribute(prepareGeometry(assets.get('geometry', 'intro-particles'), {
        center: false,
        scaleToSize: false,
        recomputeNormals: false
      }))
      : null;

    const iglooColor = assets.get('texture', 'igloo-color');
    const iglooExplodedColor = assets.get('texture', 'igloo-exploded-color');
    const groundColor = assets.get('texture', 'ground-color');
    const groundGlow = assets.get('texture', 'ground-glow');
    const groundSansIglooColor = assets.get('texture', 'ground-sansigloo-color');
    const mountainColor = assets.get('texture', 'mountain-color');
    const trianglesTiling = assets.get('texture', 'triangles-tiling');
    const mosaicNoise = assets.get('texture', 'mosaic-noise');
    const cloudsNoise = assets.get('texture', 'clouds-noise');
    const windNoise = assets.get('texture', 'wind-noise');
    const shellNoise = assets.get('texture', 'detail-perlin') ?? windNoise;

    this.skyGlow = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), createSkyMaterial());
    this.skyGlow.rotation.x = THREE.MathUtils.degToRad(16);
    this.skyGlow.rotation.z = THREE.MathUtils.degToRad(-16);
    this.root.add(this.skyGlow);
    this.shaderMaterials.push(this.skyGlow.material);

    this.floor = new THREE.Mesh(
      groundGeometry,
      createIglooBaseMaterial({
        map: groundColor,
        groundGlow,
        wind: windNoise
      })
    );
    this.floor.renderOrder = 2;
    this.root.add(this.floor);
    this.shaderMaterials.push(this.floor.material);

    this.dome = new THREE.Mesh(
      iglooGeometry,
      createIglooShellMaterial({
        map: iglooColor,
        explodedMap: iglooExplodedColor,
        triangles: trianglesTiling,
        noise: shellNoise
      })
    );
    this.dome.renderOrder = 3;
    this.root.add(this.dome);
    this.shaderMaterials.push(this.dome.material);

    if (iglooOutlineGeometry) {
      this.outline = new THREE.Mesh(
        iglooOutlineGeometry,
        new THREE.MeshBasicMaterial({
          color: '#cfe5ff',
          transparent: true,
          opacity: 0.08,
          wireframe: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      this.root.add(this.outline);
    }

    if (iglooCageGeometry) {
      this.cage = new THREE.Mesh(
        iglooCageGeometry,
        new THREE.MeshBasicMaterial({
          color: '#ddf3ff',
          transparent: true,
          opacity: 0.07,
          wireframe: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      this.cage.scale.setScalar(1.025);
      this.root.add(this.cage);
    }

    if (mountainGeometry) {
      const mountainSpecs = [
        { position: [59.53, -1.0, -11.84], scale: [4.0, 3.14, 4.0], rotation: [0.0716, -0.7470, 0.0873] },
        { position: [1.0, -2.21, -23.0], scale: [2.0, 2.0, 2.0], rotation: [0.0611, 0.5236, 0.0] },
        { position: [75.0, 0.0, -90.0], scale: [8.0, 8.0, 8.0], rotation: [0.0559, -0.2915, -0.0454] },
        { position: [250.0, 11.33, -133.0], scale: [10.0, 10.0, 10.0], rotation: [0.2304, 0.3491, 0.0873] },
        { position: [-25.22, -1.59, -53.05], scale: [2.5, 2.5, 2.5], rotation: [0.0611, 0.4363, 0.0] }
      ];

      mountainSpecs.forEach((specification) => {
        const mesh = new THREE.Mesh(
          mountainGeometry,
          createMountainMaterial({
            map: mountainColor,
            triangles: trianglesTiling,
            noise: mosaicNoise,
          }),
        );

        mesh.position.set(...specification.position);
        mesh.scale.set(...specification.scale);
        mesh.rotation.set(...specification.rotation);
        mesh.renderOrder = 1;
        this.root.add(mesh);
        this.mountains.push({
          mesh,
          basePosition: mesh.position.clone(),
          baseRotation: mesh.rotation.clone()
        });
        this.shaderMaterials.push(mesh.material);
      });
    }

    if (groundGeometry) {
      const terrainSpecs = [
        { position: [-3.76, -0.58, 12.5], scale: [0.6, 0.6, 0.6], rotation: [-0.0890, 0.0, 0.0] },
        { position: [-17.63, -0.01, 2.0], scale: [1.0, 1.0, 1.0], rotation: [0.0471, 0.0140, 0.0] },
        { position: [3.12, -0.75, -1.02], scale: [1.5, 0.66, 1.5], rotation: [0.0, 0.0, 0.0] },
        { position: [6.0, 0.16, 15.78], scale: [1.0, 1.0, 1.0], rotation: [0.0192, 0.0, 0.1222] },
        { position: [16.06, 0.34, 4.0], scale: [1.0, 1.0, 1.0], rotation: [0.0, 0.0, 0.0] }
      ];

      terrainSpecs.forEach((specification) => {
        const mesh = new THREE.Mesh(
          groundGeometry.clone(),
          createLayerMaterial({
            map: groundSansIglooColor,
            triangles: trianglesTiling,
            accent: '#8ab6ff',
            brightness: 0.96,
            triangleStrength: 0.04,
            opacity: 0.95,
            side: THREE.DoubleSide
          })
        );

        mesh.position.set(...specification.position);
        mesh.scale.set(...specification.scale);
        mesh.rotation.set(...specification.rotation);
        this.root.add(mesh);
        this.terrainChunks.push({
          mesh,
          basePosition: mesh.position.clone(),
          baseRotation: mesh.rotation.clone(),
          baseScale: mesh.scale.clone()
        });
        this.shaderMaterials.push(mesh.material);
      });
    }

    if (patchGeometry) {
      const patchSpecs = [
        { position: [-9.34, -1.77, 6.96], scale: [7.0, 7.0, 7.0], rotation: [0.0, 0.0, 0.0] },
        { position: [-8.82, -1.35, 11.69], scale: [8.0, 8.0, 8.0], rotation: [-0.0960, -0.4468, 0.0] }
      ];

      patchSpecs.forEach((specification) => {
        const mesh = new THREE.Mesh(
          patchGeometry,
          createLayerMaterial({
            map: groundSansIglooColor,
            triangles: trianglesTiling,
            accent: '#8ab6ff',
            brightness: 0.94,
            triangleStrength: 0.045,
            opacity: 0.88,
            side: THREE.DoubleSide
          })
        );

        mesh.position.set(...specification.position);
        mesh.scale.set(...specification.scale);
        mesh.rotation.set(...specification.rotation);
        this.root.add(mesh);
        this.terrainPatches.push({
          mesh,
          basePosition: mesh.position.clone(),
          baseRotation: mesh.rotation.clone(),
          baseScale: mesh.scale.clone()
        });
        this.shaderMaterials.push(mesh.material);
      });
    }

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.48, 0.028, 16, 96),
      new THREE.MeshBasicMaterial({
        color: '#8ed9ff',
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.ring.rotation.x = Math.PI * 0.5;
    this.ring.visible = false;
    this.root.add(this.ring);

    if (cloudsNoise || windNoise) {
      const smokeSpecs = [
        { position: [-5, 1.25, -10], scale: [10.8, 3.2, 1], tint: '#f6f9ff', speed: 0.7, rotationY: 0 },
        { position: [13.45, 3, -4], scale: [11.6, 3.4, 1], tint: '#eef3ff', speed: 1.05, rotationY: THREE.MathUtils.degToRad(-10) }
      ];

      smokeSpecs.forEach((specification, index) => {
        const material = createCloudMaterial({
          map: cloudsNoise,
          noise: windNoise,
          tint: specification.tint,
          opacity: index === 0 ? 0.12 : 0.1
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.45), material);
        mesh.position.set(...specification.position);
        mesh.scale.set(...specification.scale);
        mesh.rotation.y = specification.rotationY;
        mesh.renderOrder = 2;
        this.root.add(mesh);
        this.smokeLayers.push({
          mesh,
          basePosition: mesh.position.clone(),
          baseScale: mesh.scale.clone(),
          speed: specification.speed
        });
        this.shaderMaterials.push(material);
      });
    }

    if (introParticleGeometry) {
      this.introParticles = new THREE.Points(
        introParticleGeometry,
        createPointMaterial({
          color: '#d7eeff',
          opacity: 0.4,
          size: 48
        })
      );
      this.introParticles.position.set(0, 1.2, -0.2);
      this.introParticles.renderOrder = 6;
      this.root.add(this.introParticles);
      this.shaderMaterials.push(this.introParticles.material);
    }

    const snowField = createSnowField(150);
    this.snowBasePositions = snowField.basePositions;
    this.snowSeeds = snowField.seeds;
    this.snowParticles = new THREE.Points(
      snowField.geometry,
      createPointMaterial({
        color: '#f5fbff',
        opacity: 0.24,
        size: 42
      })
    );
    this.snowParticles.position.y = -0.25;
    this.snowParticles.renderOrder = 5;
    this.root.add(this.snowParticles);
    this.shaderMaterials.push(this.snowParticles.material);

    this.camera.position.copy(this.timelineStartCameraPosition);
    this.camera.lookAt(this.timelineStartCameraTarget);
  }

  computePresentationState(progress = this.progress) {
    const exitFade = 1 - smoothWindow(progress, 0.78, 0.9);
    const introPresence = this.introProgress * exitFade;
    const introParticlesPresence = 1 - this.introProgress;
    const cameraProgress = this.introProgress;

    return {
      panelProgress: introPresence,
      brandProgress: introPresence,
      titleProgress: introPresence,
      textProgress: introPresence,
      legalProgress: introPresence,
      introParticlesProgress: introParticlesPresence,
      cameraProgress,
      whiteoutProgress: smoothWindow(progress, 0.58, 0.92)
    };
  }

  getPresentationState() {
    return { ...this.presentationState };
  }

  getColorCorrectionState() {
    const whiteoutProgress = this.presentationState.whiteoutProgress ?? 0;
    return {
      profile: 'igloo',
      gradientAlpha: THREE.MathUtils.lerp(0.9, 0.24, whiteoutProgress),
      lutIntensity: THREE.MathUtils.lerp(1, 0.62, whiteoutProgress)
    };
  }

  getInitialAutoCenterProgress() {
    return this.initialScrollAutocenter;
  }

  getFinalAutoCenterProgress() {
    return this.finalScrollAutocenter;
  }

  getAutoCenterProgress() {
    return this.finalScrollAutocenter;
  }

  setPointer(pointer = null) {
    void pointer;
  }

  setSize(width, height) {
    super.setSize(width, height);

    if (this.camera.isPerspectiveCamera) {
      this.camera.zoom = Math.min(1, (width / height) * 1.25);
      this.camera.updateProjectionMatrix();
    }
  }

  prepareForRender(renderer, renderState = {}) {
    void renderer;
    const width = renderState.renderWidth ?? renderState.width ?? 1;
    const height = renderState.renderHeight ?? renderState.height ?? 1;

    this.mountains.forEach(({ mesh }) => {
      const resolution = mesh.material?.uniforms?.uResolution?.value;

      if (resolution) {
        resolution.set(width, height);
      }
    });
  }

  updateSnowField(elapsed, strength) {
    if (!this.snowParticles) {
      return;
    }

    const positions = this.snowParticles.geometry.getAttribute('position');

    for (let index = 0; index < this.snowSeeds.length; index += 1) {
      const seed = this.snowSeeds[index];
      const baseX = this.snowBasePositions[index * 3 + 0];
      const baseY = this.snowBasePositions[index * 3 + 1];
      const baseZ = this.snowBasePositions[index * 3 + 2];
      const fall = (elapsed * (0.16 + seed * 0.22) + seed * 9.0) % 1;

      positions.array[index * 3 + 0] = baseX + Math.sin(elapsed * (0.45 + seed * 0.25) + seed * 14.0) * 0.45 * strength;
      positions.array[index * 3 + 1] = (1 - fall) * 9.5 - 0.8 + Math.sin(elapsed * 0.6 + seed * 17.0) * 0.08;
      positions.array[index * 3 + 2] = baseZ + Math.cos(elapsed * (0.35 + seed * 0.18) + baseY * 0.08) * 0.32 * strength;
    }

    positions.needsUpdate = true;
  }

  update(delta, elapsed) {
    const presentation = this.computePresentationState(this.progress);
    this.presentationState = presentation;

    const introPresence = 1 - this.introProgress;
    const sectionPresence = 1 - smoothWindow(this.progress, 0.72, 1);
    const snowPresence = sectionPresence * 0.7;
    const smokePresence = sectionPresence;
    const timelineWeight = smoothWindow(this.progress, 0.14, 1);
    const whiteoutProgress = smoothWindow(this.progress, 0.56, 0.9);

    this.root.rotation.y = Math.sin(elapsed * 0.05) * 0.006 * sectionPresence;
    this.dome.rotation.y += delta * 0.01;
    this.dome.position.y = 0;
    this.dome.material.uniforms.uDisplacementMix.value = introPresence * 0.6;
    this.dome.material.uniforms.uAlpha.value = sectionPresence;
    this.floor.material.uniforms.uAlpha.value = sectionPresence;
    this.fillLight.intensity = THREE.MathUtils.lerp(4.5, 2.8, this.progress);

    if (this.outline) {
      this.outline.rotation.y += delta * 0.012;
      this.outline.position.y = this.dome.position.y + 0.03;
      this.outline.material.opacity = introPresence * 0.22;
      this.outline.visible = this.outline.material.opacity > 0.001;
    }

    if (this.cage) {
      this.cage.rotation.y -= delta * 0.05;
      this.cage.position.y = this.dome.position.y + 0.06;
      this.cage.scale.setScalar(1.014 + introPresence * 0.03);
      this.cage.material.opacity = introPresence * 0.28;
      this.cage.visible = this.cage.material.opacity > 0.001;
    }

    this.shaderMaterials.forEach((material, index) => {
      if (material.uniforms?.uTime) {
        material.uniforms.uTime.value = elapsed + index * 0.3;
      }

      if (material.uniforms?.uWhiten) {
        material.uniforms.uWhiten.value = whiteoutProgress;
      }
    });

    this.mountains.forEach(({ mesh, basePosition }, index) => {
      mesh.position.set(
        basePosition.x,
        basePosition.y,
        basePosition.z
      );
      if (mesh.material.uniforms.uAlpha) {
        mesh.material.uniforms.uAlpha.value = sectionPresence;
      }
      if (mesh.material.uniforms.uProgress) {
        mesh.material.uniforms.uProgress.value = this.introProgress;
      }
      if (mesh.material.uniforms.uProgress2) {
        mesh.material.uniforms.uProgress2.value = this.introProgress;
      }
    });

    this.terrainChunks.forEach(({ mesh, basePosition, baseRotation }, index) => {
      mesh.position.set(
        basePosition.x,
        basePosition.y,
        basePosition.z
      );
      mesh.rotation.set(
        baseRotation.x,
        baseRotation.y,
        baseRotation.z
      );
      mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.95, 0.8, this.progress) * sectionPresence;
      mesh.material.uniforms.uTriangleStrength.value = THREE.MathUtils.lerp(0.04, 0.015, this.progress);
    });

    this.terrainPatches.forEach(({ mesh, basePosition, baseRotation }, index) => {
      mesh.position.set(
        basePosition.x,
        basePosition.y,
        basePosition.z
      );
      mesh.rotation.set(
        baseRotation.x,
        baseRotation.y,
        baseRotation.z
      );
      mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.88, 0.72, this.progress) * sectionPresence;
      mesh.material.uniforms.uTriangleStrength.value = THREE.MathUtils.lerp(0.045, 0.018, this.progress);
    });

    this.smokeLayers.forEach(({ mesh, basePosition, baseScale, speed }, index) => {
      mesh.position.set(
        basePosition.x + Math.sin(elapsed * 0.12 * speed + index) * 0.6,
        basePosition.y + Math.cos(elapsed * 0.16 * speed + index * 2.0) * 0.18,
        basePosition.z
      );
      mesh.scale.set(
        baseScale.x * (1 + Math.sin(elapsed * 0.15 * speed + index) * 0.045 + whiteoutProgress * 1.35),
        baseScale.y * (1 + Math.cos(elapsed * 0.11 * speed + index * 1.5) * 0.035 + whiteoutProgress * 0.82),
        baseScale.z
      );
      mesh.material.uniforms.uOpacity.value = smokePresence * ((index === 0 ? 0.12 : 0.1) + whiteoutProgress * (index === 0 ? 0.3 : 0.24));
    });

    if (this.introParticles) {
      this.introParticles.rotation.y += delta * 0.06;
      this.introParticles.position.y = 1.2 + Math.sin(elapsed * 0.3) * 0.08;
      this.introParticles.material.uniforms.uAlpha.value = introPresence * 0.24;
      this.introParticles.material.uniforms.uJitter.value = THREE.MathUtils.lerp(0.85, 0.18, this.progress);
    }

    if (this.snowParticles) {
      this.snowParticles.material.uniforms.uAlpha.value = snowPresence * 0.2;
      this.snowParticles.material.uniforms.uJitter.value = 0.35;
      this.updateSnowField(elapsed, THREE.MathUtils.lerp(0.35, 1, snowPresence));
    }

    if (this.skyGlow) {
      this.skyGlow.material.uniforms.uProgress.value = this.introProgress;
      this.skyGlow.scale.setScalar(1);
    }

    this._cameraPositionA.lerpVectors(
      this.introCameraPosition,
      this.timelineStartCameraPosition,
      presentation.cameraProgress
    );
    this.camera.position.lerpVectors(
      this._cameraPositionA,
      this.timelineEndCameraPosition,
      timelineWeight
    );

    this._cameraTargetA.lerpVectors(
      this.introCameraTarget,
      this.timelineStartCameraTarget,
      presentation.cameraProgress
    );
    this._cameraTargetA.lerp(this.timelineEndCameraTarget, timelineWeight);
    this.camera.lookAt(this._cameraTargetA.x, this._cameraTargetA.y, this._cameraTargetA.z);
  }
}

