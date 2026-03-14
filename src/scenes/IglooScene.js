import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

export class IglooScene extends SceneBase {
  constructor({ assets }) {
    super({
      name: 'igloo',
      background: '#0b1018'
    });

    const ambient = new THREE.AmbientLight('#b9d0ff', 1.6);
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.8);
    keyLight.position.set(5, 8, 4);
    this.add(ambient, keyLight);

    const iglooGeometry = prepareGeometry(assets.get('geometry', 'igloo-shell'), {
      size: 3.2,
      align: 'ground'
    }) || new THREE.SphereGeometry(1.5, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const groundGeometry = prepareGeometry(assets.get('geometry', 'ground'), {
      size: 8.6,
      align: 'ground'
    }) || new THREE.CircleGeometry(5, 64);
    const iglooColor = assets.get('texture', 'igloo-color');
    const groundColor = assets.get('texture', 'ground-color');

    this.floor = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({
        color: '#111a26',
        map: groundColor ?? null,
        metalness: 0.08,
        roughness: 0.95
      })
    );
    this.floor.position.y = -1.6;
    this.root.add(this.floor);

    this.dome = new THREE.Mesh(
      iglooGeometry,
      new THREE.MeshStandardMaterial({
        color: iglooColor ? '#ffffff' : '#c6efff',
        map: iglooColor ?? null,
        metalness: 0.06,
        roughness: 0.55
      })
    );
    this.dome.position.y = -1.25;
    this.root.add(this.dome);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.035, 16, 96),
      new THREE.MeshBasicMaterial({
        color: '#8ed9ff'
      })
    );
    this.ring.rotation.x = Math.PI * 0.5;
    this.root.add(this.ring);

    this.camera.position.set(-3.6, 2.4, 5.8);
    this.camera.lookAt(0, 0, 0);
  }

  update(delta, elapsed) {
    this.dome.rotation.y += delta * 0.18;
    this.ring.rotation.z -= delta * 0.1;
    this.dome.position.y = THREE.MathUtils.lerp(-1.25, -0.45, this.progress);
    this.ring.position.y = THREE.MathUtils.lerp(-0.35, 0.25, this.progress);
    this.camera.position.x = THREE.MathUtils.lerp(-3.6, -1.8, this.progress);
    this.camera.position.y = THREE.MathUtils.lerp(2.4, 1.8, this.progress);
    this.camera.lookAt(0, -0.6 + this.progress * 0.5, 0);
    this.floor.material.color.offsetHSL(0, 0, Math.sin(elapsed * 0.25) * 0.0006);
  }
}
