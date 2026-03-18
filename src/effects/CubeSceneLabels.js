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

function createOverlayLine() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
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

function createDebugPoint(color = '#ff00ff') {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  mesh.visible = false;
  mesh.renderOrder = 1200;
  mesh.frustumCulled = false;
  return mesh;
}

function createDebugBackplate(color = '#ff00ff') {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  mesh.visible = false;
  mesh.renderOrder = 1090;
  mesh.frustumCulled = false;
  return mesh;
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
    this.titleLineProgress = 0;
    this.titleTextProgress = 0;
    this.metaLineProgress = 0;
    this.metaTextProgress = 0;
    this.tempTextProgress = 0;
    this.tempKey = '';
    this.tempAnchor = new THREE.Vector3();
    this.titleAnchor = new THREE.Vector3();
    this.titleElbow = new THREE.Vector3();
    this.titleLabel = new THREE.Vector3();
    this.metaAnchor = new THREE.Vector3();
    this.metaLabel = new THREE.Vector3();
    this.tempLabel = new THREE.Vector3();
    this.localBoundsAnchor = new THREE.Vector3();
    this.titleClip = new THREE.Vector3();
    this.metaClip = new THREE.Vector3();
    this.tempClip = new THREE.Vector3();
    this.lastDebugLogAt = -Infinity;

    this.titleText = new CanvasTextBlock({
      text: formatCubesTitle(project),
      maxWidth: 320,
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
      maxWidth: 260,
      fontSize: 22,
      lineHeight: 0.95,
      align: 'right',
      color: '#ffffff',
      paddingX: 10,
      paddingY: 8
    });
    this.metaText.mesh.renderOrder = 1100;
    this.tempText = new CanvasTextBlock({
      text: formatCubeTemperature(project?.temp ?? 0, 0, index),
      maxWidth: 220,
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
    this.debugBackplates = {
      title: createDebugBackplate('#ff4d6d'),
      meta: createDebugBackplate('#00bbf9'),
      temp: createDebugBackplate('#b388ff')
    };
    this.debugPoints = {
      titleAnchor: createDebugPoint('#ff4d6d'),
      titleLabel: createDebugPoint('#ffd166'),
      metaAnchor: createDebugPoint('#00bbf9'),
      metaLabel: createDebugPoint('#9bffb0'),
      tempAnchor: createDebugPoint('#b388ff'),
      tempLabel: createDebugPoint('#ffffff')
    };

    [
      this.titleText.mesh,
      this.metaText.mesh,
      this.tempText.mesh,
      this.titleLine,
      this.metaLine,
      ...Object.values(this.debugBackplates),
      ...Object.values(this.debugPoints)
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
    camera = null,
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

    const forceShow = Boolean(this.debugSettings.forceShow);
    const showAnchors = Boolean(this.debugSettings.showAnchors);
    const scaleMultiplier = this.debugSettings.textScaleMultiplier ?? 1;
    const opacityFloor = clamp01(this.debugSettings.opacityFloor ?? 0);
    const debugFloor = forceShow ? Math.max(opacityFloor, 0.72) : opacityFloor;
    const presenceMix = forceShow ? 1 : clamp01(presence);
    const titleWindow = forceShow || (
      presenceMix > 0.02
      && (1 - Math.abs(fit(scrollDistance, -1.6, 0.5, -1, 1))) > 0
    );
    const metaWindow = forceShow || (
      presenceMix > 0.02
      && (1 - Math.abs(fit(scrollDistance, -0.6, 1.25, -1, 1))) > 0
    );
    const tempWindow = forceShow || (
      presenceMix > 0.02
      && (1 - Math.abs(fit(scrollDistance, -1.2, 0.5, -1, 1))) > 0
    );

    this.titleLineProgress = approach(this.titleLineProgress, titleWindow ? 1 : 0, delta, 0.2);
    this.titleTextProgress = approach(this.titleTextProgress, titleWindow ? 1 : 0, delta, 0.4);
    this.metaLineProgress = approach(this.metaLineProgress, metaWindow ? 1 : 0, delta, 0.2);
    this.metaTextProgress = approach(this.metaTextProgress, metaWindow ? 1 : 0, delta, 0.4);
    this.tempTextProgress = approach(this.tempTextProgress, tempWindow ? 1 : 0, delta, 0.4);

    const tempText = formatCubeTemperature(this.project?.temp ?? 0, time, this.index);
    if (tempText !== this.tempKey) {
      this.tempKey = tempText;
      this.tempText.setText(tempText);
    }

    const textScale = Math.min(0.0064, 0.0046 * (1300 / Math.max(viewportHeight, 1))) * scaleMultiplier;

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
    this.debugPoints.titleAnchor.position.copy(this.titleAnchor);
    this.debugPoints.titleLabel.position.copy(this.titleLabel);
    this.debugPoints.metaAnchor.position.copy(this.metaAnchor);
    this.debugPoints.metaLabel.position.copy(this.metaLabel);
    this.debugPoints.tempAnchor.position.copy(this.tempAnchor);
    this.debugPoints.tempLabel.position.copy(this.tempLabel);
    Object.values(this.debugPoints).forEach((point) => {
      point.visible = showAnchors;
    });

    const titlePoints = trimPolyline(
      [this.titleAnchor, this.titleElbow, this.titleLabel],
      this.titleLineProgress
    );
    const metaPoints = trimPolyline(
      [this.metaAnchor, this.metaLabel],
      this.metaLineProgress
    );

    if (titlePoints.length >= 2 && this.titleLineProgress > 0.01) {
      setLinePoints(this.titleLine, titlePoints);
      this.titleLine.visible = true;
      this.titleLine.material.opacity = Math.max(this.titleLineProgress * presenceMix, titleWindow ? debugFloor : 0);
    } else {
      this.titleLine.visible = false;
    }

    if (metaPoints.length >= 2 && this.metaLineProgress > 0.01) {
      setLinePoints(this.metaLine, metaPoints);
      this.metaLine.visible = true;
      this.metaLine.material.opacity = Math.max(this.metaLineProgress * presenceMix, metaWindow ? debugFloor : 0);
    } else {
      this.metaLine.visible = false;
    }

    this.titleText.mesh.position.copy(this.titleLabel)
      .addScaledVector(cameraUp, this.titleText.size.height * textScale * 0.5 + 0.05);
    this.metaText.mesh.position.copy(this.metaLabel)
      .addScaledVector(cameraRight, -this.metaText.size.width * textScale)
      .addScaledVector(cameraUp, this.metaText.size.height * textScale * 0.5 + 0.05);
    this.tempText.mesh.position.copy(this.tempLabel)
      .addScaledVector(cameraUp, this.tempText.size.height * textScale * 0.5 + 0.02);

    const showBackplates = forceShow || showAnchors;
    const titlePlateWidth = Math.max(this.titleText.size.width * textScale, 0.18);
    const titlePlateHeight = Math.max(this.titleText.size.height * textScale, 0.08);
    const metaPlateWidth = Math.max(this.metaText.size.width * textScale, 0.18);
    const metaPlateHeight = Math.max(this.metaText.size.height * textScale, 0.08);
    const tempPlateWidth = Math.max(this.tempText.size.width * textScale, 0.16);
    const tempPlateHeight = Math.max(this.tempText.size.height * textScale, 0.08);

    this.debugBackplates.title.position.copy(this.titleText.mesh.position)
      .addScaledVector(cameraRight, titlePlateWidth * 0.5)
      .addScaledVector(cameraUp, -titlePlateHeight * 0.5);
    this.debugBackplates.title.quaternion.copy(cameraQuaternion);
    this.debugBackplates.title.scale.set(titlePlateWidth, titlePlateHeight, 1);

    this.debugBackplates.meta.position.copy(this.metaText.mesh.position)
      .addScaledVector(cameraRight, metaPlateWidth * 0.5)
      .addScaledVector(cameraUp, -metaPlateHeight * 0.5);
    this.debugBackplates.meta.quaternion.copy(cameraQuaternion);
    this.debugBackplates.meta.scale.set(metaPlateWidth, metaPlateHeight, 1);

    this.debugBackplates.temp.position.copy(this.tempText.mesh.position)
      .addScaledVector(cameraRight, tempPlateWidth * 0.5)
      .addScaledVector(cameraUp, -tempPlateHeight * 0.5);
    this.debugBackplates.temp.quaternion.copy(cameraQuaternion);
    this.debugBackplates.temp.scale.set(tempPlateWidth, tempPlateHeight, 1);
    Object.values(this.debugBackplates).forEach((backplate) => {
      backplate.visible = showBackplates;
    });

    this.setOpacity(
      Math.max(this.titleTextProgress * presenceMix, titleWindow ? debugFloor : 0),
      Math.max(this.metaTextProgress * presenceMix, metaWindow ? debugFloor : 0),
      Math.max(this.tempTextProgress * presenceMix, tempWindow ? debugFloor : 0)
    );

    if ((forceShow || showAnchors) && camera && this.index === 0 && time - this.lastDebugLogAt >= 1) {
      this.lastDebugLogAt = time;
      this.titleClip.copy(this.titleText.mesh.position).project(camera);
      this.metaClip.copy(this.metaText.mesh.position).project(camera);
      this.tempClip.copy(this.tempText.mesh.position).project(camera);
      console.info('[CubeSceneLabels]', {
        index: this.index,
        project: this.project?.hash ?? this.project?.title ?? 'unknown',
        scrollDistance: Number(scrollDistance.toFixed(3)),
        presence: Number(presenceMix.toFixed(3)),
        titleWindow,
        metaWindow,
        tempWindow,
        titleOpacity: Number(clamp01(Math.max(this.titleTextProgress * presenceMix, titleWindow ? debugFloor : 0)).toFixed(3)),
        metaOpacity: Number(clamp01(Math.max(this.metaTextProgress * presenceMix, metaWindow ? debugFloor : 0)).toFixed(3)),
        tempOpacity: Number(clamp01(Math.max(this.tempTextProgress * presenceMix, tempWindow ? debugFloor : 0)).toFixed(3)),
        titleVisible: this.titleText.mesh.visible,
        metaVisible: this.metaText.mesh.visible,
        tempVisible: this.tempText.mesh.visible,
        titleClip: {
          x: Number(this.titleClip.x.toFixed(3)),
          y: Number(this.titleClip.y.toFixed(3)),
          z: Number(this.titleClip.z.toFixed(3))
        },
        metaClip: {
          x: Number(this.metaClip.x.toFixed(3)),
          y: Number(this.metaClip.y.toFixed(3)),
          z: Number(this.metaClip.z.toFixed(3))
        },
        tempClip: {
          x: Number(this.tempClip.x.toFixed(3)),
          y: Number(this.tempClip.y.toFixed(3)),
          z: Number(this.tempClip.z.toFixed(3))
        }
      });
    }
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
      Object.values(this.debugBackplates).forEach((backplate) => {
        backplate.visible = false;
      });
      Object.values(this.debugPoints).forEach((point) => {
        point.visible = false;
      });
      this.setOpacity(0, 0, 0);
    }
  }

  dispose() {
    [
      this.titleText.mesh,
      this.metaText.mesh,
      this.tempText.mesh,
      this.titleLine,
      this.metaLine,
      ...Object.values(this.debugBackplates),
      ...Object.values(this.debugPoints)
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
    Object.values(this.debugBackplates).forEach((backplate) => {
      backplate.geometry.dispose();
      backplate.material.dispose();
    });
    Object.values(this.debugPoints).forEach((point) => {
      point.geometry.dispose();
      point.material.dispose();
    });
  }
}
