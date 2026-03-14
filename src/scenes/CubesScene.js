import * as THREE from 'three';
import { prepareGeometry } from '../utils/geometry.js';
import { SceneBase } from './SceneBase.js';

const CUBE_ASSET_KEYS = [
  {
    geometryKey: 'cube1',
    normalKey: 'cube1-normal',
    roughnessKey: 'cube1-roughness'
  },
  {
    geometryKey: 'cube2',
    normalKey: 'cube2-normal',
    roughnessKey: 'cube2-roughness'
  },
  {
    geometryKey: 'cube3',
    normalKey: 'cube3-normal',
    roughnessKey: 'cube3-roughness'
  }
];

export class CubesScene extends SceneBase {
  constructor({ assets, projects }) {
    super({
      name: 'cubes',
      background: '#10131b'
    });

    this.projects = projects;
    this.cubes = [];
    this.projectGroup = new THREE.Group();
    this.root.add(this.projectGroup);
    this.environment = assets.get('texture', 'cubes-environment');

    const ambient = new THREE.AmbientLight('#f0f4ff', 1.4);
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(3, 5, 6);
    this.add(ambient, keyLight);

    projects.forEach((project, index) => {
      const assetConfig = CUBE_ASSET_KEYS[index] ?? CUBE_ASSET_KEYS[0];
      const geometry = prepareGeometry(assets.get('geometry', assetConfig.geometryKey), {
        size: 1.6
      }) || new THREE.BoxGeometry(1.35, 1.35, 1.35);

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshPhysicalMaterial({
          color: project.accent,
          roughness: 0.68,
          roughnessMap: assets.get('texture', assetConfig.roughnessKey) ?? null,
          normalMap: assets.get('texture', assetConfig.normalKey) ?? null,
          metalness: 0.12,
          envMapIntensity: 1.1,
          transmission: 0.04
        })
      );

      mesh.position.y = -index * 2.15;
      mesh.rotation.x = 0.45;
      mesh.rotation.y = 0.6;
      mesh.userData.project = project;

      this.projectGroup.add(mesh);
      this.cubes.push(mesh);
    });

    this.camera.position.set(0, 0.8, 6);
    this.camera.lookAt(0, 0, 0);
  }

  update(delta) {
    const scrollOffset = this.progress * 2.15;
    this.projectGroup.position.y = scrollOffset;

    this.cubes.forEach((cube, index) => {
      cube.rotation.x += delta * (0.2 + index * 0.03);
      cube.rotation.y += delta * (0.25 + index * 0.03);
      cube.position.x = Math.sin(this.progress * Math.PI + index) * 0.32;
      cube.scale.setScalar(index === 0 ? 1.08 : 1);
    });

    this.camera.position.y = THREE.MathUtils.lerp(0.8, -0.25, this.progress);
    this.camera.lookAt(0, -1 + this.progress, 0);
  }
}
