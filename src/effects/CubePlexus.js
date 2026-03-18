import * as THREE from 'three';

const POINT_VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;

  varying float vAlpha;

  uniform float uOpacity;
  uniform float uPointSize;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vAlpha = aAlpha * uOpacity;
    gl_PointSize = uPointSize / max(-mvPosition.z, 0.1);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;

  uniform vec3 uColor;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float dist = length(centered);
    float alpha = smoothstep(0.5, 0.12, dist) * vAlpha;

    if (alpha <= 0.001) {
      discard;
    }

    gl_FragColor = vec4(uColor, alpha);
  }
`;

const LINE_VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;

  varying float vAlpha;

  uniform float uOpacity;

  void main() {
    vAlpha = aAlpha * uOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;

  uniform vec3 uColor;

  void main() {
    if (vAlpha <= 0.001) {
      discard;
    }

    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function wrapSigned(value, range) {
  const halfRange = range * 0.5;
  return ((((value + halfRange) % range) + range) % range) - halfRange;
}

function randomCentered(value) {
  return value * 2 - 1;
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

export class CubePlexus {
  constructor({
    color = '#dce8ff',
    radius = 0.8,
    treadmillDist = 3,
    totalPoints = 18,
    maxConnectionsPerPoint = 3
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'cube-plexus';
    this.group.renderOrder = 14;

    this.color = new THREE.Color(color);
    this.radius = radius;
    this.treadmillDist = treadmillDist;
    this.totalPoints = totalPoints;
    this.maxConnectionsPerPoint = maxConnectionsPerPoint;
    this.maxConnections = this.totalPoints * this.maxConnectionsPerPoint;
    this.connectDistance = Math.max(this.radius * 1.8, this.treadmillDist);
    this.clickPulse = 0;
    this.visibleStrength = 0;
    this.captureHidden = false;
    this.pointStrength = new Float32Array(this.totalPoints);
    this.lineStrength = new Float32Array(this.maxConnections * 2);
    this.points = [];
    this.connections = [];
    this.connectionKeys = new Set();

    for (let index = 0; index < this.totalPoints; index += 1) {
      const rand = Math.random();
      const angle = rand * Math.PI * 2;
      const radial = THREE.MathUtils.lerp(this.radius * 0.45, this.radius, Math.random());
      const point = {
        angle,
        radial,
        height: randomCentered(Math.random()) * this.treadmillDist * 0.45,
        rand,
        drift: Math.random() * Math.PI * 2,
        canConnect: false,
        world: new THREE.Vector3(),
        connections: 0
      };
      this.points.push(point);
    }

    const pointPositions = new Float32Array(this.totalPoints * 3);
    const pointAlphas = new Float32Array(this.totalPoints);
    this.pointGeometry = new THREE.BufferGeometry();
    this.pointPositionAttribute = new THREE.BufferAttribute(pointPositions, 3);
    this.pointAlphaAttribute = new THREE.BufferAttribute(pointAlphas, 1);
    this.pointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.pointAlphaAttribute.setUsage(THREE.DynamicDrawUsage);
    this.pointGeometry.setAttribute('position', this.pointPositionAttribute);
    this.pointGeometry.setAttribute('aAlpha', this.pointAlphaAttribute);

    this.pointMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#666666') },
        uOpacity: { value: 0 },
        uPointSize: { value: 26 }
      },
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      transparent: false,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.pointMesh = new THREE.Points(this.pointGeometry, this.pointMaterial);
    this.pointMesh.frustumCulled = false;

    const linePositions = new Float32Array(this.maxConnections * 2 * 3);
    const lineAlphas = new Float32Array(this.maxConnections * 2);
    this.lineGeometry = new THREE.BufferGeometry();
    this.linePositionAttribute = new THREE.BufferAttribute(linePositions, 3);
    this.lineAlphaAttribute = new THREE.BufferAttribute(lineAlphas, 1);
    this.linePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.lineAlphaAttribute.setUsage(THREE.DynamicDrawUsage);
    this.lineGeometry.setAttribute('position', this.linePositionAttribute);
    this.lineGeometry.setAttribute('aAlpha', this.lineAlphaAttribute);
    this.lineGeometry.setDrawRange(0, 0);

    this.lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#7f7f7f') },
        uOpacity: { value: 0 }
      },
      vertexShader: LINE_VERTEX_SHADER,
      fragmentShader: LINE_FRAGMENT_SHADER,
      transparent: false,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lineMesh = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.lineMesh.frustumCulled = false;

    this.group.add(this.lineMesh, this.pointMesh);
  }

  triggerPulse(strength = 1) {
    this.clickPulse = Math.max(this.clickPulse, clamp01(strength));
  }

  update({
    delta = 0.016,
    time = 0,
    visibility = 0,
    hover = 0,
    focus = 0,
    scrollSpeed = 0
  } = {}) {
    const visibilityTarget = clamp01(visibility);
    const blend = 1 - Math.exp(-delta * 8);
    this.visibleStrength = THREE.MathUtils.lerp(this.visibleStrength, visibilityTarget, blend);
    this.clickPulse = THREE.MathUtils.lerp(this.clickPulse, 0, 1 - Math.exp(-delta * 4.5));

    const interaction = clamp01(this.clickPulse);
    const displayMix = clamp01(Math.max(this.visibleStrength, interaction));
    const motionGate = 1 - clamp01(scrollSpeed * 0.85);
    const connectionDistance = this.treadmillDist;
    const treadmillRange = this.treadmillDist * 0.5;
    const treadmillConnectThreshold = treadmillRange * 0.75;

    this.points.forEach((point, index) => {
      const angle = point.angle + time * (0.3 + point.rand * 0.45);
      const wobble = Math.sin(time * (0.7 + point.rand) + point.drift) * 0.08;
      const radial = point.radial + wobble;
      const previousY = point.world.y;
      const y = wrapSigned(
        point.height + time * (0.24 + point.rand * 0.15),
        this.treadmillDist
      );

      point.world.set(
        Math.cos(angle) * radial,
        y + Math.sin(time * 0.9 + index * 1.3) * 0.04,
        Math.sin(angle) * radial
      );
      point.connections = 0;
      point.canConnect = motionGate > 0.04
        && Math.abs(point.world.y) < treadmillConnectThreshold
        && Math.abs(previousY - point.world.y) <= treadmillRange;

      const positionOffset = index * 3;
      this.pointPositionAttribute.array[positionOffset + 0] = point.world.x;
      this.pointPositionAttribute.array[positionOffset + 1] = point.world.y;
      this.pointPositionAttribute.array[positionOffset + 2] = point.world.z;
    });

    this.connections.length = 0;
    this.connectionKeys.clear();

    for (let index = 0; index < this.points.length; index += 1) {
      const point = this.points[index];

      if (!point.canConnect || point.connections >= this.maxConnectionsPerPoint) {
        continue;
      }

      const candidates = [];

      for (let candidateIndex = 0; candidateIndex < this.points.length; candidateIndex += 1) {
        if (candidateIndex === index) {
          continue;
        }

        const candidate = this.points[candidateIndex];
        if (!candidate.canConnect || candidate.connections >= this.maxConnectionsPerPoint) {
          continue;
        }

        const connectionKey = index < candidateIndex
          ? `${index}:${candidateIndex}`
          : `${candidateIndex}:${index}`;
        if (this.connectionKeys.has(connectionKey)) {
          continue;
        }

        const distance = point.world.distanceTo(candidate.world);
        if (distance > connectionDistance) {
          continue;
        }

        candidates.push({
          distance,
          candidateIndex,
          connectionKey
        });
      }

      shuffleInPlace(candidates);

      for (let candidateOffset = 0; candidateOffset < candidates.length; candidateOffset += 1) {
        if (point.connections >= this.maxConnectionsPerPoint || this.connections.length >= this.maxConnections) {
          break;
        }

        const candidateEntry = candidates[candidateOffset];
        const candidate = this.points[candidateEntry.candidateIndex];

        if (candidate.connections >= this.maxConnectionsPerPoint) {
          continue;
        }

        point.connections += 1;
        candidate.connections += 1;
        this.connectionKeys.add(candidateEntry.connectionKey);
        this.connections.push({
          pointA: index,
          pointB: candidateEntry.candidateIndex,
          distance: candidateEntry.distance
        });
      }
    }

    this.points.forEach((point, index) => {
      const target = point.connections > 0
        ? THREE.MathUtils.lerp(0.24, 0.82, displayMix * 0.92)
        : THREE.MathUtils.lerp(0.04, 0.12, displayMix * motionGate);
      this.pointStrength[index] = THREE.MathUtils.lerp(this.pointStrength[index], target, 1 - Math.exp(-delta * 10));
      this.pointAlphaAttribute.array[index] = this.pointStrength[index];
    });

    let vertexOffset = 0;
    for (let connectionIndex = 0; connectionIndex < this.connections.length; connectionIndex += 1) {
      const connection = this.connections[connectionIndex];
      const pointA = this.points[connection.pointA];
      const pointB = this.points[connection.pointB];
      const alpha = clamp01(
        THREE.MathUtils.lerp(0.42, 0.9, this.visibleStrength * 0.8 + this.clickPulse * 0.2)
        * (1 - clamp01(connection.distance / connectionDistance))
      );

      this.linePositionAttribute.array[vertexOffset * 3 + 0] = pointA.world.x;
      this.linePositionAttribute.array[vertexOffset * 3 + 1] = pointA.world.y;
      this.linePositionAttribute.array[vertexOffset * 3 + 2] = pointA.world.z;
      this.lineAlphaAttribute.array[vertexOffset] = alpha;
      vertexOffset += 1;

      this.linePositionAttribute.array[vertexOffset * 3 + 0] = pointB.world.x;
      this.linePositionAttribute.array[vertexOffset * 3 + 1] = pointB.world.y;
      this.linePositionAttribute.array[vertexOffset * 3 + 2] = pointB.world.z;
      this.lineAlphaAttribute.array[vertexOffset] = alpha;
      vertexOffset += 1;
    }

    for (let index = vertexOffset; index < this.lineStrength.length; index += 1) {
      this.lineAlphaAttribute.array[index] = 0;
    }

    this.lineGeometry.setDrawRange(0, vertexOffset);
    this.pointPositionAttribute.needsUpdate = true;
    this.pointAlphaAttribute.needsUpdate = true;
    this.linePositionAttribute.needsUpdate = true;
    this.lineAlphaAttribute.needsUpdate = true;

    this.group.visible = this.visibleStrength > 0.01 && !this.captureHidden;
    this.group.scale.setScalar(THREE.MathUtils.lerp(1, 1.08, this.clickPulse));
    this.pointMaterial.uniforms.uOpacity.value = clamp01(
      this.visibleStrength * (0.42 + this.clickPulse * 0.58) * THREE.MathUtils.lerp(0.42, 1, motionGate)
    );
    this.lineMaterial.uniforms.uOpacity.value = clamp01(
      this.visibleStrength * (0.46 + this.clickPulse * 0.54) * THREE.MathUtils.lerp(0.5, 1, motionGate)
    );
    this.pointMaterial.uniforms.uPointSize.value = THREE.MathUtils.lerp(18, 34, this.visibleStrength * 0.75 + this.clickPulse * 0.25);
  }

  setVisible(visible) {
    this.captureHidden = !visible;
    this.group.visible = Boolean(visible) && this.visibleStrength > 0.01;
  }

  dispose() {
    this.pointGeometry.dispose();
    this.lineGeometry.dispose();
    this.pointMaterial.dispose();
    this.lineMaterial.dispose();
  }
}
