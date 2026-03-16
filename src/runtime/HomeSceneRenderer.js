import * as THREE from 'three';

const COMPOSITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tSceneA;
  uniform sampler2D tSceneB;
  uniform sampler2D tDetail;
  uniform sampler2D tCubes;
  uniform sampler2D tScroll;
  uniform sampler2D tFrost;
  uniform sampler2D tBlue;
  uniform vec2 uResolution;
  uniform vec2 uBlueOffset;
  uniform float uMix;
  uniform float uProgressVel;
  uniform float uDetailProgress;
  uniform float uDetailProgress2;
  uniform float uUseDetail;

  varying vec2 vUv;

  float fit(float value, float minA, float maxA, float minB, float maxB) {
    float normalized = clamp((value - minA) / max(maxA - minA, 0.0001), 0.0, 1.0);
    return mix(minB, maxB, normalized);
  }

  vec4 getBlueNoise(vec2 fragCoord, vec2 offset) {
    return texture2D(tBlue, fract(fragCoord / 128.0 + offset));
  }

  vec4 chromaticAberration(sampler2D source, vec2 uv, float strength, float bend) {
    vec4 accumulated = vec4(0.0);
    vec4 weight = vec4(0.0);

    for (int index = 0; index < 5; index += 1) {
      float t = float(index) / 4.0;
      vec2 centered = uv - 0.5;
      float distortion = bend * strength * t * dot(centered, centered);
      vec2 sampleUv = uv + centered * distortion;
      vec4 spectrum = vec4(
        smoothstep(0.0, 0.55, 1.0 - abs(t - 0.1) * 2.0),
        smoothstep(0.0, 0.75, 1.0 - abs(t - 0.5) * 2.0),
        smoothstep(0.0, 0.55, 1.0 - abs(t - 0.9) * 2.0),
        1.0
      );
      accumulated += spectrum * texture2D(source, sampleUv);
      weight += spectrum;
    }

    return accumulated / max(weight, vec4(0.0001));
  }

  vec3 renderHomeTransition() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 dataUv = vUv - 0.5;
    dataUv.x *= aspect;
    dataUv += 0.5;

    vec3 scrollData = texture2D(tScroll, dataUv).rgb;
    float slopeDisplacement = (scrollData.b * 2.0 - 1.0) * 0.4;
    float slope = -0.2 * aspect * step(0.0, uMix);
    float inclination = mix(1.0 - vUv.x + slopeDisplacement, vUv.x + slopeDisplacement, step(slope, 0.0));
    float cutProgress = fit(uMix, 0.0, 1.0, 0.0, 1.0 + abs(slope));
    float diagonalValue = vUv.y + inclination * abs(slope);
    float cutBlur = smoothstep(cutProgress - 0.18, cutProgress + 0.18, diagonalValue);
    float techDisplacement = smoothstep(cutBlur - 0.12, cutBlur + 0.12, scrollData.g);
    float cut = smoothstep(cutBlur - 0.04, cutBlur + 0.04, scrollData.r);

    float modulator = 12.0
      * smoothstep(1.0, 0.7, abs(vUv.x * 2.0 - 1.0))
      * smoothstep(1.0, 0.7, abs(vUv.y * 2.0 - 1.0));
    vec4 noise = getBlueNoise(gl_FragCoord.xy, uBlueOffset);
    float velocityBoost = 0.65 + uProgressVel * 2.4;
    vec2 sceneADisplacement = vec2(0.0, 0.4 * uMix + 0.025 * techDisplacement * velocityBoost);
    vec2 sceneBDisplacement = vec2(0.0, 0.4 * (1.0 - uMix) + 0.025 * (1.0 - techDisplacement) * velocityBoost);
    vec3 sceneA = chromaticAberration(
      tSceneA,
      vUv - sceneADisplacement,
      modulator,
      cutBlur * noise.r
    ).rgb;
    vec3 sceneB = chromaticAberration(
      tSceneB,
      vUv + sceneBDisplacement,
      modulator,
      (1.0 - cutBlur) * noise.g
    ).rgb;

    return clamp(mix(sceneA, sceneB, cut), 0.0, 1.0);
  }

  vec3 renderDetailTransition() {
    vec2 centeredUv = vUv - 0.5;
    vec2 detailUv = centeredUv;
    detailUv.x *= uResolution.x / max(uResolution.y, 1.0);
    detailUv += 0.5;

    vec4 noise = getBlueNoise(gl_FragCoord.xy, uBlueOffset);
    float modulator = 8.0
      * smoothstep(1.0, 0.5, abs(vUv.x * 2.0 - 1.0))
      * smoothstep(1.0, 0.5, abs(vUv.y * 2.0 - 1.0));
    float transition = fit(uDetailProgress, 0.4, 1.0, 0.0, 1.0);
    float scrollDisplacementSample = texture2D(tScroll, detailUv * 0.1).g * 2.0 - 1.0;
    vec2 techDisplacement = vec2(scrollDisplacementSample) * vec2(0.005, 0.0);
    vec2 frostUv = centeredUv * 5.0 * (1.0 - uDetailProgress);
    float frostSample = texture2D(tFrost, frostUv + 0.5).r * 2.0 - 1.0;
    vec2 frostDisplacement = vec2(frostSample) * 0.1;
    frostDisplacement += vec2(0.0, frostSample) * 0.1;

    vec3 sceneColor = texture2D(tCubes, vUv).rgb;
    if (transition < 1.0) {
      vec2 sceneIceDisplacement = frostDisplacement * fit(uDetailProgress, 0.1, 0.9, 0.0, 1.0);
      vec2 sceneTechDisplacement = techDisplacement * (1.0 - pow(1.0 - uDetailProgress, 5.0));
      sceneColor = chromaticAberration(
        tCubes,
        vUv + sceneIceDisplacement + sceneTechDisplacement,
        modulator,
        (1.0 - pow(1.0 - uDetailProgress, 3.0)) * noise.r
      ).rgb;
    }

    vec3 detailColor = texture2D(tDetail, vUv).rgb;
    if (transition > 0.0) {
      vec2 detailIceDisplacement = frostDisplacement * fit(uDetailProgress, 0.1, 0.9, 1.0, 0.0);
      vec2 detailTechDisplacement = techDisplacement * fit(uDetailProgress2, 0.7, 1.0, 1.0, 0.0);
      detailColor = chromaticAberration(
        tDetail,
        vUv + detailIceDisplacement + detailTechDisplacement,
        modulator,
        (1.0 - uDetailProgress2) * noise.b
      ).rgb;
    }

    return mix(sceneColor, detailColor, transition);
  }

  void main() {
    vec3 homeColor = uMix > 0.001
      ? renderHomeTransition()
      : texture2D(tSceneA, vUv).rgb;
    vec3 color = uUseDetail > 0.001
      ? renderDetailTransition()
      : homeColor;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const LUT_VERTEX_SHADER = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const LUT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D tDiffuse;
  uniform sampler3D tLUT;
  uniform float uLUTSize;
  uniform float uLUTIntensity;
  uniform float uGradientAlpha;

  in vec2 vUv;

  out vec4 outColor;

  vec3 LUTLinearTosRGB(in vec3 value) {
    return mix(
      pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055),
      value.rgb * 12.92,
      vec3(lessThanEqual(value.rgb, vec3(0.0031308)))
    );
  }

  vec3 LUTsRGBToLinear(in vec3 value) {
    return mix(
      pow(value.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)),
      value.rgb * 0.0773993808,
      vec3(lessThanEqual(value.rgb, vec3(0.04045)))
    );
  }

  vec3 apply3DLUTTetrahedral(vec3 color, sampler3D lutTexture, float lutSize, float lutIntensity) {
    float scale = lutSize - 1.0;
    float texelSize = 1.0 / lutSize;
    vec3 col = LUTLinearTosRGB(color);
    vec3 rgb = clamp(col, 0.0, 1.0) * scale;
    vec3 p = floor(rgb);
    vec3 f = rgb - p;
    vec3 v1 = (p + 0.5) * texelSize;
    vec3 v4 = (p + 1.5) * texelSize;
    vec3 v2;
    vec3 v3;
    vec3 frac;

    if (f.r >= f.g) {
      if (f.g > f.b) {
        frac = f.rgb;
        v2 = vec3(v4.x, v1.y, v1.z);
        v3 = vec3(v4.x, v4.y, v1.z);
      } else if (f.r >= f.b) {
        frac = f.rbg;
        v2 = vec3(v4.x, v1.y, v1.z);
        v3 = vec3(v4.x, v1.y, v4.z);
      } else {
        frac = f.brg;
        v2 = vec3(v1.x, v1.y, v4.z);
        v3 = vec3(v4.x, v1.y, v4.z);
      }
    } else {
      if (f.b > f.g) {
        frac = f.bgr;
        v2 = vec3(v1.x, v1.y, v4.z);
        v3 = vec3(v1.x, v4.y, v4.z);
      } else if (f.r >= f.b) {
        frac = f.grb;
        v2 = vec3(v1.x, v4.y, v1.z);
        v3 = vec3(v4.x, v4.y, v1.z);
      } else {
        frac = f.gbr;
        v2 = vec3(v1.x, v4.y, v1.z);
        v3 = vec3(v1.x, v4.y, v4.z);
      }
    }

    vec4 n1 = texture(tLUT, v1);
    vec4 n2 = texture(tLUT, v2);
    vec4 n3 = texture(tLUT, v3);
    vec4 n4 = texture(tLUT, v4);
    vec4 weights = vec4(1.0 - frac.x, frac.x - frac.y, frac.y - frac.z, frac.z);
    vec4 result = weights * mat4(
      vec4(n1.r, n2.r, n3.r, n4.r),
      vec4(n1.g, n2.g, n3.g, n4.g),
      vec4(n1.b, n2.b, n3.b, n4.b),
      vec4(1.0)
    );

    return LUTsRGBToLinear(mix(col, result.rgb, lutIntensity));
  }

  void main() {
    vec3 scene = texture(tDiffuse, vUv).rgb;
    float gradient = mix(0.8, 1.0, (vUv.x + vUv.y) * 0.5);
    gradient = mix(1.0, gradient, uGradientAlpha);
    scene *= gradient;

    vec3 sceneColor = apply3DLUTTetrahedral(scene.rgb, tLUT, uLUTSize, uLUTIntensity);
    outColor = vec4(sceneColor, 1.0);
  }
`;

const ENTRY_POST_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ENTRY_POST_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tBlue;
  uniform sampler2D tScroll;
  uniform vec2 uResolution;
  uniform vec2 uBlueOffset;
  uniform float uRingProximity;
  uniform vec3 uSquareAttr;

  varying vec2 vUv;

  float noise3(vec3 value) {
    return sin(value.x) * sin(value.y) * sin(value.z);
  }

  vec4 rgbShift(sampler2D textureMap, vec2 uv, float angle, float amount) {
    vec2 offset = amount * vec2(cos(angle), sin(angle));
    vec4 cr = texture2D(textureMap, uv + offset);
    vec4 cga = texture2D(textureMap, uv);
    vec4 cb = texture2D(textureMap, uv - offset);
    return vec4(cr.r, cga.g, cb.b, cga.a);
  }

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -0.3333333, 0.6666667, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
  }

  vec3 getNoise(sampler2D textureMap, vec2 fragCoord, vec2 offset) {
    return texture2D(textureMap, fract(fragCoord / 128.0 + offset)).rgb;
  }

  void main() {
    vec2 uv = vUv;
    vec3 scene;
    vec3 noise = getNoise(tBlue, gl_FragCoord.xy, uBlueOffset);
    float aspect = uResolution.x / max(uResolution.y, 1.0);

    if (uRingProximity > 0.0) {
      vec2 localUv = uv - 0.5;
      localUv.x *= aspect;
      float angle = atan(localUv.y, localUv.x);
      float dist = length(localUv);
      float angle1 = angle + 0.3 * (noise.r - 0.5) * uRingProximity;
      vec2 shiftedUv = vec2(cos(angle1), sin(angle1)) * dist;
      shiftedUv.x /= aspect;
      shiftedUv += 0.5;

      float dispSquares = texture2D(tScroll, shiftedUv * 1.5 + uSquareAttr.rg).g * 2.0 - 1.0;
      shiftedUv += dispSquares * 0.01 * uSquareAttr.b * uRingProximity;
      scene = texture2D(tDiffuse, shiftedUv).rgb;

      if (length(scene) < length(vec3(1.0))) {
        scene = rgb2hsv(scene);
        scene.g += 0.05 * uRingProximity;
        scene.b += 0.075 * uRingProximity;
        scene = hsv2rgb(scene);
      }
    } else {
      scene = texture2D(tDiffuse, uv).rgb;
    }

    vec3 sceneColor = scene;
    float diagonalGradient = pow(vUv.x * vUv.y, 2.0);
    sceneColor += diagonalGradient * (noise3(vec3(vUv.x * aspect, vUv.y, 0.5)) * 0.4 + 0.4) * vec3(0.8, 0.9, 1.0) * noise.b * 2.0;
    gl_FragColor = vec4(clamp(sceneColor, 0.0, 1.0), 1.0);
  }
`;

function createRenderTarget(width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false
  });

  target.texture.colorSpace = THREE.SRGBColorSpace;
  return target;
}

function prepareSceneForRender(scene, renderer, renderState, preparedScenes) {
  if (!scene || preparedScenes.has(scene)) {
    return;
  }

  scene.prepareForRender?.(renderer, renderState);
  preparedScenes.add(scene);
}

function getColorCorrectionState(scene) {
  if (!scene) {
    return null;
  }

  const sceneState = scene.getColorCorrectionState?.() ?? null;
  if (sceneState?.profile) {
    return sceneState;
  }

  if (scene.name === 'igloo') {
    return {
      profile: 'igloo',
      gradientAlpha: 1
    };
  }

  return null;
}

export class HomeSceneRenderer {
  constructor({ scenes = {}, assets = null } = {}) {
    this.name = 'home-renderer';
    this.active = false;
    this.scenes = scenes;
    this.assets = assets;
    this.renderState = null;
    this.size = {
      width: 1,
      height: 1,
      pixelRatio: 1
    };
    this.blueOffset = new THREE.Vector2(0, 0);
    this.iglooSceneLut = this.assets?.get('texture', 'igloo-scene-lut') ?? null;
    this.overlayScene = null;
    this.elapsed = 0;

    this.compositeScene = new THREE.Scene();
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tSceneA: { value: null },
        tSceneB: { value: null },
        tDetail: { value: null },
        tCubes: { value: null },
        tScroll: { value: this.assets?.get('texture', 'scroll-data') ?? null },
        tFrost: { value: this.assets?.get('texture', 'frost-data') ?? null },
        tBlue: { value: this.assets?.get('texture', 'blue-noise') ?? null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBlueOffset: { value: this.blueOffset.clone() },
        uMix: { value: 0 },
        uProgressVel: { value: 0 },
        uDetailProgress: { value: 0 },
        uDetailProgress2: { value: 0 },
        uUseDetail: { value: 0 }
      },
      vertexShader: COMPOSITE_VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false
    });
    this.compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    this.compositeScene.add(this.compositeQuad);

    this.lutScene = new THREE.Scene();
    this.lutCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lutMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tLUT: { value: this.iglooSceneLut },
        uLUTSize: { value: this.iglooSceneLut?.image?.width ?? 1 },
        uLUTIntensity: { value: 1 },
        uGradientAlpha: { value: 1 }
      },
      vertexShader: LUT_VERTEX_SHADER,
      fragmentShader: LUT_FRAGMENT_SHADER,
      glslVersion: THREE.GLSL3,
      depthWrite: false,
      depthTest: false
    });
    this.lutQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMaterial);
    this.lutScene.add(this.lutQuad);

    this.entryPostScene = new THREE.Scene();
    this.entryPostCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.entryPostMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBlue: { value: this.assets?.get('texture', 'blue-noise') ?? null },
        tScroll: { value: this.assets?.get('texture', 'scroll-data') ?? null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBlueOffset: { value: this.blueOffset.clone() },
        uRingProximity: { value: 0 },
        uSquareAttr: { value: new THREE.Vector3() }
      },
      vertexShader: ENTRY_POST_VERTEX_SHADER,
      fragmentShader: ENTRY_POST_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false
    });
    this.entryPostQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.entryPostMaterial);
    this.entryPostScene.add(this.entryPostQuad);

    this.renderTargetA = createRenderTarget(1, 1);
    this.renderTargetB = createRenderTarget(1, 1);
    this.renderTargetDetail = createRenderTarget(1, 1);
    this.renderTargetCubes = createRenderTarget(1, 1);
    this.renderTargetPostA = createRenderTarget(1, 1);
    this.renderTargetPostB = createRenderTarget(1, 1);
    this.renderTargetPostEntry = createRenderTarget(1, 1);
  }

  setActive(active) {
    this.active = active;
  }

  setScenes(scenes) {
    this.scenes = scenes;
    Object.values(this.scenes).forEach((scene) => {
      scene.setSize(this.size.width, this.size.height);
    });
  }

  setRenderState(renderState) {
    this.renderState = renderState;
  }

  setOverlayScene(overlayScene) {
    this.overlayScene = overlayScene;
    this.overlayScene?.setSize?.(this.size.width, this.size.height, this.size.pixelRatio);
  }

  setSize(width, height, pixelRatio = 1) {
    this.size.width = width;
    this.size.height = height;
    this.size.pixelRatio = pixelRatio;

    const renderWidth = Math.max(1, Math.round(width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(height * pixelRatio));

    this.renderTargetA.setSize(renderWidth, renderHeight);
    this.renderTargetB.setSize(renderWidth, renderHeight);
    this.renderTargetDetail.setSize(renderWidth, renderHeight);
    this.renderTargetCubes.setSize(renderWidth, renderHeight);
    this.renderTargetPostA.setSize(renderWidth, renderHeight);
    this.renderTargetPostB.setSize(renderWidth, renderHeight);
    this.renderTargetPostEntry.setSize(renderWidth, renderHeight);
    this.compositeMaterial.uniforms.uResolution.value.set(renderWidth, renderHeight);
    this.entryPostMaterial.uniforms.uResolution.value.set(renderWidth, renderHeight);

    Object.values(this.scenes).forEach((scene) => {
      scene.setSize(width, height);
    });

    this.renderState?.detailScene?.setSize?.(width, height);
    this.overlayScene?.setSize?.(width, height, pixelRatio);
  }

  applyColorCorrection(renderer, sourceTarget, destinationTarget, colorCorrectionState) {
    if (colorCorrectionState?.profile === 'entry') {
      this.entryPostMaterial.uniforms.tDiffuse.value = sourceTarget.texture;
      this.entryPostMaterial.uniforms.uBlueOffset.value.copy(this.blueOffset);
      this.entryPostMaterial.uniforms.uRingProximity.value = colorCorrectionState.ringProximity ?? 0;
      this.entryPostMaterial.uniforms.uSquareAttr.value.copy(colorCorrectionState.squareAttr ?? new THREE.Vector3());

      renderer.setRenderTarget(destinationTarget);
      renderer.clear(true, true, true);
      renderer.render(this.entryPostScene, this.entryPostCamera);
      return destinationTarget.texture;
    }

    if (
      colorCorrectionState?.profile !== 'igloo'
      || !this.iglooSceneLut?.isData3DTexture
    ) {
      return sourceTarget.texture;
    }

    this.lutMaterial.uniforms.tDiffuse.value = sourceTarget.texture;
    this.lutMaterial.uniforms.tLUT.value = this.iglooSceneLut;
    this.lutMaterial.uniforms.uLUTSize.value = this.iglooSceneLut.image?.width ?? 1;
    this.lutMaterial.uniforms.uLUTIntensity.value = colorCorrectionState.lutIntensity ?? 1;
    this.lutMaterial.uniforms.uGradientAlpha.value = colorCorrectionState.gradientAlpha ?? 1;

    renderer.setRenderTarget(destinationTarget);
    renderer.clear(true, true, true);
    renderer.render(this.lutScene, this.lutCamera);
    return destinationTarget.texture;
  }

  update(delta, elapsed, frameState) {
    this.elapsed = elapsed;

    if (!this.renderState?.scene) {
      return;
    }

    this.renderState.scene.update(delta, elapsed, frameState);

    if (this.renderState.nextScene && this.renderState.nextScene !== this.renderState.scene && this.renderState.blend > 0) {
      this.renderState.nextScene.update(delta, elapsed, frameState);
    }

    if (this.renderState.detailScene && this.renderState.detailBlend > 0) {
      this.renderState.detailScene.update(delta, elapsed, frameState);
    }

    const cubesScene = this.renderState.cubesScene ?? this.scenes.cubes ?? null;
    if (
      cubesScene
      && cubesScene !== this.renderState.scene
      && cubesScene !== this.renderState.nextScene
    ) {
      cubesScene.update(delta, elapsed, frameState);
    }

    this.overlayScene?.animate?.(delta, elapsed, frameState, this.renderState);
  }

  render(renderer) {
    if (!this.renderState?.scene) {
      return;
    }

    const previousTarget = renderer.getRenderTarget();
    const currentScene = this.renderState.scene;
    const nextScene = this.renderState.nextScene;
    const blend = nextScene ? this.renderState.blend : 0;
    const detailScene = this.renderState.detailScene;
    const cubesScene = this.renderState.cubesScene ?? this.scenes.cubes ?? null;
    const detailBlend = this.renderState.detailBlend ?? 0;
    const detailSceneBlend = this.renderState.detailSceneBlend ?? detailBlend;
    const preparedScenes = new Set();
    const renderSize = {
      width: this.size.width,
      height: this.size.height,
      pixelRatio: this.size.pixelRatio,
      renderWidth: this.renderTargetA.width,
      renderHeight: this.renderTargetA.height
    };

    prepareSceneForRender(currentScene, renderer, renderSize, preparedScenes);
    prepareSceneForRender(nextScene, renderer, renderSize, preparedScenes);
    prepareSceneForRender(detailScene, renderer, renderSize, preparedScenes);
    prepareSceneForRender(cubesScene, renderer, renderSize, preparedScenes);

    renderer.setRenderTarget(this.renderTargetA);
    renderer.clear(true, true, true);
    renderer.render(currentScene, currentScene.camera);

    renderer.setRenderTarget(this.renderTargetB);
    renderer.clear(true, true, true);
    renderer.render(nextScene ?? currentScene, (nextScene ?? currentScene).camera);

    renderer.setRenderTarget(this.renderTargetDetail);
    renderer.clear(true, true, true);
    renderer.render(detailScene ?? currentScene, (detailScene ?? currentScene).camera);

    renderer.setRenderTarget(this.renderTargetCubes);
    renderer.clear(true, true, true);
    renderer.render(cubesScene ?? currentScene, (cubesScene ?? currentScene).camera);

    const sceneATexture = this.applyColorCorrection(
      renderer,
      this.renderTargetA,
      this.renderTargetPostA,
      getColorCorrectionState(currentScene)
    );
    const sceneBTexture = this.applyColorCorrection(
      renderer,
      this.renderTargetB,
      this.renderTargetPostB,
      getColorCorrectionState(nextScene ?? currentScene)
    );

    this.compositeMaterial.uniforms.tSceneA.value = sceneATexture;
    this.compositeMaterial.uniforms.tSceneB.value = sceneBTexture;
    this.compositeMaterial.uniforms.tDetail.value = this.renderTargetDetail.texture;
    this.compositeMaterial.uniforms.tCubes.value = this.renderTargetCubes.texture;
    this.compositeMaterial.uniforms.uMix.value = blend;
    this.compositeMaterial.uniforms.uProgressVel.value = this.renderState.scrollVelocity ?? 0;
    this.compositeMaterial.uniforms.uDetailProgress.value = detailBlend;
    this.compositeMaterial.uniforms.uDetailProgress2.value = detailSceneBlend;
    this.compositeMaterial.uniforms.uUseDetail.value = Math.max(detailBlend, detailSceneBlend);
    this.blueOffset.set(
      (this.blueOffset.x + 0.61803398875) % 1,
      (this.blueOffset.y + 0.41421356237) % 1
    );
    this.compositeMaterial.uniforms.uBlueOffset.value.copy(this.blueOffset);

    renderer.setRenderTarget(previousTarget);
    renderer.clear(true, true, true);
    renderer.render(this.compositeScene, this.compositeCamera);

    if (this.overlayScene?.scene && this.overlayScene?.camera) {
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(this.overlayScene.scene, this.overlayScene.camera);
      renderer.autoClear = previousAutoClear;
    }
  }

  dispose() {
    this.renderTargetA.dispose();
    this.renderTargetB.dispose();
    this.renderTargetDetail.dispose();
    this.renderTargetCubes.dispose();
    this.renderTargetPostA.dispose();
    this.renderTargetPostB.dispose();
    this.renderTargetPostEntry.dispose();
    this.compositeQuad.geometry.dispose();
    this.compositeMaterial.dispose();
    this.lutQuad.geometry.dispose();
    this.lutMaterial.dispose();
    this.entryPostQuad.geometry.dispose();
    this.entryPostMaterial.dispose();
    this.overlayScene?.dispose?.();
  }
}
