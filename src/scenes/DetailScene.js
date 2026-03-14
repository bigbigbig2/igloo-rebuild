import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const FALLBACK_GEOMETRY_FACTORY = [
  () => new THREE.TorusKnotGeometry(1.0, 0.26, 180, 32),
  () => new THREE.IcosahedronGeometry(1.25, 1),
  () => new THREE.OctahedronGeometry(1.45, 0)
];

export class DetailScene extends SceneBase {
  constructor({ assets }) {
    super({
      name: 'detail',
      background: '#080c13'
    });

    this.assets = assets;
    this.project = null;

    const ambient = new THREE.AmbientLight('#ffffff', 1.1);
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.8);
    keyLight.position.set(4, 6, 5);
    this.add(ambient, keyLight);

    this.pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 0.55, 48),
      new THREE.MeshStandardMaterial({
        color: '#111722',
        roughness: 0.82,
        metalness: 0.16
      })
    );
    this.pedestal.position.y = -2.15;
    this.root.add(this.pedestal);

    this.object = new THREE.Mesh(
      FALLBACK_GEOMETRY_FACTORY[0](),
      new THREE.MeshPhysicalMaterial({
        color: '#8ed9ff',
        roughness: 0.18,
        metalness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.1
      })
    );
    this.ownedGeometry = this.object.geometry;
    this.root.add(this.object);

    this.camera.position.set(0, 0.5, 5.5);
    this.camera.lookAt(0, 0, 0);
  }

  setProject(project) {
    this.project = project;

    if (this.ownedGeometry) {
      this.ownedGeometry.dispose();
      this.ownedGeometry = null;
    }

    const preparedGeometry = prepareGeometry(this.assets.get('geometry', project.modelKey), {
      size: 2.6
    });
    const nextGeometry = preparedGeometry ?? FALLBACK_GEOMETRY_FACTORY[project.index % FALLBACK_GEOMETRY_FACTORY.length]();
    this.ownedGeometry = nextGeometry;
    this.object.geometry = nextGeometry;
    this.object.material.map = this.assets.get('texture', project.textureKey) ?? null;
    this.object.material.color.set(this.object.material.map ? '#ffffff' : project.accent);
    this.object.material.transparent = Boolean(this.object.material.map);
    this.object.material.emissive.copy(new THREE.Color(project.accent).multiplyScalar(0.18));
    this.object.material.needsUpdate = true;
  }

  update(delta, elapsed) {
    this.object.rotation.x += delta * 0.2;
    this.object.rotation.y += delta * 0.35;
    this.object.position.y = Math.sin(elapsed * 1.4) * 0.18;
    this.camera.position.x = Math.sin(elapsed * 0.25) * 0.25;
    this.camera.lookAt(0, 0, 0);
  }
}
