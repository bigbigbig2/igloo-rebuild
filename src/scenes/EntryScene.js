import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

export class EntryScene extends SceneBase {
  constructor({ assets }) {
    super({
      name: 'entry',
      background: '#09070e'
    });

    const ambient = new THREE.AmbientLight('#ffe0b7', 1.25);
    const backLight = new THREE.PointLight('#ff8f5c', 18, 18);
    backLight.position.set(0, 0, 2.8);
    this.add(ambient, backLight);

    const floorGeometry = prepareGeometry(assets.get('geometry', 'floor'), {
      size: 8.8,
      align: 'ground'
    }) || new THREE.CylinderGeometry(4.4, 4.9, 0.2, 64);
    const ringGeometry = prepareGeometry(assets.get('geometry', 'ring'), {
      size: 4
    }) || new THREE.TorusGeometry(2.4, 0.12, 24, 160);

    this.floor = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({
        color: '#2b221f',
        map: assets.get('texture', 'floor-color') ?? null,
        roughness: 0.92,
        metalness: 0.04
      })
    );
    this.floor.position.y = -2.2;
    this.root.add(this.floor);

    this.portal = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshStandardMaterial({
        color: assets.get('texture', 'ring-color') ? '#ffffff' : '#ff9367',
        map: assets.get('texture', 'ring-color') ?? null,
        aoMap: assets.get('texture', 'ring-ao') ?? null,
        emissive: '#8f2d12',
        emissiveIntensity: 0.6,
        metalness: 0.15,
        roughness: 0.18
      })
    );
    this.root.add(this.portal);

    const particlesGeometry = new THREE.BufferGeometry();
    const points = new Float32Array(600 * 3);

    for (let index = 0; index < 600; index += 1) {
      const stride = index * 3;
      const radius = 1.5 + Math.random() * 2.5;
      const angle = Math.random() * Math.PI * 2;
      points[stride] = Math.cos(angle) * radius;
      points[stride + 1] = (Math.random() - 0.5) * 3.6;
      points[stride + 2] = (Math.random() - 0.5) * 3.6;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));

    this.particles = new THREE.Points(
      particlesGeometry,
      new THREE.PointsMaterial({
        color: '#ffd4a6',
        size: 0.025,
        transparent: true,
        opacity: 0.9
      })
    );
    this.root.add(this.particles);

    this.camera.position.set(0, 0, 7.5);
    this.camera.lookAt(0, 0, 0);
  }

  update(delta) {
    this.portal.rotation.x += delta * 0.16;
    this.portal.rotation.y += delta * 0.21;
    this.portal.scale.setScalar(1 + this.progress * 0.2);
    this.particles.rotation.y -= delta * 0.05;
    this.particles.rotation.z += delta * 0.02;
    this.camera.position.z = THREE.MathUtils.lerp(7.5, 6.2, this.progress);
  }
}
