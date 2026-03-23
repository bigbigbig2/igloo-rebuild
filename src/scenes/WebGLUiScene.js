import * as THREE from 'three';
import { CanvasTextBlock, MsdfTextBlock, loadFontMetrics } from '../ui/msdf.js';

const SPRITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FITTED_SPRITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vScale;

  vec2 getMatrixScale(mat4 matrixValue) {
    return vec2(
      length(vec3(matrixValue[0].xyz)),
      length(vec3(matrixValue[1].xyz))
    );
  }

  void main() {
    vUv = uv;
    vScale = getMatrixScale(modelMatrix);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LOGO_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vScale;

  uniform sampler2D tMap;
  uniform sampler2D tBlocks;
  uniform vec2 uImageSize;
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

  vec2 imagefitUV(vec2 uv, vec2 imageSize, vec2 containerSize, float cover) {
    vec2 ratio = containerSize / max(imageSize, vec2(1.0));
    float aspect = mix(min(ratio.x, ratio.y), max(ratio.x, ratio.y), cover);
    return (uv - 0.5) * ratio * (1.0 / aspect) + 0.5;
  }

  vec2 hash21(float value) {
    vec3 p3 = fract(vec3(value) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  void main() {
    vec2 uv = imagefitUV(vUv, uImageSize, max(vScale, vec2(1.0)), 1.0);
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

const DEFAULT_ENTRY_HUD_DEBUG_SETTINGS = Object.freeze({
  labelYOffset: 0,
  labelTextLift: 0,
  labelSpreadMultiplier: 0.68,
  currentScaleMultiplier: 1,
  sideScaleMultiplier: 0.78,
  currentOpacityMultiplier: 1,
  sideOpacityMultiplier: 0.48,
  visitYOffset: 0,
  visitOpacityMultiplier: 1,
  arrowOpacityMultiplier: 1,
  frameOpacityMultiplier: 0
});

function createLogoMaterial(texture, blocksTexture) {
  const imageWidth = texture?.image?.width ?? texture?.source?.data?.width ?? 1;
  const imageHeight = texture?.image?.height ?? texture?.source?.data?.height ?? 1;
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      tBlocks: { value: blocksTexture },
      uImageSize: { value: new THREE.Vector2(imageWidth, imageHeight) },
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 1 },
      uShow: { value: 0 },
      uRand: { value: Math.random() }
    },
    vertexShader: FITTED_SPRITE_VERTEX_SHADER,
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

function placeTextBlock(block, x, y, scale = 1, anchor = 'left', vertical = 'top') {
  if (!block?.mesh) {
    return;
  }

  const width = (block.size?.width ?? 0) * scale;
  const height = (block.size?.height ?? 0) * scale;
  let targetX = x;
  let targetY = y;

  if (anchor === 'center') {
    targetX -= width * 0.5;
  } else if (anchor === 'right') {
    targetX -= width;
  }

  if (vertical === 'center') {
    targetY += height * 0.5;
  } else if (vertical === 'bottom') {
    targetY += height;
  }

  block.mesh.scale.set(scale, scale, 1);
  block.mesh.position.set(targetX, targetY, 0);
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

function clampOverlayTopLeft(position, blockWidth, blockHeight, width, height, margin = 36) {
  position.x = clamp(position.x, -width * 0.5 + margin, width * 0.5 - blockWidth - margin);
  position.y = clamp(position.y, -height * 0.5 + blockHeight + margin, height * 0.5 - margin);
  return position;
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

function smoothStep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function rangeProgress(value, start, end) {
  if (Math.abs(end - start) <= 1e-6) {
    return value >= end ? 1 : 0;
  }

  return smoothStep01((value - start) / (end - start));
}

function trimPolyline(points = [], progress = 1) {
  if (!Array.isArray(points) || points.length < 2 || progress <= 0) {
    return [];
  }

  if (progress >= 1) {
    return points.map((point) => point.clone());
  }

  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = points[index].distanceTo(points[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength <= 1e-6) {
    return [];
  }

  let remaining = totalLength * clamp(progress, 0, 1);
  const trimmed = [points[0].clone()];

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const pointA = points[index];
    const pointB = points[index + 1];

    if (remaining >= segmentLength) {
      trimmed.push(pointB.clone());
      remaining -= segmentLength;
      continue;
    }

    if (remaining > 0 && segmentLength > 1e-6) {
      trimmed.push(pointA.clone().lerp(pointB, remaining / segmentLength));
    }
    break;
  }

  return trimmed.length >= 2 ? trimmed : [];
}

function createRectanglePoints(centerX, centerY, width, height) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  return [
    new THREE.Vector2(centerX - halfWidth, centerY + halfHeight),
    new THREE.Vector2(centerX + halfWidth, centerY + halfHeight),
    new THREE.Vector2(centerX + halfWidth, centerY - halfHeight),
    new THREE.Vector2(centerX - halfWidth, centerY - halfHeight),
    new THREE.Vector2(centerX - halfWidth, centerY + halfHeight)
  ];
}

function createBracketPoints(centerX, centerY, width, height, side = 'left') {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const direction = side === 'left' ? 1 : -1;
  const edgeX = centerX + (side === 'left' ? -halfWidth : halfWidth);
  const inset = Math.max(width * 0.14, 10);

  return [
    new THREE.Vector2(edgeX + inset * direction, centerY + halfHeight),
    new THREE.Vector2(edgeX, centerY + halfHeight),
    new THREE.Vector2(edgeX, centerY - halfHeight),
    new THREE.Vector2(edgeX + inset * direction, centerY - halfHeight)
  ];
}

/**
 * WebGLUiScene 是首页高保真 HUD 的 WebGL 实现。
 *
 * 当前它主要负责：
 * - 左上 logo
 * - 左下 sound 状态
 * - manifesto 区块的 WebGL 文本展示
 * - cubes section 的框线、标题、日期、温度标注
 *
 * 它不试图完全替代 DOM HUD，而是与 UIScene 并行存在：
 * - UIScene 保证功能完整
 * - WebGLUiScene 负责逐步接管更接近原站风格的可视层
 */
export class WebGLUiScene {
  constructor({ content, assets, audio = null }) {
    this.content = content;
    this.assets = assets;
    this.audio = audio;
    this.size = { width: 1, height: 1 };
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;
    this.elapsed = 0;
    this.uiScale = 1;
    this.readyState = 'loading';
    this.entryDebugSettings = { ...DEFAULT_ENTRY_HUD_DEBUG_SETTINGS };
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
      cubesPresentation: null,
      entryPresentation: null
    };

    // heroGroup 用于承载 logo / manifesto / legal 等首页上层信息。
    this.heroGroup = new THREE.Group();
    this.legalGroup = new THREE.Group();
    this.manifestoGroup = new THREE.Group();
    this.soundGroup = new THREE.Group();
    this.entryGroup = new THREE.Group();
    // cubesGroup 独立承载 portfolio section 的 UI 锚点框线与文字。
    this.cubesGroup = new THREE.Group();

    this.scene.add(this.heroGroup);
    this.scene.add(this.soundGroup);
    this.scene.add(this.cubesGroup);
    this.scene.add(this.entryGroup);
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
    this.entryLines = {
      cage: createOverlayLine('#d8deea', 1000),
      arrowLeft: createOverlayLine('#ffffff', 1002),
      arrowRight: createOverlayLine('#ffffff', 1002),
      selectionLeft: createOverlayLine('#ffffff', 1003),
      selectionRight: createOverlayLine('#ffffff', 1003)
    };
    this.basePositions = {};
    this.cubesOverlay = {
      titleKey: null,
      tempKey: null,
      activeHash: null,
      visible: false,
      revealClock: 0,
      lastBeepTime: -Infinity,
      segmentPlayed: {
        title: false,
        meta: false,
        temp: false
      }
    };
    this.entryOverlay = {
      previousLabel: null,
      currentLabel: null,
      nextLabel: null
    };

    this.cubesGroup.add(this.cubesLines.frame, this.cubesLines.title, this.cubesLines.date);
    this.entryGroup.add(
      this.entryLines.cage,
      this.entryLines.arrowLeft,
      this.entryLines.arrowRight,
      this.entryLines.selectionLeft,
      this.entryLines.selectionRight
    );

    const blocksTexture = this.assets?.get('texture', 'scroll-data') ?? null;
    this.entryVisitMesh = createSpriteMesh(
      createLogoMaterial(this.assets?.get('texture', 'ui-visit') ?? null, blocksTexture),
      1002
    );
    this.entryLeftArrow = createSpriteMesh(
      createLogoMaterial(this.assets?.get('texture', 'ui-arrow') ?? null, blocksTexture),
      1002
    );
    this.entryRightArrow = createSpriteMesh(
      createLogoMaterial(this.assets?.get('texture', 'ui-arrow') ?? null, blocksTexture),
      1002
    );
    this.entryLeftArrow.scale.x = -1;
    this.entryGroup.add(this.entryVisitMesh, this.entryLeftArrow, this.entryRightArrow);
    this.entryGroup.visible = false;

    this.ready = this.init().catch((error) => {
      console.warn('WebGL UI failed to initialize, keeping DOM HUD as fallback.', error);
      this.readyState = 'failed';
    });

    this.setSize(1, 1);
    this.applyState();
  }

  async init() {
    // WebGL HUD 依赖字体 metrics 与 atlas 纹理，ready 之前只能回退 DOM HUD。
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
    this.textBlocks.cubeTitle = new CanvasTextBlock({
      text: '',
      maxWidth: 420,
      fontSize: 36,
      lineHeight: 0.92,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.cubeMeta = new CanvasTextBlock({
      text: '',
      maxWidth: 300,
      fontSize: 24,
      lineHeight: 0.94,
      align: 'right',
      color: '#ffffff'
    });
    this.textBlocks.cubeTemp = new CanvasTextBlock({
      text: '',
      maxWidth: 220,
      fontSize: 20,
      lineHeight: 0.92,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.entryPrev = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.content.links?.[0]?.label ?? '',
      maxWidth: 260,
      fontSize: 18,
      lineHeight: 1,
      align: 'left',
      color: '#a8b2c4'
    });
    this.textBlocks.entryCurrent = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.content.links?.[0]?.label ?? '',
      maxWidth: 260,
      fontSize: 20,
      lineHeight: 1,
      align: 'left',
      color: '#ffffff'
    });
    this.textBlocks.entryNext = new MsdfTextBlock({
      fontData: this.fontData,
      atlasTexture: fontTexture,
      text: this.content.links?.[1]?.label ?? '',
      maxWidth: 260,
      fontSize: 18,
      lineHeight: 1,
      align: 'left',
      color: '#a8b2c4'
    });

    this.legalGroup.add(this.textBlocks.copyright.mesh, this.textBlocks.rights.mesh);
    this.manifestoGroup.add(this.textBlocks.manifestoLabel.mesh, this.textBlocks.manifestoText.mesh);
    this.soundGroup.add(this.textBlocks.soundLabel.mesh, this.textBlocks.soundValue.mesh);
    this.cubesGroup.add(this.textBlocks.cubeTitle.mesh, this.textBlocks.cubeMeta.mesh, this.textBlocks.cubeTemp.mesh);
    this.entryGroup.add(
      this.textBlocks.entryPrev.mesh,
      this.textBlocks.entryCurrent.mesh,
      this.textBlocks.entryNext.mesh
    );
    this.textBlocks.cubeTitle.mesh.renderOrder = 1004;
    this.textBlocks.cubeMeta.mesh.renderOrder = 1004;
    this.textBlocks.cubeTemp.mesh.renderOrder = 1004;
    this.textBlocks.entryPrev.mesh.renderOrder = 1006;
    this.textBlocks.entryCurrent.mesh.renderOrder = 1006;
    this.textBlocks.entryNext.mesh.renderOrder = 1006;

    this.readyState = 'ready';
    this.layout();
    this.applyState();
  }

  isReadyForHero() {
    return this.readyState === 'ready';
  }

  getEntryDebugSettings() {
    return { ...this.entryDebugSettings };
  }

  setEntryDebugSetting(key, value) {
    if (!(key in this.entryDebugSettings) || !Number.isFinite(value)) {
      return;
    }

    this.entryDebugSettings[key] = value;
    this.applyEntryPresentation();
  }

  resetEntryDebugSettings() {
    this.entryDebugSettings = { ...DEFAULT_ENTRY_HUD_DEBUG_SETTINGS };
    this.applyEntryPresentation();
  }

  // 为了兼容 HomeSceneRenderer 的调用约定，这里保留空实现。
  setActive() {}

  setSize(width, height) {
    // WebGL HUD 本质是屏幕空间 scene，所以正交相机边界直接跟视口绑定。
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
    // 这类静态文本只在内容变化时重建字形，避免每帧重排。
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
    // cubes overlay 的标题和 meta 只在项目切换时更新；
    // 温度会随着时间缓慢浮动，因此可能更频繁刷新。
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

  updateEntryOverlayContent() {
    if (this.readyState !== 'ready') {
      return;
    }

    const links = this.content.links ?? [];

    if (!links.length) {
      return;
    }

    const activeIndex = clamp(
      Math.round(this.state.entryPresentation?.activeLinkIndex ?? 0),
      0,
      links.length - 1
    );
    const previousIndex = (activeIndex - 1 + links.length) % links.length;
    const nextIndex = (activeIndex + 1) % links.length;
    const previousLabel = links[previousIndex]?.label ?? '';
    const currentLabel = links[activeIndex]?.label ?? '';
    const nextLabel = links[nextIndex]?.label ?? '';

    if (this.entryOverlay.previousLabel !== previousLabel) {
      this.entryOverlay.previousLabel = previousLabel;
      this.textBlocks.entryPrev.setText(previousLabel);
    }

    if (this.entryOverlay.currentLabel !== currentLabel) {
      this.entryOverlay.currentLabel = currentLabel;
      this.textBlocks.entryCurrent.setText(currentLabel);
    }

    if (this.entryOverlay.nextLabel !== nextLabel) {
      this.entryOverlay.nextLabel = nextLabel;
      this.textBlocks.entryNext.setText(nextLabel);
    }
  }

  resetCubesOverlayReveal(projectHash = null) {
    this.cubesOverlay.activeHash = projectHash;
    this.cubesOverlay.revealClock = 0;
    this.cubesOverlay.segmentPlayed.title = false;
    this.cubesOverlay.segmentPlayed.meta = false;
    this.cubesOverlay.segmentPlayed.temp = false;
  }

  playRandomCubeBeep() {
    if (!this.audio || this.elapsed - this.cubesOverlay.lastBeepTime < 0.38) {
      return;
    }

    const keys = ['beeps', 'beeps2', 'beeps3'];
    const key = keys[Math.floor(Math.random() * keys.length)] ?? keys[0];
    this.cubesOverlay.lastBeepTime = this.elapsed;
    this.audio.play(key);
  }

  updateCubesOverlayRuntime(delta = 0) {
    const presentation = this.state.cubesPresentation;
    const isCubesHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'cubes'
      && !this.state.hasProject;
    const isVisible = isCubesHome
      && Boolean(presentation?.visible)
      && clamp(presentation?.reveal ?? 0, 0, 1) > 0.02;
    const projectHash = presentation?.project?.hash ?? null;

    if (!isVisible) {
      this.cubesOverlay.visible = false;
      this.cubesOverlay.revealClock = 0;
      return;
    }

    if (!this.cubesOverlay.visible || projectHash !== this.cubesOverlay.activeHash) {
      this.resetCubesOverlayReveal(projectHash);
    }

    this.cubesOverlay.visible = true;
    this.cubesOverlay.revealClock = clamp(this.cubesOverlay.revealClock + delta / 0.82, 0, 1);

    [
      ['title', 0.08],
      ['meta', 0.32],
      ['temp', 0.56]
    ].forEach(([key, threshold]) => {
      if (!this.cubesOverlay.segmentPlayed[key] && this.cubesOverlay.revealClock >= threshold) {
        this.cubesOverlay.segmentPlayed[key] = true;
        this.playRandomCubeBeep();
      }
    });
  }

  applyCubesPresentation() {
    // 只有首页 cubes section 且没有进入 detail 时，cubes overlay 才真正显示。
    if (this.readyState !== 'ready') {
      return;
    }

    const presentation = this.state.cubesPresentation;
    const isCubesHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'cubes'
      && !this.state.hasProject;

    if (presentation?.useSceneLabels) {
      this.cubesGroup.visible = false;
      Object.values(this.cubesLines).forEach((line) => {
        line.visible = false;
      });
      return;
    }

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
    const scale = mobile ? 0.82 : small ? 0.94 : 1.04;
    const stickyFloor = presentation.sticky ? 0.94 : 0.28;
    const baseReveal = smoothStep01(clamp(Math.max(presentation.reveal ?? 0, stickyFloor), 0, 1));
    const runtimeReveal = clamp(Math.max(this.cubesOverlay.revealClock, baseReveal), 0, 1);
    const frameReveal = presentation.sticky ? 1 : baseReveal * rangeProgress(runtimeReveal, 0.0, 0.18);
    const titleReveal = presentation.sticky ? 1 : baseReveal * rangeProgress(runtimeReveal, 0.0, 0.22);
    const metaReveal = presentation.sticky ? 1 : baseReveal * rangeProgress(runtimeReveal, 0.04, 0.28);
    const tempReveal = presentation.sticky ? 1 : baseReveal * rangeProgress(runtimeReveal, 0.08, 0.32);
    const hoverMix = clamp(presentation.hover ?? 0, 0, 1);
    const titleAnchor = ndcToOverlayPoint(presentation.titleAnchor, width, height);
    const dateAnchor = ndcToOverlayPoint(presentation.dateAnchor, width, height);
    const tempAnchor = ndcToOverlayPoint(presentation.tempAnchor, width, height);
    const screenBoxHalfWidth = Math.max((presentation.screenBox?.halfWidth ?? 0.14) * width * 0.5, 72 * scale);
    const screenBoxHalfHeight = Math.max((presentation.screenBox?.halfHeight ?? 0.18) * height * 0.5, 92 * scale);
    const frameAnchors = (presentation.frameAnchors ?? []).map((point) => ndcToOverlayPoint(point, width, height));
    const drift = Math.sin(this.elapsed * 1.9 + (presentation.index ?? 0) * 0.7) * 1.2 * scale;
    const titlePosition = new THREE.Vector2(
      titleAnchor.x - screenBoxHalfWidth - 56 * scale,
      titleAnchor.y + screenBoxHalfHeight * 0.24 + 10 * scale + drift * 0.1
    );
    const datePosition = new THREE.Vector2(
      dateAnchor.x + screenBoxHalfWidth * 0.16 + 18 * scale,
      dateAnchor.y - screenBoxHalfHeight * 0.46 - 4 * scale - drift * 0.04
    );
    const tempPosition = new THREE.Vector2(
      tempAnchor.x + screenBoxHalfWidth * 0.16 + 20 * scale,
      tempAnchor.y + screenBoxHalfHeight * 0.08 + 2 * scale + drift * 0.08
    );
    const titleElbow = new THREE.Vector2(
      titleAnchor.x - screenBoxHalfWidth * 0.18,
      titleAnchor.y + screenBoxHalfHeight * 0.18 + drift * 0.05
    );
    const dateElbow = new THREE.Vector2(
      dateAnchor.x + screenBoxHalfWidth * 0.12,
      dateAnchor.y - screenBoxHalfHeight * 0.18 - drift * 0.03
    );

    clampOverlayTopLeft(
      titlePosition,
      this.textBlocks.cubeTitle.size.width * scale,
      this.textBlocks.cubeTitle.size.height * scale,
      width,
      height
    );
    clampOverlayTopLeft(
      datePosition,
      this.textBlocks.cubeMeta.size.width * scale,
      this.textBlocks.cubeMeta.size.height * scale,
      width,
      height
    );
    clampOverlayTopLeft(
      tempPosition,
      this.textBlocks.cubeTemp.size.width * scale,
      this.textBlocks.cubeTemp.size.height * scale,
      width,
      height
    );

    this.textBlocks.cubeTitle.mesh.scale.set(scale, scale, 1);
    this.textBlocks.cubeMeta.mesh.scale.set(scale, scale, 1);
    this.textBlocks.cubeTemp.mesh.scale.set(scale, scale, 1);

    this.textBlocks.cubeTitle.mesh.position.set(
      titlePosition.x - (1 - titleReveal) * 6 * scale,
      titlePosition.y + (1 - titleReveal) * 6 * scale,
      0
    );
    this.textBlocks.cubeMeta.mesh.position.set(
      datePosition.x + (1 - metaReveal) * 5 * scale,
      datePosition.y - (1 - metaReveal) * 6 * scale,
      0
    );
    this.textBlocks.cubeTemp.mesh.position.set(
      tempPosition.x + (1 - tempReveal) * 4 * scale,
      tempPosition.y + (1 - tempReveal) * 4 * scale,
      0
    );

    this.textBlocks.cubeTitle.setOpacity(clamp(Math.max(titleReveal, presentation.sticky ? 1 : 0.42), 0, 1));
    this.textBlocks.cubeMeta.setOpacity(clamp(Math.max(metaReveal, presentation.sticky ? 0.96 : 0.36), 0, 1));
    this.textBlocks.cubeTemp.setOpacity(clamp(Math.max(tempReveal, presentation.sticky ? 0.88 : 0.3), 0, 1));

    const titlePolyline = [
      titleAnchor,
      titleElbow,
      new THREE.Vector2(titlePosition.x + 40 * scale, titlePosition.y - 14 * scale)
    ];
    const datePolyline = [
      dateAnchor,
      dateElbow,
      new THREE.Vector2(
        datePosition.x - this.textBlocks.cubeMeta.size.width * scale - 16 * scale,
        datePosition.y - 12 * scale
      )
    ];
    const trimmedTitleLine = trimPolyline(titlePolyline, rangeProgress(runtimeReveal, 0.06, 0.42));
    const trimmedDateLine = trimPolyline(datePolyline, rangeProgress(runtimeReveal, 0.22, 0.6));
    const trimmedFrameLine = trimPolyline(frameAnchors, frameReveal);

    if (trimmedFrameLine.length >= 2) {
      setLinePoints(this.cubesLines.frame, trimmedFrameLine);
      this.cubesLines.frame.visible = true;
      this.cubesLines.frame.material.opacity = clamp(Math.max(frameReveal, presentation.sticky ? 0.76 : 0.26), 0, 1);
    } else {
      this.cubesLines.frame.visible = false;
    }

    if (trimmedTitleLine.length >= 2) {
      setLinePoints(this.cubesLines.title, trimmedTitleLine);
      this.cubesLines.title.visible = true;
      this.cubesLines.title.material.opacity = clamp(Math.max(titleReveal, presentation.sticky ? 0.94 : 0.34), 0, 1);
    } else {
      this.cubesLines.title.visible = false;
    }

    if (trimmedDateLine.length >= 2) {
      setLinePoints(this.cubesLines.date, trimmedDateLine);
      this.cubesLines.date.visible = true;
      this.cubesLines.date.material.opacity = clamp(Math.max(metaReveal, presentation.sticky ? 0.9 : 0.3), 0, 1);
    } else {
      this.cubesLines.date.visible = false;
    }
  }

  applyEntryPresentation() {
    if (this.readyState !== 'ready') {
      return;
    }

    const presentation = this.state.entryPresentation;
    const isEntryHome = this.state.routeName === 'home'
      && this.state.activeSectionKey === 'entry'
      && !this.state.hasProject;
    const reveal = isEntryHome ? clamp(presentation?.panelProgress ?? 0, 0, 1) : 0;
    const linksReveal = isEntryHome ? clamp(presentation?.linksProgress ?? 0, 0, 1) : 0;
    const interactionPulse = isEntryHome ? clamp(presentation?.interactionPulse ?? 0, 0, 1) : 0;
    const visible = isEntryHome && Math.max(reveal, linksReveal) > 0.001;

    this.entryGroup.visible = visible;

    if (!visible) {
      this.entryLines.cage.visible = false;
      this.entryLines.arrowLeft.visible = false;
      this.entryLines.arrowRight.visible = false;
      this.entryLines.selectionLeft.visible = false;
      this.entryLines.selectionRight.visible = false;
      this.entryVisitMesh.material.uniforms.uOpacity.value = 0;
      this.entryLeftArrow.visible = false;
      this.entryRightArrow.visible = false;
      this.entryLeftArrow.material.uniforms.uOpacity.value = 0;
      this.entryRightArrow.material.uniforms.uOpacity.value = 0;
      this.textBlocks.entryPrev.setOpacity(0);
      this.textBlocks.entryCurrent.setOpacity(0);
      this.textBlocks.entryNext.setOpacity(0);
      return;
    }

    this.updateEntryOverlayContent();

    const width = this.size.width;
    const height = this.size.height;
    const mobile = width < 760 || height < 680;
    const small = width < 1180 || height < 820;
    const entryDebug = this.entryDebugSettings;
    const entryCenterY = (mobile ? 2 : small ? 8 : 14) * this.uiScale;
    const arrowOffset = (mobile ? 160 : small ? 210 : 260) * this.uiScale;
    const arrowLineLength = (mobile ? 28 : small ? 38 : 48) * this.uiScale;
    const arrowLineInset = (mobile ? 6 : small ? 8 : 10) * this.uiScale;
    const arrowTip = (mobile ? 8 : small ? 9 : 10) * this.uiScale;
    const visitWidth = (mobile ? 150 : small ? 180 : 220) * this.uiScale;
    const visitHeight = visitWidth / 3.125;
    const bottomPositionY =
      -height * 0.5
      + this.layoutState.topMargin
      + (mobile ? 80 : 20) * this.uiScale;
    const labelCenterY = bottomPositionY + entryDebug.labelYOffset * this.uiScale;
    const labelTextY = labelCenterY + entryDebug.labelTextLift * this.uiScale;
    const visitCenterY = labelCenterY + entryDebug.visitYOffset * this.uiScale;
    const labelSpread =
      (mobile ? 74 : small ? 88 : 98)
      * this.uiScale
      * entryDebug.labelSpreadMultiplier;
    const currentScale =
      (mobile ? 0.78 : small ? 0.88 : 0.96)
      * this.uiScale
      * entryDebug.currentScaleMultiplier;
    const sideScale =
      currentScale
      * (mobile ? 0.78 : 0.82)
      * entryDebug.sideScaleMultiplier;
    const boxOpacity = 0.74 + linksReveal * 0.12 + interactionPulse * 0.06;
    const sideOpacity = 0.08 + linksReveal * 0.12;
    const currentOpacity = 0.84 + linksReveal * 0.12 + interactionPulse * 0.04;
    const arrowOpacity = 0.28 + linksReveal * 0.26 + interactionPulse * 0.04;
    const pulse = 1 + Math.sin(this.elapsed * 3.1) * 0.008 + interactionPulse * 0.015;

    this.entryVisitMesh.visible = true;
    this.entryVisitMesh.scale.set(visitWidth * pulse, visitHeight * pulse, 1);
    this.entryVisitMesh.position.set(0, visitCenterY, 0);
    this.entryVisitMesh.material.uniforms.uShow.value = linksReveal;
    this.entryVisitMesh.material.uniforms.uOpacity.value = clamp(
      boxOpacity * entryDebug.visitOpacityMultiplier,
      0,
      1
    );

    this.entryLeftArrow.visible = false;
    this.entryRightArrow.visible = false;
    this.entryLeftArrow.material.uniforms.uOpacity.value = 0;
    this.entryRightArrow.material.uniforms.uOpacity.value = 0;

    this.textBlocks.entryPrev.setColor('#9ba3b1');
    this.textBlocks.entryCurrent.setColor('#ffffff');
    this.textBlocks.entryNext.setColor('#9ba3b1');
    this.textBlocks.entryPrev.setOpacity(clamp(sideOpacity * entryDebug.sideOpacityMultiplier, 0, 1));
    this.textBlocks.entryCurrent.setOpacity(clamp(currentOpacity * entryDebug.currentOpacityMultiplier, 0, 1));
    this.textBlocks.entryNext.setOpacity(clamp(sideOpacity * entryDebug.sideOpacityMultiplier, 0, 1));

    placeTextBlock(this.textBlocks.entryPrev, -labelSpread, labelTextY, sideScale, 'center', 'center');
    placeTextBlock(this.textBlocks.entryCurrent, 0, labelTextY, currentScale, 'center', 'center');
    placeTextBlock(this.textBlocks.entryNext, labelSpread, labelTextY, sideScale, 'center', 'center');

    this.entryLines.cage.visible = false;
    setLinePoints(this.entryLines.arrowLeft, [
      new THREE.Vector2(-arrowOffset - arrowTip, entryCenterY + arrowTip),
      new THREE.Vector2(-arrowOffset, entryCenterY),
      new THREE.Vector2(-arrowOffset - arrowTip, entryCenterY - arrowTip),
      new THREE.Vector2(-arrowOffset, entryCenterY),
      new THREE.Vector2(-arrowOffset + arrowLineLength + arrowLineInset, entryCenterY)
    ]);
    setLinePoints(this.entryLines.arrowRight, [
      new THREE.Vector2(arrowOffset + arrowTip, entryCenterY + arrowTip),
      new THREE.Vector2(arrowOffset, entryCenterY),
      new THREE.Vector2(arrowOffset + arrowTip, entryCenterY - arrowTip),
      new THREE.Vector2(arrowOffset, entryCenterY),
      new THREE.Vector2(arrowOffset - arrowLineLength - arrowLineInset, entryCenterY)
    ]);
    this.entryLines.arrowLeft.visible = true;
    this.entryLines.arrowRight.visible = true;
    this.entryLines.arrowLeft.material.opacity = clamp(
      arrowOpacity * 0.9 * entryDebug.arrowOpacityMultiplier,
      0,
      1
    );
    this.entryLines.arrowRight.material.opacity = clamp(
      arrowOpacity * 0.9 * entryDebug.arrowOpacityMultiplier,
      0,
      1
    );
    this.entryLines.selectionLeft.visible = false;
    this.entryLines.selectionRight.visible = false;
    this.entryLines.selectionLeft.material.opacity = 0;
    this.entryLines.selectionRight.material.opacity = 0;
  }

  layout() {
    // layout 负责把逻辑组件摆放到当前屏幕尺寸下的合理位置。
    // 这里区分了 desktop / small / mobile 三种近似布局档位。
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
    // update 只做“状态写入 + 必要时刷新文本 / 重新布局”。
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
    // applyState 根据当前 route / section / detail 状态真正决定哪些 UI 组可见。
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
    this.applyEntryPresentation();
  }

  animate(delta, elapsed) {
    // animate 是 WebGL HUD 的逐帧动画层，例如 logo 呼吸和 sound pulse。
    this.elapsed = elapsed;
    this.updateCubesOverlayRuntime(delta);

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

    if (this.readyState === 'ready') {
      this.updateCubesOverlayContent();
      this.applyCubesPresentation();
      this.applyEntryPresentation();
    }
  }

  dispose() {
    // WebGL HUD 自己创建了多套 geometry / material / text block，需要显式释放。
    this.logoMesh.geometry.dispose();
    this.logoMesh.material.dispose();
    this.soundIcon.geometry.dispose();
    this.soundIcon.material.dispose();
    Object.values(this.cubesLines).forEach((line) => {
      line.geometry.dispose();
      line.material.dispose();
    });
    Object.values(this.entryLines).forEach((line) => {
      line.geometry.dispose();
      line.material.dispose();
    });
    this.entryVisitMesh.geometry.dispose();
    this.entryVisitMesh.material.dispose();
    this.entryLeftArrow.geometry.dispose();
    this.entryLeftArrow.material.dispose();
    this.entryRightArrow.geometry.dispose();
    this.entryRightArrow.material.dispose();
    Object.values(this.textBlocks).forEach((block) => block.dispose());
  }
}

function heightFromTop(viewHeight, topMargin, halfHeight) {
  return viewHeight * 0.5 - topMargin - halfHeight;
}
