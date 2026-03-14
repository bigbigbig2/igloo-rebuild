import * as THREE from 'three';

export class Engine {
  constructor({ container, bus }) {
    this.container = container;
    this.bus = bus;
    this.scene = null;
    this.clock = new THREE.Clock();
    this.frame = 0;
    this.isRunning = false;
    this.size = {
      width: 0,
      height: 0,
      pixelRatio: 1
    };

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#070b10');

    this.container.appendChild(this.renderer.domElement);

    this.onResize = this.onResize.bind(this);
    this.loop = this.loop.bind(this);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.start();
  }

  setScene(scene) {
    if (this.scene === scene) {
      return;
    }

    if (this.scene) {
      this.scene.setActive(false);
    }

    this.scene = scene;

    if (this.scene) {
      this.scene.setActive(true);
      this.scene.setSize(this.size.width, this.size.height);
    }
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.clock.start();
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.size.width = width;
    this.size.height = height;
    this.size.pixelRatio = pixelRatio;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    if (this.scene) {
      this.scene.setSize(width, height);
    }

    this.bus.emit('resize', { ...this.size });
  }

  loop() {
    if (!this.isRunning) {
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();
    const frameState = {
      delta,
      elapsed,
      frame: this.frame++,
      size: { ...this.size },
      renderer: this.renderer
    };

    this.bus.emit('tick', frameState);

    if (this.scene) {
      this.scene.update(delta, elapsed, frameState);
      this.renderer.render(this.scene, this.scene.camera);
    }

    this.bus.emit('after-render', frameState);

    window.requestAnimationFrame(this.loop);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
