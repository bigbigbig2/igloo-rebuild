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

function fitRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) {
    return value >= inMax ? outMax : outMin;
  }

  const normalized = clamp01((value - inMin) / (inMax - inMin));
  return THREE.MathUtils.lerp(outMin, outMax, normalized);
}

function fpsLerp(current, target, amount, delta) {
  const alpha = 1 - Math.pow(1 - amount, delta * 60);
  return THREE.MathUtils.lerp(current, target, alpha);
}

function easeSineIn(value) {
  return 1 - Math.cos(clamp01(value) * Math.PI * 0.5);
}

function ramp(value, start, duration) {
  return smoothWindow(value, start, start + duration);
}

function fadeWindow(value, fadeInStart, fadeInDuration, fadeOutStart, fadeOutDuration) {
  return ramp(value, fadeInStart, fadeInDuration) * (1 - ramp(value, fadeOutStart, fadeOutDuration));
}

function createIglooPieceAnimationData(sourceGeometry) {
  if (
    !sourceGeometry
    || !sourceGeometry.getAttribute?.('centr')
    || !sourceGeometry.getAttribute?.('rand')
  ) {
    return {
      geometry: sourceGeometry,
      pieces: [],
      optionsTexture: null,
      textureSize: 1
    };
  }

  const geometry = sourceGeometry.clone();
  const positionAttribute = geometry.getAttribute('position');
  const centroidAttribute = geometry.getAttribute('centr');
  const randomAttribute = geometry.getAttribute('rand');
  let emissionAttribute = geometry.getAttribute('emission');
  const batchIdAttribute = geometry.getAttribute('batchId');
  const vertexCount = positionAttribute?.count ?? 0;
  const pieceIds = new Float32Array(vertexCount);
  const pieces = [];
  const pieceIndexByKey = new Map();

  if (!emissionAttribute && vertexCount > 0) {
    emissionAttribute = new THREE.BufferAttribute(new Float32Array(vertexCount), 1);
    geometry.setAttribute('emission', emissionAttribute);
  }

  for (let index = 0; index < vertexCount; index += 1) {
    const centroidX = centroidAttribute.getX(index);
    const centroidY = centroidAttribute.getY(index);
    const centroidZ = centroidAttribute.getZ(index);
    const batchId = batchIdAttribute ? Math.round(batchIdAttribute.getX(index)) : null;
    const pieceKey = batchId ?? `${centroidX.toFixed(5)}|${centroidY.toFixed(5)}|${centroidZ.toFixed(5)}`;
    let pieceIndex = pieceIndexByKey.get(pieceKey);

    if (pieceIndex == null) {
      pieceIndex = batchId ?? pieces.length;
      pieceIndexByKey.set(pieceKey, pieceIndex);
      pieces[pieceIndex] = {
        pieceIndex,
        centroid: new THREE.Vector3(centroidX, centroidY, centroidZ),
        rand: new THREE.Vector3(
          randomAttribute.getX(index),
          randomAttribute.getY(index),
          randomAttribute.getZ(index)
        ),
        emission: emissionAttribute ? emissionAttribute.getX(index) : 0,
        targetDisplacement1: 0,
        targetDisplacement2: 0,
        targetBounce1: 0,
        targetBounce2: 0,
        displacement: 0,
        scrollDisplacement1: 0,
        scrollDisplacement2: 0,
        bounce: 0
      };
    }

    pieceIds[index] = pieceIndex;
  }

  geometry.setAttribute('aPieceId', new THREE.BufferAttribute(pieceIds, 1));

  const pieceCount = pieces.length;
  const textureSize = Math.max(4, Math.ceil(Math.sqrt(pieceCount)));
  const optionsData = new Float32Array(textureSize * textureSize * 4);
  const optionsTexture = new THREE.DataTexture(
    optionsData,
    textureSize,
    textureSize,
    THREE.RGBAFormat,
    THREE.FloatType
  );

  optionsTexture.needsUpdate = true;
  optionsTexture.minFilter = THREE.NearestFilter;
  optionsTexture.magFilter = THREE.NearestFilter;
  optionsTexture.generateMipmaps = false;
  optionsTexture.wrapS = THREE.ClampToEdgeWrapping;
  optionsTexture.wrapT = THREE.ClampToEdgeWrapping;

  return {
    geometry,
    pieces,
    optionsData,
    optionsTexture,
    textureSize
  };
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
  wind,
  triangles,
  noise,
  mousePosition
}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uWhiten: { value: 0 },
      uMousePos: { value: mousePosition ?? new THREE.Vector3(0, 0.45, 0) },
      uProgress: { value: 1 },
      uProgress2: { value: 1 },
      uTriangleAlpha: { value: 1 },
      tMap: { value: map ?? null },
      tGroundGlow: { value: groundGlow ?? null },
      tWind: { value: wind ?? null },
      tTriangles: { value: triangles ?? null },
      tNoise: { value: noise ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vMouseGlow;

      uniform vec3 uMousePos;

      void main() {
        vUv = uv;
        vPos = position;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vMouseGlow = (1.0 - clamp(distance(uMousePos, vWorldPos.xyz * vec3(1.0, 0.0, 1.0)), 0.0, 5.0) / 5.0)
          * vec3(0.5, 0.7, 1.0)
          * smoothstep(-0.5, 2.0, uMousePos.y);
        vMouseGlow *= 1.0 - clamp(length(vWorldPos.xyz), 0.0, 9.0) / 9.0;
        vMouseGlow *= 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      uniform float uWhiten;
      uniform vec3 uMousePos;
      uniform float uProgress;
      uniform float uProgress2;
      uniform float uTriangleAlpha;
      uniform sampler2D tMap;
      uniform sampler2D tGroundGlow;
      uniform sampler2D tWind;
      uniform sampler2D tTriangles;
      uniform sampler2D tNoise;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vMouseGlow;

      float falloff(float value, float start, float end, float width, float progress) {
        float edge = mix(start, end, clamp(progress, 0.0, 1.0));
        return smoothstep(edge - width, edge, value) * (1.0 - smoothstep(edge, edge + width, value));
      }

      float falloffSmooth(float value, float start, float end, float width, float progress) {
        float edge = mix(start, end, clamp(progress, 0.0, 1.0));
        return smoothstep(edge - width, edge + width, value);
      }

      void main() {
        float alpha = 1.0;
        vec3 terrainColor = texture2D(tMap, vUv).rgb;

        vec3 glow = texture2D(tGroundGlow, vUv).rgb;
        float glowStrength = sin(vPos.x - uTime + 3.2) * 0.5 + 0.5;
        terrainColor += glow * glowStrength * terrainColor.r;
        terrainColor += vMouseGlow * terrainColor.r;

        float verticalGrad = 1.0 - clamp(vPos.y * 0.3 + 1.1, 0.0, 1.0);
        float windA = texture2D(tWind, vWorldPos.xz * 0.15 + vUv * 0.1 + vec2(-uTime * 0.15, -uTime * 0.15)).r;
        float windB = texture2D(tWind, vWorldPos.xz * 0.17 + vUv * 0.1 + vec2(-uTime * 0.15, -uTime * 0.15)).r;
        float wind = windA * windB * verticalGrad;
        terrainColor = mix(terrainColor, vec3(1.0), wind * 4.0);

        vec3 color = terrainColor;

        if (uProgress2 < 0.999) {
          alpha = 0.0;

          float noiseSample = texture2D(tNoise, vWorldPos.xz * 0.07).r;
          float trianglesSample = texture2D(tTriangles, vWorldPos.xz * 0.25).r;
          vec3 blue = vec3(0.3, 0.45, 1.0);
          float inputGradient = length(vWorldPos.xz) + noiseSample * 3.5;

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

          color += terrainShockwaveColor;
          alpha += terrainShockwaveAlpha;

          color += triangleShockwaveColor * (1.0 - terrainShockwaveAlpha);
          alpha += triangleShockwaveAlpha * (1.0 - terrainShockwaveAlpha);
        }

        color = mix(color, vec3(0.965, 0.972, 0.985), uWhiten * 0.9);

        alpha *= 1.0 - smoothstep(0.8, 1.0, length(vPos.xz) * 0.1085);
        alpha = clamp(alpha, 0.0, 1.0) * uAlpha;

        gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), alpha);
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
  noise,
  pieceOptionsTexture,
  pieceTextureSize = 1,
  usePieceAttributes = false
}) {
  return new THREE.ShaderMaterial({
    defines: usePieceAttributes ? { USE_IGLOO_PIECES: 1 } : {},
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uWhiten: { value: 0 },
      uDisplacementMix: { value: 0 },
      uProgress: { value: 1 },
      uIntroMaterialize: { value: 1 },
      uIntroGlow: { value: 1 },
      uPieceTextureSize: { value: pieceTextureSize },
      uHoverPoint: { value: new THREE.Vector3(0, 1.0, 0.6) },
      uHoverStrength: { value: 0 },
      uHoverVelocity: { value: 0 },
      tMap: { value: map ?? null },
      tMapExploded: { value: explodedMap ?? null },
      tTriangles: { value: triangles ?? null },
      tNoise: { value: noise ?? null },
      tPieceOptions: { value: pieceOptionsTexture ?? null }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPieceTextureSize;
      uniform vec3 uHoverPoint;
      uniform float uHoverStrength;
      uniform float uHoverVelocity;
      uniform sampler2D tPieceOptions;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vHoverMask;
      varying float vHoverPulse;
      varying float vPieceEmission;
      varying float vHoverDisplacement;

      #ifdef USE_IGLOO_PIECES
      attribute float aPieceId;
      attribute vec3 centr;
      attribute vec3 rand;
      attribute float emission;
      #endif

      vec4 getPieceOptions(float pieceId) {
        float x = mod(pieceId, uPieceTextureSize);
        float y = floor(pieceId / uPieceTextureSize);
        vec2 uv = (vec2(x, y) + 0.5) / uPieceTextureSize;
        return texture2D(tPieceOptions, uv);
      }

      vec3 rotateX(vec3 value, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec3(value.x, value.y * c - value.z * s, value.y * s + value.z * c);
      }

      vec3 rotateY(vec3 value, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec3(value.x * c + value.z * s, value.y, -value.x * s + value.z * c);
      }

      vec3 rotateZ(vec3 value, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec3(value.x * c - value.y * s, value.x * s + value.y * c, value.z);
      }

      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec3 transformedNormal = normal;
        vHoverMask = 0.0;
        vHoverPulse = 0.0;
        vPieceEmission = 0.0;
        vHoverDisplacement = 0.0;

        #ifdef USE_IGLOO_PIECES
          vec4 pieceOptions = getPieceOptions(aPieceId);
          float pieceDisplacement = pieceOptions.r;
          float pieceBounce = pieceOptions.g;
          float pieceScrollDisplacement = pieceOptions.b;
          vec3 pieceLocal = position - centr;
          float angleY = cos(pieceDisplacement * 2.0 + rand.z * 30.0) * pieceDisplacement * 0.5 + pieceScrollDisplacement * rand.x * -1.5;
          float angleZ = cos(pieceDisplacement * 2.0 + rand.x * 30.0) * pieceDisplacement * 0.5 + pieceScrollDisplacement * rand.y * -1.5;
          float angleX = cos(pieceDisplacement * 2.0 + rand.y * 30.0) * pieceDisplacement * 0.5 + pieceScrollDisplacement * rand.z * -1.5;
          pieceLocal = rotateY(pieceLocal, angleY);
          pieceLocal = rotateZ(pieceLocal, angleZ);
          pieceLocal = rotateX(pieceLocal, angleX);
          transformedNormal = rotateY(transformedNormal, angleY);
          transformedNormal = rotateZ(transformedNormal, angleZ);
          transformedNormal = rotateX(transformedNormal, angleX);
          vec3 pieceOrigin = centr;
          pieceOrigin += centr * pieceDisplacement;
          pieceOrigin += centr * pieceScrollDisplacement;
          transformed = pieceOrigin + pieceLocal;
          vec3 pieceCenterWorld = (modelMatrix * vec4(pieceOrigin, 1.0)).xyz;
          float hoverDistance = length(pieceCenterWorld - uHoverPoint);
          vHoverMask = clamp(pieceBounce * 1.8, 0.0, 1.0);
          vHoverPulse = sin(hoverDistance * 4.0 - uTime * 7.0 + rand.z * 19.0) * 0.5 + 0.5;
          vPieceEmission = emission;
          vHoverDisplacement = pieceDisplacement;
        #else
          vec3 hoverSourceWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          float hoverDistance = length(hoverSourceWorld - uHoverPoint);
          float hoverMask = (1.0 - smoothstep(1.0, 3.2, hoverDistance)) * uHoverStrength;
          float hoverPulse = sin(hoverDistance * 6.5 - uTime * 7.0 + dot(position, vec3(4.0, 2.5, 3.0))) * 0.5 + 0.5;
          vec3 hoverDirection = normalize(position + normal * 0.4);
          float hoverDisplacement = hoverMask * (0.045 + 0.035 * hoverPulse) * (0.7 + 0.3 * min(uHoverVelocity * 3.0, 1.0));
          transformed += hoverDirection * hoverDisplacement;
          transformed += normal * hoverDisplacement * 0.35;
          vHoverMask = hoverMask;
          vHoverPulse = hoverPulse;
          vPieceEmission = hoverMask;
          vHoverDisplacement = hoverDisplacement;
        #endif

        vPos = transformed;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * transformedNormal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      uniform float uWhiten;
      uniform float uDisplacementMix;
      uniform float uProgress;
      uniform float uIntroMaterialize;
      uniform float uIntroGlow;
      uniform float uHoverVelocity;
      uniform sampler2D tMap;
      uniform sampler2D tMapExploded;
      uniform sampler2D tTriangles;
      uniform sampler2D tNoise;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vHoverMask;
      varying float vHoverPulse;
      varying float vPieceEmission;
      varying float vHoverDisplacement;

      void main() {
        vec3 baseColor = texture2D(tMap, vUv).rgb;
        vec3 exploded = texture2D(tMapExploded, vUv).rgb + 0.05;
        vec3 blue = vec3(0.5, 0.7, 1.0);
        float detailTrianglesMask = texture2D(tTriangles, vUv * 5.0 + vec2(uTime * 0.012, -uTime * 0.009)).r;
        float detailNoiseMask = texture2D(tNoise, vUv * 2.0 + vec2(uTime * 0.018, uTime * 0.011)).r;
        vec3 detailSeamGlow = max(exploded - baseColor, vec3(0.0));
        float detailSeamMask = clamp(length(detailSeamGlow) * 3.5, 0.0, 1.0);

        #ifdef USE_IGLOO_PIECES
        float textureMix = clamp(5.0 * vHoverDisplacement, 0.0, 1.0);
        vec3 color = mix(baseColor, exploded, max(clamp(uDisplacementMix, 0.0, 1.0), textureMix));
        #else
        float hoverDisplacementMix = clamp(vHoverDisplacement * 5.0, 0.0, 1.0);
        vec3 color = mix(baseColor, exploded, clamp(uDisplacementMix + hoverDisplacementMix, 0.0, 1.0));
        #endif

        if (uIntroMaterialize < 0.999) {
          float trianglesMask = texture2D(tTriangles, vUv * 5.0).r;
          float introEmissive = 1.0 - smoothstep(-0.4, 3.95, mix(-0.4, 3.95, uIntroMaterialize) - vPos.y);
          introEmissive = clamp(introEmissive, 0.0, 1.0);
          introEmissive += clamp(introEmissive * trianglesMask * 13.0, 0.0, 1.0);
          color += introEmissive * blue * uIntroGlow;
        }

        float idlePulse = sin(vPos.x - uTime + 3.2) * 0.5 + 0.5;

        #ifdef USE_IGLOO_PIECES
        color += pow(vPieceEmission, 2.0) * clamp(vHoverDisplacement, 0.0, 1.0) * blue;
        vec3 powEmission = pow(vPieceEmission, 8.0) * blue * 0.5;
        color += powEmission * idlePulse;
        color += max(0.0, smoothstep(0.0, 2.0, vPos.x * 0.5 - vPos.z * 0.5)) * powEmission;
        color += (1.0 - smoothstep(-1.5, 1.0, vPos.y)) * clamp(vHoverMask * 1.6, 0.0, 1.0) * vec3(0.8, 0.9, 1.0) * 0.25;
        #else
        vec3 pulseEmission = pow(max(detailSeamMask, detailTrianglesMask * 0.7), 6.0) * blue * 0.38;
        color += detailSeamGlow * (0.82 + detailNoiseMask * 0.22);
        color += pulseEmission * idlePulse;
        color += max(0.0, smoothstep(0.0, 2.0, vPos.x * 0.5 - vPos.z * 0.5)) * pulseEmission;
        float hoverGlow = clamp(vHoverDisplacement * (0.9 + 0.5 * vHoverPulse), 0.0, 1.0);
        color += detailSeamGlow * hoverGlow * 0.3;
        color += pow(max(vPieceEmission, detailSeamMask), 2.0) * blue * hoverGlow * 0.36;
        color += blue * hoverGlow * (0.05 + 0.08 * min(uHoverVelocity * 1.6, 1.0));
        #endif
        color += (vPos.x * 0.1 + 0.4) * 0.15 * min(vPos.y + 0.5, 1.0);
        color += (1.0 - smoothstep(-1.5, 1.0, vPos.y)) * vec3(0.8, 0.9, 1.0) * 0.22;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDir), 0.0), 2.0);
        color += blue * fresnel * 0.18;
        color = mix(color, vec3(0.95, 0.962, 0.985), uWhiten * 0.72);

        gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), uAlpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true
  });
}

function createCloudMaterial({ noise, tint = '#ffffff', opacity = 0.16 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uWhiten: { value: 0 },
      uTint: { value: new THREE.Color(tint) },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogNear: { value: FOG_NEAR },
      uFogFar: { value: FOG_FAR },
      uHasNoise: { value: noise ? 1 : 0 },
      tNoise: { value: noise ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;

        vec4 mvPosition = viewMatrix * worldPosition;
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uWhiten;
      uniform vec3 uTint;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uHasNoise;
      uniform sampler2D tNoise;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      void main() {
        vec2 uv = vUv;
        uv.x *= 2.0;

        float t = uTime * 0.15;

        if (vWorldPos.x > 6.0) {
          t += 0.914;
        }

        float wind = texture2D(tNoise, uv + vec2(-t, t * 0.4)).r;
        wind *= texture2D(tNoise, uv * 1.25 + vec2(-t, 0.75)).r;
        wind *= texture2D(tNoise, uv * 0.5 + vec2(-t, -t * 0.35)).r;
        wind *= mix(1.0, 8.0, uHasNoise);

        float alpha = wind;
        alpha *= 1.0 - vUv.y;
        alpha *= smoothstep(0.0, 0.1, vUv.y);
        alpha *= smoothstep(0.0, 0.5, vUv.x);
        alpha *= smoothstep(1.0, 0.8, vUv.x);
        alpha *= uOpacity;

        float fogFactor = smoothstep(uFogNear * 0.8, uFogFar, vFogDepth);
        vec3 color = mix(uTint, uFogColor, fogFactor);
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

  material.toneMapped = false;
  return material;
}

function createIntroNetworkMaterial({ color = '#ffffff', opacity = 0.2 }) {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });

  material.toneMapped = false;
  return material;
}

function createIntroField({ pointCount = 52, radius = 24, height = 11 } = {}) {
  const points = [];
  const pointPositions = new Float32Array(pointCount * 3);
  const pointSeeds = new Float32Array(pointCount);

  for (let index = 0; index < pointCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radial = 5.5 + Math.pow(Math.random(), 0.85) * radius;
    const elevation = 4.2 + Math.pow(Math.random(), 0.78) * height;
    const x = Math.cos(angle) * radial + (Math.random() - 0.5) * 2.8;
    const y = elevation;
    const z = Math.sin(angle) * radial + (Math.random() - 0.5) * 3.6 - 2.0;

    points.push(new THREE.Vector3(x, y, z));
    pointPositions[index * 3 + 0] = x;
    pointPositions[index * 3 + 1] = y;
    pointPositions[index * 3 + 2] = z;
    pointSeeds[index] = Math.random();
  }

  const linePositions = [];
  const usedConnections = new Set();

  for (let index = 0; index < points.length; index += 1) {
    const nearest = [];

    for (let compareIndex = 0; compareIndex < points.length; compareIndex += 1) {
      if (compareIndex === index) {
        continue;
      }

      const distance = points[index].distanceTo(points[compareIndex]);

      if (distance > 8.25) {
        continue;
      }

      nearest.push({ compareIndex, distance });
    }

    nearest.sort((left, right) => left.distance - right.distance);

    for (let connectionIndex = 0; connectionIndex < Math.min(1, nearest.length); connectionIndex += 1) {
      const compareIndex = nearest[connectionIndex].compareIndex;
      const key = index < compareIndex
        ? `${index}:${compareIndex}`
        : `${compareIndex}:${index}`;

      if (usedConnections.has(key)) {
        continue;
      }

      usedConnections.add(key);
      const pointA = points[index];
      const pointB = points[compareIndex];
      linePositions.push(pointA.x, pointA.y, pointA.z, pointB.x, pointB.y, pointB.z);
    }
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

  const lineMesh = new THREE.LineSegments(
    lineGeometry,
    createIntroNetworkMaterial({
      color: '#e8f1ff',
      opacity: 0
    })
  );
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = 10;

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
  pointGeometry.setAttribute('aSeed', new THREE.BufferAttribute(pointSeeds, 1));

  const pointMaterial = createPointMaterial({
    color: '#f3f7ff',
    opacity: 0,
    size: 18
  });
  pointMaterial.uniforms.uFogNear.value = FOG_NEAR * 0.25;
  pointMaterial.uniforms.uFogFar.value = FOG_FAR * 2.0;
  pointMaterial.uniforms.uJitter.value = 0.1;
  pointMaterial.toneMapped = false;

  const pointMesh = new THREE.Points(pointGeometry, pointMaterial);
  pointMesh.frustumCulled = false;
  pointMesh.renderOrder = 11;

  const groundRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.8, 40, 4),
    new THREE.MeshBasicMaterial({
      color: '#e3eefb',
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  groundRing.rotation.x = -Math.PI * 0.5;
  groundRing.position.y = -0.04;
  groundRing.renderOrder = 9;
  groundRing.material.toneMapped = false;

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(4.9, 5.9, 32, 4),
    new THREE.MeshBasicMaterial({
      color: '#dde9f8',
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  outerRing.rotation.x = -Math.PI * 0.5;
  outerRing.position.y = -0.06;
  outerRing.renderOrder = 8;
  outerRing.material.toneMapped = false;

  const group = new THREE.Group();
  group.visible = false;
  group.add(groundRing, outerRing, lineMesh, pointMesh);

  return {
    group,
    lineMesh,
    pointMesh,
    groundRing,
    outerRing
  };
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
    this.introProgress = 0;
    this.introElapsed = 0;
    this.introDuration = 7.5;
    this.introPlayed = false;
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
    this._cameraPositionB = new THREE.Vector3();
    this._cameraTargetB = new THREE.Vector3();
    this._cameraViewOffset = new THREE.Vector3();
    this._cameraRight = new THREE.Vector3();
    this._cameraUpOrtho = new THREE.Vector3();
    this._cameraViewDirection = new THREE.Vector3();
    this._worldUp = new THREE.Vector3(0, 1, 0);
    this._pointerPlaneForward = new THREE.Vector3();
    this._pointerPlanePoint = new THREE.Vector3();
    this.pointerNdc = new THREE.Vector2();
    this.pointerDrift = new THREE.Vector2();
    this.pointerDriftTarget = new THREE.Vector2();
    this.pointerActive = false;
    this.pointerWorld = new THREE.Vector3(0, 0.45, 0);
    this.pointerTarget = new THREE.Vector3(0, 0.45, 0);
    this.pointerProbeDistance = 19.25;
    this.pointerRaycaster = new THREE.Raycaster();
    this.pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pointerIntersection = new THREE.Vector3();
    this.hoverPoint = new THREE.Vector3(0, 1.0, 0.6);
    this.hoverPointTarget = new THREE.Vector3(0, 1.0, 0.6);
    this.hoverPointPrevious = new THREE.Vector3(0, 1.0, 0.6);
    this.hoverDelta = new THREE.Vector3();
    this.hoverStrength = 0;
    this.hoverStrengthTarget = 0;
    this.hoverVelocity = 0;
    this.usingPieceHover = false;
    this.debugHoverLogging = false;
    this.debugHoverLastLogTime = -Infinity;
    this.debugHoverMaxDisplacement = 0;
    this.debugHoverAvgDisplacement = 0;
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

    const preparedIglooGeometry = prepareGeometry(assets.get('geometry', 'igloo-shell'), {
      center: false,
      scaleToSize: false
    }) || new THREE.SphereGeometry(1.5, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const iglooPieceData = createIglooPieceAnimationData(preparedIglooGeometry);
    const iglooGeometry = iglooPieceData.geometry ?? preparedIglooGeometry;
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
    this.iglooPieces = iglooPieceData.pieces?.filter(Boolean) ?? [];
    this.iglooPieceOptionsData = iglooPieceData.optionsData ?? null;
    this.iglooPieceOptionsTexture = iglooPieceData.optionsTexture ?? null;
    this.iglooPieceTextureSize = iglooPieceData.textureSize ?? 1;
    this.usingPieceHover = Boolean(
      this.iglooPieces.length
      && iglooGeometry?.hasAttribute?.('aPieceId')
      && iglooGeometry?.hasAttribute?.('centr')
      && iglooGeometry?.hasAttribute?.('rand')
    );

    if (this.debugHoverLogging && typeof console !== 'undefined') {
      console.info('[IglooScene] geometry attrs', Object.keys(iglooGeometry?.attributes ?? {}));
      console.info('[IglooScene] piece hover setup', {
        usingPieceHover: this.usingPieceHover,
        pieceCount: this.iglooPieces.length,
        pieceTextureSize: this.iglooPieceTextureSize
      });
    }

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
        wind: windNoise,
        triangles: trianglesTiling,
        noise: mosaicNoise,
        mousePosition: this.pointerWorld
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
        noise: shellNoise,
        pieceOptionsTexture: this.iglooPieceOptionsTexture,
        pieceTextureSize: this.iglooPieceTextureSize,
        usePieceAttributes: this.usingPieceHover
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
    this.ring.renderOrder = 12;
    this.ring.material.toneMapped = false;
    this.root.add(this.ring);

    this.introField = createIntroField();
    this.root.add(this.introField.group);
    this.shaderMaterials.push(this.introField.pointMesh.material);

    if (cloudsNoise || windNoise) {
      const smokeSpecs = [
        { position: [-5, 1.25, -10], scale: [10.8, 3.2, 1], tint: '#f6f9ff', rotationY: 0 },
        { position: [13.45, 3, -4], scale: [11.6, 3.4, 1], tint: '#eef3ff', rotationY: THREE.MathUtils.degToRad(-10) }
      ];

      smokeSpecs.forEach((specification, index) => {
        const material = createCloudMaterial({
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
          baseScale: mesh.scale.clone()
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

    this.camera.position.copy(this.introCameraPosition);
    this.camera.lookAt(this.introCameraTarget);
  }

  computePresentationState(progress = this.progress) {
    const exitFade = 1 - smoothWindow(progress, 0.78, 0.9);
    const introTime = Math.min(this.introElapsed, this.introDuration);
    const panelProgress = ramp(introTime, 4.45, 1.25) * exitFade;
    const brandProgress = ramp(introTime, 4.5, 1.2) * exitFade;
    const titleProgress = ramp(introTime, 4.65, 1.1) * exitFade;
    const textProgress = ramp(introTime, 4.8, 1.25) * exitFade;
    const legalProgress = ramp(introTime, 4.65, 1.05) * exitFade;
    const introParticlesPresence = 1 - ramp(introTime, 0.5, 4.0);
    const cameraProgress = ramp(introTime, 2.0, 5.5);

    return {
      panelProgress,
      brandProgress,
      titleProgress,
      textProgress,
      legalProgress,
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
    const bloomStrength = THREE.MathUtils.lerp(1.18, 0.9, this.introProgress)
      * THREE.MathUtils.lerp(1, 0.9, whiteoutProgress);
    return {
      profile: 'igloo',
      gradientAlpha: THREE.MathUtils.lerp(0.9, 0.24, whiteoutProgress),
      lutIntensity: THREE.MathUtils.lerp(1, 0.62, whiteoutProgress),
      bloomStrength,
      bloomRadius: THREE.MathUtils.lerp(0.42, 0.28, this.introProgress),
      bloomThreshold: THREE.MathUtils.lerp(0.76, 0.84, this.introProgress)
    };
  }

  setActive(active) {
    const wasActive = this.active;
    super.setActive(active);

    if (active && !wasActive && !this.introPlayed) {
      this.introElapsed = 0;
      this.introProgress = 0;
    }
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
    if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
      this.pointerNdc.set(pointer.x, pointer.y);
      this.pointerActive = true;
      return;
    }

    this.pointerActive = false;
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

  updateIglooPieceAnimation(delta, elapsed) {
    if (!this.iglooPieces.length || !this.iglooPieceOptionsData || !this.iglooPieceOptionsTexture) {
      this.debugHoverMaxDisplacement = 0;
      this.debugHoverAvgDisplacement = 0;
      return;
    }

    const hoverInfluence = fitRange(this.progress, 0, this.initialScrollAutocenter, 0, 1);
    const scrollEase = easeSineIn(fitRange(this.progress, 0, 0.4, 1, 0));
    const introMotion = ramp(Math.min(this.introElapsed, this.introDuration), 2.0, 2.0);

    let maxDisplacement = 0;
    let displacementSum = 0;

    this.iglooPieces.forEach((piece) => {
      let bounceTarget = 0.4;
      bounceTarget *= Math.sin(-elapsed * 2 + piece.centroid.x) * 0.5 + 0.5;
      bounceTarget *= Math.cos(-elapsed) * 0.5 + 0.5;
      bounceTarget *= THREE.MathUtils.lerp(0.5, 2.0, piece.rand.z);
      bounceTarget *= 0.5;
      bounceTarget *= introMotion;

      const hoverModulation = Math.sin(elapsed + piece.rand.x * 12.342) * piece.rand.y;
      const hoverDistance = piece.centroid.distanceTo(this.pointerWorld);
      const hoverFalloff = 1 - THREE.MathUtils.smoothstep(hoverDistance, 1, 3);
      const hoverBounce = hoverFalloff * (0.5 + 0.3 * hoverModulation);
      bounceTarget = Math.max(bounceTarget, hoverBounce * hoverInfluence * this.hoverStrength);

      piece.targetBounce1 = bounceTarget;
      piece.targetBounce2 = fpsLerp(piece.targetBounce2, piece.targetBounce1, 0.05, delta);
      piece.bounce = fpsLerp(piece.bounce, piece.targetBounce2, 0.05, delta);

      const verticalMask = THREE.MathUtils.smoothstep(piece.centroid.y, 0.45, 0.7);
      piece.targetDisplacement1 = Math.max(0, piece.bounce * verticalMask);
      piece.targetDisplacement2 = fpsLerp(piece.targetDisplacement2, piece.targetDisplacement1, 0.06, delta);
      piece.displacement = fpsLerp(piece.displacement, piece.targetDisplacement2, 0.06, delta);

      const scrollVertical = THREE.MathUtils.smoothstep(piece.centroid.y, 0.3, 1.0);
      const scrollRandom = fitRange(piece.rand.x, 0.4, 1, 0, 1) * 2;
      const scrollTarget = scrollEase * scrollVertical * scrollRandom;
      piece.scrollDisplacement1 = fpsLerp(piece.scrollDisplacement1, scrollTarget, 0.075, delta);
      piece.scrollDisplacement2 = fpsLerp(piece.scrollDisplacement2, piece.scrollDisplacement1, 0.075, delta);
      maxDisplacement = Math.max(maxDisplacement, piece.displacement);
      displacementSum += piece.displacement;

      const baseIndex = piece.pieceIndex * 4;
      this.iglooPieceOptionsData[baseIndex + 0] = piece.displacement;
      this.iglooPieceOptionsData[baseIndex + 1] = piece.bounce;
      this.iglooPieceOptionsData[baseIndex + 2] = piece.scrollDisplacement2;
      this.iglooPieceOptionsData[baseIndex + 3] = piece.emission;
    });

    this.debugHoverMaxDisplacement = maxDisplacement;
    this.debugHoverAvgDisplacement = this.iglooPieces.length > 0
      ? displacementSum / this.iglooPieces.length
      : 0;
    this.iglooPieceOptionsTexture.needsUpdate = true;
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
    if (!this.introPlayed && this.active) {
      this.introElapsed = Math.min(this.introElapsed + delta, this.introDuration);
      const rawIntro = clamp01(this.introElapsed / this.introDuration);
      this.introProgress = rawIntro * rawIntro * (3 - 2 * rawIntro);

      if (rawIntro >= 0.999) {
        this.introProgress = 1;
        this.introPlayed = true;
      }
    }

    const presentation = this.computePresentationState(this.progress);
    this.presentationState = presentation;

    const introPresence = 1 - this.introProgress;
    const sectionPresence = 1 - smoothWindow(this.progress, 0.72, 1);
    const snowPresence = sectionPresence * 0.7;
    const smokePresence = sectionPresence;
    const timelineWeight = smoothWindow(this.progress, 0.14, 1);
    const whiteoutProgress = smoothWindow(this.progress, 0.56, 0.9);
    const introTime = Math.min(this.introElapsed, this.introDuration);
    const introCameraBlend = ramp(introTime, 2.0, 5.5);
    const introTerrainProgress = ramp(introTime, 0.7, 6.8);
    const introShellProgress = ramp(introTime, 1.0, 1.0);
    const introMaterialize = ramp(introTime, 1.1, 2.25);
    const introMountainsAlpha = ramp(introTime, 0.7, 3.0);
    const introGroundAlpha = introTime >= 2.1 ? 1 : 0;
    const introSmokeAlpha = ramp(introTime, 2.0, 3.0);
    const introSnowAlpha = ramp(introTime, 2.0, 4.0);
    const introSkyProgress = ramp(introTime, 1.5, 3.0);
    const introOutlinePresence = fadeWindow(introTime, 0.0, 0.12, 2.0, 3.0);
    const introCagePresence = fadeWindow(introTime, 0.0, 0.1, 2.1, 3.0);
    const introFieldPresence = fadeWindow(introTime, 0.0, 0.45, 1.55, 1.2);
    const introParticlesAlpha = fadeWindow(introTime, 0.5, 0.6, 1.75, 2.0);

    if (this.pointerActive) {
      this.pointerDriftTarget.copy(this.pointerNdc);
      this.pointerRaycaster.setFromCamera(this.pointerNdc, this.camera);
      this.camera.getWorldDirection(this._pointerPlaneForward);
      this._pointerPlanePoint.copy(this.camera.position).addScaledVector(this._pointerPlaneForward, this.pointerProbeDistance);
      this.pointerPlane.setFromNormalAndCoplanarPoint(this._pointerPlaneForward, this._pointerPlanePoint);

      if (this.pointerRaycaster.ray.intersectPlane(this.pointerPlane, this.pointerIntersection)) {
        this.pointerTarget.copy(this.pointerIntersection);
      } else {
        this.pointerTarget.copy(this.pointerRaycaster.ray.origin)
          .addScaledVector(this.pointerRaycaster.ray.direction, this.pointerProbeDistance);
      }

      const hoverHits = this.pointerRaycaster.intersectObject(this.dome, false);

      if (hoverHits.length > 0) {
        this.hoverPointTarget.copy(this.pointerTarget);
        this.hoverStrengthTarget = 0.92;
      } else {
        this.hoverPointTarget.set(0, 1.0, 0.6);
        this.hoverStrengthTarget = 0;
      }
    } else {
      this.pointerDriftTarget.set(0, 0);
      this.pointerTarget.set(0, 0.45, 0);
      this.hoverPointTarget.set(0, 1.0, 0.6);
      this.hoverStrengthTarget = 0;
    }

    this.pointerDrift.lerp(this.pointerDriftTarget, 1 - Math.exp(-delta * 6));
    this.pointerWorld.lerp(this.pointerTarget, 1 - Math.exp(-delta * 4));
    this.hoverPoint.lerp(this.hoverPointTarget, 1 - Math.exp(-delta * 9));
    this.hoverStrength = THREE.MathUtils.lerp(this.hoverStrength, this.hoverStrengthTarget, 1 - Math.exp(-delta * 10));
    this.hoverDelta.copy(this.hoverPoint).sub(this.hoverPointPrevious);
    const hoverVelocityTarget = clamp01(this.hoverDelta.length() / Math.max(delta, 1e-4) / 10) * this.hoverStrengthTarget;
    this.hoverVelocity = THREE.MathUtils.lerp(this.hoverVelocity, hoverVelocityTarget, 1 - Math.exp(-delta * 12));
    this.hoverPointPrevious.copy(this.hoverPoint);
    this.updateIglooPieceAnimation(delta, elapsed);

    if (
      this.debugHoverLogging
      && this.pointerActive
      && elapsed - this.debugHoverLastLogTime > 0.6
      && typeof console !== 'undefined'
    ) {
      this.debugHoverLastLogTime = elapsed;
      console.info('[IglooScene hover]', {
        usingPieceHover: this.usingPieceHover,
        pieceCount: this.iglooPieces.length,
        pointerNdc: {
          x: Number(this.pointerNdc.x.toFixed(3)),
          y: Number(this.pointerNdc.y.toFixed(3))
        },
        pointerWorld: {
          x: Number(this.pointerWorld.x.toFixed(3)),
          y: Number(this.pointerWorld.y.toFixed(3)),
          z: Number(this.pointerWorld.z.toFixed(3))
        },
        hoverPoint: {
          x: Number(this.hoverPoint.x.toFixed(3)),
          y: Number(this.hoverPoint.y.toFixed(3)),
          z: Number(this.hoverPoint.z.toFixed(3))
        },
        hoverStrength: Number(this.hoverStrength.toFixed(3)),
        hoverVelocity: Number(this.hoverVelocity.toFixed(3)),
        maxDisplacement: Number(this.debugHoverMaxDisplacement.toFixed(4)),
        avgDisplacement: Number(this.debugHoverAvgDisplacement.toFixed(4))
      });
    }

    this.root.rotation.y = 0;
    this.dome.rotation.y = 0;
    this.dome.position.y = 0;
    this.dome.visible = sectionPresence > 0.001 && (this.introPlayed || introTime >= 1.05);
    this.dome.material.uniforms.uDisplacementMix.value = (1 - introMaterialize) * 0.6;
    this.dome.material.uniforms.uProgress.value = introShellProgress;
    this.dome.material.uniforms.uIntroMaterialize.value = introMaterialize;
    this.dome.material.uniforms.uIntroGlow.value = THREE.MathUtils.lerp(1.2, 1, introMaterialize);
    this.dome.material.uniforms.uHoverPoint.value.copy(this.hoverPoint);
    this.dome.material.uniforms.uHoverStrength.value = this.hoverStrength * sectionPresence;
    this.dome.material.uniforms.uHoverVelocity.value = this.hoverVelocity;
    this.dome.material.uniforms.uAlpha.value = sectionPresence * ramp(introTime, 1.1, 0.5);
    this.floor.material.uniforms.uMousePos.value.copy(this.pointerWorld);
    this.floor.material.uniforms.uProgress.value = introTerrainProgress;
    this.floor.material.uniforms.uProgress2.value = introTerrainProgress;
    this.floor.material.uniforms.uAlpha.value = sectionPresence * introGroundAlpha;
    this.fillLight.intensity = THREE.MathUtils.lerp(4.5, 2.8, this.progress);

    if (this.outline) {
      this.outline.rotation.y = 0;
      this.outline.position.y = this.dome.position.y + 0.03;
      this.outline.scale.setScalar(1.0 + introPresence * 0.015);
      this.outline.material.opacity = introOutlinePresence * sectionPresence * 0.28;
      this.outline.visible = this.outline.material.opacity > 0.001;
    }

    if (this.cage) {
      this.cage.rotation.y = 0;
      this.cage.position.y = this.dome.position.y + 0.06;
      this.cage.scale.setScalar(1.014 + introCagePresence * 0.03);
      this.cage.material.opacity = introCagePresence * sectionPresence * 0.32;
      this.cage.visible = this.cage.material.opacity > 0.001;
    }

    if (this.ring) {
      this.ring.visible = false;
    }

    if (this.introField) {
      this.introField.group.visible = introFieldPresence * sectionPresence > 0.001;
      this.introField.group.rotation.y = 0.04 + introFieldPresence * 0.08 + elapsed * 0.01;
      this.introField.group.position.y = 1.2 + introFieldPresence * 0.1;
      this.introField.group.scale.setScalar(0.92 + introFieldPresence * 0.02);
      this.introField.lineMesh.material.opacity = introFieldPresence * sectionPresence * 0.075;
      this.introField.pointMesh.material.uniforms.uAlpha.value = introFieldPresence * sectionPresence * 0.055;
      this.introField.pointMesh.material.uniforms.uJitter.value = THREE.MathUtils.lerp(0.12, 0.04, introMaterialize);
      this.introField.groundRing.material.opacity = introFieldPresence * sectionPresence * 0.028;
      this.introField.outerRing.material.opacity = introFieldPresence * sectionPresence * 0.016;
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
        mesh.material.uniforms.uAlpha.value = sectionPresence * introMountainsAlpha;
      }
      if (mesh.material.uniforms.uProgress) {
        mesh.material.uniforms.uProgress.value = introTerrainProgress;
      }
      if (mesh.material.uniforms.uProgress2) {
        mesh.material.uniforms.uProgress2.value = introTerrainProgress;
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
      mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.95, 0.8, this.progress) * sectionPresence * introGroundAlpha;
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
      mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.88, 0.72, this.progress) * sectionPresence * introGroundAlpha;
      mesh.material.uniforms.uTriangleStrength.value = THREE.MathUtils.lerp(0.045, 0.018, this.progress);
    });

    this.smokeLayers.forEach(({ mesh, basePosition, baseScale }, index) => {
      mesh.position.copy(basePosition);
      mesh.scale.set(
        baseScale.x * (1 + whiteoutProgress * 1.35),
        baseScale.y * (1 + whiteoutProgress * 0.82),
        baseScale.z
      );
      mesh.material.uniforms.uOpacity.value = smokePresence
        * introSmokeAlpha
        * ((index === 0 ? 0.12 : 0.1) + whiteoutProgress * (index === 0 ? 0.3 : 0.24));
    });

    if (this.introParticles) {
      this.introParticles.rotation.y = elapsed * 0.04;
      this.introParticles.position.y = 1.2 + Math.sin(elapsed * 0.3) * 0.08;
      this.introParticles.material.uniforms.uAlpha.value = introParticlesAlpha * sectionPresence * 0.26;
      this.introParticles.material.uniforms.uJitter.value = THREE.MathUtils.lerp(0.85, 0.18, this.progress);
    }

    if (this.snowParticles) {
      this.snowParticles.material.uniforms.uAlpha.value = snowPresence * introSnowAlpha * 0.2;
      this.snowParticles.material.uniforms.uJitter.value = 0.35;
      this.updateSnowField(elapsed, THREE.MathUtils.lerp(0.35, 1, snowPresence * introSnowAlpha));
    }

    if (this.skyGlow) {
      this.skyGlow.material.uniforms.uProgress.value = introSkyProgress;
      this.skyGlow.scale.setScalar(1);
    }

    this._cameraPositionA.lerpVectors(
      this.introCameraPosition,
      this.timelineStartCameraPosition,
      introCameraBlend
    );
    this._cameraPositionB.lerpVectors(
      this._cameraPositionA,
      this.timelineEndCameraPosition,
      timelineWeight
    );

    this._cameraTargetA.lerpVectors(
      this.introCameraTarget,
      this.timelineStartCameraTarget,
      introCameraBlend
    );
    this._cameraTargetB.copy(this._cameraTargetA).lerp(this.timelineEndCameraTarget, timelineWeight);

    const cameraHoverAmount = introCameraBlend * sectionPresence;
    const horizontalAngle = this.pointerDrift.x * 0.07 * cameraHoverAmount;
    const verticalAngle = -this.pointerDrift.y * 0.025 * cameraHoverAmount;

    this._cameraViewDirection.copy(this._cameraPositionB).sub(this._cameraTargetB);

    if (this._cameraViewDirection.lengthSq() > 1e-6) {
      this._cameraRight.crossVectors(this._worldUp, this._cameraViewDirection).normalize();

      if (this._cameraRight.lengthSq() < 1e-6) {
        this._cameraRight.set(1, 0, 0);
      }

      this._cameraUpOrtho.crossVectors(this._cameraViewDirection, this._cameraRight).normalize();
      this._cameraViewOffset.copy(this._cameraPositionB).sub(this._cameraTargetB);
      this._cameraViewOffset.applyAxisAngle(this._cameraRight, verticalAngle);
      this._cameraViewOffset.applyAxisAngle(this._cameraUpOrtho, horizontalAngle);
      this.camera.position.copy(this._cameraTargetB).add(this._cameraViewOffset);
    } else {
      this.camera.position.copy(this._cameraPositionB);
    }

    this.camera.lookAt(this._cameraTargetB.x, this._cameraTargetB.y, this._cameraTargetB.z);
  }
}
