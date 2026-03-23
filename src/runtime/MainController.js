import { AssetRegistry } from '../core/AssetRegistry.js';
import { assetManifest } from '../content/assetManifest.js';
import { siteContent } from '../content/siteContent.js';
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
import { HomeScrollCoordinator } from './coordinators/HomeScrollCoordinator.js';
import { PointerCoordinator } from './coordinators/PointerCoordinator.js';
import { RouteCoordinator } from './coordinators/RouteCoordinator.js';
import { UiSyncCoordinator } from './coordinators/UiSyncCoordinator.js';
import { EntryInteractionCoordinator } from './coordinators/EntryInteractionCoordinator.js';
import { HomeSceneCoordinator } from './coordinators/HomeSceneCoordinator.js';
import { FrameCoordinator } from './coordinators/FrameCoordinator.js';

/**
 * MainController 是整个运行时的总调度器。
 *
 * 它不负责具体的视觉细节，而是统一协调：
 * - 资源初始化
 * - 首页 section 编排
 * - route 与 detail overlay 的切换
 * - 指针 / 键盘 / 滚轮输入
 * - DOM HUD 与 WebGL HUD 的同步
 * - 音频状态
 *
 * 可以把它理解成“应用状态机 + 场景编排器”。
 */
export class MainController {
  constructor({ bus, router, engine, uiContainer }) {
    // -------- 基础依赖 --------
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

    // -------- 运行时子状态机 --------
    // routeSync 负责把底层 Router 包装成更贴近业务的导航接口。
    this.routeSync = new RouteSync({ router });
    // homeSceneStack 把首页 section 编排成一条连续滚动轴。
    this.homeSceneStack = new HomeSceneStack({
      sections: this.content.sections
    });
    // scrollState 存储首页滚动的 current / target / velocity。
    this.scrollState = new ScrollState({
      min: 0,
      max: this.homeSceneStack.getTotalLength(),
      wrap: true
    });
    // detailTransition 管理首页 -> 详情页的分段进度。
    this.detailTransition = new DetailTransitionState();

    // -------- 视图对象 --------
    this.sections = {};
    this.homeRenderer = null;
    this.detailScene = null;
    this.ui = new UIScene({
      container: uiContainer,
      content: this.content
    });
    this.webglUi = null;

    // -------- 路由 / 交互状态 --------
    this.route = this.routeSync.getRoute();
    this.currentProject = null;
    this.hoveredProject = null;
    // 进入 detail 前记录首页 scroll 位置，返回时恢复。
    this.homeScrollSnapshot = null;
    // detailPhases 是 detailTransition 的快照，拆分了多个子进度。
    this.detailPhases = this.detailTransition.getSnapshot();
    this.pendingProjectEnterAudio = null;
    this.pendingProjectTextAudio = null;
    // scroll 停止多久后才允许自动居中。
    this.scrollIdleDelay = 1.1;
    this.lastScrollInputTime = 0;
    this.lastAutoCenterTime = -Infinity;
    this.entryInteractionAudioEnabled = false;
    // homeState 保存首页当前 section 的运行结果，供渲染和 UI 消费。
    this.homeState = {
      key: this.content.sections[0]?.key ?? null,
      localProgress: 0,
      blend: 0,
      scrollVelocity: 0
    };
    this.homeScrollCoordinator = new HomeScrollCoordinator(this);
    this.pointerCoordinator = new PointerCoordinator(this);
    this.routeCoordinator = new RouteCoordinator(this);
    this.uiSyncCoordinator = new UiSyncCoordinator(this);
    this.entryInteractionCoordinator = new EntryInteractionCoordinator(this);
    this.homeSceneCoordinator = new HomeSceneCoordinator(this);
    this.frameCoordinator = new FrameCoordinator(this);
    this.cleanupCallbacks = [];

    this.onTick = this.onTick.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onPointerClick = this.onPointerClick.bind(this);
    this.onRouteChange = this.onRouteChange.bind(this);

    // 把 DOM HUD 的按钮行为接回主控制器。
    this.ui.bind({
      onHome: () => this.goHome(),
      onPrevious: () => this.moveToSection(this.homeSceneStack.currentSectionIndex - 1),
      onNext: () => this.moveToSection(this.homeSceneStack.currentSectionIndex + 1),
      onProject: (hash) => this.openProject(hash),
      onEntryLinkPreview: (index) => this.previewEntryLink(index),
      onEntryLinkPreviewClear: () => this.clearEntryLinkPreview(),
      onEntryLinkSelect: (index) => this.activateEntryLink(index),
      onEntryLinkVisit: (index) => this.visitEntryLink(index),
      onEntryLinkCycle: (direction) => this.cycleEntryLink(direction)
    });

    // 注册运行时事件：路由变化、每帧 tick、音频状态变化、输入事件等。
    this.cleanupCallbacks.push(this.routeSync.onChange(this.onRouteChange));
    this.cleanupCallbacks.push(this.bus.on('tick', this.onTick));
    this.cleanupCallbacks.push(this.audio.onChange(() => {
      if (this.ready) {
        this.syncUi();
      }
    }));
    window.addEventListener('wheel', this.onWheel, { passive: false });
    this.engine.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.engine.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.engine.renderer.domElement.addEventListener('click', this.onPointerClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  async init() {
    // 先初始化 loader，再统一预加载首页所需几何和贴图资源。
    await this.assets.init(this.engine.renderer);
    await this.assets.preload(['geometry', 'texture']);

    // 创建首页 3 个主 section scene。
    this.sections = {
      igloo: new IglooScene({ assets: this.assets }),
      cubes: new CubesScene({
        assets: this.assets,
        projects: this.content.projects,
        clickLabel: this.content.clickLabel
      }),
      entry: new EntryScene({
        assets: this.assets,
        links: this.content.links
      })
    };
    // 把 scene 实例注入 HomeSceneStack，后续由它统一广播 progress 和 transitionState。
    this.homeSceneStack.setScenes(this.sections);
    // 首页并不是直接 render 某个 scene，而是通过 HomeSceneRenderer 做多场景合成。
    this.homeRenderer = new HomeSceneRenderer({
      scenes: this.sections,
      assets: this.assets
    });
    // WebGL HUD 与首页合成渲染器关联，作为最上层 overlay scene 使用。
    this.webglUi = new WebGLUiScene({
      content: this.content,
      assets: this.assets,
      audio: this.audio
    });
    await this.webglUi.ready;
    this.homeRenderer.setOverlayScene(this.webglUi);
    // DetailScene 独立存在，但会被首页 renderer 作为 overlay 混入。
    this.detailScene = new DetailScene({ assets: this.assets });
    this.ready = true;

    // 初始化一次首页状态、音频状态和 HUD。
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
    this.routeCoordinator.goHome();
  }

  setAudioMuted(muted) {
    this.audio?.setMuted(muted);
  }

  toggleAudioMute() {
    this.audio?.toggleMute();
  }

  replayIglooIntro() {
    if (!this.ready) {
      return;
    }

    // 无论用户当前在哪，都先把首页定位回 igloo section 再重播开场。
    const iglooScrollStart = this.homeSceneStack.getScrollStartForKey('igloo');
    const runReplay = () => {
      this.scrollState.jumpTo(iglooScrollStart);
      this.syncHomeScene();
      this.sections.igloo?.replayIntro?.();
      this.syncUi();
    };

    if (this.route.name !== 'home') {
      this.routeSync.goHome();
      requestAnimationFrame(runReplay);
      return;
    }

    runReplay();
  }

  openProject(hash) {
    this.routeCoordinator.openProject(hash);
  }

  isEntryInteractive() {
    return this.entryInteractionCoordinator.isEntryInteractive();
  }

  previewEntryLink(index) {
    this.entryInteractionCoordinator.previewEntryLink(index);
  }

  clearEntryLinkPreview() {
    this.entryInteractionCoordinator.clearEntryLinkPreview();
  }

  activateEntryLink(index) {
    this.entryInteractionCoordinator.activateEntryLink(index);
  }

  visitEntryLink(index) {
    this.entryInteractionCoordinator.visitEntryLink(index);
  }

  cycleEntryLink(direction = 1) {
    this.entryInteractionCoordinator.cycleEntryLink(direction);
  }

  moveToSection(index) {
    this.homeScrollCoordinator.moveToSection(index);
  }

  onWheel(event) {
    this.homeScrollCoordinator.onWheel(event);
  }

  onKeyDown(event) {
    this.homeScrollCoordinator.onKeyDown(event);
  }

  markScrollInteraction() {
    this.homeScrollCoordinator.markScrollInteraction();
  }

  centerScroll(value, duration = 1.6) {
    this.homeScrollCoordinator.centerScroll(value, duration);
  }

  resolveAutoCenterTarget(metric, progress) {
    return this.homeScrollCoordinator.resolveAutoCenterTarget(metric, progress);
  }

  getAutoCenterTarget() {
    return this.homeScrollCoordinator.getAutoCenterTarget();
  }

  maybeAutoCenter(elapsed) {
    this.homeScrollCoordinator.maybeAutoCenter(elapsed);
  }

  isCubesInteractive() {
    return this.pointerCoordinator.isCubesInteractive();
  }

  getNormalizedPointer(event) {
    return this.pointerCoordinator.getNormalizedPointer(event);
  }

  pickProjectHitFromEvent(event) {
    return this.pointerCoordinator.pickProjectHitFromEvent(event);
  }

  pickProjectFromEvent(event) {
    return this.pointerCoordinator.pickProjectFromEvent(event);
  }

  setHoveredProject(project = null) {
    this.pointerCoordinator.setHoveredProject(project);
  }

  onPointerMove(event) {
    this.pointerCoordinator.onPointerMove(event);
  }

  onPointerLeave() {
    this.pointerCoordinator.onPointerLeave();
  }

  onPointerClick(event) {
    this.pointerCoordinator.onPointerClick(event);
  }

  onRouteChange(route) {
    this.routeCoordinator.handleRouteChange(route);
  }

  onTick({ delta, elapsed }) {
    this.frameCoordinator.onTick({ delta, elapsed });
  }

  syncHomeScene() {
    this.homeSceneCoordinator.syncHomeScene();
  }

  syncUi() {
    this.uiSyncCoordinator.syncUi();
  }

  destroy() {
    this.cleanupCallbacks.forEach((cleanup) => cleanup?.());
    this.cleanupCallbacks = [];

    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.engine.renderer.domElement.removeEventListener(
      'pointermove',
      this.onPointerMove
    );
    this.engine.renderer.domElement.removeEventListener(
      'pointerleave',
      this.onPointerLeave
    );
    this.engine.renderer.domElement.removeEventListener(
      'click',
      this.onPointerClick
    );

    this.routeSync?.destroy?.();
    this.detailTransition?.dispose?.();
    this.audio?.dispose?.();
    this.ui?.root?.remove?.();
  }
}
