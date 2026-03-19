import * as THREE from 'three';

export class Engine {
  constructor({ container, bus }) {
    this.container = container;
    this.bus = bus;
    this.view = null;
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
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#000000');

    this.container.appendChild(this.renderer.domElement);

    this.onResize = this.onResize.bind(this);
    this.loop = this.loop.bind(this);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.start();
  }

  setView(view) {
    if (this.view === view) {
      return;
    }

    if (this.view?.setActive) {
      this.view.setActive(false);
    }

    this.view = view;
    this.scene = view?.isScene ? view : null;

    if (this.view?.setActive) {
      this.view.setActive(true);
    }

    if (this.view?.setSize) {
      this.view.setSize(this.size.width, this.size.height, this.size.pixelRatio);
    }
  }

  setScene(scene) {
    this.setView(scene);
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

    if (this.view?.setSize) {
      this.view.setSize(width, height, pixelRatio);
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

    if (this.view) {
      this.view.update?.(delta, elapsed, frameState);

      if (typeof this.view.render === 'function') {
        this.view.render(this.renderer, frameState);
      } else if (this.view.camera) {
        this.renderer.render(this.view, this.view.camera);
      }
    }

    this.bus.emit('after-render', frameState);

    window.requestAnimationFrame(this.loop);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.view?.dispose?.();
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
