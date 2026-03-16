import * as THREE from 'three';

export class SceneBase extends THREE.Scene {
  constructor({
    name,
    background = '#0a1119',
    cameraType = 'perspective'
  }) {
    super();

    this.name = name;
    this.progress = 0;
    this.active = false;
    this.transitionState = {
      role: 'inactive',
      sectionKey: name,
      currentKey: null,
      previousKey: null,
      nextKey: null,
      blend: 0,
      enterProgress: 0,
      exitProgress: 0,
      isTransitioning: false
    };
    this.root = new THREE.Group();
    this.add(this.root);
    this.background = new THREE.Color(background);

    if (cameraType === 'orthographic') {
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      this.camera.position.set(0, 0, 10);
    } else {
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      this.camera.position.set(0, 0, 8);
    }
  }

  setActive(active) {
    this.active = active;
  }

  setProgress(progress) {
    this.progress = progress;
  }

  setTransitionState(transitionState = {}) {
    this.transitionState = {
      ...this.transitionState,
      ...transitionState
    };
  }

  setSize(width, height) {
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const aspect = width / height;
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
    }

    this.camera.updateProjectionMatrix();
  }

  update() {}
}
