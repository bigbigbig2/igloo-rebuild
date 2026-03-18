import * as THREE from 'three';

const MSDF_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MSDF_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tMap;
  uniform vec3 uColor;
  uniform float uOpacity;

  float median(vec3 sampleValue) {
    return max(min(sampleValue.r, sampleValue.g), min(max(sampleValue.r, sampleValue.g), sampleValue.b));
  }

  float msdf(sampler2D textureMap, vec2 sampleUv) {
    float signedDistance = median(texture2D(textureMap, sampleUv).rgb) - 0.5;
    float smoothing = max(fwidth(signedDistance), 1e-4);
    return smoothstep(-smoothing, smoothing, signedDistance);
  }

  void main() {
    float alpha = msdf(tMap, vUv) * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function getGlyphMap(fontData) {
  if (fontData.__glyphMap) {
    return fontData.__glyphMap;
  }

  const glyphMap = new Map();
  (fontData.glyphs ?? []).forEach((glyph) => {
    glyphMap.set(glyph.unicode, glyph);
  });

  fontData.__glyphMap = glyphMap;
  return glyphMap;
}

function getGlyph(fontData, character) {
  return getGlyphMap(fontData).get(character.codePointAt(0)) ?? null;
}

function measureLine(fontData, line, fontSize) {
  let width = 0;

  for (const character of line) {
    const glyph = getGlyph(fontData, character);
    width += (glyph?.advance ?? 0.6) * fontSize;
  }

  return width;
}

function wrapText(fontData, text, maxWidth, fontSize) {
  const lines = [];
  const paragraphs = `${text ?? ''}`.split('\n');

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push('');
      return;
    }

    let currentLine = words.shift();

    words.forEach((word) => {
      const nextLine = `${currentLine} ${word}`;
      if (measureLine(fontData, nextLine, fontSize) > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    });

    lines.push(currentLine);
  });

  return lines;
}

function buildTextGeometry(fontData, text, {
  maxWidth = Infinity,
  fontSize = 16,
  lineHeight = 1.3,
  align = 'left'
} = {}) {
  const atlasWidth = fontData.atlas.width;
  const atlasHeight = fontData.atlas.height;
  const metrics = fontData.metrics;
  const lines = wrapText(fontData, text, maxWidth, fontSize);
  const positions = [];
  const uvs = [];
  const indices = [];
  let cursorIndex = 0;
  let maxLineWidth = 0;

  lines.forEach((line, lineIndex) => {
    const lineWidth = measureLine(fontData, line, fontSize);
    const offsetX = align === 'right' ? -lineWidth : 0;
    let cursorX = offsetX;
    const baselineY = -lineIndex * fontSize * lineHeight - metrics.ascender * fontSize;
    maxLineWidth = Math.max(maxLineWidth, lineWidth);

    for (const character of line) {
      const glyph = getGlyph(fontData, character);
      const advance = (glyph?.advance ?? 0.6) * fontSize;

      if (!glyph?.planeBounds || !glyph?.atlasBounds) {
        cursorX += advance;
        continue;
      }

      const { planeBounds, atlasBounds } = glyph;
      const x0 = cursorX + planeBounds.left * fontSize;
      const x1 = cursorX + planeBounds.right * fontSize;
      const y0 = baselineY + planeBounds.bottom * fontSize;
      const y1 = baselineY + planeBounds.top * fontSize;

      const u0 = atlasBounds.left / atlasWidth;
      const u1 = atlasBounds.right / atlasWidth;
      const v0 = atlasBounds.bottom / atlasHeight;
      const v1 = atlasBounds.top / atlasHeight;

      positions.push(
        x0, y1, 0,
        x1, y1, 0,
        x1, y0, 0,
        x0, y0, 0
      );
      uvs.push(
        u0, v1,
        u1, v1,
        u1, v0,
        u0, v0
      );
      indices.push(
        cursorIndex, cursorIndex + 1, cursorIndex + 2,
        cursorIndex, cursorIndex + 2, cursorIndex + 3
      );

      cursorIndex += 4;
      cursorX += advance;
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const blockHeight = lines.length === 0
    ? 0
    : (lines.length - 1) * fontSize * lineHeight + (metrics.ascender - metrics.descender) * fontSize;

  return {
    geometry,
    width: maxLineWidth,
    height: blockHeight
  };
}

export async function loadFontMetrics(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font metrics from ${url}`);
  }

  return response.json();
}

function wrapCanvasText(context, text, maxWidth) {
  const paragraphs = `${text ?? ''}`.split('\n');
  const lines = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (!Number.isFinite(maxWidth) || words.length <= 1) {
      lines.push(words.length > 0 ? words.join(' ') : paragraph);
      return;
    }

    let currentLine = words.shift();

    words.forEach((word) => {
      const nextLine = `${currentLine} ${word}`;
      if (context.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    });

    lines.push(currentLine);
  });

  return lines.length > 0 ? lines : [''];
}

function buildCanvasTextGeometry(width, height) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0,
      width, 0, 0,
      width, -height, 0,
      0, -height, 0
    ], 3)
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([
      0, 1,
      1, 1,
      1, 0,
      0, 0
    ], 2)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

export class MsdfTextBlock {
  constructor({
    fontData,
    atlasTexture,
    text = '',
    maxWidth = Infinity,
    fontSize = 16,
    lineHeight = 1.3,
    align = 'left',
    color = '#ffffff'
  }) {
    this.fontData = fontData;
    this.atlasTexture = atlasTexture;
    this.options = {
      maxWidth,
      fontSize,
      lineHeight,
      align
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: atlasTexture },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 }
      },
      vertexShader: MSDF_VERTEX_SHADER,
      fragmentShader: MSDF_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.size = { width: 0, height: 0 };
    this.setText(text);
  }

  setText(text) {
    this.text = text;
    const previousGeometry = this.mesh.geometry;
    const { geometry, width, height } = buildTextGeometry(this.fontData, text, this.options);
    this.mesh.geometry = geometry;
    this.size.width = width;
    this.size.height = height;
    previousGeometry?.dispose?.();
  }

  setColor(color) {
    this.material.uniforms.uColor.value.set(color);
  }

  setOpacity(opacity) {
    this.material.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export class CanvasTextBlock {
  constructor({
    text = '',
    maxWidth = Infinity,
    fontSize = 16,
    lineHeight = 1.3,
    align = 'left',
    color = '#ffffff',
    fontFamily = '"IBM Plex Mono", monospace',
    paddingX = null,
    paddingY = null
  } = {}) {
    this.options = {
      maxWidth,
      fontSize,
      lineHeight,
      align,
      fontFamily,
      paddingX,
      paddingY
    };
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { alpha: true });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.size = { width: 0, height: 0 };
    this.setText(text);
  }

  setText(text) {
    this.text = `${text ?? ''}`;

    const {
      maxWidth,
      fontSize,
      lineHeight,
      align,
      fontFamily
    } = this.options;

    const context = this.context;
    const pixelRatio = Math.max(window.devicePixelRatio ?? 1, 1);
    const paddingX = this.options.paddingX ?? Math.ceil(fontSize * 0.45);
    const paddingY = this.options.paddingY ?? Math.ceil(fontSize * 0.35);

    context.font = `${fontSize}px ${fontFamily}`;
    context.textBaseline = 'top';

    const lines = wrapCanvasText(context, this.text, maxWidth);
    const lineWidths = lines.map((line) => context.measureText(line).width);
    const textWidth = lineWidths.reduce((max, width) => Math.max(max, width), 0);
    const lineStep = fontSize * lineHeight;
    const textHeight = lines.length > 0
      ? fontSize + (lines.length - 1) * lineStep
      : 0;
    const blockWidth = Math.max(Math.ceil(textWidth + paddingX * 2), 1);
    const blockHeight = Math.max(Math.ceil(textHeight + paddingY * 2), 1);

    this.canvas.width = Math.max(1, Math.ceil(blockWidth * pixelRatio));
    this.canvas.height = Math.max(1, Math.ceil(blockHeight * pixelRatio));

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, blockWidth, blockHeight);
    context.font = `${fontSize}px ${fontFamily}`;
    context.textBaseline = 'top';
    context.textAlign = align === 'right' ? 'right' : 'left';
    context.fillStyle = '#ffffff';

    lines.forEach((line, index) => {
      const x = align === 'right'
        ? blockWidth - paddingX
        : paddingX;
      const y = paddingY + index * lineStep;
      context.fillText(line, x, y);
    });

    this.texture.needsUpdate = true;

    const previousGeometry = this.mesh.geometry;
    this.mesh.geometry = buildCanvasTextGeometry(blockWidth, blockHeight);
    previousGeometry?.dispose?.();
    this.size.width = blockWidth;
    this.size.height = blockHeight;
  }

  setColor(color) {
    this.material.color.set(color);
  }

  setOpacity(opacity) {
    this.material.opacity = opacity;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.texture.dispose();
    this.material.dispose();
  }
}
