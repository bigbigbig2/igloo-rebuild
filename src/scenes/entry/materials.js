import * as THREE from 'three';

const GLSL_FALLOFF = `
  float _linstep(float begin, float end, float t) {
    return clamp((t - begin) / (end - begin), 0.0, 1.0);
  }

  float falloff(float inputValue, float start, float end, float margin, float progress) {
    float direction = sign(end - start);
    float offset = margin * direction;
    float pivot = mix(start - offset, end, progress);
    return _linstep(pivot + offset, pivot, inputValue);
  }

  float falloffsmooth(float inputValue, float start, float end, float margin, float progress) {
    float direction = sign(end - start);
    float offset = margin * direction;
    float pivot = mix(start - offset, end, progress);
    return smoothstep(pivot + offset, pivot, inputValue);
  }
`;

const GLSL_SINE_NOISE = `
  #define sinlayer(frX, frY, frZ) value += sin(dot(p, vec3(frX, frY, frZ)));
  float sinenoise1(vec3 p) {
    float value = 0.0;
    sinlayer(1.5, 3.4598, 1.234);
    sinlayer(3.12, -3.234, 4.221);
    sinlayer(0.355, 2.3, -1.375);
    sinlayer(-0.156, -3.34, -0.4566);
    sinlayer(-4.1235, -0.485, -1.45);
    sinlayer(2.54, -0.879, -2.123);
    return value / 6.0;
  }
`;

const GLSL_AASTEP = `
  float aastep(float threshold, float value) {
    return smoothstep(threshold - 0.02, threshold + 0.02, value);
  }
`;

const GLSL_ROTATION = `
  mat4 rotation3D(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat4(
      oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
      oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0,
      oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0,
      0.0, 0.0, 0.0, 1.0
    );
  }

  vec3 rotate3D(vec3 value, vec3 axis, float angle) {
    return (rotation3D(axis, angle) * vec4(value, 1.0)).xyz;
  }
`;

export function createForcefieldMaterial({ triangles = null, noise = null, color = '#b3d0ff', opacity = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      tTriangles: { value: triangles ?? null },
      tNoise: { value: noise ?? null }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vFalloff;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depth = -mvPosition.z;
        vFalloff = smoothstep(3.5, 2.3, depth);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      ${GLSL_AASTEP}
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform sampler2D tTriangles;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vFalloff;
      void main() {
        float radius = length(vUv - 0.5) * 2.0;
        float circleMask = 1.0 - step(0.98, radius);
        float radialMask = smoothstep(0.5, 1.0, radius);
        float circleEdgeMask = smoothstep(0.9, 0.85, radius);

        float fieldNoise = texture2D(tNoise, vUv * 0.25 + vec2(vWorldPos.y)).r;
        fieldNoise *= texture2D(tNoise, vUv * 0.8 + vec2(vWorldPos.y)).r;
        fieldNoise = sin(fieldNoise * 13.0 + uTime - radius * 10.0) * 0.5 + 0.5;
        float mask = aastep(0.2, fieldNoise) * (1.0 - fieldNoise * 0.75);

        float triangles = texture2D(tTriangles, vUv * 2.0 + vec2(fieldNoise * 0.04)).r * 4.0;
        float alpha = triangles * mask;
        alpha += pow(mask, 5.0) * 0.5;
        alpha += radialMask * 0.5;
        alpha *= circleMask;
        alpha = min(1.0, alpha);
        alpha *= circleEdgeMask;
        alpha *= smoothstep(0.45 - vFalloff * 0.25, 0.75 - vFalloff * 0.3, length(vUv - 0.5));

        float camFactor = 1.0 - clamp(-cameraPosition.z * 8.0, 0.0, 1.0);
        alpha *= camFactor;

        gl_FragColor = vec4(uColor, alpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

export function createPlasmaMaterial({ noise = null, color = '#a6d2ff', opacity = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      tNoise: { value: noise ?? null }
    },
    vertexShader: `
      varying float vFalloff;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        float depth = -(modelViewMatrix * vec4(position, 1.0)).z;
        vFalloff = 1.0 - smoothstep(2.0, 4.0, depth);
        vFalloff *= smoothstep(0.4, 1.0, depth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vFalloff;
      void main() {
        vec2 uv = vUv * vec2(0.25, 0.5);
        uv.x += uv.y;
        float t = -uTime * 0.075;

        float wind = texture2D(tNoise, uv * 3.0 + vec2(-t, t * 0.7)).r;
        wind *= texture2D(tNoise, uv * 4.0 + vec2(-t, t * 0.7)).r;
        wind *= texture2D(tNoise, uv * 6.0 + vec2(-t, t * 0.7)).r;

        float value = wind;
        float fade = 1.0;
        fade *= smoothstep(0.3, 0.4, vUv.x);
        fade *= smoothstep(0.6, 0.5, vUv.x);
        value *= fade;

        float glowMask = smoothstep(0.3, 0.45, vUv.x) * smoothstep(0.8, 0.4, vUv.x);
        value += glowMask * 0.3;
        value += pow(glowMask, 2.0) * wind * 0.2;
        value *= vFalloff;

        float alpha = value * 1.7;
        alpha = pow(max(alpha, 0.0), 4.0);
        alpha = min(1.0, alpha);

        float camFactor = pow(1.0 - clamp(-cameraPosition.z, 0.0, 1.0), 4.0);
        alpha *= camFactor;

        gl_FragColor = vec4(uColor, alpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false
  });
}

export function createSmokeMaterial({ noise, tint = '#edf5ff', opacity = 0.22, speed = 0.08, exponent = 2.6 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uExponent: { value: exponent },
      uTint: { value: new THREE.Color(tint) },
      tNoise: { value: noise ?? null }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSpeed;
      uniform float uExponent;
      uniform vec3 uTint;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vec2 uv = vUv * vec2(0.7, 1.0);
        uv.x += vPos.y * 0.08;
        float t = uTime * uSpeed;
        float noiseA = texture2D(tNoise, uv * 1.5 + vec2(-t, t * 0.7)).r;
        float noiseB = texture2D(tNoise, uv * 2.8 + vec2(-t * 1.3, t * 0.4)).r;
        float fade = 1.0;
        fade *= smoothstep(0.0, 0.2, vUv.y);
        fade *= smoothstep(1.0, 0.45, vUv.y);
        fade *= smoothstep(0.05, 0.3, vUv.x);
        fade *= smoothstep(1.0, 0.5, vUv.x);
        float alpha = pow(max(noiseA * noiseB * fade, 0.0), uExponent) * uOpacity;
        gl_FragColor = vec4(uTint, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

export function createLightroomMaterial(dotPattern) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDotPattern: { value: dotPattern ?? null },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDotPattern;
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec2 vUv;
      ${GLSL_SINE_NOISE}
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        float ramp = (screenUv.x + screenUv.y) * 0.5;
        ramp *= sinenoise1(vec3(screenUv, uTime * 0.614)) * 0.5 + 0.5;
        ramp *= sinenoise1(vec3(screenUv * 2.0, uTime * 0.17)) * 0.5 + 0.5;
        vec3 color = mix(vec3(0.4157, 0.4353, 0.4902), vec3(0.8824, 0.9020, 0.9451), ramp) * 1.1;
        vec2 dotUv = vUv * vec2(200.0, 100.0);
        float dots = texture2D(tDotPattern, dotUv).r;
        float dotFade = 1.0 - abs(fract(hash12(floor(dotUv)) + uTime * 0.1) - 0.5) * 2.0;
        color += dots * dotFade * 2.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  });
}

export function createEntryRingMaterial({ map = null, glow = null }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      tMap: { value: map },
      tGlow: { value: glow },
      uAlpha: { value: 1 },
      uColor1: { value: new THREE.Color('#6a6f7d') },
      uColor2: { value: new THREE.Color('#e1e6f1') }
    },
    vertexShader: `
      ${GLSL_FALLOFF}
      ${GLSL_ROTATION}

      uniform float uTime;

      attribute vec3 centr;
      attribute vec3 rand;

      varying vec2 vUv;
      varying vec3 vPos;
      varying float vFalloff;
      varying float vFade;

      vec2 rotate2(vec2 value, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, s, -s, c) * value;
      }

      void main() {
        vUv = uv;
        vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;

        vec3 pos = position;
        vec3 translation = modelMatrix[3].xyz;
        float firstRingMask = falloff(translation.y, -1.66, -1.661, 0.01, 0.5);
        float camFactor = clamp(-cameraPosition.z * 0.8, 0.0, 1.0);
        float dist = distance(cameraPosition, translation);

        vFalloff = falloffsmooth(dist, 14.0, 2.0, 13.0, 0.75);
        float glowFalloff = 1.0 - smoothstep(0.2, 0.4, 1.0 - vFalloff);

        vec3 scaledCentr = centr * 0.3;
        vec3 axis = normalize(rand * 2.0 - 1.0);
        float angle = 0.5 * smoothstep(1.5, 12.0, -vPos.z) + firstRingMask * camFactor * 0.5;
        pos -= scaledCentr;
        pos = rotate3D(pos, axis, angle);
        pos += scaledCentr;

        pos += centr * glowFalloff * mix(0.075, 0.15, rand.z);
        pos += rand.y * centr * glowFalloff * sin(rand.x * 5.0 + uTime * 0.5 + (centr.x + centr.y + centr.z) * 15.0) * 0.05;
        pos += centr * camFactor * 0.15 * firstRingMask;

        float spinFalloff = falloffsmooth(dist, 8.0, 2.0, 5.0, 0.5);
        float spinFalloff2 = falloffsmooth(dist, 10.0, 2.0, 8.0, 0.5);
        pos.xz = rotate2(pos.xz, spinFalloff * 3.14159 * 0.3);
        pos.xy = rotate2(pos.xy, spinFalloff2 * 3.14159 * 0.3 + translation.y * 0.25 + 1.5);

        vFade = min(1.0, falloffsmooth(dist, 2.0, 16.0, 9.0, 0.5));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      ${GLSL_SINE_NOISE}

      uniform float uTime;
      uniform vec2 uResolution;
      uniform sampler2D tMap;
      uniform sampler2D tGlow;
      uniform float uAlpha;
      uniform vec3 uColor1;
      uniform vec3 uColor2;

      varying vec2 vUv;
      varying vec3 vPos;
      varying float vFalloff;
      varying float vFade;

      void main() {
        vec3 color = texture2D(tMap, vUv).rgb;

        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        float diagonalGradient = (screenUv.x + screenUv.y) * 0.5;
        diagonalGradient *= sinenoise1(vec3(screenUv, uTime * 0.614)) * 0.5 + 0.5;
        diagonalGradient *= sinenoise1(vec3(screenUv * 2.0, uTime * 0.17)) * 0.5 + 0.5;
        vec3 bg = mix(uColor1, uColor2, diagonalGradient) * 1.1;

        color = mix(bg, color, vFade * 0.95);

        float falloffValue = 1.0 - vFalloff;
        float glowFalloff = smoothstep(0.2, 0.4, falloffValue);
        float n1 = sinenoise1(vPos + uTime * 0.5 + color.r * 5.0) * 0.5 + 0.5;
        n1 = n1 * 0.5 + 0.5;
        float camFactor = pow(1.0 - clamp(-cameraPosition.z, 0.0, 1.0), 4.0);
        color += texture2D(tGlow, vUv).r * vec3(0.5, 0.7, 1.0) * n1 * glowFalloff * 0.8 * camFactor;

        gl_FragColor = vec4(color, uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
}

export function createEntryFloorMaterial({ map = null, perlin = null }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      tMap: { value: map },
      tPerlin: { value: perlin },
      uAlpha: { value: 0 },
      uColor1: { value: new THREE.Color('#6a6f7d') },
      uColor2: { value: new THREE.Color('#e1e6f1') },
      uRotationTime: { value: 0 }
    },
    vertexShader: `
      ${GLSL_ROTATION}

      attribute float animationmask;
      attribute float iteration;
      attribute float glow;

      uniform float uRotationTime;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vPosOriginal;
      varying float vGlow;

      void main() {
        vUv = uv;
        vGlow = glow;
        vPosOriginal = position;

        vec3 pos = position;
        float t = uRotationTime;
        vec3 axis = normalize(vec3(0.0, 0.5, 1.0));
        axis = rotate3D(axis, vec3(0.0, 1.0, 0.0), t * 1.25 + iteration * 1.2);
        float angle = 0.03 * animationmask;
        pos = rotate3D(pos, axis, angle);
        pos.y -= sin(iteration - t) * 0.01 * animationmask;
        pos.y -= animationmask * 0.04;

        vPos = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      ${GLSL_FALLOFF}
      ${GLSL_SINE_NOISE}

      uniform float uTime;
      uniform vec2 uResolution;
      uniform sampler2D tMap;
      uniform float uAlpha;
      uniform vec3 uColor1;
      uniform vec3 uColor2;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vPosOriginal;
      varying float vGlow;

      void main() {
        float posLen = length(vPos.xz);
        vec3 color = texture2D(tMap, vUv).rgb;
        color *= mix(0.65, 1.0, vPos.x * 0.5 + 0.5);
        color += (vPos.x + 1.0) * 0.02;

        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        float diagonalGradient = (screenUv.x + screenUv.y) * 0.5;
        diagonalGradient *= sinenoise1(vec3(screenUv, uTime * 0.614)) * 0.5 + 0.5;
        diagonalGradient *= sinenoise1(vec3(screenUv * 2.0, uTime * 0.17)) * 0.5 + 0.5;
        vec3 bg = mix(uColor1, uColor2, diagonalGradient);

        float alpha = falloffsmooth(posLen * 3.0, 0.0, 6.0, 3.0, uAlpha);
        alpha *= smoothstep(1.99, 1.3, posLen);

        float shadow = min(1.0, length(vPos * 1.5 + vec3(1.15, 0.0, -0.55)));
        shadow = pow(shadow, 2.0);
        shadow += sin(uTime * 3.3 + vPos.z * 5.0) * 0.1 + 0.1;
        shadow += sin(uTime * 3.1 + vPos.x * 4.0) * 0.1 + 0.1;
        shadow = mix(0.5, 1.0, shadow);
        color *= mix(vec3(0.5, 0.7, 1.0) * 0.1, vec3(1.0), shadow);

        vec3 blue = vec3(0.5, 0.7, 1.0) * (1.0 - smoothstep(1.4, 1.6, posLen));
        float glowModulation = smoothstep(0.087, -0.1, vPosOriginal.y);
        float animatedGlow = smoothstep(0.087, 0.05, vPosOriginal.y);
        animatedGlow *= sin(vPos.z * 5.0 + posLen * 10.0 - uTime * 0.75) * 0.5 + 0.5;
        color += blue * glowModulation;
        color += blue * animatedGlow;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
}

export function createPortalForcefieldMaterial(trianglesTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uHeight: { value: 3 },
      tTriangles: { value: trianglesTexture ?? null }
    },
    vertexShader: `
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
    `,
    fragmentShader: `
      ${GLSL_SINE_NOISE}

      uniform float uTime;
      uniform float uAlpha;
      uniform sampler2D tTriangles;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vEye;

      void main() {
        vec2 uv = vUv;
        uv.x *= 2.0;

        vec3 pos = vPos;
        float t = uTime * 0.5;
        float noise = sinenoise1(pos * 4.0 + vec3(0.0, t * 0.45, -t * 0.13)) * 0.5 + 0.5;
        noise *= sinenoise1(pos * 2.0 + vec3(t * 0.3, -t * 0.27, t * 0.2)) * 0.5 + 0.5;
        noise = sin(noise * 15.0 - t * 7.0) * 0.5 + 0.5;
        noise = pow(noise, 4.0);

        float triangles = texture2D(tTriangles, uv * 6.0 + vec2(noise * 0.05)).r;
        float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vEye)));
        float softedge = 1.0 - smoothstep(0.65, 0.99, fresnel);
        fresnel = mix(fresnel, 1.0, 0.25);
        float fadetop = 1.0 - smoothstep(0.5, 1.0, vUv.y);

        float alpha = (noise * triangles * 2.0 + noise * 0.03) * fresnel * softedge * fadetop;
        alpha *= uAlpha;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

export function createRoomRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      vec2 rotate2(vec2 v, float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, s, -s, c) * v;
      }
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.xz = rotate2(pos.xz, -uTime * 0.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5);
        float alpha = smoothstep(0.5, 0.3, dist);
        alpha *= smoothstep(0.3, 0.4, dist);
        alpha *= smoothstep(0.03, 0.1, abs(vUv.x - 0.5));
        alpha *= mix(1.0, 0.8, sin(dist + vUv.x * 2.0 + vUv.y) * 0.5 + 0.5);
        gl_FragColor = vec4(vec3(2.0), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

export function createTextCylinderMaterial(atlas, outer = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: atlas ?? null },
      uAlpha: { value: outer ? 1 : 0 }
    },
    vertexShader: `
      attribute float rand;
      varying vec2 vUv;
      varying vec3 vPos;
      varying float vRand;
      void main() {
        vUv = uv;
        vPos = position;
        vRand = rand;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tMap;
      uniform float uAlpha;
      varying vec2 vUv;
      varying vec3 vPos;
      varying float vRand;
      void main() {
        float alpha = texture2D(tMap, vUv).r;
        alpha *= ${outer ? '0.25' : 'clamp(vPos.y * 2.0, 0.0, 1.0)'};
        alpha *= sin(vRand * 10.0 + (vPos.x * 2.0 + vPos.z * 2.0 ${outer ? '+ vPos.y' : ''})) * 0.5 + 0.5;
        alpha *= uAlpha;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
}

export function createSmokeTrailMaterial(noise) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      tNoise: { value: noise ?? null }
    },
    vertexShader: `
      varying float vFalloff;
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        vUv = uv;
        vec3 pos = position;
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;

        float depth = -(modelViewMatrix * vec4(position, 1.0)).z;
        vFalloff = 1.0 - smoothstep(2.0, 15.0, depth);
        vFalloff *= smoothstep(0.5, 2.0, depth);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform sampler2D tNoise;

      varying float vFalloff;
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        vec2 uv = vUv * vec2(0.25, 0.5);
        uv.x += vPos.z * 0.1;
        float t = uTime * 0.15;

        float value = texture2D(tNoise, uv * 3.0 + vec2(-t, t * 0.7)).r;
        value *= texture2D(tNoise, uv * 4.0 + vec2(-t, t * 0.7)).r;
        value *= texture2D(tNoise, uv * 6.0 + vec2(-t, t * 0.7)).r;

        float fade = 1.0;
        fade *= smoothstep(0.0, 0.2, vUv.y);
        fade *= smoothstep(1.0, 0.5, vUv.y);
        fade *= 1.0 - abs((vUv.x - 0.5) * 2.0);
        value *= fade;
        value *= vFalloff;

        float alpha = min(1.0, pow(value * 2.75, 3.0)) * uOpacity;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

export function createTunnelMaterial(noise) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      tNoise: { value: noise ?? null }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv * vec2(1.0, 0.25);
        uv.x += uv.y;
        float t = uTime * 0.05;
        float value = texture2D(tNoise, uv * 3.0 + vec2(-t, t * 0.7)).r;
        value *= texture2D(tNoise, uv * 4.0 + vec2(-t, t * 0.7)).r;
        value *= texture2D(tNoise, uv * 6.0 + vec2(-t, t * 0.7)).r;
        float fade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), pow(value * fade, 3.0) * 3.0 * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

export function createParticleField(count = 720) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    const radius = Math.sqrt(Math.random()) * 0.32;
    const angle = Math.random() * Math.PI * 2;
    positions[stride] = Math.cos(angle) * radius;
    positions[stride + 1] = (Math.random() - 0.5) * 0.78;
    positions[stride + 2] = Math.sin(angle) * radius;
    seeds[index] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

export function createParticleMaterial({ color = '#ffd4a6', opacity = 0.7, size = 0.05 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSize: { value: size },
      uInitialGlow: { value: 1 },
      uColor: { value: new THREE.Color(color) },
      uColorInitial: { value: new THREE.Color('#b5d5ff') },
      uColorDark: { value: new THREE.Color('#222b42') }
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vSeed;
      varying float vHeight;
      varying float vRadius;
      void main() {
        vSeed = aSeed;
        vec3 transformed = position;
        float swirl = uTime * mix(0.6, 1.2, aSeed);
        transformed.x += sin(swirl + position.y * 12.0) * 0.02;
        transformed.z += cos(swirl * 0.9 + position.x * 10.0) * 0.02;
        transformed.y += sin(swirl * 1.3 + aSeed * 18.0) * 0.01;
        vHeight = transformed.y;
        vRadius = length(transformed.xz);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * (1.0 + fract(aSeed * 17.0)) * 140.0 / max(1.0, -mvPosition.z);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uInitialGlow;
      uniform vec3 uColor;
      uniform vec3 uColorInitial;
      uniform vec3 uColorDark;
      varying float vSeed;
      varying float vHeight;
      varying float vRadius;
      void main() {
        float alpha = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        float pulse = 0.75 + 0.25 * sin(uTime * 2.0 + vSeed * 20.0);
        float shade = smoothstep(0.3, 0.02, vRadius) * (0.65 + 0.35 * smoothstep(-0.34, 0.35, vHeight));
        vec3 base = mix(uColorDark, uColor, shade);
        vec3 glow = mix(base, uColorInitial, uInitialGlow);
        gl_FragColor = vec4(glow * pulse, alpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

export function createSnowParticleField(count = 200) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const random = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    positions[stride] = (Math.random() - 0.5) * 3;
    positions[stride + 1] = (Math.random() - 0.5) * 8;
    positions[stride + 2] = (Math.random() - 0.5) * 3;
    random[stride] = Math.random();
    random[stride + 1] = Math.random();
    random[stride + 2] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('random', new THREE.BufferAttribute(random, 3));
  return geometry;
}

export function createSnowParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: `
      attribute vec3 random;
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec3 vRandom;
      varying float vAlpha;

      vec3 wrapBox(vec3 value, vec3 size) {
        return mod(value + size * 0.5, size) - size * 0.5;
      }

      vec2 rotate2(vec2 v, float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, s, -s, c) * v;
      }

      void main() {
        vRandom = random;
        vec3 pos = position;
        float t = uTime * mix(0.2, 1.0, random.x);
        pos.y -= mix(0.4, 0.7, fract(random.x + random.z + random.y)) * uTime;
        float angle = t * 0.5 + pos.y;
        pos.x += sin(angle) * 0.4;
        pos.z += cos(angle) * 0.4;
        pos.xz = rotate2(pos.xz, t * 0.5);
        pos = wrapBox(pos, vec3(3.0, 4.0, 3.0));

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        float worldY = (modelMatrix * vec4(pos, 1.0)).y;
        vAlpha = 1.0;
        vAlpha *= smoothstep(8.0, 0.0, -worldY);
        vAlpha *= smoothstep(0.0, 2.0, -worldY);
        vAlpha *= 1.0 - min(1.0, length(pos.xz) * 0.5);
        vAlpha *= smoothstep(0.5, 1.0, -mvPos.z);
        vAlpha *= smoothstep(0.0, 2.0, -mvPos.z);
        vAlpha *= sin(uTime + random.x + random.z * 13.0) * 0.5 + 0.5;
        vAlpha *= 0.3;

        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = 50.0 / length(mvPos.xyz) * (uResolution.y / 1300.0);
      }
    `,
    fragmentShader: `
      uniform float uAlpha;
      varying vec3 vRandom;
      varying float vAlpha;

      vec2 rotate2(vec2 v, float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, s, -s, c) * v;
      }

      void main() {
        vec2 uv = gl_PointCoord.xy;
        float alpha = vAlpha;
        float circularGrad = 1.0 - length(uv - 0.5) * 2.0;
        alpha *= circularGrad;

        uv -= 0.5;
        uv = rotate2(uv, vRandom.y * 6.28318 + mix(0.5, 0.2, vRandom.x));
        uv += 0.5;

        float squish = pow(1.0 - abs(uv.x - 0.5), floor(vRandom.y * 3.0 + 2.0));
        alpha *= squish;
        alpha = clamp(alpha, 0.0, 1.0) * uAlpha;

        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

export function createAmbientParticleField(count = 60) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const random = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    positions[stride] = (Math.random() - 0.5) * 2.5;
    positions[stride + 1] = (Math.random() - 0.5) * 0.5;
    positions[stride + 2] = (Math.random() - 0.5) * 2.5;
    random[stride] = Math.random();
    random[stride + 1] = Math.random();
    random[stride + 2] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('random', new THREE.BufferAttribute(random, 3));
  return geometry;
}

export function createAmbientParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uAlpha: { value: 1 }
    },
    vertexShader: `
      attribute vec3 random;
      uniform float uTime;
      uniform vec2 uResolution;
      varying float vLightFalloff;
      void main() {
        float t = uTime * 0.1;
        vec3 pos = position;
        pos.x += sin(t * 0.4 + position.z * 2.5) * 0.75;
        pos.y += sin(t * 0.2 + position.x * 2.5) * 0.75;
        pos.z += sin(t * 0.2 + position.y * 2.5) * 0.75;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = mix(7.0, 12.0, random.x) * uResolution.y * 0.002;

        vLightFalloff = sin(uTime * 1.8 + random.y * 22.43) * 0.4 + 0.6;
        vLightFalloff *= smoothstep(0.2, 0.24, length(pos.xz));
        vLightFalloff *= 1.25;
      }
    `,
    fragmentShader: `
      uniform float uAlpha;
      varying float vLightFalloff;
      void main() {
        vec2 uv = gl_PointCoord.xy;
        uv.y = 1.0 - uv.y;
        float circularGrad = 1.0 - clamp(length(uv - 0.5) * 2.0, 0.0, 1.0);
        circularGrad *= pow(uv.x, 2.0);
        circularGrad = pow(circularGrad, 2.0);
        float alpha = circularGrad * vLightFalloff * uAlpha;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}
