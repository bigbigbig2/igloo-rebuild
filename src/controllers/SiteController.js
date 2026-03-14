import { AssetRegistry } from '../core/AssetRegistry.js';
import { assetManifest } from '../content/assetManifest.js';
import { siteContent } from '../content/siteContent.js';
import { damp, clamp } from '../utils/math.js';
import { IglooScene } from '../scenes/IglooScene.js';
import { CubesScene } from '../scenes/CubesScene.js';
import { EntryScene } from '../scenes/EntryScene.js';
import { DetailScene } from '../scenes/DetailScene.js';
import { UIScene } from '../scenes/UIScene.js';

export class SiteController {
  constructor({ bus, router, engine, uiContainer }) {
    this.bus = bus;
    this.router = router;
    this.engine = engine;
    this.content = siteContent;
    this.assets = new AssetRegistry(assetManifest, { bus });
    this.ready = false;

    this.sectionOrder = this.content.sections.map((section) => section.key);
    this.sections = {};
    this.detailScene = null;
    this.ui = new UIScene({
      container: uiContainer,
      content: this.content
    });

    this.route = { name: 'home', params: {}, path: '/' };
    this.scroll = {
      current: 0,
      target: 0,
      min: 0,
      max: this.sectionOrder.length - 0.001
    };
    this.currentSectionIndex = 0;
    this.currentProject = null;

    this.onTick = this.onTick.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onRouteChange = this.onRouteChange.bind(this);

    this.ui.bind({
      onHome: () => this.goHome(),
      onPrevious: () => this.moveToSection(this.currentSectionIndex - 1),
      onNext: () => this.moveToSection(this.currentSectionIndex + 1),
      onProject: (hash) => this.openProject(hash)
    });

    this.router.onChange(this.onRouteChange);
    this.bus.on('tick', this.onTick);
    this.engine.container.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  async init() {
    await this.assets.init(this.engine.renderer);
    await this.assets.preload(['geometry', 'texture']);

    this.sections = {
      igloo: new IglooScene({ assets: this.assets }),
      cubes: new CubesScene({
        assets: this.assets,
        projects: this.content.projects
      }),
      entry: new EntryScene({ assets: this.assets })
    };
    this.detailScene = new DetailScene({ assets: this.assets });
    this.ready = true;

    this.syncHomeScene();
    this.syncUi();
  }

  goHome() {
    this.router.go('/');
  }

  openProject(hash) {
    this.scroll.current = 1;
    this.scroll.target = 1;
    this.router.go(`/portfolio/${hash}`);
  }

  moveToSection(index) {
    const nextIndex = clamp(index, 0, this.sectionOrder.length - 1);
    this.scroll.target = nextIndex;
  }

  onWheel(event) {
    if (!this.ready) {
      return;
    }

    if (this.route.name !== 'home') {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY * 0.0015;
    this.scroll.target = clamp(this.scroll.target + delta, this.scroll.min, this.scroll.max);
  }

  onKeyDown(event) {
    if (!this.ready) {
      return;
    }

    if (event.key === 'Escape' && this.route.name === 'project') {
      this.goHome();
      return;
    }

    if (this.route.name !== 'home') {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      this.scroll.target = clamp(this.scroll.target + 1, this.scroll.min, this.scroll.max);
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      this.scroll.target = clamp(this.scroll.target - 1, this.scroll.min, this.scroll.max);
    }
  }

  onRouteChange(route) {
    if (!this.ready) {
      this.route = route;
      return;
    }

    this.route = route;

    if (route.name === 'project') {
      const project = this.content.projects.find((entry) => entry.hash === route.params.project);

      if (!project) {
        this.router.go('/', { replace: true });
        return;
      }

      this.currentProject = project;
      this.detailScene.setProject(project);
      this.engine.setScene(this.detailScene);
    } else {
      this.currentProject = null;
      this.syncHomeScene();
    }

    this.syncUi();
  }

  onTick({ delta }) {
    if (!this.ready) {
      return;
    }

    if (this.route.name === 'home') {
      this.scroll.current = damp(this.scroll.current, this.scroll.target, 7.5, delta);
      this.syncHomeScene();
    }
  }

  syncHomeScene() {
    const previousSectionIndex = this.currentSectionIndex;
    const nextIndex = clamp(Math.floor(this.scroll.current), 0, this.sectionOrder.length - 1);
    const localProgress = clamp(this.scroll.current - nextIndex, 0, 0.999);
    const key = this.sectionOrder[nextIndex];
    const scene = this.sections[key];

    this.currentSectionIndex = nextIndex;

    Object.entries(this.sections).forEach(([sectionKey, sectionScene]) => {
      sectionScene.setActive(sectionKey === key);
      sectionScene.setProgress(sectionKey === key ? localProgress : 0);
    });

    this.engine.setScene(scene);

    if (previousSectionIndex !== this.currentSectionIndex) {
      this.syncUi();
    }
  }

  syncUi() {
    const activeSection = this.content.sections[this.currentSectionIndex];

    this.ui.update({
      route: this.route,
      project: this.currentProject,
      sectionLabel: activeSection?.label ?? 'Project Detail'
    });
  }
}
