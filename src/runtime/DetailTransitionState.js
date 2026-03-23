import { gsap } from 'gsap';
import { clamp } from '../utils/math.js';

function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }

  const normalized = clamp((value - start) / (end - start), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

/**
 * DetailTransitionState 管理首页与 detail overlay 之间的统一开合进度。
 *
 * 它只维护一根基础 progress，但会在 getSnapshot() 里派生出多段子进度：
 * - overlayProgress: 首页整体被 detail 接管的程度
 * - focusProgress: cubes scene 中被选中项目的聚焦程度
 * - sceneProgress: detail scene 本身的出场程度
 * - uiProgress: 详情 HUD 文案出现的程度
 *
 * 这样不同层可以共用同一条总进度，又不必在完全相同的时间点起效。
 */
export class DetailTransitionState {
  constructor({ openDuration = 0.9, closeDuration = 0.72, ease = 'power2.out' } = {}) {
    this.openDuration = openDuration;
    this.closeDuration = closeDuration;
    this.ease = ease;
    this.progress = 0;
    this.target = 0;
    this.tween = null;
  }

  animateTo(target, duration) {
    const next = clamp(target, 0, 1);
    this.target = next;

    if (Math.abs(next - this.progress) <= 1e-5 || duration <= 1e-5) {
      return this.jumpTo(next);
    }

    this.tween?.kill();
    this.tween = gsap.to(this, {
      progress: next,
      duration,
      ease: this.ease,
      overwrite: true,
      onComplete: () => {
        this.progress = next;
        this.tween = null;
      }
    });

    return next;
  }

  open() {
    // detail 开合属于离散过渡，更适合交给 GSAP 做确定时长的 tween。
    this.animateTo(1, this.openDuration);
  }

  close() {
    this.animateTo(0, this.closeDuration);
  }

  jumpTo(value) {
    // 用于强制设定某个中间状态，常见于调试或需要瞬时同步的场景。
    const next = clamp(value, 0, 1);
    this.tween?.kill();
    this.tween = null;
    this.progress = next;
    this.target = next;
    return next;
  }

  step(delta) {
    // 保留 step 接口，方便继续被 Engine/MainController 每帧读取。
    // 实际的数值推进已经由 GSAP tween 接管。
    return this.progress;
  }

  getSnapshot() {
    // 这些子进度不是平均切分，而是带有先后顺序：
    // 1. overlay 最早开始
    // 2. focus 较早接管 cubes 中的选中对象
    // 3. sceneProgress 决定 detail scene 本体何时真正显形
    // 4. uiProgress 最晚开始，避免详情文案过早跳出来
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

  dispose() {
    this.tween?.kill();
    this.tween = null;
  }
}
