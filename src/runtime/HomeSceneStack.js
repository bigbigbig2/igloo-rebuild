import { clamp } from '../utils/math.js';

function clamp01(value) {
  // 这里频繁需要把各种局部进度收敛到 0~1。
  return Math.min(Math.max(value, 0), 1);
}

function wrapValue(value, length) {
  // 首页滚动轴在 wrap 模式下是一个环。
  // 这个工具把任意实数位置折回到 [0, length) 区间，
  // 这样后面的 section 命中逻辑就可以始终按一条有限轴来处理。
  if (length <= 1e-6) {
    return 0;
  }

  return ((value % length) + length) % length;
}

/**
 * HomeSceneStack 的职责不是渲染，而是“编排首页的三段场景”。
 *
 * 它维护一条抽象的首页滚动轴：
 * - 每个首页 section 在轴上占据一段长度
 * - 当前 scrollValue 会被映射成“当前 section 是谁”
 * - 同时还会算出当前 section 的局部进度、下一 section 的进入进度、
 *   以及两者之间的过渡混合值 blend
 *
 * 然后它把这些结果统一广播给各个 scene：
 * - scene.setActive(...)
 * - scene.setProgress(...)
 * - scene.setTransitionState(...)
 *
 * 这样每个 scene 只关心“收到什么进度后怎么表现”，
 * 而不用自己关心首页整条滚动轴的分段和切换规则。
 */
export class HomeSceneStack {
  constructor({ sections = [] } = {}) {
    // sections 是内容层给出的首页结构描述。
    // 典型形状：
    // { key, label, height, ... }
    this.sections = sections;
    // order 用于 key -> index 的快速反查。
    this.order = sections.map((section) => section.key);
    // scenes 会在外部实例化完各个 section scene 后注入进来。
    this.scenes = {};
    // currentSectionIndex 记录“当前首页激活的是哪一段”。
    this.currentSectionIndex = 0;
    // metrics 是把抽象 section 转成滚动轴区间后的缓存结果。
    this.metrics = [];
    // totalLength 是整条首页滚动轴的长度。
    this.totalLength = 0;
    this.refreshMetrics();
  }

  refreshMetrics() {
    // refreshMetrics 把 sections 重新投影成一条连续滚动轴。
    // 每个 section 都会得到：
    // - start: 在整条轴上的起点
    // - end:   在整条轴上的终点
    // - height: 自己占据的长度
    let start = 0;

    this.metrics = this.sections.map((section, index) => {
      // height 至少保底一个很小的正数，避免除 0 或区间退化。
      const height = Math.max(section.height ?? 1, 0.001);
      const metric = {
        ...section,
        index,
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
    // scenes 的 key 应与 sections 中的 key 对齐：
    // { igloo, cubes, entry, ... }
    this.scenes = scenes;
  }

  getTotalLength() {
    return this.totalLength;
  }

  getIndexForKey(key) {
    // 找不到时回退到 0，避免调用方拿到 -1 再继续传递。
    const index = this.order.indexOf(key);
    return index >= 0 ? index : 0;
  }

  getScrollStartForIndex(index) {
    // 给外部提供“跳到某个首页 section 的起点”能力。
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
    // ScrollState 在 wrap 模式下可能持续增长或减少，
    // 这里先把它折回当前首页轴长度之内，再判断它落在哪个 section。
    const safeScroll = wrapValue(scrollValue, this.totalLength);
    const metric = this.metrics.find((entry) => safeScroll >= entry.start && safeScroll < entry.end)
      ?? this.metrics[this.metrics.length - 1]
      ?? null;

    return {
      metric,
      safeScroll
    };
  }

  sync(scrollValue) {
    // sync 是这个类的核心：
    // 输入一个“首页滚动位置”，输出当前 section 状态，
    // 并把这些状态同步进所有 scene。
    const previousSectionIndex = this.currentSectionIndex;
    const { metric: currentMetric, safeScroll } = this.getMetricAtScroll(scrollValue);

    if (!currentMetric) {
      // 理论上不会频繁发生，除非 sections 为空。
      // 这里返回一个完整但空的结果，调用方就不需要做额外判空分支。
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

    // currentLocal 是当前位置在当前 section 内部的偏移量。
    const currentLocal = safeScroll - currentMetric.start;
    // currentProgress 是给 scene 用的“带缓冲局部进度”：
    // 它不是严格从 0 到 1，而是使用 (local + 1) / (height + 1)。
    // 这么做可以让 scene 在 section 起点附近就提前得到一点点进度，
    // 常用于让显隐、相机、shader 过渡更柔和，不会硬切。
    const currentProgress = clamp01((currentLocal + 1) / (currentMetric.height + 1));
    // rawProgress 是更“数学意义上”的真实局部进度，
    // 更适合做调试、日志或需要精确映射的逻辑。
    const rawProgress = clamp01(currentLocal / currentMetric.height);
    // 首页是循环的，所以“下一个 section”允许从最后一个回到第一个。
    const nextMetric = this.metrics.length > 1
      ? this.metrics[(currentMetric.index + 1) % this.metrics.length]
      : null;
    // 每个 section 的最后 1 个滚动单位作为过渡混合窗口。
    // 一旦进入这个窗口，就开始同时驱动 current 和 next 两个 scene。
    const blendWindowStart = Math.max(currentMetric.height - 1, 0);
    const blend = nextMetric
      ? clamp01(currentLocal - blendWindowStart)
      : 0;
    const isTransitioning = blend > 0.001;
    // nextProgress 也是带缓冲的，让下一段 scene 在刚进入混合窗口时
    // 就能以较小的初始进度开始“醒来”。
    const nextProgress = nextMetric
      ? clamp01(blend / (nextMetric.height + 1))
      : 0;
    const key = currentMetric.key;
    const nextKey = nextMetric && nextMetric.index !== currentMetric.index
      ? nextMetric.key
      : null;
    const scene = this.scenes[key] ?? null;
    const nextScene = nextKey ? this.scenes[nextKey] ?? null : null;

    this.currentSectionIndex = currentMetric.index;

    Object.entries(this.scenes).forEach(([sectionKey, sectionScene]) => {
      // 默认情况下，其它 section 都处于 inactive。
      let role = 'inactive';
      let progress = 0;
      let enterProgress = 0;
      let exitProgress = 0;
      let previousKey = null;

      if (sectionKey === key) {
        // 当前 section 负责输出主要画面。
        role = 'current';
        progress = currentProgress;
        // 当 blend 上升时，当前 section 也能知道自己正在“退出”。
        exitProgress = blend;
      } else if (sectionKey === nextKey && isTransitioning) {
        // next section 只有在进入混合窗口后才真正参与进来。
        role = 'next';
        progress = nextProgress;
        // enterProgress 与 exitProgress 共享同一条 blend，
        // 只是语义上分别给“即将进入的 scene”和“即将退出的 scene”使用。
        enterProgress = blend;
        previousKey = key;
      }

      // setActive 用于粗粒度控制：非 current / next 的 scene
      // 可以选择跳过昂贵更新、隐藏某些对象或关闭交互。
      sectionScene.setActive(role === 'current' || role === 'next');
      // setProgress 是每个首页 scene 最常消费的输入。
      sectionScene.setProgress(progress);
      // setTransitionState 提供的是“更完整的上下文”：
      // scene 不仅知道自己进度是多少，也知道自己当前扮演什么角色，
      // 以及这次过渡的另一端是谁。
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
      // changed 只表示 section 边界是否切换，
      // 不表示局部进度或 blend 是否变化。
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
