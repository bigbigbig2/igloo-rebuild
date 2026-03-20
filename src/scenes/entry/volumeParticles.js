import * as THREE from 'three';

const DISPLAY_VERTEX_SHADER = /* glsl */ `
  varying float vShadow;
  varying float vVelocity;

  uniform sampler2D tTexture1;
  uniform sampler2D tTexture2;
  uniform vec2 uResolution;
  uniform float uSize;

  attribute vec2 texuv;

  void main() {
    vec4 posData = texture2D(tTexture1, texuv);
    vec4 velData = texture2D(tTexture2, texuv);

    vec4 mvPosition = modelViewMatrix * vec4(posData.xyz, 1.0);

    vShadow = posData.w;
    vVelocity = velData.w;

    gl_Position = projectionMatrix * mvPosition;

    float distanceToCamera = max(length(mvPosition.xyz), 0.0001);
    gl_PointSize =
      max(uSize * 220.0, 1.5)
      / distanceToCamera
      * (uResolution.y / 1300.0);
  }
`;

const DISPLAY_FRAGMENT_SHADER = /* glsl */ `
  varying float vShadow;
  varying float vVelocity;

  uniform vec3 uColorInitial;
  uniform vec3 uColorLight;
  uniform vec3 uColorDark;
  uniform vec3 uColorFast;
  uniform vec3 uLightPos;

  uniform float uVisible;
  uniform float uAlpha;
  uniform float uInitialGlow;

  float linearstep(float edge0, float edge1, float value) {
    return clamp((value - edge0) / max(edge1 - edge0, 0.00001), 0.0, 1.0);
  }

  float fit(float value, float srcMin, float srcMax, float dstMin, float dstMax) {
    float t = clamp((value - srcMin) / max(srcMax - srcMin, 0.00001), 0.0, 1.0);
    return mix(dstMin, dstMax, t);
  }

  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
  }

  void main() {
    float alpha = step(length(gl_PointCoord.xy - 0.5), 0.5) * uVisible;
    if (alpha < 0.001 || uAlpha < 0.001) {
      discard;
    }

    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
    float radiusSq = dot(uv, uv);
    vec3 normal = normalize(vec3(uv, sqrt(max(1.0 - radiusSq, 0.0))));
    normal.y = 1.0 - normal.y;

    vec3 lightDirection = normalize(rotateY(3.14159265) * uLightPos);
    float lightShadow = max(0.0, dot(lightDirection, normalize(normal)));
    float ramp = lightShadow * clamp(vShadow, 0.0, 1.0);

    vec3 color = mix(uColorDark, uColorLight, ramp);
    float fastMix = pow(fit(vVelocity, 0.003, 0.005, 0.0, 1.0), 2.0);
    color = mix(color, uColorFast, fastMix);

    alpha *= max(uInitialGlow, pow(fit(vVelocity, 0.002, 0.007, 1.0, 0.0), 2.0) * 0.5 + 0.5);

    vec3 fadeInColor = mix(vec3(1.0), uColorInitial, linearstep(0.0, 1.0, uAlpha));
    color = mix(color, fadeInColor, uInitialGlow);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha * uAlpha);
  }
`;

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  in vec3 position;

  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RESET_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  uniform sampler2D tOrig;

  layout(location = 0) out vec4 outPosition;
  layout(location = 1) out vec4 outVelocity;

  void main() {
    ivec2 uv = ivec2(gl_FragCoord.xy);
    vec4 origin = texelFetch(tOrig, uv, 0);
    outPosition = vec4(origin.xyz, 1.0);
    outVelocity = vec4(0.0);
  }
`;

const COMPUTE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  precision highp sampler3D;

  uniform sampler2D tTexture1;
  uniform sampler2D tTexture2;
  uniform sampler2D tOrig;
  uniform sampler3D tVolume;

  uniform float uTime;
  uniform float uDelta;
  uniform float uRotation;
  uniform float uCubeSize;
  uniform float uVolumeScale;
  uniform float uShowNoise;
  uniform float uAdditionalNoise;
  uniform float uInteractForce;
  uniform float uInteractRadius;
  uniform float uSimulationSpeed;
  uniform float uFlowForceMultiplier;
  uniform float uOrigForceMultiplier;
  uniform float uSurfaceForceMultiplier;
  uniform float uFriction;
  uniform float uInteractionForceMultiplier;

  uniform vec3 uInteractPoint;
  uniform vec3 uInteractDelta;
  uniform vec3 uLightPos;

  layout(location = 0) out vec4 outPosition;
  layout(location = 1) out vec4 outVelocity;

  float saturate(float value) {
    return clamp(value, 0.0, 1.0);
  }

  float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
  }

  vec3 pseudoCurl(vec3 position, float time, float seed) {
    vec3 a = vec3(
      sin(position.y * 4.7 + position.z * 2.1 + time * (0.32 + seed * 0.18)),
      sin(position.z * 4.1 + position.x * 2.8 + time * (0.37 + seed * 0.16)),
      sin(position.x * 3.8 + position.y * 2.4 + time * (0.28 + seed * 0.19))
    );

    vec3 b = vec3(
      cos(position.y * 3.1 - position.z * 3.6 - time * (0.26 + seed * 0.14)),
      cos(position.z * 3.4 - position.x * 3.1 - time * (0.31 + seed * 0.15)),
      cos(position.x * 3.9 - position.y * 3.5 - time * (0.35 + seed * 0.12))
    );

    return normalize(cross(a, b) + vec3(0.0001));
  }

  float frictionFPS(float friction, float dtRatio) {
    return pow(friction, dtRatio);
  }

  void main() {
    ivec2 uv = ivec2(gl_FragCoord.xy);

    vec4 currentPos = texelFetch(tTexture1, uv, 0);
    vec4 currentVel = texelFetch(tTexture2, uv, 0);
    vec4 origPos = texelFetch(tOrig, uv, 0);

    float dtRatio = clamp(uDelta * uSimulationSpeed * 60.0, 0.35, 2.5);
    float seed = origPos.w;
    float additionalNoise = max(uAdditionalNoise, uShowNoise);

    mat3 rotMatrix = rotateY(uRotation);

    vec3 samplePos = rotMatrix * (currentPos.xyz / max(uCubeSize, 0.0001)) * uVolumeScale + 0.5;
    samplePos = clamp(samplePos, vec3(0.001), vec3(0.999));

    vec4 volData = texture(tVolume, samplePos);
    vec3 grad = volData.rgb * 2.0 - 1.0;
    float gradLen = length(grad);
    grad = gradLen > 0.0001
      ? normalize(grad * rotMatrix)
      : normalize(currentPos.xyz - origPos.xyz + vec3(0.0, 1.0, 0.0));

    float dist = (volData.a * 2.0 - 1.0) * 2.0;

    vec3 flow = pseudoCurl(currentPos.xyz * 7.0 + seed * 13.7, uTime, seed);
    float flowForce = (
      0.0002 * (0.7 + 0.3 * hash11(seed * 19.7))
      + 0.0004 * additionalNoise
    ) * uFlowForceMultiplier;
    currentVel.xyz += flow * flowForce * dtRatio;

    vec3 toOrig = origPos.xyz - currentPos.xyz;
    float origForce = 0.001 * uOrigForceMultiplier;
    currentVel.xyz += toOrig * origForce * dtRatio;

    float surfaceForce = 0.0015 * (0.7 + 0.3 * hash11(seed * 53.1)) * uSurfaceForceMultiplier;
    float signForce = mix(0.0, -0.3, sign(dist) + 1.0);
    currentVel.xyz += grad * surfaceForce * signForce * dtRatio;

    vec3 toInteract = currentPos.xyz - uInteractPoint;
    float interactDistance = length(toInteract);
    if (uInteractForce > 0.001 && interactDistance < uInteractRadius) {
      float interactMask =
        smoothstep(uInteractRadius, 0.0, interactDistance)
        * uInteractForce
        * uInteractionForceMultiplier;
      vec3 interactDirection = normalize(toInteract + vec3(0.0001));
      vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), interactDirection) + vec3(0.0001));
      vec3 interactImpulse = (uInteractDelta * 0.35 + tangent * length(uInteractDelta) * 0.18);
      currentVel.xyz += interactImpulse * interactMask * dtRatio * 0.35;
    }

    currentVel.xyz *= frictionFPS(uFriction, dtRatio);
    currentPos.xyz += currentVel.xyz * dtRatio;

    currentPos.y = clamp(currentPos.y, -0.34, 0.35);

    float radialLength = length(currentPos.xz);
    if (radialLength > 0.0001) {
      currentPos.xz = normalize(currentPos.xz) * clamp(radialLength, 0.0, 0.275);
    } else {
      currentPos.xz = vec2(0.0);
    }

    vec3 lightPos = normalize(uLightPos);
    float wrap = 0.25;
    float dp = dot(lightPos, grad);
    float wrapDiffuse = max(0.0, (dp + wrap) / (1.0 + wrap));
    wrapDiffuse += max(0.0, -dp) * 0.1;

    float targetShadow = mix(wrapDiffuse * 0.2, wrapDiffuse, smoothstep(-0.05, -0.001, dist));
    currentPos.a = mix(targetShadow, currentPos.a, additionalNoise);
    currentVel.a = mix(currentVel.a, length(currentVel.xyz), saturate(0.035 * dtRatio));

    outPosition = currentPos;
    outVelocity = currentVel;
  }
`;

function createDataTexture(data, size) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createStateTarget(size) {
  const target = new THREE.WebGLRenderTarget(size, size, {
    count: 2,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false
  });

  target.textures.forEach((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  });

  return target;
}

function buildParticleGeometry(textureSize) {
  const particleCount = textureSize * textureSize;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const texuv = new Float32Array(particleCount * 2);
  const rand = new Float32Array(particleCount * 4);

  for (let index = 0; index < particleCount; index += 1) {
    const x = index % textureSize;
    const y = Math.floor(index / textureSize);
    const texelIndex = index * 2;
    const randIndex = index * 4;

    texuv[texelIndex + 0] = (x + 0.5) / textureSize;
    texuv[texelIndex + 1] = (y + 0.5) / textureSize;

    rand[randIndex + 0] = Math.random();
    rand[randIndex + 1] = Math.random();
    rand[randIndex + 2] = Math.random();
    rand[randIndex + 3] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('texuv', new THREE.BufferAttribute(texuv, 2));
  geometry.setAttribute('rand', new THREE.BufferAttribute(rand, 4));
  geometry.computeBoundingSphere();

  return geometry;
}

function buildInitialState(textureSize, cubeSize) {
  const count = textureSize * textureSize;
  const posData = new Float32Array(count * 4);
  const velData = new Float32Array(count * 4);
  const origData = new Float32Array(count * 4);
  const halfCube = cubeSize * 0.5;

  for (let index = 0; index < count; index += 1) {
    const stride = index * 4;
    const x = THREE.MathUtils.randFloatSpread(cubeSize);
    const y = THREE.MathUtils.randFloatSpread(cubeSize);
    const z = THREE.MathUtils.randFloatSpread(cubeSize);
    const seed = Math.random();

    posData[stride + 0] = x;
    posData[stride + 1] = y;
    posData[stride + 2] = z;
    posData[stride + 3] = 1;

    velData[stride + 0] = 0;
    velData[stride + 1] = 0;
    velData[stride + 2] = 0;
    velData[stride + 3] = 0;

    origData[stride + 0] = THREE.MathUtils.clamp(x, -halfCube, halfCube);
    origData[stride + 1] = THREE.MathUtils.clamp(y, -halfCube, halfCube);
    origData[stride + 2] = THREE.MathUtils.clamp(z, -halfCube, halfCube);
    origData[stride + 3] = seed;
  }

  return {
    positionTexture: createDataTexture(posData, textureSize),
    velocityTexture: createDataTexture(velData, textureSize),
    origTexture: createDataTexture(origData, textureSize)
  };
}

function buildVolumeShapeTexture(volumeTexture, textureSize, cubeSize, volumeScale = 1) {
  const image = volumeTexture?.image;
  const data = image?.data;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const depth = image?.depth ?? 0;

  if (!data || !width || !height || !depth) {
    return null;
  }

  const surfaceCandidates = [];
  const interiorCandidates = [];

  const getSignedDistance = (alpha) => ((alpha / 255) * 2 - 1) * 2;
  const getAlpha = (x, y, z) => {
    const index = ((z * height + y) * width + x) * 4;
    return data[index + 3];
  };

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = getAlpha(x, y, z);
        const dist = getSignedDistance(alpha);
        const inside = dist <= 0;
        let isSurface = Math.abs(dist) < 0.22;

        if (!isSurface && inside && x > 0 && y > 0 && z > 0 && x < width - 1 && y < height - 1 && z < depth - 1) {
          const neighborDistances = [
            getSignedDistance(getAlpha(x - 1, y, z)),
            getSignedDistance(getAlpha(x + 1, y, z)),
            getSignedDistance(getAlpha(x, y - 1, z)),
            getSignedDistance(getAlpha(x, y + 1, z)),
            getSignedDistance(getAlpha(x, y, z - 1)),
            getSignedDistance(getAlpha(x, y, z + 1))
          ];

          isSurface = neighborDistances.some((neighborDist) => neighborDist > 0);
        }

        if (isSurface) {
          surfaceCandidates.push([x, y, z]);
        } else if (inside) {
          interiorCandidates.push([x, y, z]);
        }
      }
    }
  }

  const candidates = surfaceCandidates.length > 0 ? surfaceCandidates : interiorCandidates;
  if (candidates.length === 0) {
    return null;
  }

  const count = textureSize * textureSize;
  const shapeData = new Float32Array(count * 4);
  const surfaceBias = interiorCandidates.length > 0 && surfaceCandidates.length > 0 ? 0.86 : 1;

  for (let index = 0; index < count; index += 1) {
    const stride = index * 4;
    const useInterior = interiorCandidates.length > 0 && Math.random() > surfaceBias;
    const source = useInterior ? interiorCandidates : candidates;
    const sample = source[Math.floor(Math.random() * source.length)];
    const jitterAmount = useInterior ? 0.9 : 0.42;
    const jitterX = (Math.random() - 0.5) * jitterAmount + 0.5;
    const jitterY = (Math.random() - 0.5) * jitterAmount + 0.5;
    const jitterZ = (Math.random() - 0.5) * jitterAmount + 0.5;

    const u = (sample[0] + jitterX) / width;
    const v = (sample[1] + jitterY) / height;
    const w = (sample[2] + jitterZ) / depth;

    shapeData[stride + 0] = ((u - 0.5) / Math.max(volumeScale, 0.0001)) * cubeSize;
    shapeData[stride + 1] = ((v - 0.5) / Math.max(volumeScale, 0.0001)) * cubeSize;
    shapeData[stride + 2] = ((w - 0.5) / Math.max(volumeScale, 0.0001)) * cubeSize;
    shapeData[stride + 3] = Math.random();
  }

  return createDataTexture(shapeData, textureSize);
}

const DEFAULT_VOLUME_PARTICLE_DEBUG_SETTINGS = Object.freeze({
  simulationSpeed: 1,
  flowForceMultiplier: 1,
  origForceMultiplier: 1,
  surfaceForceMultiplier: 1,
  friction: 0.9,
  interactionForceMultiplier: 1
});

export class EntryVolumeParticles extends THREE.Group {
  constructor({
    volumeTextures = [],
    volumeScales = [],
    particleCount = 150000,
    cubeSize = 0.65
  } = {}) {
    super();

    this.isVolumeParticleField = true;
    this.hasVolumeTexture = volumeTextures.length > 0;
    this.volumeTextures = volumeTextures;
    this.volumeScales = volumeScales.length > 0
      ? volumeScales
      : new Array(volumeTextures.length).fill(1);
    this.cubeSize = cubeSize;
    this.textureSize = Math.ceil(Math.sqrt(particleCount));
    this.particleCount = this.textureSize * this.textureSize;
    this.currentVolumeIndex = 0;
    this.additionalNoise = 0;
    this.rotationValue = 0;
    this.visibleValue = 0;
    this.warmupSteps = 0;
    this.warmupTarget = 96;
    this.initialized = false;
    this._supportsSimulation = true;
    this.debugSettings = { ...DEFAULT_VOLUME_PARTICLE_DEBUG_SETTINGS };

    this.interactionPoint = new THREE.Vector3();
    this.interactionDelta = new THREE.Vector3();
    this.interactionForce = 0;

    const sharedTime = { value: 0 };
    const sharedAlpha = { value: 1 };
    const sharedSize = { value: 0.055 };
    const sharedInitialGlow = { value: 1 };
    const sharedShowNoise = { value: 1 };
    const sharedAdditionalNoise = { value: 0 };
    const sharedLightPos = { value: new THREE.Vector3(-0.75, 1, -0.1) };

    this.state = buildInitialState(this.textureSize, this.cubeSize);
    this.fallbackOrigTexture = this.state.origTexture;
    this.origTextures = this.volumeTextures.map((texture, index) => {
      return buildVolumeShapeTexture(
        texture,
        this.textureSize,
        this.cubeSize,
        this.volumeScales[index] ?? 1
      ) ?? this.state.origTexture;
    });
    this.state.origTexture = this.origTextures[0] ?? this.state.origTexture;
    this.targets = [createStateTarget(this.textureSize), createStateTarget(this.textureSize)];
    this.currentTarget = this.targets[0];
    this.nextTarget = this.targets[1];

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tTexture1: { value: this.state.positionTexture },
        tTexture2: { value: this.state.velocityTexture },
        uColorInitial: { value: new THREE.Color('#b5d5ff') },
        uColorLight: { value: new THREE.Color('#bdc6d4') },
        uColorDark: { value: new THREE.Color('#222b42') },
        uColorFast: { value: new THREE.Color('#d7ebfa') },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSize: sharedSize,
        uLightPos: sharedLightPos,
        uVisible: { value: 0 },
        uAlpha: sharedAlpha,
        uOpacity: sharedAlpha,
        uInitialGlow: sharedInitialGlow,
        uShowNoise: sharedShowNoise,
        uAdditionalNoise: sharedAdditionalNoise,
        uTime: sharedTime
      },
      vertexShader: DISPLAY_VERTEX_SHADER,
      fragmentShader: DISPLAY_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NormalBlending
    });

    this.geometry = buildParticleGeometry(this.textureSize);
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.name = 'entry_volume_particles';
    this.mesh = this.points;
    this.add(this.points);

    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.simScene.add(this.simQuad);

    this.resetMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tOrig: { value: this.state.origTexture }
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: RESET_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false
    });

    this.computationMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tTexture1: { value: this.state.positionTexture },
        tTexture2: { value: this.state.velocityTexture },
        tOrig: { value: this.state.origTexture },
        tVolume: { value: this.volumeTextures[0] ?? null },
        uTime: sharedTime,
        uDelta: { value: 1 / 60 },
        uRotation: { value: 0 },
        uCubeSize: { value: this.cubeSize },
        uVolumeScale: { value: this.volumeScales[0] ?? 1 },
        uShowNoise: sharedShowNoise,
        uAdditionalNoise: sharedAdditionalNoise,
        uInteractForce: { value: 0 },
        uInteractRadius: { value: 0.22 },
        uSimulationSpeed: { value: this.debugSettings.simulationSpeed },
        uFlowForceMultiplier: { value: this.debugSettings.flowForceMultiplier },
        uOrigForceMultiplier: { value: this.debugSettings.origForceMultiplier },
        uSurfaceForceMultiplier: { value: this.debugSettings.surfaceForceMultiplier },
        uFriction: { value: this.debugSettings.friction },
        uInteractionForceMultiplier: { value: this.debugSettings.interactionForceMultiplier },
        uInteractPoint: { value: this.interactionPoint.clone() },
        uInteractDelta: { value: this.interactionDelta.clone() },
        uLightPos: sharedLightPos
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: COMPUTE_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false
    });
  }

  getDebugSettings() {
    return { ...this.debugSettings };
  }

  setDebugSetting(key, value) {
    if (!(key in this.debugSettings) || !Number.isFinite(value)) {
      return;
    }

    this.debugSettings[key] = value;

    const uniformMap = {
      simulationSpeed: 'uSimulationSpeed',
      flowForceMultiplier: 'uFlowForceMultiplier',
      origForceMultiplier: 'uOrigForceMultiplier',
      surfaceForceMultiplier: 'uSurfaceForceMultiplier',
      friction: 'uFriction',
      interactionForceMultiplier: 'uInteractionForceMultiplier'
    };

    const uniformName = uniformMap[key];
    if (uniformName && this.computationMaterial?.uniforms?.[uniformName]) {
      this.computationMaterial.uniforms[uniformName].value = value;
    }
  }

  resetDebugSettings() {
    this.debugSettings = { ...DEFAULT_VOLUME_PARTICLE_DEBUG_SETTINGS };
    Object.entries(this.debugSettings).forEach(([key, value]) => {
      this.setDebugSetting(key, value);
    });
  }

  setSimulationState({
    delta = 1 / 60,
    elapsed = 0,
    alpha = 1,
    size = 0.055,
    initialGlow = 0,
    showNoise = 0,
    portalCoreProgress = 0
  } = {}) {
    const damping = 1 - Math.exp(-delta * 2.8);

    this.additionalNoise = THREE.MathUtils.lerp(this.additionalNoise, 0, damping);
    this.rotationValue -= delta * 0.00075;

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uAlpha.value = alpha;
    this.material.uniforms.uOpacity.value = alpha;
    this.material.uniforms.uSize.value = size;
    this.material.uniforms.uInitialGlow.value = initialGlow;
    this.material.uniforms.uShowNoise.value = showNoise;
    this.material.uniforms.uAdditionalNoise.value = this.additionalNoise;

    this.computationMaterial.uniforms.uTime.value = elapsed;
    this.computationMaterial.uniforms.uDelta.value = Math.max(delta, 1 / 240);
    this.computationMaterial.uniforms.uRotation.value = this.rotationValue;
    this.computationMaterial.uniforms.uShowNoise.value = showNoise;
    this.computationMaterial.uniforms.uAdditionalNoise.value = this.additionalNoise;
  }

  setVolume(index, { burstNoise = 1 } = {}) {
    if (!Number.isFinite(index) || this.volumeTextures.length <= 0) {
      return false;
    }

    const nextIndex = THREE.MathUtils.clamp(Math.round(index), 0, this.volumeTextures.length - 1);
    if (nextIndex === this.currentVolumeIndex) {
      return false;
    }

    this.currentVolumeIndex = nextIndex;
    this.rotationValue = Math.PI * 1.5;
    this.additionalNoise = Math.max(this.additionalNoise, burstNoise);
    this.computationMaterial.uniforms.tVolume.value = this.volumeTextures[nextIndex];
    this.computationMaterial.uniforms.tOrig.value = this.origTextures[nextIndex] ?? this.state.origTexture;
    this.resetMaterial.uniforms.tOrig.value = this.origTextures[nextIndex] ?? this.state.origTexture;
    this.computationMaterial.uniforms.uVolumeScale.value = this.volumeScales[nextIndex] ?? 1;
    this.material.uniforms.uAdditionalNoise.value = this.additionalNoise;
    this.computationMaterial.uniforms.uAdditionalNoise.value = this.additionalNoise;
    return true;
  }

  setInteraction({ point, delta, force = 0 } = {}) {
    if (point?.isVector3) {
      this.interactionPoint.copy(point);
    } else {
      this.interactionPoint.set(0, 0, 0);
    }

    if (delta?.isVector3) {
      this.interactionDelta.copy(delta);
    } else {
      this.interactionDelta.set(0, 0, 0);
    }

    this.interactionForce = THREE.MathUtils.clamp(force, 0, 1);
    this.computationMaterial.uniforms.uInteractPoint.value.copy(this.interactionPoint);
    this.computationMaterial.uniforms.uInteractDelta.value.copy(this.interactionDelta);
    this.computationMaterial.uniforms.uInteractForce.value = this.interactionForce;
  }

  initialize(renderer) {
    if (this.initialized || !renderer) {
      return;
    }

    this._supportsSimulation = !!renderer.capabilities?.isWebGL2;
    if (!this._supportsSimulation) {
      this.material.uniforms.uVisible.value = 1;
      this.initialized = true;
      return;
    }

    const previousTarget = renderer.getRenderTarget();
    this.simQuad.material = this.resetMaterial;

    for (const target of this.targets) {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(this.simScene, this.simCamera);
    }

    renderer.setRenderTarget(previousTarget);

    this.currentTarget = this.targets[0];
    this.nextTarget = this.targets[1];
    this.syncTextures();
    this.initialized = true;
  }

  syncTextures() {
    this.material.uniforms.tTexture1.value = this.currentTarget.textures[0];
    this.material.uniforms.tTexture2.value = this.currentTarget.textures[1];
    this.computationMaterial.uniforms.tTexture1.value = this.currentTarget.textures[0];
    this.computationMaterial.uniforms.tTexture2.value = this.currentTarget.textures[1];
  }

  step(renderer, iterations = 1) {
    if (!renderer) {
      return;
    }

    this.initialize(renderer);

    if (!this._supportsSimulation) {
      return;
    }

    const previousTarget = renderer.getRenderTarget();
    this.simQuad.material = this.computationMaterial;

    for (let index = 0; index < iterations; index += 1) {
      this.computationMaterial.uniforms.tTexture1.value = this.currentTarget.textures[0];
      this.computationMaterial.uniforms.tTexture2.value = this.currentTarget.textures[1];

      renderer.setRenderTarget(this.nextTarget);
      renderer.clear();
      renderer.render(this.simScene, this.simCamera);

      const swapTarget = this.currentTarget;
      this.currentTarget = this.nextTarget;
      this.nextTarget = swapTarget;
    }

    renderer.setRenderTarget(previousTarget);
    this.syncTextures();
  }

  prewarm(renderer, steps = 1) {
    if (!renderer || !this.hasVolumeTexture) {
      return;
    }

    const remainingWarmup = Math.max(0, this.warmupTarget - this.warmupSteps);
    const iterationBudget = remainingWarmup > 0
      ? Math.max(remainingWarmup, steps)
      : 1;

    this.step(renderer, iterationBudget);
    this.warmupSteps += iterationBudget;

    if (this.warmupSteps >= this.warmupTarget) {
      this.material.uniforms.uVisible.value = 1;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.points.geometry.dispose();
    this.simQuad.geometry.dispose();
    this.resetMaterial.dispose();
    this.computationMaterial.dispose();
    this.targets.forEach((target) => target.dispose());
    this.state.positionTexture.dispose();
    this.state.velocityTexture.dispose();
    if (this.fallbackOrigTexture && !this.origTextures.includes(this.fallbackOrigTexture)) {
      this.fallbackOrigTexture.dispose();
    }
    this.origTextures.forEach((texture) => {
      if (texture && texture !== this.fallbackOrigTexture) {
        texture.dispose();
      }
    });
  }
}
