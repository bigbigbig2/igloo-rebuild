import * as THREE from 'three';
import {
  ensureEntryFloorAttributes,
  ensureEntryRingAttributes,
  ensureRandAttribute,
  rawGeometry
} from './utils.js';
import {
  createAmbientParticleField,
  createAmbientParticleMaterial,
  createEntryFloorMaterial,
  createEntryRingMaterial,
  createForcefieldMaterial,
  createLightroomMaterial,
  createParticleField,
  createParticleMaterial,
  createPlasmaMaterial,
  createPortalForcefieldMaterial,
  createRoomRingMaterial,
  createSnowParticleField,
  createSnowParticleMaterial,
  createSmokeMaterial,
  createSmokeTrailMaterial,
  createTextCylinderMaterial,
  createTunnelMaterial
} from './materials.js';
import { EntryVolumeParticles } from './volumeParticles.js';

function resolveVolumeSpecs(assets, links = []) {
  const fallbackSpecs = [
    { vdb: 'peachesbody_64', scale: 1.2 },
    { vdb: 'x_64', scale: 1.3 },
    { vdb: 'medium_32', scale: 1.25 }
  ];
  const sourceSpecs = Array.isArray(links) && links.length > 0 ? links : fallbackSpecs;

  return sourceSpecs
    .map((link) => ({
      texture: assets.get('texture', `entry-volume-${link.vdb}`) ?? null,
      scale: link.scale ?? 1
    }))
    .filter((entry) => entry.texture);
}

export function buildEntryScene(scene, { assets, links = [] }) {
  const windNoise = assets.get('texture', 'wind-noise') ?? assets.get('texture', 'detail-perlin');
  const cloudsNoise = assets.get('texture', 'clouds-noise') ?? windNoise;
  const perlinTexture = assets.get('texture', 'detail-perlin') ?? windNoise;
  const trianglesTexture = assets.get('texture', 'triangles-tiling') ?? null;
  const floorGeometry = ensureEntryFloorAttributes(
    rawGeometry(assets.get('geometry', 'floor'), { recomputeNormals: false })
    || new THREE.CylinderGeometry(4.4, 4.9, 0.2, 64)
  );
  const ringGeometry = ensureEntryRingAttributes(
    rawGeometry(assets.get('geometry', 'ring'), { recomputeNormals: false })
    || new THREE.TorusGeometry(2.4, 0.12, 24, 160)
  );
  const ringSecondaryGeometry = ensureEntryRingAttributes(
    rawGeometry(assets.get('geometry', 'ring-secondary'), { recomputeNormals: false })
    || ringGeometry.clone()
  );
  const smokeTrailGeometry = rawGeometry(assets.get('geometry', 'smoke-trail'), { recomputeNormals: false });
  const groundSmokeGeometry = rawGeometry(assets.get('geometry', 'ground-smoke'), { recomputeNormals: false });
  const ceilingSmokeGeometry = rawGeometry(assets.get('geometry', 'ceiling-smoke'), { recomputeNormals: false });
  const blurryTextCylinderGeometry = ensureRandAttribute(
    rawGeometry(assets.get('geometry', 'blurrytext-cylinder'), { recomputeNormals: false })
  );

  scene.lightroom = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 32),
    createLightroomMaterial(assets.get('texture', 'dot-pattern'))
  );
  scene.lightroom.position.y = -12.15;
  scene.lightroom.renderOrder = 2;
  scene.add(scene.lightroom);
  scene.materials.push(scene.lightroom.material);

  scene.floor = new THREE.Mesh(
    floorGeometry,
    createEntryFloorMaterial({
      map: assets.get('texture', 'floor-color') ?? null,
      perlin: perlinTexture
    })
  );
  scene.floor.position.y = -10.19;
  scene.floor.scale.setScalar(0.73);
  scene.floor.rotation.y = Math.PI;
  scene.floor.visible = false;
  scene.root.add(scene.floor);
  scene.materials.push(scene.floor.material);

  const ringSpecs = [
    {
      geometry: ringSecondaryGeometry,
      map: assets.get('texture', 'ring-secondary-color') ?? assets.get('texture', 'ring-color'),
      aoMap: assets.get('texture', 'ring-secondary-ao') ?? assets.get('texture', 'ring-ao'),
      positionY: -1.65,
      scale: 1.0
    },
    {
      geometry: ringGeometry,
      map: assets.get('texture', 'ring-color'),
      aoMap: assets.get('texture', 'ring-ao'),
      positionY: -4.15,
      scale: 0.92
    },
    {
      geometry: ringSecondaryGeometry,
      map: assets.get('texture', 'ring-secondary-color') ?? assets.get('texture', 'ring-color'),
      aoMap: assets.get('texture', 'ring-secondary-ao') ?? assets.get('texture', 'ring-ao'),
      positionY: -6.65,
      scale: 0.86
    }
  ];

  ringSpecs.forEach((spec) => {
    const ring = new THREE.Mesh(
      spec.geometry,
      createEntryRingMaterial({ map: spec.map ?? null, glow: spec.aoMap ?? null })
    );
    ring.position.y = spec.positionY;
    ring.rotation.x = -Math.PI * 0.5;
    ring.scale.setScalar(spec.scale);
    scene.root.add(ring);
    scene.portalRings.push({ ring, baseY: spec.positionY, baseScale: spec.scale });
    scene.materials.push(ring.material);
  });

  scene.roomRing = new THREE.Mesh((() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(Math.PI * 0.5);
    geometry.translate(0, 1.5, 0);
    return geometry;
  })(), createRoomRingMaterial());
  scene.roomRing.position.y = -10.26;
  scene.roomRing.scale.setScalar(0.57);
  scene.roomRing.renderOrder = 3;
  scene.roomRing.visible = false;
  scene.root.add(scene.roomRing);
  scene.materials.push(scene.roomRing.material);

  scene.portalRings.forEach(({ baseY }, index) => {
    const forcefield = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      createForcefieldMaterial({
        triangles: trianglesTexture,
        noise: cloudsNoise,
        color: '#b3d0ff',
        opacity: 1
      })
    );
    forcefield.position.y = baseY;
    forcefield.rotation.x = -Math.PI * 0.5;
    forcefield.scale.setScalar(0.65);
    forcefield.renderOrder = 3 - index;
    forcefield.visible = false;
    scene.root.add(forcefield);
    scene.forcefields.push(forcefield);
    scene.materials.push(forcefield.material);

    const plasma = new THREE.Mesh(
      groundSmokeGeometry?.clone() ?? new THREE.CircleGeometry(1.45, 96),
      createPlasmaMaterial({
        noise: windNoise,
        color: '#8cbfff',
        opacity: 1
      })
    );
    plasma.position.y = baseY;
    plasma.userData.initialRotation = index * Math.PI * 0.5;
    plasma.renderOrder = 3 - index;
    plasma.visible = false;
    scene.root.add(plasma);
    scene.plasmaLayers.push(plasma);
    scene.materials.push(plasma.material);
  });

  scene.portalForcefield = new THREE.Mesh((() => {
    const geometry = new THREE.CylinderGeometry(1, 1, 3, 64, 6, true);
    geometry.translate(0, 1.5, 0);
    return geometry;
  })(), createPortalForcefieldMaterial(trianglesTexture));
  scene.portalForcefield.position.y = -10.13;
  scene.portalForcefield.scale.setScalar(0.28);
  scene.portalForcefield.renderOrder = 15;
  scene.portalForcefield.visible = false;
  scene.root.add(scene.portalForcefield);
  scene.materials.push(scene.portalForcefield.material);

  if (smokeTrailGeometry) {
    let currentY = -1.6;
    for (let index = 0; index < 3; index += 1) {
      const mesh = new THREE.Mesh(smokeTrailGeometry, createSmokeTrailMaterial(windNoise));
      mesh.position.y = currentY;
      mesh.rotation.y = index * Math.PI * 0.5;
      scene.root.add(mesh);
      scene.smokeTrails.push({ mesh, baseY: currentY, initialRotation: mesh.rotation.y });
      scene.materials.push(mesh.material);
      currentY -= 2.5;
    }
  }

  if (groundSmokeGeometry) {
    scene.groundSmoke = new THREE.Mesh(
      groundSmokeGeometry,
      createSmokeMaterial({
        noise: windNoise,
        tint: '#edf5ff',
        opacity: 0.24,
        speed: 0.05,
        exponent: 3.1
      })
    );
    scene.groundSmoke.position.y = -10.17;
    scene.groundSmoke.scale.set(5, 0.1, 5);
    scene.root.add(scene.groundSmoke);
    scene.materials.push(scene.groundSmoke.material);
  }

  if (ceilingSmokeGeometry) {
    scene.ceilingSmoke = new THREE.Mesh(
      ceilingSmokeGeometry,
      createSmokeMaterial({
        noise: windNoise,
        tint: '#f5f8ff',
        opacity: 0.16,
        speed: -0.06,
        exponent: 2.2
      })
    );
    scene.ceilingSmoke.position.y = -9.4;
    scene.ceilingSmoke.scale.set(2, 0.1, 2);
    scene.root.add(scene.ceilingSmoke);
    scene.materials.push(scene.ceilingSmoke.material);
  }

  if (blurryTextCylinderGeometry) {
    const atlas = assets.get('texture', 'blurrytext-atlas');
    scene.textCylinder = new THREE.Mesh(
      blurryTextCylinderGeometry,
      createTextCylinderMaterial(atlas)
    );
    scene.textCylinder.position.y = -10.33;
    scene.textCylinder.scale.setScalar(1.75);
    scene.textCylinder.renderOrder = 1;
    scene.textCylinder.visible = false;
    scene.root.add(scene.textCylinder);
    scene.materials.push(scene.textCylinder.material);

    scene.textCylinder2 = new THREE.Mesh(
      blurryTextCylinderGeometry,
      createTextCylinderMaterial(atlas)
    );
    scene.textCylinder2.position.y = -10.33;
    scene.textCylinder2.scale.setScalar(3.5);
    scene.textCylinder2.rotation.y = Math.PI * 0.5;
    scene.textCylinder2.renderOrder = 0;
    scene.textCylinder2.visible = false;
    scene.root.add(scene.textCylinder2);
    scene.materials.push(scene.textCylinder2.material);

    scene.textCylinder3 = new THREE.Mesh(
      blurryTextCylinderGeometry,
      createTextCylinderMaterial(atlas, true)
    );
    scene.textCylinder3.position.y = -9.5;
    scene.textCylinder3.scale.set(2, 9, 2);
    scene.textCylinder3.rotation.y = Math.PI;
    scene.textCylinder3.renderOrder = 0;
    scene.root.add(scene.textCylinder3);
    scene.materials.push(scene.textCylinder3.material);

    scene.textCylinder4 = new THREE.Mesh(
      blurryTextCylinderGeometry,
      createTextCylinderMaterial(atlas, true)
    );
    scene.textCylinder4.position.y = -9.5;
    scene.textCylinder4.scale.set(3.3, 8, 3.3);
    scene.textCylinder4.renderOrder = -1;
    scene.root.add(scene.textCylinder4);
    scene.materials.push(scene.textCylinder4.material);
  }

  scene.tunnel = new THREE.Mesh((() => {
    const geometry = new THREE.CylinderGeometry(1.3, 1.3, 9, 64, 32, true);
    geometry.translate(0, -4.5, 0);
    geometry.scale(-1, 1, 1);
    return geometry;
  })(), createTunnelMaterial(windNoise));
  scene.tunnel.position.y = 1;
  scene.tunnel.visible = false;
  scene.root.add(scene.tunnel);
  scene.materials.push(scene.tunnel.material);

  scene.snowParticles = new THREE.Points(
    createSnowParticleField(200),
    createSnowParticleMaterial()
  );
  scene.snowParticles.position.y = -3.5;
  scene.snowParticles.visible = false;
  scene.snowParticles.renderOrder = 1;
  scene.root.add(scene.snowParticles);
  scene.materials.push(scene.snowParticles.material);

  const volumeSpecs = resolveVolumeSpecs(assets, links);
  const canUseVolumeParticles =
    volumeSpecs.length > 0
    && volumeSpecs.every(({ texture }) => texture?.isData3DTexture);

  scene.particles = canUseVolumeParticles
    ? new EntryVolumeParticles({
      volumeTextures: volumeSpecs.map(({ texture }) => texture),
      volumeScales: volumeSpecs.map(({ scale }) => scale)
    })
    : new THREE.Points(
      createParticleField(12000),
      createParticleMaterial({ color: '#d0d6e5', opacity: 1, size: 0.055 })
    );
  scene.particles.position.set(0, -9.785, 0);
  scene.particles.visible = false;
  scene.particles.renderOrder = 10;
  if (scene.particles.points) {
    scene.particles.points.renderOrder = 10;
  }
  scene.root.add(scene.particles);
  scene.materials.push(scene.particles.material);

  scene.ambientParticles = new THREE.Points(
    createAmbientParticleField(250),
    createAmbientParticleMaterial()
  );
  scene.ambientParticles.position.y = -9.61;
  scene.ambientParticles.visible = false;
  scene.ambientParticles.renderOrder = 1;
  scene.root.add(scene.ambientParticles);
  scene.materials.push(scene.ambientParticles.material);

  scene.camera.fov = 22;
  scene.camera.position.set(0, 1.5, -2);
  scene.camera.up.set(0, 1, 0);
  scene.camera.lookAt(0, -2.5, -1);
  scene.camera.updateProjectionMatrix();
}
