import { AssetRegistry } from '../core/AssetRegistry.js';
import { assetManifest } from '../content/assetManifest.js';
import { siteContent } from '../content/siteContent.js';
import { clamp } from '../utils/math.js';
import { IglooScene } from '../scenes/IglooScene.js';
import { CubesScene } from '../scenes/CubesScene.js';
import { EntryScene } from '../scenes/EntryScene.js';
import { DetailScene } from '../scenes/DetailScene.js';
import { UIScene } from '../scenes/UIScene.js';
import { WebGLUiScene } from '../scenes/WebGLUiScene.js';
import { ScrollState } from './ScrollState.js';
import { RouteSync } from './RouteSync.js';
import { HomeSceneStack } from './HomeSceneStack.js';
import { HomeSceneRenderer } from './HomeSceneRenderer.js';
import { DetailTransitionState } from './DetailTransitionState.js';
import { AudioController } from './AudioController.js';

export class MainController {
  constructor({ bus, router, engine, uiContainer }) {
    this.bus = bus;
    this.router = router;
    this.engine = engine;
    this.content = siteContent;
    this.assets = new AssetRegistry(assetManifest, { bus });
    this.audio = new AudioController({
      assets: this.assets,
      content: this.content
    });
    this.ready = false;

    this.routeSync = new RouteSync({ router });
    this.homeSceneStack = new HomeSceneStack({
      sections: this.content.sections
    });
    this.scrollState = new ScrollState({
      min: 0,
      max: this.homeSceneStack.getTotalLength() - 0.001
    });
    this.detailTransition = new DetailTransitionState();

    this.sections = {};
    this.homeRenderer = null;
    this.detailScene = null;
    this.ui = new UIScene({
      container: uiContainer,
      content: this.content
    });
    this.webglUi = null;

    this.route = this.routeSync.getRoute();
    this.currentProject = null;
    this.hoveredProject = null;
    this.homeScrollSnapshot = null;
    this.detailPhases = this.detailTransition.getSnapshot();
    this.scrollIdleDelay = 1.1;
    this.lastScrollInputTime = 0;
    this.lastAutoCenterTime = -Infinity;
    this.homeState = {
      key: this.content.sections[0]?.key ?? null,
      localProgress: 0,
      blend: 0,
      scrollVelocity: 0
    };

    this.onTick = this.onTick.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onPointerClick = this.onPointerClick.bind(this);
    this.onRouteChange = this.onRouteChange.bind(this);

    this.ui.bind({
      onHome: () => this.goHome(),
      onPrevious: () => this.moveToSection(this.homeSceneStack.currentSectionIndex - 1),
      onNext: () => this.moveToSection(this.homeSceneStack.currentSectionIndex + 1),
      onProject: (hash) => this.openProject(hash)
    });

    this.routeSync.onChange(this.onRouteChange);
    this.bus.on('tick', this.onTick);
    this.audio.onChange(() => {
      if (this.ready) {
        this.syncUi();
      }
    });
    window.addEventListener('wheel', this.onWheel, { passive: false });
    this.engine.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.engine.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.engine.renderer.domElement.addEventListener('click', this.onPointerClick);
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
    this.homeSceneStack.setScenes(this.sections);
    this.homeRenderer = new HomeSceneRenderer({
      scenes: this.sections,
      assets: this.assets
    });
    this.webglUi = new WebGLUiScene({
      content: this.content,
      assets: this.assets
    });
    await this.webglUi.ready;
    this.homeRenderer.setOverlayScene(this.webglUi);
    this.detailScene = new DetailScene({ assets: this.assets });
    this.ready = true;

    this.syncHomeScene();
    this.audio.update(0, {
      routeName: this.route.name,
      activeSectionKey: this.homeState?.key ?? null,
      hasProject: Boolean(this.currentProject),
      detailUiProgress: this.detailPhases.uiProgress
    });
    this.syncUi();
  }

  goHome() {
    this.routeSync.goHome();
  }

  setAudioMuted(muted) {
    this.audio?.setMuted(muted);
  }

  toggleAudioMute() {
    this.audio?.toggleMute();
  }

  openProject(hash) {
    const cubesScrollStart = this.homeSceneStack.getScrollStartForKey('cubes');
    this.audio?.play('click-project');

    this.setHoveredProject(null);
    this.homeScrollSnapshot = this.scrollState.current;

    if (this.homeSceneStack.getActiveSection()?.key !== 'cubes') {
      this.scrollState.jumpTo(cubesScrollStart);
      this.syncHomeScene();
    }

    this.routeSync.goProject(hash);
  }

  moveToSection(index) {
    const nextIndex = clamp(index, 0, this.content.sections.length - 1);
    this.markScrollInteraction();
    this.scrollState.setTarget(this.homeSceneStack.getScrollStartForIndex(nextIndex));
  }

  onWheel(event) {
    if (!this.ready || this.route.name !== 'home') {
      return;
    }

    event.preventDefault();
    this.markScrollInteraction();
    this.scrollState.nudge(event.deltaY * 0.0015);
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
      this.markScrollInteraction();
      this.scrollState.nudge(0.16);
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      this.markScrollInteraction();
      this.scrollState.nudge(-0.16);
    }
  }

  markScrollInteraction() {
    this.lastScrollInputTime = performance.now() * 0.001;
  }

  resolveAutoCenterTarget(metric, progress) {
    if (!metric || typeof progress !== 'number') {
      return null;
    }

    return clamp(
      metric.start + progress * (metric.height + 1) - 1,
      this.scrollState.min,
      this.scrollState.max
    );
  }

  getAutoCenterTarget() {
    const { metric, safeScroll } = this.homeSceneStack.getMetricAtScroll(this.scrollState.current);

    if (!metric) {
      return null;
    }

    const currentScene = this.sections[metric.key] ?? null;
    const currentLocal = safeScroll - metric.start;
    const nextMetric = this.homeSceneStack.metrics[metric.index + 1] ?? null;
    const blendWindowStart = Math.max(metric.height - 1, 0);

    if (nextMetric && currentLocal >= blendWindowStart) {
      const overlap = clamp(currentLocal - blendWindowStart, 0, 1);

      if (overlap >= 0.5) {
        const nextScene = this.sections[nextMetric.key] ?? null;
        const nextProgress = nextScene?.getInitialAutoCenterProgress?.() ?? nextMetric.initialScrollAutocenter;
        return this.resolveAutoCenterTarget(nextMetric, nextProgress);
      }

      const currentProgress = currentScene?.getFinalAutoCenterProgress?.()
        ?? currentScene?.getAutoCenterProgress?.()
        ?? metric.finalScrollAutocenter
        ?? metric.initialScrollAutocenter;
      return this.resolveAutoCenterTarget(metric, currentProgress);
    }

    const currentProgress = currentScene?.getAutoCenterProgress?.()
      ?? metric.finalScrollAutocenter
      ?? metric.initialScrollAutocenter;
    return this.resolveAutoCenterTarget(metric, currentProgress);
  }

  maybeAutoCenter(elapsed) {
    if (
      !this.ready
      || this.route.name !== 'home'
      || this.detailTransition.progress > 0.001
      || this.detailTransition.target > 0.001
    ) {
      return;
    }

    if (elapsed - this.lastScrollInputTime < this.scrollIdleDelay) {
      return;
    }

    if (elapsed - this.lastAutoCenterTime < 0.6) {
      return;
    }

    if (
      this.scrollState.velocity > 0.002
      || Math.abs(this.scrollState.target - this.scrollState.current) > 0.002
    ) {
      return;
    }

    const target = this.getAutoCenterTarget();

    if (target == null) {
      return;
    }

    if (
      Math.abs(target - this.scrollState.current) < 0.02
      && Math.abs(target - this.scrollState.target) < 0.02
    ) {
      return;
    }

    this.lastAutoCenterTime = elapsed;
    this.scrollState.setTarget(target);
  }

  isCubesInteractive() {
    if (!this.ready || this.route.name !== 'home') {
      return false;
    }

    if (this.detailTransition.progress > 0.001 || this.detailTransition.target > 0) {
      return false;
    }

    return this.homeSceneStack.getActiveSection()?.key === 'cubes';
  }

  getNormalizedPointer(event) {
    const bounds = this.engine.renderer.domElement.getBoundingClientRect();

    if (!bounds.width || !bounds.height) {
      return null;
    }

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
    };
  }

  pickProjectHitFromEvent(event) {
    if (!this.isCubesInteractive()) {
      this.sections.cubes?.setPointerHit(null);
      return null;
    }

    return this.sections.cubes?.pickProjectHit(this.getNormalizedPointer(event)) ?? null;
  }

  pickProjectFromEvent(event) {
    return this.pickProjectHitFromEvent(event)?.project ?? null;
  }

  setHoveredProject(project = null) {
    const nextHash = project?.hash ?? null;

    if (this.hoveredProject?.hash === nextHash) {
      return;
    }

    this.hoveredProject = project;
    this.sections.cubes?.setHoveredProject(nextHash);
    this.engine.renderer.domElement.style.cursor = nextHash ? 'pointer' : '';
    this.syncUi();
  }

  onPointerMove(event) {
    const pointer = this.getNormalizedPointer(event);
    this.sections.igloo?.setPointer(pointer);
    const hit = this.pickProjectHitFromEvent(event);
    this.sections.cubes?.setPointerHit(hit);
    this.setHoveredProject(hit?.project ?? null);
  }

  onPointerLeave() {
    this.sections.igloo?.setPointer(null);
    this.sections.cubes?.setPointerHit(null);
    this.setHoveredProject(null);
  }

  onPointerClick(event) {
    const hit = this.pickProjectHitFromEvent(event);
    const project = hit?.project ?? null;

    if (!project) {
      return;
    }

    event.preventDefault();
    this.openProject(project.hash);
  }

  onRouteChange(route) {
    if (!this.ready) {
      this.route = route;
      return;
    }

    const previousRoute = this.route;
    const cubesScrollStart = this.homeSceneStack.getScrollStartForKey('cubes');

    this.route = route;

    if (route.name === 'project') {
      const project = this.content.projects.find((entry) => entry.hash === route.params.project);

      if (!project) {
        this.routeSync.replaceHome();
        return;
      }

      this.currentProject = project;
      this.setHoveredProject(null);

      if (this.homeScrollSnapshot == null) {
        this.homeScrollSnapshot = cubesScrollStart;
      }

      if (this.homeSceneStack.getActiveSection()?.key !== 'cubes') {
        this.scrollState.jumpTo(cubesScrollStart);
      }

      this.detailScene.setProject(project);
      this.detailTransition.open();
      this.syncHomeScene();
    } else {
      if (previousRoute.name === 'project') {
        this.scrollState.jumpTo(this.homeScrollSnapshot ?? cubesScrollStart);
      }

      this.detailTransition.close();
      this.syncHomeScene();
    }

    this.syncUi();
  }

  onTick({ delta, elapsed }) {
    if (!this.ready) {
      return;
    }

    if (this.route.name === 'home') {
      this.scrollState.step(delta);
    }

    const detailProgress = this.detailTransition.step(delta);
    this.detailPhases = this.detailTransition.getSnapshot();
    const detailAnchor = this.currentProject
      ? this.sections.cubes?.getDetailAnchor(this.currentProject.hash) ?? null
      : null;

    this.detailScene?.setHandoffAnchor(detailAnchor);
    this.detailScene?.setTransitionProgress(this.detailPhases.sceneProgress);
    this.sections.cubes?.setDetailFocus(this.currentProject?.hash ?? null, this.detailPhases.focusProgress);

    if (!this.isCubesInteractive() && this.hoveredProject) {
      this.setHoveredProject(null);
    }

    this.syncHomeScene();
    this.audio?.update(delta, {
      routeName: this.route.name,
      activeSectionKey: this.homeState?.key ?? null,
      hasProject: Boolean(this.currentProject),
      detailUiProgress: this.detailPhases.uiProgress
    });
    this.maybeAutoCenter(elapsed);

    if (
      this.detailPhases.isOpen
      || (this.route.name === 'home' && ['igloo', 'cubes', 'entry'].includes(this.homeState?.key))
    ) {
      this.syncUi();
    }

    if (this.route.name === 'home' && detailProgress < 0.001 && this.detailTransition.target === 0) {
      this.currentProject = null;
      this.homeScrollSnapshot = null;
      this.sections.cubes?.setDetailFocus(null, 0);
      this.syncUi();
    }
  }

  syncHomeScene() {
    const result = this.homeSceneStack.sync(this.scrollState.current);
    this.homeState = result;

    if (this.homeRenderer) {
      this.homeRenderer.setRenderState({
        ...result,
        detailScene: this.detailScene,
        cubesScene: this.sections.cubes,
        detailBlend: this.detailPhases.overlayProgress,
        detailSceneBlend: this.detailPhases.sceneProgress,
        scrollVelocity: this.scrollState.velocity
      });
      this.engine.setView(this.homeRenderer);
    }

    if (result.changed) {
      this.syncUi();
    }
  }

  syncUi() {
    const activeSection = this.homeSceneStack.getActiveSection();
    const uiState = {
      route: this.route,
      project: this.currentProject,
      hoveredProject: this.hoveredProject,
      activeSectionKey: activeSection?.key ?? null,
      homeSectionProgress: this.homeState?.localProgress ?? 0,
      iglooPresentation: this.sections.igloo?.getPresentationState?.() ?? null,
      cubesPresentation: this.sections.cubes?.getOverlayPresentation?.() ?? null,
      entryPresentation: this.sections.entry?.getPresentationState?.() ?? null,
      detailUiProgress: this.detailPhases.uiProgress,
      interactionLabel: this.currentProject && this.detailPhases.uiProgress > 0.08
        ? (this.content.closeLabel ?? 'Back Home')
        : activeSection?.key === 'entry'
          ? 'Click a portal link or scroll back through the reconstructed flow.'
          : this.hoveredProject
            ? `${this.content.clickLabel ?? 'Click to explore'} ${this.hoveredProject.title}`
            : (this.content.scrollLabel ?? 'Scroll or use arrow keys to move between reconstructed sections.'),
      sectionLabel: this.currentProject && this.detailPhases.uiProgress > 0.35
        ? (this.currentProject.detailTitle ?? this.currentProject.title)
        : (activeSection?.label ?? 'Project Detail')
    };

    this.ui.update({
      ...uiState,
      useWebglUi: this.webglUi?.isReadyForHero?.()
        && uiState.route.name === 'home'
        && ['igloo', 'cubes', 'entry'].includes(uiState.activeSectionKey)
        && !uiState.project
    });
    this.webglUi?.update({
      routeName: uiState.route.name,
      activeSectionKey: uiState.activeSectionKey,
      hasProject: Boolean(uiState.project),
      iglooPresentation: uiState.iglooPresentation,
      cubesPresentation: uiState.cubesPresentation,
      muted: this.audio?.muted ?? this.content.audio?.muted ?? true,
      brand: this.content.brand,
      copyright: this.content.manifesto.copyright,
      rights: this.content.manifesto.rights,
      clickLabel: this.content.clickLabel ?? 'Click to explore',
      manifestoLabel: uiState.iglooPresentation ? 'Manifesto' : this.content.manifesto.title,
      manifestoText: this.content.manifesto.text
    });
  }
}
