import * as THREE from 'three';
import { RING_PULSES, SQUARE_EVENTS, TOTAL_DURATION } from './constants.js';
import { clamp01, easeIn, easeOut, smoothWindow } from './utils.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PORTAL_UP = new THREE.Vector3(0, 0, -1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const CAMERA_POSITION = new THREE.Vector3();
const CAMERA_TARGET = new THREE.Vector3();
const CAMERA_FORWARD = new THREE.Vector3();
const CAMERA_RIGHT = new THREE.Vector3();
const CAMERA_TRUE_UP = new THREE.Vector3();
const CAMERA_UP = new THREE.Vector3();

const CUSTOM_EASES = {
  entry_ease: [
    [
      { x: 0, y: 0 },
      { x: 0.358, y: 0 },
      { x: 0.336, y: 0.209 },
      { x: 0.442, y: 0.519 }
    ],
    [
      { x: 0.442, y: 0.519 },
      { x: 0.59, y: 0.952 },
      { x: 0.768, y: 0.918 },
      { x: 1, y: 1 }
    ]
  ],
  entry_ease_2: [
    [
      { x: 0, y: 0 },
      { x: 0.388, y: 0.082 },
      { x: 0.924, y: 0.862 },
      { x: 1, y: 1 }
    ]
  ],
  entry_ease_3: [
    [
      { x: 0, y: 0 },
      { x: 0.272, y: 0 },
      { x: 0.472, y: 0.454 },
      { x: 0.496, y: 0.496 }
    ],
    [
      { x: 0.496, y: 0.496 },
      { x: 0.66, y: 0.79 },
      { x: 0.685, y: 1 },
      { x: 1, y: 1 }
    ]
  ]
};

const CAMERA_TRACKS = {
  positionY: {
    initial: 1.5,
    segments: [
      { start: 0.2, duration: 7, to: -9.83, ease: 'entry_ease_3' }
    ]
  },
  positionZ: {
    initial: -2,
    segments: [
      { start: 0, duration: 2.5, to: 0, ease: 'power2.out' },
      { start: 3.5, duration: 3.7, to: -1.5, ease: 'entry_ease' },
      { start: 7.2, duration: 2, to: -3, ease: 'entry_ease_2' }
    ]
  },
  targetY: {
    initial: -2.5,
    segments: [
      { start: 0.2, duration: 3, to: -10, ease: 'power1.inOut' },
      { start: 3.2, duration: 2.5, to: -9.81, ease: 'power1.inOut' },
      { start: 7.2, duration: 2, to: -10.35, ease: 'power2.in' }
    ]
  },
  targetZ: {
    initial: -1,
    segments: [
      { start: 0, duration: 2.5, to: 0, ease: 'power2.out' }
    ]
  },
  upRotation: {
    initial: 0,
    segments: [
      { start: 1, duration: 5.25, to: Math.PI, ease: 'power3.inOut' }
    ]
  },
  upOriginal: {
    initial: 0,
    segments: [
      { start: 3.5, duration: 3.7, to: 1, ease: 'entry_ease' }
    ]
  },
  fov: {
    initial: 22,
    segments: [
      { start: 0, duration: 7.2, to: 30, ease: 'power1.inOut' }
    ]
  },
  displacementX: {
    initial: 0.01,
    segments: [
      { start: 4, duration: 1, to: 0, ease: 'power2.inOut' }
    ]
  },
  displacementY: {
    initial: 0.005,
    segments: [
      { start: 4, duration: 1, to: 0, ease: 'power2.inOut' }
    ]
  },
  displacementTargetX: {
    initial: 0,
    segments: [
      { start: 4, duration: 2, to: -0.03, ease: 'power2.inOut' }
    ]
  },
  displacementTargetY: {
    initial: 0,
    segments: [
      { start: 4, duration: 2, to: -0.01, ease: 'power2.inOut' }
    ]
  },
  displacementRotation: {
    initial: 0,
    segments: [
      { start: 4, duration: 2, to: 0.05, ease: 'power2.inOut' }
    ]
  }
};

const ROOM_TRACKS = {
  particleAlpha: {
    initial: 0,
    segments: [
      { start: 1.5, duration: 2.5, to: 1, ease: 'power2.inOut' }
    ]
  },
  particleInitialGlow: {
    initial: 1,
    segments: [
      { start: 3.9, duration: 1, to: 0, ease: 'power1.inOut' }
    ]
  },
  particleShowNoise: {
    initial: 1,
    segments: [
      { start: 3.5, duration: 1.5, to: 0, ease: 'power1.inOut' }
    ]
  },
  floorAlpha: {
    initial: 0,
    segments: [
      { start: 3.4, duration: 5, to: 1, ease: 'power2.out' }
    ]
  },
  textAlpha: {
    initial: 0,
    segments: [
      { start: 4.5, duration: 2, to: 1, ease: 'power2.inOut' }
    ]
  },
  portalForcefieldAlpha: {
    initial: 0,
    segments: [
      { start: 4, duration: 2, to: 1, ease: 'power2.inOut' }
    ]
  },
  groundSmokeAlpha: {
    initial: 0,
    segments: [
      { start: 4.4, duration: 3, to: 1, ease: 'power2.out' }
    ]
  },
  ambientAlpha: {
    initial: 0,
    segments: [
      { start: 4.4, duration: 3, to: 1, ease: 'power2.out' }
    ]
  }
};

const FORCEFIELD_WINDOWS = [
  { start: 0.1, end: 0.34 },
  { start: 0.25, end: 0.43 },
  { start: 0.36, end: 0.52 }
];

const PLASMA_WINDOWS = [
  { start: 0.06, end: 0.34 },
  { start: 0.25, end: 0.43 },
  { start: 0.35, end: 0.52 }
];

const RING_ENDS = [0.34, 0.43, 0.52];
const SMOKE_ENDS = [0.37, 0.47, 0.56];
function powerExponent(level) {
  return level + 1;
}

function easePowerIn(value, level) {
  return Math.pow(clamp01(value), powerExponent(level));
}

function easePowerOut(value, level) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, powerExponent(level));
}

function easePowerInOut(value, level) {
  const t = clamp01(value);
  const exponent = powerExponent(level);
  if (t <= 0.5) {
    return Math.pow(t * 2, exponent) * 0.5;
  }
  return 1 - Math.pow((1 - t) * 2, exponent) * 0.5;
}

function cubicBezierCoordinate(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  return (inv ** 3) * p0 + 3 * (inv ** 2) * t * p1 + 3 * inv * (t ** 2) * p2 + (t ** 3) * p3;
}

function cubicBezierDerivative(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  return 3 * (inv ** 2) * (p1 - p0) + 6 * inv * t * (p2 - p1) + 3 * (t ** 2) * (p3 - p2);
}

function sampleCustomEaseSegment(segment, value) {
  const clamped = clamp01(value);
  const p0 = segment[0];
  const p1 = segment[1];
  const p2 = segment[2];
  const p3 = segment[3];
  const span = Math.max(p3.x - p0.x, 1e-6);

  let t = clamp01((clamped - p0.x) / span);

  for (let index = 0; index < 5; index += 1) {
    const currentX = cubicBezierCoordinate(p0.x, p1.x, p2.x, p3.x, t);
    const delta = currentX - clamped;
    const slope = cubicBezierDerivative(p0.x, p1.x, p2.x, p3.x, t);
    if (Math.abs(delta) < 1e-5 || Math.abs(slope) < 1e-6) {
      break;
    }
    t = clamp01(t - delta / slope);
  }

  let low = 0;
  let high = 1;
  for (let index = 0; index < 8; index += 1) {
    const currentX = cubicBezierCoordinate(p0.x, p1.x, p2.x, p3.x, t);
    if (currentX > clamped) {
      high = t;
    } else {
      low = t;
    }
    t = (low + high) * 0.5;
  }

  return cubicBezierCoordinate(p0.y, p1.y, p2.y, p3.y, t);
}

function sampleCustomEase(name, value) {
  const segments = CUSTOM_EASES[name];
  if (!segments) {
    return clamp01(value);
  }

  const clamped = clamp01(value);
  const segment =
    segments.find((candidate) => clamped <= candidate[3].x + 1e-6)
    ?? segments[segments.length - 1];

  return sampleCustomEaseSegment(segment, clamped);
}

function applyEase(name, value) {
  switch (name) {
    case 'power1.inOut':
      return easePowerInOut(value, 1);
    case 'power2.out':
      return easePowerOut(value, 2);
    case 'power2.in':
      return easePowerIn(value, 2);
    case 'power2.inOut':
      return easePowerInOut(value, 2);
    case 'power3.inOut':
      return easePowerInOut(value, 3);
    case 'entry_ease':
    case 'entry_ease_2':
    case 'entry_ease_3':
      return sampleCustomEase(name, value);
    default:
      return clamp01(value);
  }
}

function sampleTrack(track, timePosition) {
  let current = track.initial;

  for (const segment of track.segments) {
    const startValue = segment.from ?? current;
    if (timePosition < segment.start) {
      return current;
    }

    if (timePosition >= segment.start + segment.duration) {
      current = segment.to;
      continue;
    }

    const localProgress = clamp01((timePosition - segment.start) / segment.duration);
    return THREE.MathUtils.lerp(startValue, segment.to, applyEase(segment.ease, localProgress));
  }

  return current;
}

function fadeWindow(progress, start, end, fadeIn = 0.04, fadeOut = 0.08) {
  const visibleIn = smoothWindow(progress, start, Math.min(end, start + fadeIn));
  const visibleOut = 1 - smoothWindow(progress, Math.max(start, end - fadeOut), end);
  return visibleIn * visibleOut;
}

function computeLinkInteractionForce(progress) {
  const fadeIn = THREE.MathUtils.smoothstep(progress, 0.45, 0.65);
  const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.8, 0.93);
  return clamp01(fadeIn * fadeOut);
}

function applyCameraTimeline(scene, timePosition) {
  CAMERA_POSITION.set(
    0,
    sampleTrack(CAMERA_TRACKS.positionY, timePosition),
    sampleTrack(CAMERA_TRACKS.positionZ, timePosition)
  );
  CAMERA_TARGET.set(
    0,
    sampleTrack(CAMERA_TRACKS.targetY, timePosition),
    sampleTrack(CAMERA_TRACKS.targetZ, timePosition)
  );

  const upRotation = sampleTrack(CAMERA_TRACKS.upRotation, timePosition);
  const upOriginal = sampleTrack(CAMERA_TRACKS.upOriginal, timePosition);
  const displacementX = sampleTrack(CAMERA_TRACKS.displacementX, timePosition);
  const displacementY = sampleTrack(CAMERA_TRACKS.displacementY, timePosition);
  const displacementTargetX = sampleTrack(CAMERA_TRACKS.displacementTargetX, timePosition);
  const displacementTargetY = sampleTrack(CAMERA_TRACKS.displacementTargetY, timePosition);
  const displacementRotation = sampleTrack(CAMERA_TRACKS.displacementRotation, timePosition);
  const nextFov = sampleTrack(CAMERA_TRACKS.fov, timePosition);

  CAMERA_UP.copy(PORTAL_UP);
  CAMERA_UP.applyAxisAngle(AXIS_Y, upRotation);
  CAMERA_UP.lerp(WORLD_UP, upOriginal).normalize();

  CAMERA_FORWARD.subVectors(CAMERA_TARGET, CAMERA_POSITION).normalize();
  CAMERA_RIGHT.crossVectors(CAMERA_FORWARD, CAMERA_UP);
  if (CAMERA_RIGHT.lengthSq() < 1e-6) {
    CAMERA_RIGHT.set(1, 0, 0);
  } else {
    CAMERA_RIGHT.normalize();
  }
  CAMERA_TRUE_UP.crossVectors(CAMERA_RIGHT, CAMERA_FORWARD).normalize();

  CAMERA_POSITION.addScaledVector(CAMERA_RIGHT, displacementX);
  CAMERA_POSITION.addScaledVector(CAMERA_TRUE_UP, displacementY);
  CAMERA_TARGET.addScaledVector(CAMERA_RIGHT, displacementTargetX);
  CAMERA_TARGET.addScaledVector(CAMERA_TRUE_UP, displacementTargetY);
  CAMERA_UP.applyAxisAngle(CAMERA_FORWARD, displacementRotation).normalize();

  scene.camera.position.copy(CAMERA_POSITION);
  scene.camera.up.copy(CAMERA_UP);
  scene.camera.lookAt(CAMERA_TARGET);

  if (Math.abs(scene.camera.fov - nextFov) > 1e-4) {
    scene.camera.fov = nextFov;
    scene.camera.updateProjectionMatrix();
  }

  return { upRotation };
}

export function computePresentationState(progress = 0, enterProgress = 1) {
  const panelProgress = smoothWindow(progress, 0.5, 0.72) * enterProgress;
  const linksProgress = smoothWindow(progress, 0.58, 0.82) * enterProgress;
  const roomRingProgress = smoothWindow(progress, 0.53, 0.7) * enterProgress;
  const portalCoreProgress =
    smoothWindow(progress, 0.54, 0.76) * (1 - smoothWindow(progress, 0.88, 1)) * enterProgress;
  const interactionPulse =
    smoothWindow(progress, 0.6, 0.78) * (1 - smoothWindow(progress, 0.9, 1)) * enterProgress;

  return {
    panelProgress,
    linksProgress,
    roomRingProgress,
    portalCoreProgress,
    interactionPulse,
    enterProgress
  };
}

export function updateEntryScene(scene, delta, elapsed) {
  const debug = scene.entryDebugSettings ?? {};
  const particleSizeMultiplier = debug.particleSizeMultiplier ?? 1;
  const particleAlphaMultiplier = debug.particleAlphaMultiplier ?? 1;
  const particleRotationSpeed = debug.particleRotationSpeed ?? 1;
  const particleNoiseMultiplier = debug.particleNoiseMultiplier ?? 1;
  const particleInitialGlowMultiplier = debug.particleInitialGlowMultiplier ?? 1;
  const cylinderShellAlphaMultiplier = debug.cylinderShellAlphaMultiplier ?? 1;
  const floorPhaseSpeed = debug.floorPhaseSpeed ?? 1;
  const isIncomingFromCubes =
    scene.transitionState?.role === 'next' && scene.transitionState?.previousKey === 'cubes';
  const enterProgress = isIncomingFromCubes
    ? THREE.MathUtils.smoothstep(scene.transitionState.enterProgress ?? 0, 0, 1)
    : 1;
  const progress = scene.progress;
  const timePosition = progress * TOTAL_DURATION;

  scene.direction = progress > scene.lastProgress ? 1 : -1;

  SQUARE_EVENTS.forEach((event) => {
    const lastTime = scene.lastProgress * TOTAL_DURATION;
    const crossedForward = lastTime < event.time && timePosition >= event.time;
    const crossedBackward = lastTime > event.time && timePosition <= event.time;
    if (!crossedForward && !crossedBackward) {
      return;
    }

    const scale = event.scale ?? (scene.direction < 0 ? event.scaleBackward : event.scaleForward);
    scene.postState.squareAttr.set(Math.random() * 25.424, Math.random() * 64.453, scale);
  });

  scene.postState.ringProximity = RING_PULSES.reduce((maximum, pulse) => {
    if (timePosition < pulse.start) {
      return maximum;
    }
    if (timePosition < pulse.start + pulse.inDuration) {
      return Math.max(maximum, easeIn((timePosition - pulse.start) / pulse.inDuration));
    }
    if (timePosition < pulse.outStart) {
      return 1;
    }
    if (timePosition < pulse.outStart + pulse.outDuration) {
      return Math.max(maximum, 1 - easeOut((timePosition - pulse.outStart) / pulse.outDuration));
    }
    return maximum;
  }, 0);

  scene.presentationState = computePresentationState(progress, enterProgress);
  scene.presentationState.activeLinkIndex = scene.activeLinkIndex;
  scene.presentationState.activeLink = scene.links?.[scene.activeLinkIndex] ?? null;

  const { upRotation } = applyCameraTimeline(scene, timePosition);
  const roomRingReveal = smoothWindow(progress, 0.53, 0.64);
  const portalCoreProgress = smoothWindow(progress, 0.54, 0.76) * (1 - smoothWindow(progress, 0.88, 1));
  const interactionPulse = smoothWindow(progress, 0.6, 0.78) * (1 - smoothWindow(progress, 0.9, 1));
  const tunnelReveal = 1 - smoothWindow(progress, 0.46, 0.52);
  const floorReveal = sampleTrack(ROOM_TRACKS.floorAlpha, timePosition);
  const portalForcefieldReveal = sampleTrack(ROOM_TRACKS.portalForcefieldAlpha, timePosition);
  const textReveal = sampleTrack(ROOM_TRACKS.textAlpha, timePosition);
  const groundSmokeReveal = sampleTrack(ROOM_TRACKS.groundSmokeAlpha, timePosition);
  const ceilingSmokeReveal = smoothWindow(timePosition, 4.5, 5.1);
  const ambientReveal = sampleTrack(ROOM_TRACKS.ambientAlpha, timePosition);
  const cylinderShellReveal =
    smoothWindow(progress, 0.56, 0.74)
    * (1 - smoothWindow(progress, 0.94, 1))
    * THREE.MathUtils.lerp(0.75, 1, roomRingReveal);
  const particleReveal = sampleTrack(ROOM_TRACKS.particleAlpha, timePosition);
  const particleInitialGlow = sampleTrack(ROOM_TRACKS.particleInitialGlow, timePosition);
  const particleShowNoise = sampleTrack(ROOM_TRACKS.particleShowNoise, timePosition);
  const linkInteractionEnabled = progress > 0.64 && progress < 0.9;
  const linkInteractionForce = computeLinkInteractionForce(progress);

  scene.setLinkInteractionEnabled?.(linkInteractionEnabled);
  scene.presentationState.activeLinkIndex = scene.activeLinkIndex;
  scene.presentationState.activeLink = scene.links?.[scene.activeLinkIndex] ?? null;
  scene.presentationState.interactionEnabled = scene.linkInteractionEnabled;

  if (scene.lightroom?.material?.uniforms?.uTime) {
    scene.lightroom.material.uniforms.uTime.value = elapsed;
  }

  scene.portalRings.forEach(({ ring, baseScale }, index) => {
    const ringReveal = 1 - smoothWindow(progress, RING_ENDS[index] - 0.06, RING_ENDS[index]);
    ring.visible = ringReveal > 0.001;
    ring.rotation.z = upRotation * 0.4;
    ring.scale.setScalar(baseScale);
    ring.material.uniforms.uTime.value = elapsed;
    ring.material.uniforms.uAlpha.value = ringReveal;
  });

  scene.forcefields.forEach((forcefield, index) => {
    const { start, end } = FORCEFIELD_WINDOWS[index];
    const reveal = fadeWindow(progress, start, end, 0.05, 0.08);
    forcefield.visible = reveal > 0.001;
    forcefield.material.uniforms.uTime.value = elapsed;
    forcefield.material.uniforms.uOpacity.value = reveal * (0.42 + interactionPulse * 0.06);
  });

  scene.plasmaLayers.forEach((plasma, index) => {
    const { start, end } = PLASMA_WINDOWS[index];
    const reveal = fadeWindow(progress, start, end, 0.05, 0.08);
    plasma.visible = reveal > 0.001;
    plasma.rotation.y = (plasma.userData.initialRotation ?? index * Math.PI * 0.5) + upRotation * 0.5;
    plasma.material.uniforms.uTime.value = elapsed;
    plasma.material.uniforms.uOpacity.value = reveal * (0.3 + interactionPulse * 0.08);
  });

  scene.smokeTrails.forEach(({ mesh, initialRotation }, index) => {
    const reveal = fadeWindow(progress, 0, SMOKE_ENDS[index], 0.05, 0.08);
    mesh.visible = reveal > 0.001;
    mesh.rotation.y = initialRotation + upRotation * 0.5;
    mesh.material.uniforms.uTime.value = elapsed;
    mesh.material.uniforms.uOpacity.value = reveal * 0.42;
  });

  if (scene.tunnel) {
    scene.tunnel.visible = tunnelReveal > 0.001;
    scene.tunnel.rotation.y = upRotation * 0.65;
    scene.tunnel.material.uniforms.uTime.value = elapsed;
    scene.tunnel.material.uniforms.uOpacity.value = tunnelReveal;
  }

  if (scene.snowParticles) {
    scene.snowParticles.visible = tunnelReveal > 0.001;
    scene.snowParticles.material.uniforms.uTime.value = elapsed;
    scene.snowParticles.material.uniforms.uAlpha.value = tunnelReveal;
  }

  if (scene.floor) {
    scene.floorAdditionalTime = THREE.MathUtils.damp(
      scene.floorAdditionalTime ?? 0,
      scene.floorAdditionalTimeTarget ?? 0,
      1.6,
      delta
    );
    scene.floor.visible = timePosition >= 3.4 || floorReveal > 0.001;
    scene.floor.material.uniforms.uTime.value = elapsed;
    scene.floor.material.uniforms.uRotationTime.value =
      elapsed * 0.5 * floorPhaseSpeed + scene.floorAdditionalTime;
    scene.floor.material.uniforms.uAlpha.value = floorReveal;
  }

  if (scene.roomRing) {
    scene.roomRing.visible = progress > 0.53;
    scene.roomRing.scale.setScalar(0.57 * THREE.MathUtils.lerp(0.94, 1, roomRingReveal));
    scene.roomRing.material.uniforms.uTime.value = elapsed;
  }

  if (scene.portalForcefield) {
    scene.portalForcefield.visible = timePosition >= 4 || portalForcefieldReveal > 0.001;
    scene.portalForcefield.material.uniforms.uTime.value = elapsed;
    scene.portalForcefield.material.uniforms.uAlpha.value =
      portalForcefieldReveal * (0.28 + interactionPulse * 0.05);
  }

  if (scene.textCylinder && scene.textCylinder2) {
    const visible = timePosition >= 4.5 || textReveal > 0.001;
    scene.textCylinder.visible = visible;
    scene.textCylinder2.visible = visible;
    scene.textCylinder.material.uniforms.uTime.value = elapsed;
    scene.textCylinder2.material.uniforms.uTime.value = elapsed;
    scene.textCylinder.material.uniforms.uAlpha.value = textReveal;
    scene.textCylinder2.material.uniforms.uAlpha.value = textReveal;
  }

  if (scene.textCylinder3) {
    scene.textCylinder3.visible = cylinderShellReveal > 0.001;
    scene.textCylinder3.material.uniforms.uTime.value = elapsed;
    scene.textCylinder3.material.uniforms.uAlpha.value =
      cylinderShellReveal * 0.92 * cylinderShellAlphaMultiplier;
    scene.textCylinder3.rotation.y = upRotation * 0.65 + 2;
  }

  if (scene.textCylinder4) {
    scene.textCylinder4.visible = cylinderShellReveal > 0.001;
    scene.textCylinder4.material.uniforms.uTime.value = elapsed;
    scene.textCylinder4.material.uniforms.uAlpha.value =
      cylinderShellReveal * 0.72 * cylinderShellAlphaMultiplier;
    scene.textCylinder4.rotation.y = upRotation * 0.65;
  }

  if (scene.groundSmoke) {
    scene.groundSmoke.visible = timePosition >= 3.4 || groundSmokeReveal > 0.001;
    scene.groundSmoke.material.uniforms.uTime.value = elapsed;
    scene.groundSmoke.material.uniforms.uOpacity.value = groundSmokeReveal * 0.14;
  }

  if (scene.ceilingSmoke) {
    scene.ceilingSmoke.visible = timePosition >= 4.5 || ceilingSmokeReveal > 0.001;
    scene.ceilingSmoke.material.uniforms.uTime.value = elapsed;
    scene.ceilingSmoke.material.uniforms.uOpacity.value = ceilingSmokeReveal * 0.16;
  }

  if (scene.ambientParticles) {
    scene.ambientParticles.visible = timePosition >= 3.4 || ambientReveal > 0.001;
    scene.ambientParticles.material.uniforms.uTime.value = elapsed;
    scene.ambientParticles.material.uniforms.uAlpha.value = ambientReveal * 0.72;
  }

  if (scene.particles) {
    scene.particles.visible = timePosition >= 1.5 || particleReveal > 0.001;
    scene.particles.position.y = -9.785;
    if (scene.particles.isVolumeParticleField) {
      scene.particles.rotation.set(0, 0, 0);
      scene.particles.scale.setScalar(1);
    } else {
      scene.particles.rotation.y -= delta * particleRotationSpeed * (0.08 + portalCoreProgress * 0.08);
      scene.particles.rotation.x = Math.sin(elapsed * 0.25 * particleRotationSpeed) * 0.06;
      scene.particles.scale.setScalar(THREE.MathUtils.lerp(0.9, 1.08, particleReveal) * (1 + portalCoreProgress * 0.05));
    }
    const particleSize = THREE.MathUtils.lerp(
      0.048,
      0.082,
      clamp01(particleReveal * 0.9 + portalCoreProgress * 0.25)
    ) * particleSizeMultiplier;
    const particleAlpha = THREE.MathUtils.clamp(
      particleReveal * (0.92 + interactionPulse * 0.08) * particleAlphaMultiplier,
      0,
      1
    );
    const particleShowNoiseClamped = THREE.MathUtils.clamp(
      particleShowNoise * particleNoiseMultiplier,
      0,
      1
    );
    const particleInitialGlowClamped = THREE.MathUtils.clamp(
      particleInitialGlow * particleInitialGlowMultiplier,
      0,
      1
    );
    const particleMaterial = scene.particles.material;

    if (particleMaterial?.uniforms?.uTime) {
      particleMaterial.uniforms.uTime.value = elapsed;
    }
    if (particleMaterial?.uniforms?.uOpacity) {
      particleMaterial.uniforms.uOpacity.value = particleAlpha;
    }
    if (particleMaterial?.uniforms?.uAlpha) {
      particleMaterial.uniforms.uAlpha.value = particleAlpha;
    }
    if (particleMaterial?.uniforms?.uSize) {
      particleMaterial.uniforms.uSize.value = particleSize;
    }
    if (particleMaterial?.uniforms?.uShowNoise) {
      particleMaterial.uniforms.uShowNoise.value = particleShowNoiseClamped;
    }
    if (particleMaterial?.uniforms?.uInitialGlow) {
      particleMaterial.uniforms.uInitialGlow.value = particleInitialGlowClamped;
    }

    scene.particles.setSimulationState?.({
      delta,
      elapsed,
      alpha: particleAlpha,
      size: particleSize,
      initialGlow: particleInitialGlowClamped,
      showNoise: particleShowNoiseClamped,
      portalCoreProgress
    });

    scene.updatePointerInteraction?.(delta, linkInteractionForce);
  }

  const particleBurstNoise =
    scene.particles?.material?.uniforms?.uAdditionalNoise?.value
    ?? scene.particles?.material?.uniforms?.uShowNoise?.value
    ?? 0;
  const particleMix = scene.particles?.visible
    ? THREE.MathUtils.clamp(
      linkInteractionForce * 0.04
      + scene.pointerVelocity * 0.21
      + particleBurstNoise * 0.08,
      0,
      1
    )
    : 0;

  scene.audioState = {
    particlesMix: particleMix,
    interactionEnabled: linkInteractionEnabled,
    interactionForce: linkInteractionForce
  };

  scene.lastProgress = progress;
}
