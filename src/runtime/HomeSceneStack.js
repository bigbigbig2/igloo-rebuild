import { clamp } from '../utils/math.js';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * HomeSceneStack 把首页 section 列表映射成一个连续滚动坐标系。
 *
 * 它解决的是两个问题：
 * 1. 当前滚动值落在哪个 section；
 * 2. 当前 section 与下一个 section 应该如何交接。
 *
 * MainController 只需要把当前 scrollValue 喂进来，
 * HomeSceneStack 就会产出当前 section、下一个 section、局部进度、
 * 以及场景切换时需要的 blend / enter / exit 状态。
 */
export class HomeSceneStack {
  constructor({ sections = [] } = {}) {
    // 原始 section 配置，来自 siteContent.sections。
    this.sections = sections;
    // 保留一份按顺序排列的 key，方便通过 key 反查 index。
    this.order = sections.map((section) => section.key);
    // 这里存放真正的 Scene 实例，后续由 MainController 注入。
    this.scenes = {};
    // 当前激活 section 的索引，会在 sync() 时持续更新。
    this.currentSectionIndex = 0;
    // metrics 是 section 在连续滚动空间中的“测量结果”。
    this.metrics = [];
    // 首页所有 section 高度累计后的总长度。
    this.totalLength = 0;
    this.refreshMetrics();
  }

  refreshMetrics() {
    // start 表示当前 section 在整条首页滚动轴上的起点。
    let start = 0;

    this.metrics = this.sections.map((section, index) => {
      // 每个 section 至少占据极小的正长度，避免 0 高导致除零或命中异常。
      const height = Math.max(section.height ?? 1, 0.001);
      const metric = {
        ...section,
        index,
        // start / end 将离散的 section 编排成一个连续区间。
        start,
        end: start + height,
        height
      };
      start += height;
      return metric;
    });

    this.totalLength = start;
  }

  setScenes(scenes) {
    this.scenes = scenes;
  }

  getTotalLength() {
    return this.totalLength;
  }

  getIndexForKey(key) {
    const index = this.order.indexOf(key);
    return index >= 0 ? index : 0;
  }

  getScrollStartForIndex(index) {
    // 对外只暴露安全索引，避免调用方传入越界值。
    const safeIndex = clamp(index, 0, this.metrics.length - 1);
    return this.metrics[safeIndex]?.start ?? 0;
  }

  getScrollStartForKey(key) {
    return this.getScrollStartForIndex(this.getIndexForKey(key));
  }

  getActiveSection() {
    return this.sections[this.currentSectionIndex] ?? null;
  }

  getMetricAtScroll(scrollValue) {
    // scrollValue 总是先被钳制到合法范围内，再决定当前 section。
    const safeScroll = clamp(scrollValue, 0, Math.max(this.totalLength - 0.001, 0));
    const metric = this.metrics.find((entry) => safeScroll >= entry.start && safeScroll < entry.end)
      ?? this.metrics[this.metrics.length - 1]
      ?? null;

    return {
      metric,
      safeScroll
    };
  }

  sync(scrollValue) {
    // 记录上一次 section，用于告诉上层“是否刚刚切换了 section”。
    const previousSectionIndex = this.currentSectionIndex;
    const { metric: currentMetric, safeScroll } = this.getMetricAtScroll(scrollValue);

    if (!currentMetric) {
      // 没有 section 时返回一个空结果，避免上层再做额外判空。
      return {
        changed: false,
        sectionIndex: 0,
        localProgress: 0,
        rawProgress: 0,
        key: null,
        scene: null,
        nextIndex: null,
        nextKey: null,
        nextScene: null,
        blend: 0
      };
    }

    // 当前滚动值在当前 section 内部的局部位置。
    const currentLocal = safeScroll - currentMetric.start;
    // currentProgress 会额外预留 1 个单位的“前置缓冲”，
    // 让 scene 在 section 刚进入时不至于立刻从 0 硬起跳。
    const currentProgress = clamp01((currentLocal + 1) / (currentMetric.height + 1));
    // rawProgress 更接近真实 section 内部进度，通常给更直接的逻辑使用。
    const rawProgress = clamp01(currentLocal / currentMetric.height);
    const nextMetric = this.metrics[currentMetric.index + 1] ?? null;
    // 每个 section 最后的 1 个单位作为与下一 section 的混合窗口。
    const blendWindowStart = Math.max(currentMetric.height - 1, 0);
    const blend = nextMetric
      ? clamp01(currentLocal - blendWindowStart)
      : 0;
    const isTransitioning = blend > 0.001;
    // nextProgress 也是带缓冲的局部进度，只在 next scene 进入时使用。
    const nextProgress = nextMetric
      ? clamp01(blend / (nextMetric.height + 1))
      : 0;
    const key = currentMetric.key;
    const nextKey = nextMetric?.key ?? null;
    const scene = this.scenes[key] ?? null;
    const nextScene = nextKey ? this.scenes[nextKey] ?? null : null;

    this.currentSectionIndex = currentMetric.index;

    Object.entries(this.scenes).forEach(([sectionKey, sectionScene]) => {
      // 默认情况下，所有 scene 都视为非激活状态。
      let role = 'inactive';
      let progress = 0;
      let enterProgress = 0;
      let exitProgress = 0;
      let previousKey = null;

      if (sectionKey === key) {
        // 当前 section 持有主导权，它的 progress 来自 currentProgress，
        // 同时在混合窗口中会带着 exitProgress 离场。
        role = 'current';
        progress = currentProgress;
        exitProgress = blend;
      } else if (sectionKey === nextKey && isTransitioning) {
        // 只有当进入混合窗口后，下一个 scene 才会被标记为 next。
        role = 'next';
        progress = nextProgress;
        enterProgress = blend;
        previousKey = key;
      }

      // SceneBase 约定所有 scene 都实现统一接口，
      // 所以这里可以把 section 编排结果直接广播给每个场景。
      sectionScene.setActive(role === 'current' || role === 'next');
      sectionScene.setProgress(progress);
      sectionScene.setTransitionState?.({
        role,
        sectionKey,
        currentKey: key,
        previousKey,
        nextKey,
        blend,
        enterProgress,
        exitProgress,
        isTransitioning
      });
    });

    return {
      // changed 只关注“当前 section 索引是否变化”，
      // 不关心 section 内部 progress 的变化。
      changed: previousSectionIndex !== currentMetric.index,
      sectionIndex: currentMetric.index,
      localProgress: currentProgress,
      rawProgress,
      key,
      scene,
      nextIndex: nextMetric?.index ?? null,
      nextKey,
      nextScene,
      blend
    };
  }
}
