import * as THREE from 'three';
import { prepareGeometry } from '../../utils/geometry.js';

export function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }

  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function easeOut(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 2);
}

export function easeIn(value) {
  const t = clamp01(value);
  return t * t;
}

export function easeInOut(value) {
  const t = clamp01(value);
  return t <= 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
}

export function rawGeometry(source, options = {}) {
  return prepareGeometry(source, {
    center: false,
    scaleToSize: false,
    recomputeNormals: options.recomputeNormals ?? false
  });
}

export function ensureRandAttribute(geometry) {
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

function hashFloat(value) {
  return Math.abs((Math.sin(value * 12.9898) * 43758.5453) % 1);
}

function unionRoots(parents, a, b) {
  let rootA = a;
  while (parents[rootA] !== rootA) {
    rootA = parents[rootA];
  }

  let rootB = b;
  while (parents[rootB] !== rootB) {
    rootB = parents[rootB];
  }

  if (rootA !== rootB) {
    parents[rootB] = rootA;
  }
}

function findRoot(parents, index) {
  let root = index;

  while (parents[root] !== root) {
    root = parents[root];
  }

  while (parents[index] !== index) {
    const parent = parents[index];
    parents[index] = root;
    index = parent;
  }

  return root;
}

export function ensureEntryRingAttributes(geometry) {
  if (!geometry) {
    return geometry;
  }

  const target = (!geometry.getAttribute('centr') || !geometry.getAttribute('rand'))
    ? geometry.clone()
    : geometry;

  if (target.getAttribute('centr') && target.getAttribute('rand')) {
    return target;
  }

  const position = target.getAttribute('position');
  if (!position) {
    return target;
  }

  const vertexCount = position.count;
  const parents = new Int32Array(vertexCount);
  const coincidentVertices = new Map();
  const centrValues = new Float32Array(position.count * 3);
  const randValues = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();

  for (let index = 0; index < vertexCount; index += 1) {
    parents[index] = index;
    vertex.fromBufferAttribute(position, index);
    const key = [
      Math.round(vertex.x * 10000),
      Math.round(vertex.y * 10000),
      Math.round(vertex.z * 10000)
    ].join(':');
    const existing = coincidentVertices.get(key);

    if (existing != null) {
      unionRoots(parents, index, existing);
    } else {
      coincidentVertices.set(key, index);
    }
  }

  if (target.index) {
    const index = target.index;
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const a = index.getX(triangle);
      const b = index.getX(triangle + 1);
      const c = index.getX(triangle + 2);
      unionRoots(parents, a, b);
      unionRoots(parents, b, c);
      unionRoots(parents, c, a);
    }
  } else {
    const triangleCount = Math.floor(vertexCount / 3);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = triangle * 3;
      const b = a + 1;
      const c = a + 2;
      unionRoots(parents, a, b);
      unionRoots(parents, b, c);
      unionRoots(parents, c, a);
    }
  }

  const componentCentroids = new Map();
  const componentCounts = new Map();

  for (let index = 0; index < vertexCount; index += 1) {
    const root = findRoot(parents, index);
    const centroid = componentCentroids.get(root) ?? new THREE.Vector3();
    vertex.fromBufferAttribute(position, index);
    centroid.add(vertex);
    componentCentroids.set(root, centroid);
    componentCounts.set(root, (componentCounts.get(root) ?? 0) + 1);
  }

  componentCentroids.forEach((centroid, root) => {
    const count = componentCounts.get(root) ?? 1;
    centroid.multiplyScalar(1 / count);
  });

  for (let index = 0; index < vertexCount; index += 1) {
    const root = findRoot(parents, index);
    const centroid = componentCentroids.get(root) ?? new THREE.Vector3();
    const stride = index * 3;
    const randX = hashFloat(root + 1.13);
    const randY = hashFloat(root + 4.71);
    const randZ = hashFloat(root + 7.29);
    centrValues[stride] = centroid.x;
    centrValues[stride + 1] = centroid.y;
    centrValues[stride + 2] = centroid.z;
    randValues[stride] = randX;
    randValues[stride + 1] = randY;
    randValues[stride + 2] = randZ;
  }

  target.setAttribute('centr', new THREE.Float32BufferAttribute(centrValues, 3));
  target.setAttribute('rand', new THREE.Float32BufferAttribute(randValues, 3));
  return target;
}

export function ensureEntryFloorAttributes(geometry) {
  if (!geometry) {
    return geometry;
  }

  if (
    geometry.getAttribute('animationmask')
    && geometry.getAttribute('iteration')
    && geometry.getAttribute('glow')
  ) {
    return geometry;
  }

  const target = geometry.clone();
  const position = target.getAttribute('position');
  if (!position) {
    return target;
  }

  const animationMask = new Float32Array(position.count);
  const iteration = new Float32Array(position.count);
  const glow = new Float32Array(position.count);
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radial = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
    animationMask[index] = clamp01(1 - radial / 1.95);
    iteration[index] = hashFloat(index * 0.73 + vertex.x * 2.1 + vertex.z * 1.7) * Math.PI * 2;
    glow[index] = clamp01((0.08 - vertex.y) * 12);
  }

  target.setAttribute('animationmask', new THREE.Float32BufferAttribute(animationMask, 1));
  target.setAttribute('iteration', new THREE.Float32BufferAttribute(iteration, 1));
  target.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
  return target;
}
