import * as THREE from 'three';
import { MsdfTextBlock, loadFontMetrics } from '../ui/msdf.js';

const SPRITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LOGO_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tMap;
  uniform sampler2D tBlocks;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uShow;
  uniform float uRand;

  float median(vec3 sampleValue) {
    return max(min(sampleValue.r, sampleValue.g), min(max(sampleValue.r, sampleValue.g), sampleValue.b));
  }

  float msdf(sampler2D textureMap, vec2 sampleUv) {
    float signedDistance = median(texture2D(textureMap, sampleUv).rgb) - 0.5;
    float smoothing = max(fwidth(signedDistance), 1e-4);
    return smoothstep(-smoothing, smoothing, signedDistance);
  }

  vec2 hash21(float value) {
    vec3 p3 = fract(vec3(value) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  void main() {
    vec2 uv = vUv;
    float alpha = 1.0;

    if (uShow < 0.999) {
      float steps = 3.0;
      vec2 hash = hash21(floor(uShow * steps) / steps + uRand * 3.342);
      vec2 offset = hash * 2.0 - 1.0;
      vec2 blocksUv = uv * vec2(0.25, 1.0) + uRand * 12.4242 + offset * uRand * 4.543;
      float blocks = texture2D(tBlocks, blocksUv).g * 2.0 - 1.0;
      uv += vec2(blocks, 0.0) * 0.0075 * (1.0 - uShow);
      alpha *= sin(uShow * 30.0 + uRand * 12.4242) * 0.15 + 0.85;
      alpha *= step(0.01, uShow);
    }

    alpha *= msdf(tMap, uv);
    gl_FragColor = vec4(uColor, alpha * uOpacity);
  }
`;

const SOUND_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uActive;
  uniform float uShow;
  uniform float uRand;

  float median(vec3 sampleValue) {
    return max(min(sampleValue.r, sampleValue.g), min(max(sampleValue.r, sampleValue.g), sampleValue.b));
  }

  float msdf(sampler2D textureMap, vec2 sampleUv) {
    float signedDistance = median(texture2D(textureMap, sampleUv).rgb) - 0.5;
    float smoothing = max(fwidth(signedDistance), 1e-4);
    return smoothstep(-smoothing, smoothing, signedDistance);
  }

  void main() {
    vec2 uv = vUv * vec2(1.0, 0.5) + vec2(0.0, uActive * 0.5);
    float alpha = msdf(tMap, uv);

    if (uShow < 0.999) {
      alpha *= sin(uShow * 30.0 + uRand * 12.4242) * 0.4 + 0.6;
      alpha *= step(0.01, uShow);
    }

    gl_FragColor = vec4(uColor, alpha * uOpacity);
  }
`;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createLogoMaterial(texture, blocksTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      tBlocks: { value: blocksTexture },
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 1 },
      uShow: { value: 0 },
      uRand: { value: Math.random() }
    },
    vertexShader: SPRITE_VERTEX_SHADER,
    fragmentShader: LOGO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
}

function createSoundMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 1 },
      uActive: { value: 0 },
      uShow: { value: 1 },
      uRand: { value: Math.random() }
    },
    vertexShader: SPRITE_VERTEX_SHADER,
    fragmentShader: SOUND_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
}

function createSpriteMesh(material, renderOrder = 1000) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

function createOverlayLine(color = '#ffffff', renderOrder = 1001) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24), 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });

  const line = new THREE.LineSegments(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  return line;
}

function setLinePoints(line, points = []) {
  const positions = line.geometry.getAttribute('position');
  const segmentCount = Math.max(points.length - 1, 0);
  const requiredFloats = segmentCount * 2 * 3;

  if (requiredFloats > positions.array.length) {
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(requiredFloats), 3));
  }

  const target = line.geometry.getAttribute('position');
  const values = target.array;
  let cursor = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const pointA = points[index];
    const pointB = points[index + 1];
    values[cursor++] = pointA.x;
    values[cursor++] = pointA.y;
    values[cursor++] = 0;
    values[cursor++] = pointB.x;
    values[cursor++] = pointB.y;
    values[cursor++] = 0;
  }

  target.needsUpdate = true;
  line.geometry.setDrawRange(0, segmentCount * 2);
}

function ndcToOverlayPoint(ndc, width, height) {
  return new THREE.Vector2(
    ndc.x * width * 0.5,
    ndc.y * height * 0.5
  );
}

function formatCubesTitle(project) {
  const label = `${project?.originalTitle ?? project?.title ?? ''}`.toUpperCase();
  return label.replace(/^(\S+)\s+/, '$1\n');
}

function formatCubesMeta(project, clickLabel = 'Click to explore') {
  return `D ${(project?.dateLabel ?? '').replace(/\//g, '.')}\n${clickLabel.toUpperCase()}`;
}

function formatCubeTemperature(baseTemp = 0, elapsed = 0, seed = 0) {
  const celsius = baseTemp + Math.sin(elapsed * 0.05 + seed) * 2;
  const fahrenheit = celsius * 1.8 + 32;
  const fahrenheitLabel = fahrenheit.toFixed(2).padStart(5, '0');
  const sign = celsius >= 0 ? '+' : '-';
  const celsiusValue = Math.abs(celsius).toFixed(2);
  const [celsiusInt, celsiusFrac] = celsiusValue.split('.');
  const celsiusLabel = `${sign}${celsiusInt.padStart(2, '0')}.${celsiusFrac}`;
  return `TEMP  ${fahrenheitLabel}\n${celsiusLabel}`;
}

export class WebGLUiScene {
  constructor({ content, assets }) {
    this.content = content;
    this.assets = assets;
    this.size = { width: 1, height: 1 };
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;
    this.elapsed = 0;
    this.uiScale = 1;
    this.readyState = 'loading';
    this.layoutState = {
      leftMargin: 64,
      rightMargin: 64,
      topMargin: 48,
      bottomMargin: 48,
      logoWidth: 200,
      logoHeight: 42,
      soundSize: 22
    };
    this.state = {
      routeName: null,
      activeSectionKey: null,
      hasProject: false,
      muted: true,
      clickLabel: 'Click to explore',
      brand: content.brand,
      copyright: content.manifesto.copyright ?? '',
      rights: content.manifesto.rights ?? '',
      manifestoLabel: 'Manifesto',
      manifestoText: content.manifesto.text ?? '',
      iglooPresentation: null,
      cubesPresentation: null
    };

    this.heroGroup = new THREE.Group();
    this.legalGroup = new THREE.Group();
    this.manifestoGroup = new THREE.Group();
    this.soundGroup = new THREE.Group();
    this.cubesGroup = new THREE.Group();

    this.scene.add(this.heroGroup);
    this.scene.add(this.soundGroup);
    this.scene.add(this.cubesGroup);
    this.heroGroup.add(this.legalGroup);
    this.heroGroup.add(this.manifestoGroup);

    this.logoMesh = createSpriteMesh(
      createLogoMaterial(
        this.assets?.get('texture', 'ui-logo') ?? null,
        this.assets?.get('texture', 'scroll-data') ?? null
      ),
      1002
    );
    this.heroGroup.add(this.logoMesh);

    this.soundIcon = createSpriteMesh(
      createSoundMaterial(this.assets?.get('texture', 'ui-sound') ?? null),
      1002
    );
    this.soundGroup.add(this.soundIcon);

    this.textBlocks = {};
    this.cubesLines = {
      frame: createOverlayLine('#ffffff', 1000),
      title: createOverlayLine('#ffffff', 1001),
      date: createOverlayLine('#ffffff', 1001)
    };
    this.basePositions = {};
    this.cubesOverlay = {
      titleKey: null,
      tempKey: null
    };

    this.cubesGroup.add(this.cubesLines.frame, this.cubesLines.title, this.cubesLines.date);

    this.ready = this.init().catch((error) => {
      console.warn('WebGL UI failed to initialize, keeping DOM HUD as fallback.', error);
      this.readyState = 'failed';
    });

    this.setSize(1, 1);
    this.applyState();
  }

  async init() {
    this.fontData = await loadFontMetrics('/reference-assets/fonts/IBMPlexMono-Medium.json');
    const fontTexture = this.assets?.get('texture', 'ui-font-mono') ?? null;

    if (!fontTexture) {
      throw new Error('Missing ui-font-mono texture');
    }

    this.textBlocks.copyright = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.state.copyright,
      maxWidth: 360,
      fontSize: 16,
      lineHeight: 1.1,
      align: 'left',
      color: '#606570'
    });
    this.textBlocks.rights = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.state.rights,
      maxWidth: 360,
      fontSize: 21,
      lineHeight: 1.18,
      align: 'left',
      color: '#f1f5fb'
    });
    this.textBlocks.manifestoLabel = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: `/////// ${this.state.manifestoLabel}`,
      maxWidth: 320,
      fontSize: 18,
      lineHeight: 1,
      align: 'right',
      color: '#606570'
    });
    this.textBlocks.manifestoText = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.state.manifestoText,
      maxWidth: 420,
      fontSize: 28,
      lineHeight: 1.12,
      align: 'right',
      color: '#f2f6fc'
    });
    this.textBlocks.soundLabel = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: 'Sound:',
      maxWidth: 120,
      fontSize: 18,
      lineHeight: 1,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.soundValue = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.state.muted ? 'Off' : 'On',
      maxWidth: 80,
      fontSize: 18,
      lineHeight: 1,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.cubeTitle = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: '',
      maxWidth: 420,
      fontSize: 30,
      lineHeight: 0.88,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.cubeMeta = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: '',
      maxWidth: 300,
      fontSize: 24,
      lineHeight: 0.88,
      align: 'right',
      color: '#ffffff'
    });
    this.textBlocks.cubeTemp = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: '',
      maxWidth: 220,
      fontSize: 20,
      lineHeight: 0.9,
      align: 'left',
      color: '#ffffff'
    });

    this.legalGroup.add(this.textBlocks.copyright.mesh, this.textBlocks.rights.mesh);
    this.manifestoGroup.add(this.textBlocks.manifestoLabel.mesh, this.textBlocks.manifestoText.mesh);
    this.soundGroup.add(this.textBlocks.soundLabel.mesh, this.textBlocks.soundValue.mesh);
    this.cubesGroup.add(this.textBlocks.cubeTitle.mesh, this.textBlocks.cubeMeta.mesh, this.textBlocks.cubeTemp.mesh);

    this.readyState = 'ready';
    this.layout();
    this.applyState();
  }

  isReadyForHero() {
    return this.readyState === 'ready';
  }

  setActive() {}

  setSize(width, height) {
    this.size.width = width;
    this.size.height = height;
    this.camera.left = -width * 0.5;
    this.camera.right = width * 0.5;
    this.camera.top = height * 0.5;
    this.camera.bottom = -height * 0.5;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  updateTextContent() {
    if (!this.fontData || this.readyState !== 'ready') {
      return;
    }

    this.textBlocks.copyright.setText(this.state.copyright);
    this.textBlocks.rights.setText(this.state.rights);
    this.textBlocks.manifestoLabel.setText(`/////// ${this.state.manifestoLabel}`);
    this.textBlocks.manifestoText.setText(this.state.manifestoText);
    this.textBlocks.soundValue.setText(this.state.muted ? 'Off' : 'On');
  }

  updateCubesOverlayContent() {
    if (this.readyState !== 'ready') {
      return;
    }

    const presentation = this.state.cubesPresentation;
    const project = presentation?.project ?? null;
    const titleKey = project?.hash ?? null;

    if (titleKey !== this.cubesOverlay.titleKey) {
      this.cubesOverlay.titleKey = titleKey;
      this.textBlocks.cubeTitle.setText(project ? formatCubesTitle(project) : '');
      this.textBlocks.cubeMeta.setText(project ? formatCubesMeta(project, this.state.clickLabel) : '');
    }

    const nextTemp = project
      ? formatCubeTemperature(project.temp ?? 0, this.elapsed, project.index ?? 0)
      : '';

    if (nextTemp !== this.cubesOverlay.tempKey) {
      this.cubesOverlay.tempKey = nextTemp;
      this.textBlocks.cubeTemp.setText(nextTemp);
    }
  }

  applyCubesPresentation() {
    if (this.readyState !== 'ready') {
      return;
    }

    const presentation = this.state.cubesPresentation;
    const isCubesHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'cubes'
      && !this.state.hasProject;

    if (!isCubesHome || !presentation?.visible) {
      this.cubesGroup.visible = false;
      Object.values(this.cubesLines).forEach((line) => {
        line.visible = false;
      });
      return;
    }

    this.cubesGroup.visible = true;
    this.updateCubesOverlayContent();

    const width = this.size.width;
    const height = this.size.height;
    const mobile = width < 760 || height < 680;
    const small = width < 1180 || height < 820;
    const scale = mobile ? 0.74 : small ? 0.88 : 1;
    const reveal = clamp(presentation.reveal ?? 0, 0, 1);
    const titleAnchor = ndcToOverlayPoint(presentation.titleAnchor, width, height);
    const dateAnchor = ndcToOverlayPoint(presentation.dateAnchor, width, height);
    const tempAnchor = ndcToOverlayPoint(presentation.tempAnchor, width, height);
    const frameAnchors = (presentation.frameAnchors ?? []).map((point) => ndcToOverlayPoint(point, width, height));
    const titlePosition = new THREE.Vector2(
      titleAnchor.x - 188 * scale,
      titleAnchor.y + 116 * scale
    );
    const datePosition = new THREE.Vector2(
      dateAnchor.x + 126 * scale,
      dateAnchor.y - 18 * scale
    );
    const tempPosition = new THREE.Vector2(
      tempAnchor.x + 116 * scale,
      tempAnchor.y + 72 * scale
    );
    const titleElbow = new THREE.Vector2(
      titleAnchor.x - 68 * scale,
      titleAnchor.y + 56 * scale
    );
    const dateElbow = new THREE.Vector2(
      dateAnchor.x + 84 * scale,
      dateAnchor.y - 14 * scale
    );

    this.textBlocks.cubeTitle.mesh.scale.set(scale, scale, 1);
    this.textBlocks.cubeMeta.mesh.scale.set(scale, scale, 1);
    this.textBlocks.cubeTemp.mesh.scale.set(scale, scale, 1);

    this.textBlocks.cubeTitle.mesh.position.set(
      titlePosition.x,
      titlePosition.y + (1 - reveal) * 14 * scale,
      0
    );
    this.textBlocks.cubeMeta.mesh.position.set(
      datePosition.x,
      datePosition.y - (1 - reveal) * 12 * scale,
      0
    );
    this.textBlocks.cubeTemp.mesh.position.set(
      tempPosition.x,
      tempPosition.y + (1 - reveal) * 10 * scale,
      0
    );

    this.textBlocks.cubeTitle.setOpacity(reveal);
    this.textBlocks.cubeMeta.setOpacity(reveal);
    this.textBlocks.cubeTemp.setOpacity(reveal * 0.9);

    setLinePoints(this.cubesLines.title, [
      titleAnchor,
      titleElbow,
      new THREE.Vector2(titlePosition.x + 40 * scale, titlePosition.y - 14 * scale)
    ]);
    setLinePoints(this.cubesLines.date, [
      dateAnchor,
      dateElbow,
      new THREE.Vector2(datePosition.x - this.textBlocks.cubeMeta.size.width * scale - 16 * scale, datePosition.y - 12 * scale)
    ]);

    if (frameAnchors.length >= 2) {
      setLinePoints(this.cubesLines.frame, frameAnchors);
      this.cubesLines.frame.visible = true;
      this.cubesLines.frame.material.opacity = reveal * 0.32;
    } else {
      this.cubesLines.frame.visible = false;
    }

    this.cubesLines.title.visible = true;
    this.cubesLines.date.visible = true;
    this.cubesLines.title.material.opacity = reveal * 0.9;
    this.cubesLines.date.material.opacity = reveal * 0.85;
  }

  layout() {
    const width = this.size.width;
    const height = this.size.height;
    const small = width < 1180 || height < 820;
    const mobile = width < 760 || height < 680;

    this.uiScale = mobile ? 0.72 : small ? 0.88 : 1;
    this.layoutState.leftMargin = mobile ? 44 : small ? 54 : 64;
    this.layoutState.rightMargin = mobile ? 44 : small ? 56 : 64;
    this.layoutState.topMargin = mobile ? 34 : small ? 40 : 46;
    this.layoutState.bottomMargin = mobile ? 28 : small ? 34 : 42;
    this.layoutState.logoWidth = mobile ? 140 : small ? 160 : 200;
    this.layoutState.logoHeight = this.layoutState.logoWidth * 0.21;
    this.layoutState.soundSize = mobile ? 18 : small ? 20 : 22;

    this.logoMesh.scale.set(this.layoutState.logoWidth, this.layoutState.logoHeight, 1);
    this.logoMesh.position.set(
      -width * 0.5 + this.layoutState.leftMargin + this.layoutState.logoWidth * 0.5,
      height * 0.5 - this.layoutState.topMargin - this.layoutState.logoHeight * 0.5,
      0
    );

    this.basePositions.legalX = -width * 0.5 + this.layoutState.leftMargin;
    this.basePositions.legalY = height * 0.5 - this.layoutState.topMargin - 72 * this.uiScale;
    this.basePositions.manifestoX = width * 0.5 - this.layoutState.rightMargin;
    this.basePositions.manifestoY = height * 0.5 - this.layoutState.topMargin;
    this.basePositions.soundX = -width * 0.5 + this.layoutState.leftMargin;
    this.basePositions.soundY = -height * 0.5 + this.layoutState.bottomMargin + this.layoutState.soundSize;

    this.legalGroup.position.set(this.basePositions.legalX, this.basePositions.legalY, 0);
    this.manifestoGroup.position.set(this.basePositions.manifestoX, this.basePositions.manifestoY, 0);
    this.soundGroup.position.set(this.basePositions.soundX, this.basePositions.soundY, 0);

    this.soundIcon.scale.set(this.layoutState.soundSize, this.layoutState.soundSize, 1);
    this.soundIcon.position.set(this.layoutState.soundSize * 0.5, -this.layoutState.soundSize * 0.48, 0);

    if (this.readyState !== 'ready') {
      return;
    }

    Object.values(this.textBlocks).forEach((block) => {
      block.mesh.scale.set(this.uiScale, this.uiScale, 1);
    });

    this.textBlocks.copyright.mesh.position.set(0, 0, 0);
    this.textBlocks.rights.mesh.position.set(0, -44 * this.uiScale, 0);
    this.textBlocks.manifestoLabel.mesh.position.set(0, 0, 0);
    this.textBlocks.manifestoText.mesh.position.set(0, -42 * this.uiScale, 0);

    const soundTextX = this.layoutState.soundSize * 1.45;
    this.textBlocks.soundLabel.mesh.position.set(soundTextX, 0, 0);
    this.textBlocks.soundValue.mesh.position.set(
      soundTextX + this.textBlocks.soundLabel.size.width * this.uiScale + 14 * this.uiScale,
      0,
      0
    );

    this.textBlocks.cubeTitle.mesh.scale.set(this.uiScale, this.uiScale, 1);
    this.textBlocks.cubeMeta.mesh.scale.set(this.uiScale, this.uiScale, 1);
    this.textBlocks.cubeTemp.mesh.scale.set(this.uiScale, this.uiScale, 1);
  }

  update(nextState = {}) {
    const nextMuted = nextState.muted ?? this.state.muted;
    const nextCopyright = nextState.copyright ?? this.state.copyright;
    const nextRights = nextState.rights ?? this.state.rights;
    const nextManifestoLabel = nextState.manifestoLabel ?? this.state.manifestoLabel;
    const nextManifestoText = nextState.manifestoText ?? this.state.manifestoText;

    const textChanged =
      nextMuted !== this.state.muted
      || nextCopyright !== this.state.copyright
      || nextRights !== this.state.rights
      || nextManifestoLabel !== this.state.manifestoLabel
      || nextManifestoText !== this.state.manifestoText;

    this.state = {
      ...this.state,
      ...nextState,
      muted: nextMuted,
      copyright: nextCopyright,
      rights: nextRights,
      manifestoLabel: nextManifestoLabel,
      manifestoText: nextManifestoText
    };

    if (textChanged && this.readyState === 'ready') {
      this.updateTextContent();
      this.layout();
    }

    this.applyState();
  }

  applyState() {
    const isIglooHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'igloo'
      && !this.state.hasProject;
    const isCubesHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'cubes'
      && !this.state.hasProject;
    const isEntryHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'entry'
      && !this.state.hasProject;
    const showSound = this.state.routeName === 'home' && !this.state.hasProject;
    const showLogo = isIglooHome || isCubesHome || isEntryHome;
    const panelProgress = isIglooHome ? (this.state.iglooPresentation?.panelProgress ?? 0) : 0;
    const brandProgress = isIglooHome ? (this.state.iglooPresentation?.brandProgress ?? panelProgress) : 0;
    const titleProgress = isIglooHome ? (this.state.iglooPresentation?.titleProgress ?? panelProgress) : 0;
    const textProgress = isIglooHome ? (this.state.iglooPresentation?.textProgress ?? panelProgress) : 0;
    const legalProgress = isIglooHome ? (this.state.iglooPresentation?.legalProgress ?? panelProgress) : 0;

    this.heroGroup.visible = showLogo;
    this.legalGroup.visible = isIglooHome;
    this.manifestoGroup.visible = isIglooHome;
    this.soundGroup.visible = showSound;

    this.logoMesh.material.uniforms.uShow.value = isIglooHome ? brandProgress : ((isCubesHome || isEntryHome) ? 1 : 0);
    this.logoMesh.material.uniforms.uOpacity.value = isIglooHome ? brandProgress : ((isCubesHome || isEntryHome) ? 1 : 0);
    this.logoMesh.position.y = heightFromTop(this.size.height, this.layoutState.topMargin, this.layoutState.logoHeight * 0.5)
      - (1 - (isIglooHome ? brandProgress : 1)) * 10 * this.uiScale;

    this.legalGroup.position.y = this.basePositions.legalY - (1 - legalProgress) * 12 * this.uiScale;
    this.manifestoGroup.position.y = this.basePositions.manifestoY - (1 - titleProgress) * 8 * this.uiScale;

    if (this.readyState === 'ready') {
      this.textBlocks.copyright.setOpacity(legalProgress);
      this.textBlocks.rights.setOpacity(legalProgress);
      this.textBlocks.manifestoLabel.setOpacity(titleProgress);
      this.textBlocks.manifestoText.setOpacity(textProgress);
      this.textBlocks.soundLabel.setOpacity(showSound ? clamp(0.72 + panelProgress * 0.28, 0, 1) : 0);
      this.textBlocks.soundValue.setOpacity(showSound ? clamp(0.72 + panelProgress * 0.28, 0, 1) : 0);
    }

    this.soundIcon.material.uniforms.uActive.value = this.state.muted ? 0 : 1;
    this.soundIcon.material.uniforms.uOpacity.value = showSound ? clamp(0.72 + panelProgress * 0.28, 0, 1) : 0;
    this.soundIcon.material.uniforms.uShow.value = showSound ? clamp(0.72 + panelProgress * 0.28, 0, 1) : 0;
    this.applyCubesPresentation();
  }

  animate(delta, elapsed) {
    this.elapsed = elapsed;

    if (this.heroGroup.visible) {
      const logoPulse = 0.985 + Math.sin(elapsed * 1.4) * 0.015;
      this.logoMesh.scale.set(
        this.layoutState.logoWidth * logoPulse,
        this.layoutState.logoHeight * logoPulse,
        1
      );
    }

    if (this.soundGroup.visible) {
      const pulse = 0.985 + Math.sin(elapsed * 2.1) * 0.015;
      this.soundGroup.scale.set(pulse, pulse, 1);
    } else {
      this.soundGroup.scale.set(1, 1, 1);
    }

    if (this.cubesGroup.visible) {
      this.updateCubesOverlayContent();
      this.applyCubesPresentation();
    }
  }

  dispose() {
    this.logoMesh.geometry.dispose();
    this.logoMesh.material.dispose();
    this.soundIcon.geometry.dispose();
    this.soundIcon.material.dispose();
    Object.values(this.cubesLines).forEach((line) => {
      line.geometry.dispose();
      line.material.dispose();
    });
    Object.values(this.textBlocks).forEach((block) => block.dispose());
  }
}

function heightFromTop(viewHeight, topMargin, halfHeight) {
  return viewHeight * 0.5 - topMargin - halfHeight;
}
