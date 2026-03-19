import * as THREE from 'three';

const LIGHT_POSITION = new THREE.Vector3(-0.75, 1, -0.1).normalize();
const TEMP_UP = new THREE.Vector3(0, 1, 0);
const TEMP_RIGHT = new THREE.Vector3();
const TEMP_FORWARD = new THREE.Vector3();

const VOLUME_VERTEX_SHADER = /* glsl */ `
  attribute float aSeed;
  attribute float aShadow;

  uniform float uTime;
  uniform float uSize;
  uniform float uShowNoise;
  uniform float uAdditionalNoise;
  uniform vec2 uResolution;

  varying float vShadow;
  varying float vPulse;
  varying float vFast;

  void main() {
    float burst = max(uAdditionalNoise, uShowNoise * 0.85);
    vec3 pos = position;

    vec3 dir = normalize(
      position
      + vec3(
        sin(aSeed * 31.0),
        cos(aSeed * 17.0),
        sin(aSeed * 23.0)
      ) * 0.2
      + vec3(0.0001)
    );

    float driftA = sin(uTime * (0.8 + 1.2 * aSeed) + aSeed * 35.0);
    float driftB = cos(uTime * (1.1 + 0.7 * aSeed) + aSeed * 19.0);
    float driftC = sin(uTime * (0.6 + 0.3 * aSeed) + aSeed * 41.0);

    pos += dir * driftA * 0.012 * burst;
    pos.x += driftB * 0.004 * burst;
    pos.y += driftC * 0.003 * burst;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize =
      uSize
      * mix(0.92, 1.12, fract(aSeed * 17.0))
      * 195.0
      / max(1.0, length(mvPosition.xyz))
      * (uResolution.y / 1300.0);

    vShadow = aShadow;
    vPulse = 0.8 + 0.2 * sin(uTime * 2.0 + aSeed * 20.0);
    vFast = burst * (0.45 + 0.55 * abs(driftA));
  }
`;

const VOLUME_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColorInitial;
  uniform vec3 uColorLight;
  uniform vec3 uColorDark;
  uniform vec3 uColorFast;
  uniform vec3 uLightPos;
  uniform float uVisible;
  uniform float uAlpha;
  uniform float uOpacity;
  uniform float uInitialGlow;

  varying float vShadow;
  varying float vPulse;
  varying float vFast;

  void main() {
    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
    float circle = dot(uv, uv);

    if (circle > 1.0 || uVisible < 0.001) {
      discard;
    }

    vec3 normal = vec3(uv, sqrt(max(1.0 - circle, 0.0)));
    normal.y = 1.0 - normal.y;

    float lightShadow = max(0.0, dot(normalize(uLightPos), normalize(normal)));
    float ramp = mix(vShadow * 0.55, vShadow, lightShadow);

    vec3 color = mix(uColorDark, uColorLight, ramp);
    color = mix(color, uColorFast, vFast * vFast * 0.6);

    vec3 fadeInColor = mix(vec3(1.0), uColorInitial, smoothstep(0.0, 1.0, uAlpha));
    color = mix(color, fadeInColor, uInitialGlow);

    float alpha = (1.0 - smoothstep(0.82, 1.0, circle)) * uAlpha * uOpacity * vPulse;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }
`;

function normalizeChannel(value, texture) {
  if (texture.type === THREE.FloatType) {
    return value;
  }

  if (texture.type === THREE.HalfFloatType) {
    return THREE.DataUtils.fromHalfFloat(value);
  }

  if (value > 1) {
    return value / 255;
  }

  return value;
}

function readVolumeVoxel(texture, x, y, z) {
  const { data, width, height } = texture.image;
  const stride = ((z * height + y) * width + x) * 4;

  return {
    r: normalizeChannel(data[stride], texture),
    g: normalizeChannel(data[stride + 1], texture),
    b: normalizeChannel(data[stride + 2], texture),
    a: normalizeChannel(data[stride + 3], texture)
  };
}

function computeShadow(gradient) {
  const wrap = 0.25;
  const dp = LIGHT_POSITION.dot(gradient);
  let wrapDiffuse = Math.max(0, (dp + wrap) / (1 + wrap));
  wrapDiffuse += Math.max(0, -dp) * 0.1;
  return THREE.MathUtils.clamp(wrapDiffuse, 0.12, 1);
}

function pickSurfaceCandidates(texture, scale, cubeSize) {
  const image = texture?.image;
  if (!image?.data || !image.width || !image.height || !image.depth) {
    return [];
  }

  const { width, height, depth } = image;
  const candidates = [];

  for (let z = 1; z < depth - 1; z += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const voxel = readVolumeVoxel(texture, x, y, z);
        const surfaceDistance = Math.abs(voxel.a - 0.5);
        if (surfaceDistance > 0.06) {
          continue;
        }

        const gradient = new THREE.Vector3(
          voxel.r * 2 - 1,
          voxel.g * 2 - 1,
          voxel.b * 2 - 1
        );

        if (gradient.lengthSq() < 1e-5) {
          continue;
        }

        gradient.normalize();

        const uvw = new THREE.Vector3(
          (x + 0.5) / width,
          (y + 0.5) / height,
          (z + 0.5) / depth
        );

        const position = uvw.clone()
          .subScalar(0.5)
          .multiplyScalar(cubeSize / Math.max(scale, 1e-4));

        candidates.push({
          position,
          gradient,
          shadow: computeShadow(gradient)
        });
      }
    }
  }

  return candidates;
}

function buildSurfaceGeometry(texture, scale, particleCount, cubeSize) {
  const candidates = pickSurfaceCandidates(texture, scale, cubeSize);
  if (candidates.length === 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([0]), 1));
    geometry.setAttribute('aShadow', new THREE.BufferAttribute(new Float32Array([1]), 1));
    return geometry;
  }

  const { width, height, depth } = texture.image;
  const jitterScale = cubeSize / Math.min(width, height, depth) / Math.max(scale, 1e-4) * 1.75;
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  const shadows = new Float32Array(particleCount);

  for (let index = 0; index < particleCount; index += 1) {
    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    const position = candidate.position;
    const normal = candidate.gradient;

    TEMP_RIGHT.crossVectors(
      normal,
      Math.abs(normal.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : TEMP_UP
    ).normalize();
    TEMP_FORWARD.crossVectors(normal, TEMP_RIGHT).normalize();

    const jitterX = (Math.random() - 0.5) * jitterScale;
    const jitterY = (Math.random() - 0.5) * jitterScale;
    const shellOffset = (Math.random() - 0.5) * jitterScale * 0.15;

    const sample = position.clone()
      .addScaledVector(TEMP_RIGHT, jitterX)
      .addScaledVector(TEMP_FORWARD, jitterY)
      .addScaledVector(normal, shellOffset);

    const stride = index * 3;
    positions[stride] = sample.x;
    positions[stride + 1] = sample.y;
    positions[stride + 2] = sample.z;
    seeds[index] = Math.random();
    shadows[index] = candidate.shadow;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aShadow', new THREE.BufferAttribute(shadows, 1));
  return geometry;
}

export class EntryVolumeParticles extends THREE.Group {
  constructor({
    particleCount = 100000,
    cubeSize = 0.65,
    volumeTextures = [],
    volumeScales = []
  } = {}) {
    super();

    this.name = 'EntryVolumeParticles';
    this.particleCount = particleCount;
    this.cubeSize = cubeSize;
    this.volumeTextures = volumeTextures.filter(Boolean);
    this.volumeScales = volumeScales.length > 0
      ? volumeScales
      : this.volumeTextures.map(() => 1);
    this.currentVolumeIndex = 0;

    this.surfaceGeometries = this.volumeTextures.map((texture, index) => {
      return buildSurfaceGeometry(
        texture,
        this.volumeScales[index] ?? 1,
        this.particleCount,
        this.cubeSize
      );
    });

    this.displayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSize: { value: 0.055 },
        uShowNoise: { value: 1 },
        uAdditionalNoise: { value: 0 },
        uVisible: { value: 1 },
        uAlpha: { value: 0 },
        uOpacity: { value: 0 },
        uInitialGlow: { value: 1 },
        uColorInitial: { value: new THREE.Color('#b5d5ff') },
        uColorLight: { value: new THREE.Color('#bdc6d4') },
        uColorDark: { value: new THREE.Color('#222b42') },
        uColorFast: { value: new THREE.Color('#d7ebfa') },
        uLightPos: { value: LIGHT_POSITION.clone() }
      },
      vertexShader: VOLUME_VERTEX_SHADER,
      fragmentShader: VOLUME_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    this.points = new THREE.Points(
      this.surfaceGeometries[0] ?? buildSurfaceGeometry(
        {
          image: {
            data: new Uint8Array([0, 0, 0, 255]),
            width: 1,
            height: 1,
            depth: 1
          },
          type: THREE.UnsignedByteType
        },
        1,
        1,
        this.cubeSize
      ),
      this.displayMaterial
    );
    this.points.frustumCulled = false;
    this.add(this.points);
  }

  get material() {
    return this.displayMaterial;
  }

  get isVolumeParticleField() {
    return true;
  }

  get hasVolumeTexture() {
    return this.surfaceGeometries.length > 0;
  }

  setSimulationState({
    delta = null,
    elapsed = null,
    alpha = null,
    size = null,
    initialGlow = null,
    showNoise = null,
    portalCoreProgress = null
  } = {}) {
    if (Number.isFinite(delta)) {
      const safeDelta = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 20);
      if (this.displayMaterial.uniforms.uAdditionalNoise.value > 0) {
        this.displayMaterial.uniforms.uAdditionalNoise.value = Math.max(
          0,
          this.displayMaterial.uniforms.uAdditionalNoise.value - safeDelta * 2
        );
      }

      void portalCoreProgress;
    }

    if (Number.isFinite(elapsed)) {
      this.displayMaterial.uniforms.uTime.value = elapsed;
    }

    if (Number.isFinite(alpha)) {
      this.displayMaterial.uniforms.uAlpha.value = alpha;
      this.displayMaterial.uniforms.uOpacity.value = alpha;
      this.displayMaterial.uniforms.uVisible.value = alpha > 0.001 ? 1 : 0;
    }

    if (Number.isFinite(size)) {
      this.displayMaterial.uniforms.uSize.value = size;
    }

    if (Number.isFinite(initialGlow)) {
      this.displayMaterial.uniforms.uInitialGlow.value = initialGlow;
    }

    if (Number.isFinite(showNoise)) {
      this.displayMaterial.uniforms.uShowNoise.value = showNoise;
    }
  }

  setVolume(index, { burstNoise = 1 } = {}) {
    if (index < 0 || index >= this.surfaceGeometries.length) {
      return;
    }

    if (index === this.currentVolumeIndex) {
      return;
    }

    this.currentVolumeIndex = index;
    this.points.geometry = this.surfaceGeometries[index];
    this.displayMaterial.uniforms.uAdditionalNoise.value = burstNoise;
  }

  prewarm() {}

  dispose() {
    this.surfaceGeometries.forEach((geometry) => geometry.dispose());
    this.displayMaterial.dispose();
  }
}
