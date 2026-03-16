import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const FALLBACK_GEOMETRY_FACTORY = [
  () => new THREE.TorusKnotGeometry(1.0, 0.26, 180, 32),
  () => new THREE.IcosahedronGeometry(1.25, 1),
  () => new THREE.OctahedronGeometry(1.45, 0)
];

const DETAIL_PARTICLE_COUNT = 180;

const DETAIL_STAGING_PRESETS = {
  pudgy: {
    objectOffset: new THREE.Vector3(-0.08, 0.02, 0.18),
    objectScale: 1.02,
    exposure: 0.16,
    causticsStrength: 1.15,
    rimStrength: 0.2,
    bgOpacity: 0.92,
    haloOpacity: 1.08,
    haloScale: 1.06,
    ringOpacity: 0.92,
    shaftOpacity: 0.76,
    shaftScale: 1,
    planeOpacity: 0.72,
    planeScale: 0.96,
    columnOpacity: 0.8,
    columnScale: 0.96,
    particleOpacity: 0.48,
    particleDrift: 1.12,
    particleScale: 1.06,
    littleParticleOpacity: 0.11,
    littleParticleDrift: 0.78,
    littleParticleScale: 0.96,
    textOpacity: 1.08,
    textSpeed: 0.94,
    textScale: 1.04,
    textYOffset: 0.02,
    haloOffset: new THREE.Vector3(0.25, 0.2, -2.9),
    shaftOffset: new THREE.Vector3(1.45, 0.82, -0.15),
    lightPlaneOffset: new THREE.Vector3(-2.0, -0.82, 0.95),
    cameraTargetY: 0.02,
    cameraX: -0.08,
    cameraZ: 5.0
  },
  overpass_logo: {
    objectOffset: new THREE.Vector3(0.06, -0.12, 0.12),
    objectScale: 0.92,
    exposure: 0.13,
    causticsStrength: 0.9,
    rimStrength: 0.13,
    bgOpacity: 0.72,
    haloOpacity: 0.84,
    haloScale: 0.94,
    ringOpacity: 0.88,
    shaftOpacity: 1.18,
    shaftScale: 1.12,
    planeOpacity: 1.1,
    planeScale: 1.14,
    columnOpacity: 0.64,
    columnScale: 0.84,
    particleOpacity: 0.24,
    particleDrift: 0.72,
    particleScale: 0.9,
    littleParticleOpacity: 0.08,
    littleParticleDrift: 0.62,
    littleParticleScale: 0.88,
    textOpacity: 0.68,
    textSpeed: 1.08,
    textScale: 0.94,
    textYOffset: -0.04,
    haloOffset: new THREE.Vector3(0.12, 0.05, -2.8),
    shaftOffset: new THREE.Vector3(1.25, 0.62, -0.2),
    lightPlaneOffset: new THREE.Vector3(-1.85, -0.98, 1.08),
    cameraTargetY: -0.08,
    cameraX: 0.12,
    cameraZ: 5.2
  },
  abstractlogo: {
    objectOffset: new THREE.Vector3(0, 0.06, 0.08),
    objectScale: 1.08,
    exposure: 0.15,
    causticsStrength: 1.05,
    rimStrength: 0.22,
    bgOpacity: 1,
    haloOpacity: 1.2,
    haloScale: 1.16,
    ringOpacity: 1.14,
    shaftOpacity: 0.9,
    shaftScale: 1.06,
    planeOpacity: 0.92,
    planeScale: 1.08,
    columnOpacity: 0.94,
    columnScale: 1.04,
    particleOpacity: 0.46,
    particleDrift: 1.34,
    particleScale: 1.16,
    littleParticleOpacity: 0.16,
    littleParticleDrift: 1.06,
    littleParticleScale: 1.04,
    textOpacity: 1.24,
    textSpeed: 0.82,
    textScale: 1.12,
    textYOffset: 0.05,
    haloOffset: new THREE.Vector3(-0.08, 0.28, -2.95),
    shaftOffset: new THREE.Vector3(1.7, 0.95, -0.05),
    lightPlaneOffset: new THREE.Vector3(-2.15, -0.74, 0.88),
    cameraTargetY: 0.05,
    cameraX: 0,
    cameraZ: 4.9
  },
  default: {
    objectOffset: new THREE.Vector3(0, 0, 0.1),
    objectScale: 1,
    exposure: 0.14,
    causticsStrength: 1,
    rimStrength: 0.18,
    bgOpacity: 0.86,
    haloOpacity: 1,
    haloScale: 1,
    ringOpacity: 1,
    shaftOpacity: 1,
    shaftScale: 1,
    planeOpacity: 1,
    planeScale: 1,
    columnOpacity: 1,
    columnScale: 1,
    particleOpacity: 0.4,
    particleDrift: 1,
    particleScale: 1,
    littleParticleOpacity: 0.12,
    littleParticleDrift: 1,
    littleParticleScale: 1,
    textOpacity: 1,
    textSpeed: 1,
    textScale: 1,
    textYOffset: 0,
    haloOffset: new THREE.Vector3(0, 0.18, -2.85),
    shaftOffset: new THREE.Vector3(1.52, 0.75, -0.12),
    lightPlaneOffset: new THREE.Vector3(-2.0, -0.87, 1.0),
    cameraTargetY: 0,
    cameraX: 0,
    cameraZ: 5.1
  }
};

function createDetailBgMaterial(perlinTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color('#080c13') },
      uColorB: { value: new THREE.Color('#18222f') },
      tNoise: { value: perlinTexture ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform sampler2D tNoise;

      varying vec2 vUv;

      void main() {
        vec2 uv = vUv - 0.5;
        uv.x *= 1.2;
        float gradient = clamp(pow(vUv.y, 2.3), 0.0, 1.0);
        float radial = 1.0 - clamp(length(uv) * 1.6, 0.0, 1.0);
        float noise = texture2D(tNoise, vUv * 1.65 + vec2(uTime * 0.015, -uTime * 0.01)).r;
        gradient += (noise - 0.5) * 0.08;
        vec3 color = mix(uColorA, uColorB, clamp(gradient + radial * 0.18, 0.0, 1.0));
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
}

function createLightShaftMaterial(perlinTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color('#8ed9ff') },
      tNoise: { value: perlinTexture ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform sampler2D tNoise;

      varying vec2 vUv;

      void main() {
        float noise = texture2D(tNoise, vUv * vec2(1.0, 0.46) + vec2(uTime * 0.08, uTime * 0.025)).r;
        noise += texture2D(tNoise, vUv * vec2(0.55, 0.28) + vec2(-uTime * 0.06, -uTime * 0.031)).r;
        float circularGradient = 1.0 - clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
        circularGradient = pow(circularGradient, 2.0);
        float alpha = circularGradient * noise * 0.065 * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createLightPlaneMaterial(perlinTexture, bokehTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color('#d1e3ff') },
      tNoise: { value: perlinTexture ?? null },
      tBokeh: { value: bokehTexture ?? null }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform sampler2D tNoise;
      uniform sampler2D tBokeh;

      varying vec2 vUv;

      void main() {
        float circularGradient = 1.0 - clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
        circularGradient = pow(circularGradient, 2.0);
        float bokeh = texture2D(tBokeh, vUv * 2.0).r;
        float noise = texture2D(tNoise, vUv * 2.0 + uTime * 0.15).r;
        bokeh *= noise * 5.0;
        float alpha = (circularGradient + bokeh * circularGradient) * 0.14 * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createDetailObjectMaterial(noiseTexture, causticsTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPulse: { value: 0 },
      uHasMap: { value: 0 },
      uExposure: { value: 0.14 },
      uCausticsStrength: { value: 1 },
      uRimStrength: { value: 0.18 },
      uAccent: { value: new THREE.Color('#8ed9ff') },
      tMap: { value: null },
      tNoise: { value: noiseTexture ?? null },
      tCaustics: { value: causticsTexture ?? null }
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
      #include <common>

      uniform float uTime;
      uniform float uOpacity;
      uniform float uPulse;
      uniform float uHasMap;
      uniform float uExposure;
      uniform float uCausticsStrength;
      uniform float uRimStrength;
      uniform vec3 uAccent;
      uniform sampler2D tMap;
      uniform sampler2D tNoise;
      uniform sampler2D tCaustics;

      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 sampledColor = texture2D(tMap, vUv).rgb;
        vec3 baseColor = mix(uAccent, sampledColor, uHasMap);

        float noiseA = texture2D(tNoise, vPos.xy * 0.4 + vec2(-uTime * 0.10, uTime * 0.023)).r;
        float noiseB = texture2D(tNoise, vPos.yz * 0.3 + vec2(uTime * 0.05, -uTime * 0.019)).r;
        float shade = mix(0.03, uExposure, noiseA * 0.65 + noiseB * 0.35);
        vec3 color = baseColor * shade;

        float causticsA = texture2D(tCaustics, vPos.xy * 1.5 + vec2(-uTime * 0.10, uTime * 0.023)).r;
        float causticsB = texture2D(tCaustics, vPos.xy * 2.0 + vec2(uTime * 0.05, -uTime * 0.013)).r;
        float caustics = min(causticsA, causticsB);
        vec3 causticsColor = mix(baseColor, uAccent, 0.72);
        color += causticsColor * caustics * (1.2 + uPulse * 0.7) * uCausticsStrength;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.0);
        color += uAccent * rim * uRimStrength;

        gl_FragColor = vec4(color, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true
  });
}

function createParticleField() {
  const positions = new Float32Array(DETAIL_PARTICLE_COUNT * 3);
  const seeds = new Float32Array(DETAIL_PARTICLE_COUNT);

  for (let index = 0; index < DETAIL_PARTICLE_COUNT; index += 1) {
    const stride = index * 3;
    const radius = 1.1 + Math.random() * 2.8;
    const angle = Math.random() * Math.PI * 2;

    positions[stride] = Math.cos(angle) * radius;
    positions[stride + 1] = (Math.random() - 0.5) * 3.8;
    positions[stride + 2] = Math.sin(angle) * radius * (0.7 + Math.random() * 0.65);
    seeds[index] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));

  return {
    geometry,
    basePositions: positions,
    seeds
  };
}

export class DetailScene extends SceneBase {
  constructor({ assets }) {
    super({
      name: 'detail',
      background: '#080c13'
    });

    this.assets = assets;
    this.project = null;
    this.transitionProgress = 0;
    this.accentColor = new THREE.Color('#8ed9ff');
    this.stagingPreset = DETAIL_STAGING_PRESETS.default;
    this.handoffAnchor = null;
    this.anchorClipVector = new THREE.Vector3();
    this.anchorWorldVector = new THREE.Vector3();
    this.finalObjectVector = new THREE.Vector3();
    this.startQuaternion = new THREE.Quaternion();
    this.finalQuaternion = new THREE.Quaternion();

    const perlinTexture = this.assets.get('texture', 'detail-perlin');
    const bokehTexture = this.assets.get('texture', 'detail-bokeh');
    const causticsTexture = this.assets.get('texture', 'detail-caustics');

    this.bgPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      createDetailBgMaterial(perlinTexture)
    );
    this.bgPlane.position.set(0, 0, -4.8);
    this.bgPlane.renderOrder = -5;
    this.root.add(this.bgPlane);

    const ambient = new THREE.AmbientLight('#ffffff', 1.1);
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.8);
    keyLight.position.set(4, 6, 5);
    this.fillLight = new THREE.PointLight('#b7d9ff', 10, 14, 2);
    this.fillLight.position.set(-2.4, 1.2, 2.1);
    this.backLight = new THREE.PointLight('#8ed9ff', 18, 18, 2);
    this.backLight.position.set(0, 0.4, -3.8);
    this.add(ambient, keyLight, this.fillLight, this.backLight);

    this.haloBack = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 64),
      new THREE.MeshBasicMaterial({
        color: '#8ed9ff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.haloBack.position.set(0, 0.2, -2.8);
    this.root.add(this.haloBack);

    this.haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.06, 24, 180),
      new THREE.MeshBasicMaterial({
        color: '#dcecff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.haloRing.rotation.x = Math.PI * 0.5;
    this.haloRing.position.set(0, -0.25, -0.15);
    this.root.add(this.haloRing);

    this.lightShaft = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      createLightShaftMaterial(perlinTexture)
    );
    this.lightShaft.position.set(1.67, 0.79, 0);
    this.lightShaft.scale.set(1.5, 3, 1);
    this.lightShaft.rotation.z = THREE.MathUtils.degToRad(-40);
    this.root.add(this.lightShaft);

    this.lightPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      createLightPlaneMaterial(perlinTexture, bokehTexture)
    );
    this.lightPlane.position.set(-2.05, -0.87, 1);
    this.lightPlane.scale.set(4, 4, 4);
    this.root.add(this.lightPlane);

    this.lightColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.15, 6.4, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.lightColumn.position.set(0, 0.1, -1.1);
    this.root.add(this.lightColumn);

    this.pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 0.55, 48),
      new THREE.MeshStandardMaterial({
        color: '#111722',
        roughness: 0.82,
        metalness: 0.16
      })
    );
    this.pedestal.position.y = -2.15;
    this.pedestal.material.transparent = true;
    this.root.add(this.pedestal);

    this.objectMaterial = createDetailObjectMaterial(perlinTexture, causticsTexture);
    this.object = new THREE.Mesh(FALLBACK_GEOMETRY_FACTORY[0](), this.objectMaterial);
    this.ownedGeometry = this.object.geometry;
    this.object.material.transparent = true;
    this.root.add(this.object);

    this.textCylinders = [];
    const blurryCylinderGeometry = prepareGeometry(this.assets.get('geometry', 'blurrytext-cylinder'), {
      size: 5.6,
      recomputeNormals: false
    });
    const blurryAtlas = this.assets.get('texture', 'blurrytext-atlas') ?? null;

    if (blurryCylinderGeometry) {
      const cylinderSpecs = [
        { scale: [1.2, 1.2, 1.2], positionY: -0.55, rotationY: 0, opacity: 0.18, speed: 0.16, phase: 0 },
        { scale: [1.8, 1.8, 1.8], positionY: -0.55, rotationY: Math.PI * 0.5, opacity: 0.12, speed: -0.11, phase: 0.8 },
        { scale: [1.3, 3.8, 1.3], positionY: 0.2, rotationY: Math.PI, opacity: 0.09, speed: 0.08, phase: 1.9 },
        { scale: [2.15, 3.35, 2.15], positionY: 0.2, rotationY: 0, opacity: 0.05, speed: -0.06, phase: 2.7 }
      ];

      cylinderSpecs.forEach((specification) => {
        const mesh = new THREE.Mesh(
          blurryCylinderGeometry,
          new THREE.MeshBasicMaterial({
            color: '#ffffff',
            map: blurryAtlas,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );

        mesh.position.y = specification.positionY;
        mesh.rotation.y = specification.rotationY;
        mesh.scale.set(...specification.scale);
        mesh.userData.baseScale = new THREE.Vector3(...specification.scale);
        mesh.userData.baseOpacity = specification.opacity;
        mesh.userData.speed = specification.speed;
        mesh.userData.phase = specification.phase;
        mesh.userData.baseY = specification.positionY;
        this.root.add(mesh);
        this.textCylinders.push(mesh);
      });
    }

    const particleField = createParticleField();
    this.particleBasePositions = particleField.basePositions;
    this.particleSeeds = particleField.seeds;
    this.particles = new THREE.Points(
      particleField.geometry,
      new THREE.PointsMaterial({
        color: '#d7e8ff',
        size: 0.05,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.root.add(this.particles);

    const littleParticleField = createParticleField();
    this.littleParticleBasePositions = littleParticleField.basePositions;
    this.littleParticleSeeds = littleParticleField.seeds;
    this.littleParticles = new THREE.Points(
      littleParticleField.geometry,
      new THREE.PointsMaterial({
        color: '#2d3133',
        size: 0.028,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.littleParticles.scale.set(1.05, 1.05, 0.55);
    this.root.add(this.littleParticles);

    this.camera.position.set(0, 0.5, 5.5);
    this.camera.lookAt(0, 0, 0);
  }

  setProject(project) {
    this.project = project;

    if (this.ownedGeometry) {
      this.ownedGeometry.dispose();
      this.ownedGeometry = null;
    }

    const geometrySize = 2.2 * (project.detailObjectScale ?? 1);
    const detailGeometryKey = project.detailGeometryKey ?? project.modelKey;
    const detailTextureKey = project.detailTextureKey ?? project.textureKey;
    const preset = DETAIL_STAGING_PRESETS[project.detailObjectKey] ?? DETAIL_STAGING_PRESETS.default;
    const preparedGeometry = prepareGeometry(this.assets.get('geometry', detailGeometryKey), {
      size: geometrySize
    });
    const fallbackGeometry = prepareGeometry(
      FALLBACK_GEOMETRY_FACTORY[project.index % FALLBACK_GEOMETRY_FACTORY.length](),
      { size: geometrySize }
    );
    const nextGeometry = preparedGeometry ?? fallbackGeometry;

    this.ownedGeometry = nextGeometry;
    this.stagingPreset = preset;
    this.object.geometry = nextGeometry;
    this.object.name = project.detailObjectKey ?? project.hash;
    const detailTexture = this.assets.get('texture', detailTextureKey) ?? null;
    this.objectMaterial.uniforms.tMap.value = detailTexture;
    this.objectMaterial.uniforms.uHasMap.value = detailTexture ? 1 : 0;
    this.objectMaterial.uniforms.uExposure.value = preset.exposure;
    this.objectMaterial.uniforms.uCausticsStrength.value = preset.causticsStrength;
    this.objectMaterial.uniforms.uRimStrength.value = preset.rimStrength;

    this.accentColor.set(project.accent);
    this.objectMaterial.uniforms.uAccent.value.copy(this.accentColor);

    const haloRingColor = this.accentColor.clone().lerp(new THREE.Color('#ffffff'), 0.25);
    const columnColor = this.accentColor.clone().lerp(new THREE.Color('#ffffff'), 0.65);
    const particleColor = this.accentColor.clone().lerp(new THREE.Color('#ffffff'), 0.45);
    const littleParticleColor = new THREE.Color('#1e242a').lerp(this.accentColor, 0.12);
    const pedestalColor = new THREE.Color('#111722').lerp(this.accentColor, 0.18);
    const bgColorA = new THREE.Color('#06090f').lerp(this.accentColor, 0.05);
    const bgColorB = new THREE.Color('#18222f').lerp(this.accentColor, 0.22);

    this.fillLight.color.copy(haloRingColor);
    this.backLight.color.copy(this.accentColor);
    this.haloBack.material.color.copy(this.accentColor);
    this.haloRing.material.color.copy(haloRingColor);
    this.lightShaft.material.uniforms.uColor.value.copy(this.accentColor);
    this.lightPlane.material.uniforms.uColor.value.copy(haloRingColor);
    this.bgPlane.material.uniforms.uColorA.value.copy(bgColorA);
    this.bgPlane.material.uniforms.uColorB.value.copy(bgColorB);
    this.lightColumn.material.color.copy(columnColor);
    this.pedestal.material.color.copy(pedestalColor);
    this.particles.material.color.copy(particleColor);
    this.littleParticles.material.color.copy(littleParticleColor);

    this.textCylinders.forEach((mesh, index) => {
      mesh.material.color.copy(index < 2 ? new THREE.Color('#ffffff') : haloRingColor);
    });
  }

  setTransitionProgress(progress) {
    this.transitionProgress = progress;
  }

  setHandoffAnchor(anchor = null) {
    this.handoffAnchor = anchor;
  }

  update(delta, elapsed) {
    const progress = THREE.MathUtils.clamp(this.transitionProgress, 0, 1);
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    const handoffMix = THREE.MathUtils.smoothstep(progress, 0.02, 0.62);
    const supportReveal = THREE.MathUtils.smoothstep(progress, 0.16, 1);
    const pulse = Math.sin(elapsed * 1.4) * 0.5 + 0.5;
    const preset = this.stagingPreset;

    this.bgPlane.material.uniforms.uTime.value = elapsed;
    this.bgPlane.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0, preset.bgOpacity, eased);
    this.objectMaterial.uniforms.uTime.value = elapsed;
    this.objectMaterial.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.16, 1, handoffMix) * eased;
    this.objectMaterial.uniforms.uPulse.value = pulse;

    this.object.rotation.x += delta * THREE.MathUtils.lerp(0.05, 0.2, eased);
    this.object.rotation.y += delta * THREE.MathUtils.lerp(0.08, 0.35, eased);
    this.finalObjectVector.set(
      preset.objectOffset.x * eased,
      THREE.MathUtils.lerp(-0.7, preset.objectOffset.y, eased) + Math.sin(elapsed * 1.4) * 0.18 * eased,
      THREE.MathUtils.lerp(-0.3, preset.objectOffset.z, eased)
    );
    const finalScale = THREE.MathUtils.lerp(0.7, 1.03 * preset.objectScale, eased);

    if (this.handoffAnchor?.ndc) {
      this.anchorClipVector.set(this.handoffAnchor.ndc.x, this.handoffAnchor.ndc.y, this.finalObjectVector.clone().project(this.camera).z);
      this.anchorWorldVector.copy(this.anchorClipVector).unproject(this.camera);
      this.object.position.lerpVectors(this.anchorWorldVector, this.finalObjectVector, handoffMix);

      if (this.handoffAnchor.quaternion) {
        this.startQuaternion.set(
          this.handoffAnchor.quaternion.x,
          this.handoffAnchor.quaternion.y,
          this.handoffAnchor.quaternion.z,
          this.handoffAnchor.quaternion.w
        );
        this.finalQuaternion.copy(this.object.quaternion);
        this.object.quaternion.copy(this.startQuaternion).slerp(this.finalQuaternion, handoffMix);
      }

      this.object.scale.setScalar(THREE.MathUtils.lerp(
        THREE.MathUtils.clamp((this.handoffAnchor.scale ?? 1) * 0.72, 0.42, 1.65),
        finalScale,
        handoffMix
      ));
    } else {
      this.object.position.copy(this.finalObjectVector);
      this.object.scale.setScalar(finalScale);
    }

    this.pedestal.position.y = THREE.MathUtils.lerp(-2.8, -2.15, eased);
    this.pedestal.material.opacity = eased;

    this.haloBack.position.lerpVectors(new THREE.Vector3(0, -0.15, -2.4), preset.haloOffset, eased);
    this.haloBack.material.opacity = THREE.MathUtils.lerp(0, (0.12 + pulse * 0.08) * preset.haloOpacity, supportReveal);
    this.haloBack.scale.setScalar(THREE.MathUtils.lerp(0.55, (1 + pulse * 0.08) * preset.haloScale, eased));

    this.haloRing.rotation.z += delta * 0.18;
    this.haloRing.material.opacity = THREE.MathUtils.lerp(0, 0.16 * preset.ringOpacity, supportReveal);
    this.haloRing.scale.setScalar(THREE.MathUtils.lerp(0.8, 1.05, eased));

    this.lightShaft.material.uniforms.uTime.value = elapsed;
    this.lightShaft.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0, preset.shaftOpacity, supportReveal);
    this.lightShaft.position.lerpVectors(new THREE.Vector3(1.1, 0.55, -0.15), preset.shaftOffset, eased);
    this.lightShaft.scale.set(
      THREE.MathUtils.lerp(1.1, 1.5 * preset.shaftScale, eased),
      THREE.MathUtils.lerp(2.2, 3.0 * preset.shaftScale, eased),
      1
    );

    this.lightPlane.material.uniforms.uTime.value = elapsed;
    this.lightPlane.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0, preset.planeOpacity, supportReveal);
    this.lightPlane.position.x = THREE.MathUtils.lerp(-1.65, preset.lightPlaneOffset.x, eased) + Math.sin(elapsed * 0.3) * 0.2 * eased;
    this.lightPlane.position.y = THREE.MathUtils.lerp(-1.1, preset.lightPlaneOffset.y, eased) + Math.cos(elapsed * 0.24) * 0.2 * eased;
    this.lightPlane.position.z = THREE.MathUtils.lerp(0.45, preset.lightPlaneOffset.z, eased);
    this.lightPlane.scale.setScalar(THREE.MathUtils.lerp(2.6, 4.0 * preset.planeScale, eased));

    this.lightColumn.rotation.y += delta * 0.05;
    this.lightColumn.material.opacity = THREE.MathUtils.lerp(0, (0.05 + pulse * 0.025) * preset.columnOpacity, eased);
    this.lightColumn.scale.set(
      THREE.MathUtils.lerp(0.9, 1.05 * preset.columnScale, eased),
      THREE.MathUtils.lerp(0.7, 1 * preset.columnScale, eased),
      THREE.MathUtils.lerp(0.9, 1.05 * preset.columnScale, eased)
    );

    this.textCylinders.forEach((mesh, index) => {
      const drift = Math.sin(elapsed * (0.8 + index * 0.1) * preset.textSpeed + mesh.userData.phase) * 0.06;
      const shimmer = Math.sin(elapsed * 2 + mesh.userData.phase) * 0.25 + 0.75;

      mesh.rotation.y += delta * mesh.userData.speed * preset.textSpeed;
      mesh.position.y = mesh.userData.baseY + drift + preset.textYOffset * supportReveal;
      mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(THREE.MathUtils.lerp(1, preset.textScale, supportReveal));
      mesh.material.opacity = mesh.userData.baseOpacity * supportReveal * shimmer * preset.textOpacity;
    });

    if (this.particles) {
      const positionAttribute = this.particles.geometry.getAttribute('position');

      for (let index = 0; index < DETAIL_PARTICLE_COUNT; index += 1) {
        const stride = index * 3;
        const seed = this.particleSeeds[index];

        positionAttribute.array[stride] = this.particleBasePositions[stride] + Math.cos(elapsed * 0.65 + seed) * 0.06 * eased * preset.particleDrift;
        positionAttribute.array[stride + 1] = this.particleBasePositions[stride + 1] + Math.sin(elapsed * 0.9 + seed * 1.3) * 0.1 * eased * preset.particleDrift;
        positionAttribute.array[stride + 2] = this.particleBasePositions[stride + 2] + Math.sin(elapsed * 0.55 + seed) * 0.08 * eased * preset.particleDrift;
      }

      positionAttribute.needsUpdate = true;
      this.particles.rotation.y += delta * 0.04;
      this.particles.scale.setScalar(THREE.MathUtils.lerp(0.92, preset.particleScale, supportReveal));
      this.particles.material.opacity = THREE.MathUtils.lerp(0, preset.particleOpacity, supportReveal);
    }

    if (this.littleParticles) {
      const positionAttribute = this.littleParticles.geometry.getAttribute('position');

      for (let index = 0; index < DETAIL_PARTICLE_COUNT; index += 1) {
        const stride = index * 3;
        const seed = this.littleParticleSeeds[index];

        positionAttribute.array[stride] = this.littleParticleBasePositions[stride] + Math.cos(elapsed * 0.45 + seed) * 0.03 * eased * preset.littleParticleDrift;
        positionAttribute.array[stride + 1] = this.littleParticleBasePositions[stride + 1] + Math.sin(elapsed * 0.75 + seed * 1.7) * 0.05 * eased * preset.littleParticleDrift + elapsed * 0.02 % 0.8;
        positionAttribute.array[stride + 2] = this.littleParticleBasePositions[stride + 2];
      }

      positionAttribute.needsUpdate = true;
      this.littleParticles.rotation.z -= delta * 0.03;
      this.littleParticles.scale.setScalar(THREE.MathUtils.lerp(0.9, preset.littleParticleScale, supportReveal));
      this.littleParticles.material.opacity = THREE.MathUtils.lerp(0, preset.littleParticleOpacity, supportReveal);
    }

    this.camera.position.x = THREE.MathUtils.lerp(0, preset.cameraX, eased) + Math.sin(elapsed * 0.25) * 0.2 * eased;
    this.camera.position.y = THREE.MathUtils.lerp(0.1, 0.5, eased);
    this.camera.position.z = THREE.MathUtils.lerp(7.6, preset.cameraZ, eased);
    this.camera.lookAt(0, preset.cameraTargetY + pulse * 0.03, 0);
  }
}
