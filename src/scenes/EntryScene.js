import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const TOTAL_DURATION = 9.2;
const RING_PULSES = [
  { start: 2.0, inDuration: 0.5, outStart: 2.5, outDuration: 0.4 },
  { start: 2.95, inDuration: 0.5, outStart: 3.45, outDuration: 0.4 },
  { start: 3.8, inDuration: 0.5, outStart: 4.3, outDuration: 0.6 }
];
const SQUARE_EVENTS = [
  { time: 2.0, scale: 1 },
  { time: 2.95, scale: 1 },
  { time: 3.8, scaleForward: 0.5, scaleBackward: 1 },
  { time: 4.9, scale: 0.5 }
];

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function easeOut(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 2);
}

function easeIn(value) {
  const t = clamp01(value);
  return t * t;
}

function easeInOut(value) {
  const t = clamp01(value);
  return t <= 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
}

function rawGeometry(source, options = {}) {
  return prepareGeometry(source, {
    center: false,
    scaleToSize: false,
    recomputeNormals: options.recomputeNormals ?? false
  });
}

function ensureRandAttribute(geometry) {
  if (!geometry || geometry.getAttribute('rand')) {
    return geometry;
  }
  const clone = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const count = clone.getAttribute('position').count;
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = Math.abs((Math.sin((index + 1) * 12.9898) * 43758.5453) % 1);
  }
  clone.setAttribute('rand', new THREE.Float32BufferAttribute(values, 1));
  return clone;
}

function createForcefieldMaterial({ color = '#9dc9ff', opacity = 0.24 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) }
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
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 centered = vUv - 0.5;
        float ring = 1.0 - smoothstep(0.23, 0.36, abs(length(centered) - 0.32));
        float bars = smoothstep(0.1, 0.95, sin((vUv.x + vUv.y + uTime * 0.18) * 26.0) * 0.5 + 0.5);
        gl_FragColor = vec4(uColor, ring * bars * uOpacity);
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

function createPlasmaMaterial({ colorA = '#76a8ff', colorB = '#ffe0c2', opacity = 0.22 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) }
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
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      void main() {
        vec2 centered = vUv - 0.5;
        float radius = length(centered) * 2.0;
        float radial = smoothstep(1.0, 0.1, radius);
        float wave = sin(radius * 18.0 - uTime * 2.5) * 0.5 + 0.5;
        float spiral = sin(atan(centered.y, centered.x) * 5.0 + uTime * 1.2 + radius * 8.0) * 0.5 + 0.5;
        vec3 color = mix(uColorA, uColorB, spiral);
        gl_FragColor = vec4(color, radial * wave * uOpacity);
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

function createSmokeMaterial({ noise, tint = '#edf5ff', opacity = 0.22, speed = 0.08, exponent = 2.6 }) {
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

function createLightroomMaterial(dotPattern) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDotPattern: { value: dotPattern ?? null },
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
      uniform vec2 uResolution;
      varying vec2 vUv;
      float noise3(vec3 p) { return sin(p.x) * sin(p.y) * sin(p.z); }
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        float ramp = (screenUv.x + screenUv.y) * 0.5;
        ramp *= noise3(vec3(screenUv, 0.614)) * 0.5 + 0.5;
        ramp *= noise3(vec3(screenUv * 2.0, 0.17)) * 0.5 + 0.5;
        vec3 color = mix(vec3(0.4157, 0.4353, 0.4902), vec3(0.8824, 0.9020, 0.9451), ramp) * 1.1;
        vec2 dotUv = vUv * vec2(200.0, 100.0);
        float dots = texture2D(tDotPattern, dotUv).r;
        float dotFade = 1.0 - abs(fract(hash12(floor(dotUv))) - 0.5) * 2.0;
        color += dots * dotFade * 2.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  });
}

function createRoomRingMaterial() {
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

function createTextCylinderMaterial(atlas, outer = false) {
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

function createTunnelMaterial(noise) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
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
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), pow(value * fade, 3.0) * 3.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

function createParticleField(count = 720) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    const radius = 1.1 + Math.random() * 2.8;
    const angle = Math.random() * Math.PI * 2;
    positions[stride] = Math.cos(angle) * radius;
    positions[stride + 1] = 1.5 - Math.random() * 7.6;
    positions[stride + 2] = (Math.random() - 0.5) * 4.4;
    seeds[index] = Math.random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

function createParticleMaterial({ color = '#ffd4a6', opacity = 0.7, size = 0.05 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSize: { value: size },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vSeed;
      void main() {
        vSeed = aSeed;
        vec3 transformed = position;
        transformed.x += sin(uTime * 0.8 + aSeed * 14.0 + position.y) * 0.1;
        transformed.z += cos(uTime * 0.7 + aSeed * 11.0 + position.x) * 0.12;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * (1.0 + fract(aSeed * 17.0)) * 120.0 / max(1.0, -mvPosition.z);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vSeed;
      void main() {
        float alpha = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        float pulse = 0.75 + 0.25 * sin(uTime * 2.0 + vSeed * 20.0);
        gl_FragColor = vec4(uColor * pulse, alpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

export class EntryScene extends SceneBase {
  constructor({ assets }) {
    super({ name: 'entry', background: '#09070e' });
    this.assets = assets;
    this.resolution = new THREE.Vector2(1, 1);
    this.portalRings = [];
    this.forcefields = [];
    this.plasmaLayers = [];
    this.smokeTrails = [];
    this.materials = [];
    this.initialScrollAutocenter = 0.2;
    this.finalScrollAutocenter = 0.76;
    this.presentationState = this.computePresentationState(0, 1);
    this.postState = { ringProximity: 0, squareAttr: new THREE.Vector3(0, 0, 1) };
    this.lastProgress = 0;
    this.direction = 1;

    const windNoise = assets.get('texture', 'wind-noise');
    const floorGeometry = rawGeometry(assets.get('geometry', 'floor'), { recomputeNormals: false }) || new THREE.CylinderGeometry(4.4, 4.9, 0.2, 64);
    const ringGeometry = rawGeometry(assets.get('geometry', 'ring'), { recomputeNormals: false }) || new THREE.TorusGeometry(2.4, 0.12, 24, 160);
    const ringSecondaryGeometry = rawGeometry(assets.get('geometry', 'ring-secondary'), { recomputeNormals: false }) || ringGeometry.clone();
    const smokeTrailGeometry = rawGeometry(assets.get('geometry', 'smoke-trail'), { recomputeNormals: false });
    const groundSmokeGeometry = rawGeometry(assets.get('geometry', 'ground-smoke'), { recomputeNormals: false });
    const ceilingSmokeGeometry = rawGeometry(assets.get('geometry', 'ceiling-smoke'), { recomputeNormals: false });
    const blurryTextCylinderGeometry = ensureRandAttribute(rawGeometry(assets.get('geometry', 'blurrytext-cylinder'), { recomputeNormals: false }));

    this.lightroom = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 32), createLightroomMaterial(assets.get('texture', 'dot-pattern')));
    this.lightroom.position.y = -12.15;
    this.lightroom.renderOrder = 2;
    this.add(this.lightroom);
    this.materials.push(this.lightroom.material);

    this.floor = new THREE.Mesh(floorGeometry, new THREE.MeshStandardMaterial({ color: '#2b221f', map: assets.get('texture', 'floor-color') ?? null, roughness: 0.92, metalness: 0.04 }));
    this.floor.position.y = -10.19;
    this.floor.scale.setScalar(0.73);
    this.floor.rotation.y = Math.PI;
    this.root.add(this.floor);

    const ringSpecs = [
      { geometry: ringSecondaryGeometry, map: assets.get('texture', 'ring-secondary-color') ?? assets.get('texture', 'ring-color'), aoMap: assets.get('texture', 'ring-secondary-ao') ?? assets.get('texture', 'ring-ao'), positionY: -1.65, scale: 1.0 },
      { geometry: ringGeometry, map: assets.get('texture', 'ring-color'), aoMap: assets.get('texture', 'ring-ao'), positionY: -4.15, scale: 0.92 },
      { geometry: ringSecondaryGeometry, map: assets.get('texture', 'ring-secondary-color') ?? assets.get('texture', 'ring-color'), aoMap: assets.get('texture', 'ring-secondary-ao') ?? assets.get('texture', 'ring-ao'), positionY: -6.65, scale: 0.86 }
    ];

    ringSpecs.forEach((spec, index) => {
      const ring = new THREE.Mesh(spec.geometry, new THREE.MeshStandardMaterial({ color: spec.map ? '#ffffff' : '#ff9367', map: spec.map ?? null, aoMap: spec.aoMap ?? null, emissive: index === 0 ? '#8cbfff' : '#8f2d12', emissiveIntensity: index === 0 ? 0.68 : 0.58, metalness: 0.18, roughness: 0.18, transparent: true, opacity: 1 }));
      ring.position.y = spec.positionY;
      ring.rotation.x = -Math.PI * 0.5;
      ring.scale.setScalar(spec.scale);
      this.root.add(ring);
      this.portalRings.push({ ring, baseY: spec.positionY, baseScale: spec.scale });
    });

    this.roomRing = new THREE.Mesh((() => {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(Math.PI * 0.5);
      geometry.translate(0, 1.5, 0);
      return geometry;
    })(), createRoomRingMaterial());
    this.roomRing.position.y = -10.26;
    this.roomRing.scale.setScalar(0.57);
    this.roomRing.visible = false;
    this.root.add(this.roomRing);
    this.materials.push(this.roomRing.material);

    this.portalRings.forEach(({ baseY }, index) => {
      const forcefield = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 20, 160), createForcefieldMaterial({ color: index === 0 ? '#8fc2ff' : '#b7dbff', opacity: 0.24 - index * 0.03 }));
      forcefield.position.y = baseY;
      this.root.add(forcefield);
      this.forcefields.push(forcefield);
      this.materials.push(forcefield.material);

      const plasma = new THREE.Mesh(new THREE.CircleGeometry(1.45, 96), createPlasmaMaterial({ colorA: index === 0 ? '#77b0ff' : '#96aef5', colorB: '#ffd3aa', opacity: 0.24 - index * 0.03 }));
      plasma.position.y = baseY;
      plasma.position.z = -0.12;
      this.root.add(plasma);
      this.plasmaLayers.push(plasma);
      this.materials.push(plasma.material);
    });

    if (smokeTrailGeometry) {
      let currentY = -1.6;
      for (let index = 0; index < 3; index += 1) {
        const mesh = new THREE.Mesh(smokeTrailGeometry, createTunnelMaterial(windNoise));
        mesh.position.y = currentY;
        mesh.rotation.y = index * Math.PI * 0.5;
        this.root.add(mesh);
        this.smokeTrails.push({ mesh, baseY: currentY, initialRotation: mesh.rotation.y });
        this.materials.push(mesh.material);
        currentY -= 2.5;
      }
    }

    if (groundSmokeGeometry) {
      this.groundSmoke = new THREE.Mesh(groundSmokeGeometry, createSmokeMaterial({ noise: windNoise, tint: '#edf5ff', opacity: 0.24, speed: 0.05, exponent: 3.1 }));
      this.groundSmoke.position.y = -10.17;
      this.groundSmoke.scale.set(5, 0.1, 5);
      this.root.add(this.groundSmoke);
      this.materials.push(this.groundSmoke.material);
    }

    if (ceilingSmokeGeometry) {
      this.ceilingSmoke = new THREE.Mesh(ceilingSmokeGeometry, createSmokeMaterial({ noise: windNoise, tint: '#f5f8ff', opacity: 0.16, speed: -0.06, exponent: 2.2 }));
      this.ceilingSmoke.position.y = -9.4;
      this.ceilingSmoke.scale.set(2, 0.1, 2);
      this.root.add(this.ceilingSmoke);
      this.materials.push(this.ceilingSmoke.material);
    }

    if (blurryTextCylinderGeometry) {
      const atlas = assets.get('texture', 'blurrytext-atlas');
      this.textCylinder = new THREE.Mesh(blurryTextCylinderGeometry, createTextCylinderMaterial(atlas));
      this.textCylinder.position.y = -10.33;
      this.textCylinder.scale.setScalar(1.75);
      this.textCylinder.visible = false;
      this.root.add(this.textCylinder);
      this.materials.push(this.textCylinder.material);

      this.textCylinder2 = new THREE.Mesh(blurryTextCylinderGeometry, createTextCylinderMaterial(atlas));
      this.textCylinder2.position.y = -10.33;
      this.textCylinder2.scale.setScalar(3.5);
      this.textCylinder2.rotation.y = Math.PI * 0.5;
      this.textCylinder2.visible = false;
      this.root.add(this.textCylinder2);
      this.materials.push(this.textCylinder2.material);

      this.textCylinder3 = new THREE.Mesh(blurryTextCylinderGeometry, createTextCylinderMaterial(atlas, true));
      this.textCylinder3.position.y = -9.5;
      this.textCylinder3.scale.set(2, 9, 2);
      this.textCylinder3.rotation.y = Math.PI;
      this.root.add(this.textCylinder3);
      this.materials.push(this.textCylinder3.material);

      this.textCylinder4 = new THREE.Mesh(blurryTextCylinderGeometry, createTextCylinderMaterial(atlas, true));
      this.textCylinder4.position.y = -9.5;
      this.textCylinder4.scale.set(3.3, 8, 3.3);
      this.root.add(this.textCylinder4);
      this.materials.push(this.textCylinder4.material);
    }

    this.tunnel = new THREE.Mesh((() => {
      const geometry = new THREE.CylinderGeometry(1.3, 1.3, 9, 64, 32, true);
      geometry.translate(0, -4.5, 0);
      geometry.scale(-1, 1, 1);
      return geometry;
    })(), createTunnelMaterial(windNoise));
    this.tunnel.position.y = 1;
    this.tunnel.visible = false;
    this.root.add(this.tunnel);
    this.materials.push(this.tunnel.material);

    this.particles = new THREE.Points(createParticleField(720), createParticleMaterial({ color: '#ffd4a6', opacity: 0.72, size: 0.045 }));
    this.root.add(this.particles);
    this.materials.push(this.particles.material);

    this.camera.fov = 22;
    this.camera.position.set(0, 1.5, -2);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, -2.5, -1);
    this.camera.updateProjectionMatrix();
  }

  computePresentationState(progress = this.progress, enterProgress = 1) {
    const panelProgress = smoothWindow(progress, 0.5, 0.72) * enterProgress;
    const linksProgress = smoothWindow(progress, 0.58, 0.82) * enterProgress;
    const roomRingProgress = smoothWindow(progress, 0.53, 0.7) * enterProgress;
    const portalCoreProgress = smoothWindow(progress, 0.54, 0.76) * (1 - smoothWindow(progress, 0.88, 1)) * enterProgress;
    const interactionPulse = smoothWindow(progress, 0.6, 0.78) * (1 - smoothWindow(progress, 0.9, 1)) * enterProgress;
    return { panelProgress, linksProgress, roomRingProgress, portalCoreProgress, interactionPulse, enterProgress };
  }

  getPresentationState() {
    return { ...this.presentationState };
  }

  getColorCorrectionState() {
    return { profile: 'entry', ringProximity: this.postState.ringProximity, squareAttr: this.postState.squareAttr };
  }

  getInitialAutoCenterProgress() {
    return this.initialScrollAutocenter;
  }

  getFinalAutoCenterProgress() {
    return this.finalScrollAutocenter;
  }

  getAutoCenterProgress() {
    return this.progress > 0.15 ? this.finalScrollAutocenter : this.initialScrollAutocenter;
  }

  setSize(width, height) {
    super.setSize(width, height);
    this.resolution.set(width, height);
    this.camera.zoom = Math.min(1, (width / Math.max(height, 1)) * 1.5);
    this.camera.updateProjectionMatrix();
    this.materials.forEach((material) => {
      if (material.uniforms?.uResolution) {
        material.uniforms.uResolution.value.copy(this.resolution);
      }
    });
  }

  update(delta, elapsed) {
    const isIncomingFromCubes = this.transitionState?.role === 'next' && this.transitionState?.previousKey === 'cubes';
    const enterProgress = isIncomingFromCubes ? THREE.MathUtils.smoothstep(this.transitionState.enterProgress ?? 0, 0, 1) : 1;
    const progress = this.progress;
    const timePosition = progress * TOTAL_DURATION;
    this.direction = progress > this.lastProgress ? 1 : -1;

    SQUARE_EVENTS.forEach((event) => {
      const crossedForward = this.lastProgress * TOTAL_DURATION < event.time && timePosition >= event.time;
      const crossedBackward = this.lastProgress * TOTAL_DURATION > event.time && timePosition <= event.time;
      if (!crossedForward && !crossedBackward) {
        return;
      }
      const scale = event.scale ?? (this.direction < 0 ? event.scaleBackward : event.scaleForward);
      this.postState.squareAttr.set(Math.random() * 25.424, Math.random() * 64.453, scale);
    });

    this.postState.ringProximity = RING_PULSES.reduce((accumulator, pulse) => {
      if (timePosition < pulse.start) return accumulator;
      if (timePosition < pulse.start + pulse.inDuration) return Math.max(accumulator, easeIn((timePosition - pulse.start) / pulse.inDuration));
      if (timePosition < pulse.outStart) return 1;
      if (timePosition < pulse.outStart + pulse.outDuration) return Math.max(accumulator, 1 - easeOut((timePosition - pulse.outStart) / pulse.outDuration));
      return accumulator;
    }, 0);

    this.presentationState = this.computePresentationState(progress, enterProgress);

    const roomRingReveal = smoothWindow(progress, 0.53, 0.7);
    const portalCoreProgress = smoothWindow(progress, 0.54, 0.76) * (1 - smoothWindow(progress, 0.88, 1));
    const interactionPulse = smoothWindow(progress, 0.6, 0.78) * (1 - smoothWindow(progress, 0.9, 1));
    const groundSmokeReveal = smoothWindow(progress, 0.4, 0.58) * (1 - smoothWindow(progress, 0.92, 1));
    const ceilingSmokeReveal = smoothWindow(progress, 0.5, 0.68) * (1 - smoothWindow(progress, 0.96, 1));
    const upRotation = Math.PI * easeInOut(clamp01((timePosition - 1.0) / 5.25));
    const upOriginal = clamp01((timePosition - 3.5) / 3.7);

    this.root.rotation.z = upRotation * 0.08;
    this.camera.position.set(
      0,
      THREE.MathUtils.lerp(1.5, -9.83, easeOut(clamp01((timePosition - 0.2) / 7.0))),
      (() => {
        let z = THREE.MathUtils.lerp(-2, 0, easeOut(clamp01(timePosition / 2.5)));
        if (timePosition > 3.5) z = THREE.MathUtils.lerp(z, -1.5, easeInOut(clamp01((timePosition - 3.5) / 3.7)));
        if (timePosition > 7.2) z = THREE.MathUtils.lerp(-1.5, -3.0, easeOut(clamp01((timePosition - 7.2) / 2.0)));
        return z;
      })()
    );
    this.camera.up.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), upRotation).lerp(new THREE.Vector3(0, 1, 0), upOriginal).normalize();
    this.camera.lookAt(0, THREE.MathUtils.lerp(-2.5, -10.35, easeInOut(clamp01((timePosition - 0.2) / 9.0))), THREE.MathUtils.lerp(-1, 0, easeOut(clamp01(timePosition / 2.5))));

    const ringEnds = [0.34, 0.43, 0.52];
    this.portalRings.forEach(({ ring }, index) => {
      const ringReveal = (1 - smoothWindow(progress, ringEnds[index] - 0.14, ringEnds[index])) * enterProgress;
      ring.visible = ringReveal > 0.001;
      ring.rotation.z = upRotation * 0.4;
      ring.material.opacity = ringReveal;
      ring.material.emissiveIntensity = THREE.MathUtils.lerp(0.25, index === 0 ? 0.78 : 0.62, ringReveal) + interactionPulse * 0.08;
    });

    const forcefieldWindows = [[0.1, 0.34], [0.25, 0.43], [0.36, 0.52]];
    this.forcefields.forEach((forcefield, index) => {
      const reveal = smoothWindow(progress, forcefieldWindows[index][0], forcefieldWindows[index][0] + 0.08) * (1 - smoothWindow(progress, forcefieldWindows[index][1] - 0.08, forcefieldWindows[index][1])) * enterProgress;
      forcefield.visible = reveal > 0.001;
      forcefield.material.uniforms.uTime.value = elapsed;
      forcefield.material.uniforms.uOpacity.value = reveal * (0.22 - index * 0.025) * (1 + interactionPulse * 0.2);
    });

    this.plasmaLayers.forEach((plasma, index) => {
      const reveal = smoothWindow(progress, forcefieldWindows[index][0] - 0.04, forcefieldWindows[index][0] + 0.04) * (1 - smoothWindow(progress, forcefieldWindows[index][1] - 0.08, forcefieldWindows[index][1])) * enterProgress;
      plasma.visible = reveal > 0.001;
      plasma.material.uniforms.uTime.value = elapsed;
      plasma.material.uniforms.uOpacity.value = reveal * (0.26 - index * 0.03) * (1 + interactionPulse * 0.18);
    });

    const smokeEnds = [0.37, 0.47, 0.56];
    this.smokeTrails.forEach(({ mesh, initialRotation }, index) => {
      const reveal = smoothWindow(progress, 0.02, 0.1) * (1 - smoothWindow(progress, smokeEnds[index] - 0.08, smokeEnds[index])) * enterProgress;
      mesh.visible = reveal > 0.001;
      mesh.rotation.y = initialRotation + elapsed * 0.16 + upRotation * 0.5;
      mesh.material.uniforms.uTime.value = elapsed;
      mesh.material.uniforms.uOpacity.value = reveal * 0.18;
    });

    if (this.groundSmoke) {
      this.groundSmoke.visible = groundSmokeReveal > 0.001;
      this.groundSmoke.material.uniforms.uTime.value = elapsed;
      this.groundSmoke.material.uniforms.uOpacity.value = groundSmokeReveal * enterProgress * 0.22;
    }
    if (this.ceilingSmoke) {
      this.ceilingSmoke.visible = ceilingSmokeReveal > 0.001;
      this.ceilingSmoke.material.uniforms.uTime.value = elapsed;
      this.ceilingSmoke.material.uniforms.uOpacity.value = ceilingSmokeReveal * enterProgress * 0.16;
    }
    if (this.roomRing) {
      this.roomRing.visible = roomRingReveal > 0.001;
      this.roomRing.material.uniforms.uTime.value = elapsed;
    }
    if (this.tunnel) {
      this.tunnel.visible = progress < 0.52;
      this.tunnel.rotation.y = upRotation * 0.65;
      this.tunnel.material.uniforms.uTime.value = elapsed;
    }
    if (this.textCylinder && this.textCylinder2) {
      const textReveal = clamp01((timePosition - 4.5) / 2.0);
      this.textCylinder.visible = textReveal > 0.001;
      this.textCylinder2.visible = textReveal > 0.001;
      this.textCylinder.material.uniforms.uAlpha.value = textReveal;
      this.textCylinder2.material.uniforms.uAlpha.value = textReveal;
    }
    if (this.textCylinder3) this.textCylinder3.rotation.y = upRotation * 0.65 + 2;
    if (this.textCylinder4) this.textCylinder4.rotation.y = upRotation * 0.65;

    this.particles.rotation.y -= delta * 0.09;
    this.particles.rotation.z += delta * 0.03;
    this.particles.position.y = THREE.MathUtils.lerp(0.9, -2.2, progress);
    this.particles.position.z = THREE.MathUtils.lerp(0.9, -0.15, enterProgress);
    this.particles.scale.setScalar(THREE.MathUtils.lerp(0.72, 1.04, enterProgress) * (1 + portalCoreProgress * 0.06));
    this.particles.material.uniforms.uTime.value = elapsed;
    this.particles.material.uniforms.uSize.value = THREE.MathUtils.lerp(0.036, 0.055, roomRingReveal + portalCoreProgress * 0.4);
    this.particles.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.42, 0.82, roomRingReveal) * enterProgress * (1 + interactionPulse * 0.12);

    this.lastProgress = progress;
  }
}
