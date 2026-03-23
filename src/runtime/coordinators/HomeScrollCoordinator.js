import { clamp } from '../../utils/math.js';

export class HomeScrollCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  moveToSection(index) {
    const controller = this.controller;
    const nextIndex = clamp(index, 0, controller.content.sections.length - 1);

    this.markScrollInteraction();
    controller.scrollState.setTarget(
      controller.homeSceneStack.getScrollStartForIndex(nextIndex)
    );
  }

  onWheel(event) {
    const controller = this.controller;

    if (!controller.ready || controller.route.name !== 'home') {
      return;
    }

    event.preventDefault();
    this.markScrollInteraction();

    const deltaModeFactor =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? window.innerHeight
          : 1;
    const normalizedDelta = clamp(event.deltaY * deltaModeFactor, -72, 72);
    const wheelScale =
      controller.homeSceneStack.getActiveSection()?.key === 'cubes'
        ? 0.0011
        : 0.0009;

    controller.scrollState.nudge(normalizedDelta * wheelScale);
  }

  onKeyDown(event) {
    const controller = this.controller;

    if (!controller.ready) {
      return;
    }

    if (event.key === 'Escape' && controller.route.name === 'project') {
      controller.goHome();
      return;
    }

    if (controller.route.name !== 'home') {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      this.markScrollInteraction();
      controller.scrollState.nudge(0.16);
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      this.markScrollInteraction();
      controller.scrollState.nudge(-0.16);
    }
  }

  markScrollInteraction() {
    this.controller.lastScrollInputTime = performance.now() * 0.001;
  }

  centerScroll(value, duration = 1.6, options = undefined) {
    this.controller.scrollState.animateTo(value, duration, options);
  }

  resolveAutoCenterTarget(metric, progress) {
    const controller = this.controller;

    if (!metric || typeof progress !== 'number') {
      return null;
    }

    const rawTarget = metric.start + progress * (metric.height + 1) - 1;
    return controller.scrollState.resolveTarget(
      rawTarget,
      controller.scrollState.current
    );
  }

  getAutoCenterTarget() {
    const controller = this.controller;
    const { metric, safeScroll } = controller.homeSceneStack.getMetricAtScroll(
      controller.scrollState.current
    );

    if (!metric) {
      return null;
    }

    const currentScene = controller.sections[metric.key] ?? null;
    const currentLocal = safeScroll - metric.start;
    const nextMetric = controller.homeSceneStack.metrics[metric.index + 1] ?? null;
    const blendWindowStart = Math.max(metric.height - 1, 0);

    if (nextMetric && currentLocal >= blendWindowStart) {
      const overlap = clamp(currentLocal - blendWindowStart, 0, 1);

      if (overlap >= 0.5) {
        const nextScene = controller.sections[nextMetric.key] ?? null;
        const nextProgress =
          nextScene?.getInitialAutoCenterProgress?.() ??
          nextMetric.initialScrollAutocenter;
        return this.resolveAutoCenterTarget(nextMetric, nextProgress);
      }

      const currentProgress =
        currentScene?.getFinalAutoCenterProgress?.() ??
        currentScene?.getAutoCenterProgress?.() ??
        metric.finalScrollAutocenter ??
        metric.initialScrollAutocenter;
      return this.resolveAutoCenterTarget(metric, currentProgress);
    }

    const currentProgress =
      currentScene?.getAutoCenterProgress?.() ??
      metric.finalScrollAutocenter ??
      metric.initialScrollAutocenter;
    return this.resolveAutoCenterTarget(metric, currentProgress);
  }

  maybeAutoCenter(elapsed) {
    const controller = this.controller;

    if (
      !controller.ready
      || controller.route.name !== 'home'
      || controller.detailTransition.progress > 0.001
      || controller.detailTransition.target > 0.001
    ) {
      return;
    }

    const activeSectionKey =
      controller.homeState?.key ??
      controller.homeSceneStack.getActiveSection()?.key ??
      null;
    const idleDelay =
      activeSectionKey === 'cubes' ? 0.18 : controller.scrollIdleDelay;
    const cooldown = activeSectionKey === 'cubes' ? 0.16 : 0.5;

    if (elapsed - controller.lastScrollInputTime < idleDelay) {
      return;
    }

    if (elapsed - controller.lastAutoCenterTime < cooldown) {
      return;
    }

    const velocityThreshold = activeSectionKey === 'cubes' ? 0.028 : 0.003;
    const settleThreshold = activeSectionKey === 'cubes' ? 0.08 : 0.003;

    if (
      controller.scrollState.velocity > velocityThreshold
      || Math.abs(
        controller.scrollState.target - controller.scrollState.current
      ) > settleThreshold
    ) {
      return;
    }

    if (activeSectionKey === 'cubes') {
      const cubesOffset = controller.sections.cubes?.getAutoCenterOffset?.() ?? null;

      if (cubesOffset != null) {
        const target = controller.scrollState.resolveTarget(
          controller.scrollState.current + cubesOffset,
          controller.scrollState.current
        );

        if (
          Math.abs(target - controller.scrollState.current) >= 0.012
          || Math.abs(target - controller.scrollState.target) >= 0.012
        ) {
          controller.lastAutoCenterTime = elapsed;
          this.centerScroll(
            target,
            clamp(Math.abs(cubesOffset) * 3.2, 0.72, 1.12),
            {
              overshootScale: 0.24,
              overshootMax: 0.28
            }
          );
        }
        return;
      }
    }

    const target = this.getAutoCenterTarget();

    if (target == null) {
      return;
    }

    if (
      Math.abs(target - controller.scrollState.current) < 0.02
      && Math.abs(target - controller.scrollState.target) < 0.02
    ) {
      return;
    }

    controller.lastAutoCenterTime = elapsed;
    this.centerScroll(target, 1.05, {
      overshootScale: 0.22,
      overshootMax: 0.26
    });
  }
}
