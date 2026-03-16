import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tBuffer;
  uniform sampler2D tAdvect;
  uniform vec2 uSplatCoords;
  uniform vec2 uSplatPrevCoords;
  uniform vec2 uTexelSize;
  uniform float uSplatRadius;

  float lineDistance(vec2 uv, vec2 pointA, vec2 pointB) {
    vec2 pa = uv - pointA;
    vec2 ba = pointB - pointA;
    float denominator = max(dot(ba, ba), 0.00001);
    float h = clamp(dot(pa, ba) / denominator, 0.0, 1.0);
    return length(pa - ba * h);
  }

  float cubicIn(float value) {
    return value * value * value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 advect = (texture2D(tAdvect, fract(vUv * 3.0)).rg * 2.0 - 1.0);
    uv += advect * uTexelSize;

    float l = texture2D(tBuffer, uv - vec2(uTexelSize.x, 0.0)).r;
    float r = texture2D(tBuffer, uv + vec2(uTexelSize.x, 0.0)).r;
    float t = texture2D(tBuffer, uv + vec2(0.0, uTexelSize.y)).r;
    float b = texture2D(tBuffer, uv - vec2(0.0, uTexelSize.y)).r;
    float nextVal = max(max(max(l, r), t), b);

    float radius = 0.05 * smoothstep(0.1, 1.0, uSplatRadius);
    float splat = cubicIn(clamp(1.0 - lineDistance(vUv, uSplatPrevCoords, uSplatCoords) / max(radius, 0.0001), 0.0, 1.0));
    nextVal += splat;
    nextVal *= 0.985;
    nextVal = min(nextVal, 1.0);

    float prev = texture2D(tBuffer, uv).r;
    float rim = max(nextVal - prev, 0.0);

    gl_FragColor = vec4(nextVal, rim, 0.0, 1.0);
  }
`;

function createTarget(size) {
  const target = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: false,
    stencilBuffer: false
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export class MouseFrostMap {
  constructor({
    size = 512,
    advectTexture = null
  } = {}) {
    this.size = size;
    this.advectTexture = advectTexture;
    this.targets = [createTarget(size), createTarget(size)];
    this.finalTarget = this.targets[0];
    this.initialized = false;
    this.splatPosition = new THREE.Vector2(0.5, 0.5);
    this.splatLastPosition = new THREE.Vector2(0.5, 0.5);
    this.splatLastMoveTime = 0;
    this.splatLastRenderTime = 0;
    this.splatTargetVelocity = 0;
    this.splatVelocity = 0;
    this.soundVelocity = 0;
    this.pointerJustEntered = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tBuffer: { value: this.finalTarget.texture },
        tAdvect: { value: advectTexture },
        uSplatCoords: { value: this.splatPosition.clone() },
        uSplatPrevCoords: { value: this.splatLastPosition.clone() },
        uTexelSize: { value: new THREE.Vector2(1 / size, 1 / size) },
        uSplatRadius: { value: 0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  setPointer(uv, { entered = false } = {}) {
    if (!uv) {
      return;
    }

    this.splatPosition.copy(uv);
    if (entered) {
      this.pointerJustEntered = true;
    }
  }

  update(renderer, elapsed = 0) {
    if (elapsed - this.splatLastRenderTime < 0.015) {
      return;
    }

    this.splatLastRenderTime = elapsed;
    let movement = this.splatPosition.distanceTo(this.splatLastPosition);
    const idleTime = elapsed - this.splatLastMoveTime;

    if (movement > 0) {
      this.splatLastMoveTime = elapsed;
    }

    if (idleTime > 0.15 || this.pointerJustEntered || movement > 0.3) {
      this.splatLastPosition.copy(this.splatPosition);
      this.splatTargetVelocity = 0;
      this.soundVelocity = 0;
      movement = 0;
    }

    this.pointerJustEntered = false;
    this.splatTargetVelocity += movement * 6;
    this.splatTargetVelocity *= 0.88;
    this.splatTargetVelocity = THREE.MathUtils.clamp(this.splatTargetVelocity, 0, 1);
    this.splatVelocity = THREE.MathUtils.lerp(
      this.splatVelocity,
      1 - Math.pow(1 - this.splatTargetVelocity, 4),
      0.1
    );
    this.soundVelocity += movement * 4;
    this.soundVelocity *= 0.98;
    this.soundVelocity = THREE.MathUtils.clamp(this.soundVelocity, 0, 1);

    this.material.uniforms.uSplatCoords.value.copy(this.splatPosition);
    this.material.uniforms.uSplatPrevCoords.value.copy(this.splatLastPosition);
    this.material.uniforms.uSplatRadius.value = this.splatVelocity;
    this.splatLastPosition.copy(this.splatPosition);

    if (!this.initialized) {
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.targets[0]);
      renderer.clear(true, false, false);
      renderer.setRenderTarget(this.targets[1]);
      renderer.clear(true, false, false);
      renderer.setRenderTarget(previousTarget);
      this.initialized = true;
    }

    const previousTarget = renderer.getRenderTarget();
    this.material.uniforms.tBuffer.value = this.finalTarget.texture;

    const nextTarget = this.finalTarget === this.targets[0]
      ? this.targets[1]
      : this.targets[0];
    renderer.setRenderTarget(nextTarget);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousTarget);

    this.finalTarget = nextTarget;
  }

  dispose() {
    this.targets.forEach((target) => target.dispose());
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
