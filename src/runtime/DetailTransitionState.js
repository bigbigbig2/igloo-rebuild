import { damp, clamp } from '../utils/math.js';

function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }

  const normalized = clamp((value - start) / (end - start), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export class DetailTransitionState {
  constructor({ damping = 6.5 } = {}) {
    this.damping = damping;
    this.progress = 0;
    this.target = 0;
  }

  open() {
    this.target = 1;
  }

  close() {
    this.target = 0;
  }

  jumpTo(value) {
    const next = clamp(value, 0, 1);
    this.progress = next;
    this.target = next;
    return next;
  }

  step(delta) {
    this.progress = damp(this.progress, this.target, this.damping, delta);
    return this.progress;
  }

  getSnapshot() {
    const overlayProgress = smoothWindow(this.progress, 0, 1);
    const focusProgress = smoothWindow(this.progress, 0.04, 0.72);
    const sceneProgress = smoothWindow(this.progress, 0.18, 0.9);
    const uiProgress = smoothWindow(this.progress, 0.42, 0.98);

    return {
      progress: this.progress,
      target: this.target,
      isOpen: this.progress > 0.001 || this.target > 0.001,
      overlayProgress,
      focusProgress,
      sceneProgress,
      uiProgress
    };
  }
}
