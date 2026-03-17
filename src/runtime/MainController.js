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
      max: this.homeSceneStack.getTotalLength() - 0.001
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
    // scroll 停止多久后才允许自动居中。
    this.scrollIdleDelay = 1.1;
    this.lastScrollInputTime = 0;
    this.lastAutoCenterTime = -Infinity;
    // homeState 保存首页当前 section 的运行结果，供渲染和 UI 消费。
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

    // 把 DOM HUD 的按钮行为接回主控制器。
    this.ui.bind({
      onHome: () => this.goHome(),
      onPrevious: () => this.moveToSection(this.homeSceneStack.currentSectionIndex - 1),
      onNext: () => this.moveToSection(this.homeSceneStack.currentSectionIndex + 1),
      onProject: (hash) => this.openProject(hash)
    });

    // 注册运行时事件：路由变化、每帧 tick、音频状态变化、输入事件等。
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
    // 先初始化 loader，再统一预加载首页所需几何和贴图资源。
    await this.assets.init(this.engine.renderer);
    await this.assets.preload(['geometry', 'texture']);

    // 创建首页 3 个主 section scene。
    this.sections = {
      igloo: new IglooScene({ assets: this.assets }),
      cubes: new CubesScene({
        assets: this.assets,
        projects: this.content.projects
      }),
      entry: new EntryScene({ assets: this.assets })
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
      assets: this.assets
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
    this.routeSync.goHome();
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
    const cubesScrollStart = this.homeSceneStack.getScrollStartForKey('cubes');
    this.audio?.play('click-project');

    // 点开项目前清掉 hover，并记住当前首页位置，便于返回时恢复。
    this.setHoveredProject(null);
    this.homeScrollSnapshot = this.scrollState.current;

    // detail 始终从 cubes section 进入，所以如果当前不在 cubes，先跳过去。
    if (this.homeSceneStack.getActiveSection()?.key !== 'cubes') {
      this.scrollState.jumpTo(cubesScrollStart);
      this.syncHomeScene();
    }

    this.routeSync.goProject(hash);
  }

  moveToSection(index) {
    // 这里不是立即跳转，而是改写 scroll target，让 ScrollState 平滑推进过去。
    const nextIndex = clamp(index, 0, this.content.sections.length - 1);
    this.markScrollInteraction();
    this.scrollState.setTarget(this.homeSceneStack.getScrollStartForIndex(nextIndex));
  }

  onWheel(event) {
    // 只有首页状态才消费滚轮；detail 打开后滚轮不再驱动首页滚动。
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

    // 详情页里 Esc 直接回首页。
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
    // 统一记录最近一次用户主动滚动输入的时间。
    // maybeAutoCenter 会用它来判断“是否已经静止足够久”。
    this.lastScrollInputTime = performance.now() * 0.001;
  }

  resolveAutoCenterTarget(metric, progress) {
    if (!metric || typeof progress !== 'number') {
      return null;
    }

    // HomeSceneStack 的 progress 是“带缓冲”的局部进度，
    // 这里把局部 progress 重新映射回整条首页 scroll 轴上的绝对位置。
    return clamp(
      metric.start + progress * (metric.height + 1) - 1,
      this.scrollState.min,
      this.scrollState.max
    );
  }

  getAutoCenterTarget() {
    // 自动居中的目标不是固定写死的，而是由当前 section / 下一 section
    // 各自暴露的 auto-center 进度动态决定。
    const { metric, safeScroll } = this.homeSceneStack.getMetricAtScroll(this.scrollState.current);

    if (!metric) {
      return null;
    }

    const currentScene = this.sections[metric.key] ?? null;
    const currentLocal = safeScroll - metric.start;
    const nextMetric = this.homeSceneStack.metrics[metric.index + 1] ?? null;
    const blendWindowStart = Math.max(metric.height - 1, 0);

    // 当滚动已经进入 section 尾部的混合窗口时，需要判断：
    // 当前应该继续吸附在当前 section，还是提前吸附到下一个 section。
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
    // 自动居中只在首页且 detail 完全关闭时发生。
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
      // 只要滚动还在明显运动中，就不主动抢控制权。
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
    // cube hover / pick 只在首页 cubes section 可用，
    // 否则指针事件应该被忽略，避免和 detail 过渡冲突。
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

    // 把屏幕坐标转换成 Three.js 射线拾取使用的 NDC 坐标。
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
    };
  }

  pickProjectHitFromEvent(event) {
    if (!this.isCubesInteractive()) {
      // 一旦离开 cubes 可交互态，立刻清掉 pick 状态。
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

    // hoveredProject 是 UI 和 CubesScene 的共享 hover 状态。
    this.hoveredProject = project;
    this.sections.cubes?.setHoveredProject(nextHash);
    this.engine.renderer.domElement.style.cursor = nextHash ? 'pointer' : '';
    this.syncUi();
  }

  onPointerMove(event) {
    // IglooScene 与 CubesScene 共用 pointer move，但消费方式不同：
    // - IglooScene 用它做 hover 反馈
    // - CubesScene 用它做射线拾取和 hover project
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
      // init 前先记住 route，等资源和 scene 就绪后再进入完整同步逻辑。
      this.route = route;
      return;
    }

    const previousRoute = this.route;
    const cubesScrollStart = this.homeSceneStack.getScrollStartForKey('cubes');

    this.route = route;

    if (route.name === 'project') {
      // 进入 detail 路由时，先根据 hash 找项目数据。
      const project = this.content.projects.find((entry) => entry.hash === route.params.project);

      if (!project) {
        // 不合法的项目 hash 直接兜底回首页，避免运行时悬空。
        this.routeSync.replaceHome();
        return;
      }

      this.currentProject = project;
      this.setHoveredProject(null);

      if (this.homeScrollSnapshot == null) {
        // 如果是直接首屏进入 /portfolio/:project，没有首页快照时默认以 cubes 起点兜底。
        this.homeScrollSnapshot = cubesScrollStart;
      }

      if (this.homeSceneStack.getActiveSection()?.key !== 'cubes') {
        // detail 的视觉接力必须从 cubes 场景起步。
        this.scrollState.jumpTo(cubesScrollStart);
      }

      this.detailScene.setProject(project);
      this.detailTransition.open();
      this.syncHomeScene();
    } else {
      // 从 detail 返回首页时，尽量恢复之前记录的首页位置。
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

    // 首页状态下，scrollState 每帧向 target 逼近。
    if (this.route.name === 'home') {
      this.scrollState.step(delta);
    }

    // detailTransition 每帧推进，并拆解出更细的多段进度。
    const detailProgress = this.detailTransition.step(delta);
    this.detailPhases = this.detailTransition.getSnapshot();
    // detailAnchor 来自当前被选中的 cube，用于首页对象 -> detail 对象的镜头接续。
    const detailAnchor = this.currentProject
      ? this.sections.cubes?.getDetailAnchor(this.currentProject.hash) ?? null
      : null;

    this.detailScene?.setHandoffAnchor(detailAnchor);
    this.detailScene?.setTransitionProgress(this.detailPhases.sceneProgress);
    this.sections.cubes?.setDetailFocus(this.currentProject?.hash ?? null, this.detailPhases.focusProgress);

    if (!this.isCubesInteractive() && this.hoveredProject) {
      this.setHoveredProject(null);
    }

    // 每帧都重新同步首页 section 状态，再把结果交给 renderer。
    this.syncHomeScene();
    this.audio?.update(delta, {
      routeName: this.route.name,
      activeSectionKey: this.homeState?.key ?? null,
      hasProject: Boolean(this.currentProject),
      detailUiProgress: this.detailPhases.uiProgress
    });
    this.maybeAutoCenter(elapsed);

    // 首页 section 和 detail overlay 都依赖实时 UI，所以在这些状态下持续刷新 HUD。
    if (
      this.detailPhases.isOpen
      || (this.route.name === 'home' && ['igloo', 'cubes', 'entry'].includes(this.homeState?.key))
    ) {
      this.syncUi();
    }

    // 当 detail 已经完全收拢回首页后，再清掉当前项目和快照，
    // 避免返回动画中途就把依赖状态提前清空。
    if (this.route.name === 'home' && detailProgress < 0.001 && this.detailTransition.target === 0) {
      this.currentProject = null;
      this.homeScrollSnapshot = null;
      this.sections.cubes?.setDetailFocus(null, 0);
      this.syncUi();
    }
  }

  syncHomeScene() {
    // HomeSceneStack 根据 scrollValue 产出当前首页 section 的整体状态。
    const result = this.homeSceneStack.sync(this.scrollState.current);
    this.homeState = result;

    if (this.homeRenderer) {
      // HomeSceneRenderer 需要同时知道：
      // - 当前 / 下一首页场景
      // - detail overlay 的进度
      // - cubes scene（detail handoff 用）
      // - 当前滚动速度（给合成 shader 用）
      this.homeRenderer.setRenderState({
        ...result,
        detailScene: this.detailScene,
        cubesScene: this.sections.cubes,
        detailBlend: this.detailPhases.overlayProgress,
        detailSceneBlend: this.detailPhases.sceneProgress,
        scrollVelocity: this.scrollState.velocity
      });
      // 这里把 Engine 的当前 view 切换为 homeRenderer，
      // 让引擎执行多场景离屏渲染与最终合成，而不是直接 render 某个 scene。
      this.engine.setView(this.homeRenderer);
    }

    if (result.changed) {
      this.syncUi();
    }
  }

  syncUi() {
    // 先生成一份统一的 UI 状态，再同时喂给 DOM HUD 和 WebGL HUD。
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

    // DOM HUD 仍然是当前功能最完整的 UI，因此一直保持同步。
    this.ui.update({
      ...uiState,
      // useWebglUi 只在首页 hero section 启用，
      // detail 打开后或 WebGL HUD 资源未准备好时，DOM HUD 继续兜底。
      useWebglUi: this.webglUi?.isReadyForHero?.()
        && uiState.route.name === 'home'
        && ['igloo', 'cubes', 'entry'].includes(uiState.activeSectionKey)
        && !uiState.project
    });
    // WebGL HUD 更偏视觉表现层，所以只喂给它必要的显示状态。
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
