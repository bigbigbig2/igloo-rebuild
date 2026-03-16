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
