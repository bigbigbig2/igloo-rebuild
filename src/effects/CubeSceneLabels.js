import * as THREE from 'three';
import { CanvasTextBlock } from '../ui/msdf.js';

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function fit(value, fromMin, fromMax, toMin, toMax) {
  if (Math.abs(fromMax - fromMin) <= 1e-6) {
    return value >= fromMax ? toMax : toMin;
  }

  const normalized = (value - fromMin) / (fromMax - fromMin);
  return toMin + (toMax - toMin) * normalized;
}

function mix(a, b, alpha) {
  return THREE.MathUtils.lerp(a, b, alpha);
}

function approach(current, target, delta, duration) {
  if (duration <= 1e-6) {
    return target;
  }

  const step = delta / duration;
  if (target > current) {
    return Math.min(current + step, target);
  }

  return Math.max(current - step, target);
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

  let remaining = totalLength * clamp01(progress);
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

    if (remaining > 0) {
      trimmed.push(pointA.clone().lerp(pointB, remaining / segmentLength));
    }
    break;
  }

  return trimmed;
}

function setLinePoints(line, points = []) {
  const requiredFloats = points.length * 3;
  let attribute = line.geometry.getAttribute('position');

  if (!attribute || attribute.array.length < requiredFloats) {
    attribute = new THREE.Float32BufferAttribute(new Float32Array(requiredFloats), 3);
    line.geometry.setAttribute('position', attribute);
  }

  const values = attribute.array;
  let cursor = 0;

  points.forEach((point) => {
    values[cursor++] = point.x;
    values[cursor++] = point.y;
    values[cursor++] = point.z;
  });

  attribute.needsUpdate = true;
  line.geometry.setDrawRange(0, points.length);
}

function createOverlayLine() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 999;
  return line;
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

export class CubeSceneLabels {
  constructor({
    parent,
    cube,
    project,
    clickLabel = 'Click to explore',
    index = 0,
    debugSettings = null
  }) {
    this.parent = parent;
    this.cube = cube;
    this.project = project;
    this.clickLabel = clickLabel;
    this.index = index;
    this.debugSettings = debugSettings ?? {};
    this.visible = true;
    this.isHiding = false;

    this.titleLineProgress = 0;
    this.metaLineProgress = 0;
    this.titleTextProgress = 0;
    this.metaTextProgress = 0;
    this.tempTextProgress = 0;
    this.tempKey = '';

    this.titleAnchor = new THREE.Vector3();
    this.titleElbow = new THREE.Vector3();
    this.titleLabel = new THREE.Vector3();
    this.metaAnchor = new THREE.Vector3();
    this.metaLabel = new THREE.Vector3();
    this.tempAnchor = new THREE.Vector3();
    this.tempLabel = new THREE.Vector3();
    this.localBoundsAnchor = new THREE.Vector3();

    this.titleText = new CanvasTextBlock({
      text: formatCubesTitle(project),
      maxWidth: 340,
      fontSize: 26,
      lineHeight: 0.95,
      align: 'left',
      color: '#ffffff',
      paddingX: 10,
      paddingY: 8
    });
    this.titleText.mesh.renderOrder = 1100;

    this.metaText = new CanvasTextBlock({
      text: formatCubesMeta(project, clickLabel),
      maxWidth: 280,
      fontSize: 23,
      lineHeight: 0.95,
      align: 'right',
      color: '#ffffff',
      paddingX: 10,
      paddingY: 8
    });
    this.metaText.mesh.renderOrder = 1100;

    this.tempText = new CanvasTextBlock({
      text: formatCubeTemperature(project?.temp ?? 0, 0, index),
      maxWidth: 230,
      fontSize: 22,
      lineHeight: 0.95,
      align: 'left',
      color: '#ffffff',
      paddingX: 10,
      paddingY: 8
    });
    this.tempText.mesh.renderOrder = 1100;

    this.titleLine = createOverlayLine();
    this.metaLine = createOverlayLine();

    [
      this.titleText.mesh,
      this.metaText.mesh,
      this.tempText.mesh,
      this.titleLine,
      this.metaLine
    ].forEach((object) => {
      object.visible = false;
      this.parent.add(object);
    });
  }

  update({
    delta = 1 / 60,
    time = 0,
    scrollDistance = 0,
    presence = 1,
    cameraQuaternion,
    cameraRight,
    cameraUp,
    viewportHeight = 1080
  }) {
    const bounds = this.cube.geometry.boundingBox;
    if (!bounds || !this.visible) {
      this.titleLine.visible = false;
      this.metaLine.visible = false;
      this.setOpacity(0, 0, 0);
      return;
    }

    const titleWindow = 1 - Math.abs(fit(scrollDistance, -1.6, 0.5, -1, 1));
    const metaWindow = 1 - Math.abs(fit(scrollDistance, -0.6, 1.25, -1, 1));
    const tempWindow = 1 - Math.abs(fit(scrollDistance, -1.2, 0.5, -1, 1));
    const visibility = clamp01(presence);

    this.titleLineProgress = approach(this.titleLineProgress, titleWindow > 0 ? 1 : 0, delta, 0.2);
    this.metaLineProgress = approach(this.metaLineProgress, metaWindow > 0 ? 1 : 0, delta, 0.2);
    this.titleTextProgress = approach(this.titleTextProgress, titleWindow > 0 ? 1 : 0, delta, 0.4);
    this.metaTextProgress = approach(this.metaTextProgress, metaWindow > 0 ? 1 : 0, delta, 0.4);
    this.tempTextProgress = approach(this.tempTextProgress, tempWindow > 0 ? 1 : 0, delta, 0.4);

    const tempText = formatCubeTemperature(this.project?.temp ?? 0, time, this.index);
    if (tempText !== this.tempKey) {
      this.tempKey = tempText;
      this.tempText.setText(tempText);
    }

    const scaleMultiplier = this.debugSettings.textScaleMultiplier ?? 0.5;
    const textScale = Math.min(0.8, 0.5 / (Math.max(viewportHeight, 1) / 1300)) * 0.01 * scaleMultiplier;

    this.titleText.mesh.quaternion.copy(cameraQuaternion);
    this.metaText.mesh.quaternion.copy(cameraQuaternion);
    this.tempText.mesh.quaternion.copy(cameraQuaternion);

    this.titleText.mesh.scale.setScalar(textScale);
    this.metaText.mesh.scale.setScalar(textScale);
    this.tempText.mesh.scale.setScalar(textScale);

    this.localBoundsAnchor.set(
      mix(bounds.min.x, bounds.max.x, 0.35),
      mix(bounds.max.y, bounds.min.y, 0.15),
      mix(bounds.min.z, bounds.max.z, 0.93)
    );
    this.titleAnchor.copy(this.localBoundsAnchor).applyMatrix4(this.cube.matrixWorld);
    this.titleElbow.copy(this.titleAnchor)
      .addScaledVector(cameraRight, -0.3)
      .addScaledVector(cameraUp, 0.3);
    this.titleLabel.copy(this.titleElbow).addScaledVector(cameraRight, -0.5);

    this.localBoundsAnchor.set(
      mix(bounds.min.x, bounds.max.x, 0.7),
      mix(bounds.max.y, bounds.min.y, 0.75),
      mix(bounds.min.z, bounds.max.z, 0.95)
    );
    this.metaAnchor.copy(this.localBoundsAnchor).applyMatrix4(this.cube.matrixWorld);
    this.metaLabel.copy(this.metaAnchor).addScaledVector(cameraRight, 0.7);

    this.localBoundsAnchor.set(
      mix(bounds.min.x, bounds.max.x, 0.7),
      mix(bounds.max.y, bounds.min.y, 0.15),
      mix(bounds.min.z, bounds.max.z, 0.93)
    );
    this.tempAnchor.copy(this.localBoundsAnchor).applyMatrix4(this.cube.matrixWorld);
    this.tempLabel.copy(this.tempAnchor).addScaledVector(cameraRight, 0.3);

    const titlePoints = trimPolyline(
      [this.titleAnchor, this.titleElbow, this.titleLabel],
      this.titleLineProgress
    );
    const metaPoints = trimPolyline(
      [this.metaAnchor, this.metaLabel],
      this.metaLineProgress
    );

    if (titlePoints.length >= 2 && this.titleLineProgress > 0.01 && visibility > 0.01) {
      setLinePoints(this.titleLine, titlePoints);
      this.titleLine.visible = true;
      this.titleLine.material.opacity = this.titleLineProgress * visibility;
    } else {
      this.titleLine.visible = false;
    }

    if (metaPoints.length >= 2 && this.metaLineProgress > 0.01 && visibility > 0.01) {
      setLinePoints(this.metaLine, metaPoints);
      this.metaLine.visible = true;
      this.metaLine.material.opacity = this.metaLineProgress * visibility;
    } else {
      this.metaLine.visible = false;
    }

    this.titleText.mesh.position.copy(this.titleLabel)
      .addScaledVector(cameraUp, this.titleText.size.height * textScale * 0.5 + 0.05);
    this.metaText.mesh.position.copy(this.metaLabel)
      .addScaledVector(cameraUp, this.metaText.size.height * textScale * 0.5 + 0.05);
    this.tempText.mesh.position.copy(this.tempLabel);

    this.setOpacity(
      this.titleTextProgress * visibility,
      this.metaTextProgress * visibility,
      this.tempTextProgress * visibility
    );
  }

  setOpacity(titleOpacity, metaOpacity, tempOpacity) {
    this.titleText.mesh.visible = titleOpacity > 0.01 && this.visible;
    this.metaText.mesh.visible = metaOpacity > 0.01 && this.visible;
    this.tempText.mesh.visible = tempOpacity > 0.01 && this.visible;
    this.titleText.setOpacity(clamp01(titleOpacity));
    this.metaText.setOpacity(clamp01(metaOpacity));
    this.tempText.setOpacity(clamp01(tempOpacity));
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (!this.visible) {
      this.titleLine.visible = false;
      this.metaLine.visible = false;
      this.setOpacity(0, 0, 0);
    }
  }

  dispose() {
    [
      this.titleText.mesh,
      this.metaText.mesh,
      this.tempText.mesh,
      this.titleLine,
      this.metaLine
    ].forEach((object) => {
      this.parent.remove(object);
    });

    this.titleText.dispose();
    this.metaText.dispose();
    this.tempText.dispose();
    this.titleLine.geometry.dispose();
    this.titleLine.material.dispose();
    this.metaLine.geometry.dispose();
    this.metaLine.material.dispose();
  }
}
