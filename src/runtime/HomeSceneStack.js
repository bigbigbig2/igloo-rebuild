import { clamp } from '../utils/math.js';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export class HomeSceneStack {
  constructor({ sections = [] } = {}) {
    this.sections = sections;
    this.order = sections.map((section) => section.key);
    this.scenes = {};
    this.currentSectionIndex = 0;
    this.metrics = [];
    this.totalLength = 0;
    this.refreshMetrics();
  }

  refreshMetrics() {
    let start = 0;

    this.metrics = this.sections.map((section, index) => {
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
    const previousSectionIndex = this.currentSectionIndex;
    const { metric: currentMetric, safeScroll } = this.getMetricAtScroll(scrollValue);

    if (!currentMetric) {
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

    const currentLocal = safeScroll - currentMetric.start;
    const currentProgress = clamp01((currentLocal + 1) / (currentMetric.height + 1));
    const rawProgress = clamp01(currentLocal / currentMetric.height);
    const nextMetric = this.metrics[currentMetric.index + 1] ?? null;
    const blendWindowStart = Math.max(currentMetric.height - 1, 0);
    const blend = nextMetric
      ? clamp01(currentLocal - blendWindowStart)
      : 0;
    const isTransitioning = blend > 0.001;
    const nextProgress = nextMetric
      ? clamp01(blend / (nextMetric.height + 1))
      : 0;
    const key = currentMetric.key;
    const nextKey = nextMetric?.key ?? null;
    const scene = this.scenes[key] ?? null;
    const nextScene = nextKey ? this.scenes[nextKey] ?? null : null;

    this.currentSectionIndex = currentMetric.index;

    Object.entries(this.scenes).forEach(([sectionKey, sectionScene]) => {
      let role = 'inactive';
      let progress = 0;
      let enterProgress = 0;
      let exitProgress = 0;
      let previousKey = null;

      if (sectionKey === key) {
        role = 'current';
        progress = currentProgress;
        exitProgress = blend;
      } else if (sectionKey === nextKey && isTransitioning) {
        role = 'next';
        progress = nextProgress;
        enterProgress = blend;
        previousKey = key;
      }

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
