import { damp, clamp } from '../utils/math.js';

function easeOutCubic(value) {
  // 自动居中动画使用的缓出曲线。
  // 前段走得更快，后段更柔和，避免吸附动作太机械。
  return 1 - Math.pow(1 - value, 3);
}

function positiveModulo(value, mod) {
  // JS 的 % 对负数不是数学意义上的模。
  // 这里保证结果恒为正，方便做循环滚动。
  return ((value % mod) + mod) % mod;
}

/**
 * ScrollState 维护首页滚动的 current / target / velocity，
 * 同时支持普通 smooth scroll 和“自动居中吸附”的两段式动画。
 *
 * 可以把它理解成一个很轻量的滚动状态机：
 * - current: 当前帧真正生效的滚动位置
 * - target:  用户输入或系统逻辑希望去到的位置
 * - velocity: 由 current 的变化速度推导出的平滑速度指标
 * - animation: 当进入自动吸附/自动居中时使用的显式关键帧动画
 *
 * 在普通状态下：
 * - step() 会用 damp 让 current 逐渐追向 target
 *
 * 在自动居中状态下：
 * - step() 会优先执行 animation
 * - 动画结束后再回到普通 damp 模式
 *
 * 当 wrap = true 时，这条滚动轴被当成一个环：
 * - 允许最后一个 section 平滑接回第一个 section
 * - resolveTarget() 会尽量选择“离 origin 最近的那一圈”
 */
export class ScrollState {
  constructor({ min = 0, max = 0, damping = 7.5, wrap = false } = {}) {
    this.min = min;
    this.max = max;
    this.damping = damping;
    this.wrap = wrap;
    // wrap 模式下允许 current / target 落在逻辑区间外的等价圈层，
    // 这样跨边界时也能保持运动连续，而不是突然跳值。
    this.current = wrap ? min : clamp(min, min, max);
    this.target = wrap ? min : clamp(min, min, max);
    // velocity 不是严格物理速度，而是一个 0~1 的平滑强度指标，
    // 主要给运行时判断“滚动是否还在明显运动中”。
    this.velocity = 0;
    // animation 不为空时，说明当前正在执行显式吸附动画。
    this.animation = null;
  }

  getSpan() {
    // 整条滚动轴的总长度。
    return Math.max(this.max - this.min, 0);
  }

  normalize(value) {
    // normalize 负责把任意值压回逻辑区间本身：
    // - 非 wrap：直接 clamp
    // - wrap：折回 [min, max) 这一圈
    if (!this.wrap) {
      return clamp(value, this.min, this.max);
    }

    const span = this.getSpan();
    if (span <= 1e-6) {
      return this.min;
    }

    return this.min + positiveModulo(value - this.min, span);
  }

  resolveTarget(value, origin = this.current) {
    // 这是 wrap 模式里最关键的一个方法。
    //
    // 例子：
    // 逻辑上 0 和 totalLength 是同一个位置，
    // 但如果 current 已经在 totalLength 附近，目标又是 0，
    // 我们通常希望它“继续向前一点点”到 totalLength，
    // 而不是突然倒着跑一整圈回 0。
    //
    // resolveTarget 会基于 origin 选择离 origin 最近的那一圈等价位置。
    if (!this.wrap) {
      return clamp(value, this.min, this.max);
    }

    const span = this.getSpan();
    if (span <= 1e-6) {
      return this.min;
    }

    const normalized = this.normalize(value);
    const cycle = Math.round((origin - normalized) / span);
    return normalized + cycle * span;
  }

  setBounds(min, max) {
    // 当首页 sections 结构变化、总长度改变时，滚动边界也要跟着刷新。
    this.min = min;
    this.max = max;

    if (this.wrap) {
      // wrap 模式下要保持 current / target 的圈层连续性。
      this.current = this.resolveTarget(this.current, this.current);
      this.target = this.resolveTarget(this.target, this.current);
    } else {
      this.current = clamp(this.current, min, max);
      this.target = clamp(this.target, min, max);
    }

    if (this.animation) {
      // 如果更新边界时还在做吸附动画，动画的各个关键点也要一并重算。
      if (this.wrap) {
        this.animation.start = this.resolveTarget(this.animation.start, this.current);
        this.animation.overshoot = this.resolveTarget(this.animation.overshoot, this.animation.start);
        this.animation.final = this.resolveTarget(this.animation.final, this.animation.overshoot);
      } else {
        this.animation.start = clamp(this.animation.start, min, max);
        this.animation.overshoot = clamp(this.animation.overshoot, min, max);
        this.animation.final = clamp(this.animation.final, min, max);
      }
    }
  }

  setTarget(value) {
    // 用户主动输入会打断自动吸附动画，重新回到普通跟随模式。
    this.animation = null;
    // 这里以旧 target 为 origin，而不是 current，
    // 目的是让连续 wheel / keyboard 输入时目标更连贯。
    this.target = this.resolveTarget(value, this.target);
    return this.target;
  }

  nudge(delta) {
    // nudge 是最常见的输入接口：
    // 在当前目标基础上推进一小段，而不是直接指定绝对位置。
    return this.setTarget(this.target + delta);
  }

  jumpTo(value) {
    // 瞬时跳转：常用于 route 切换、初始化、强制校正。
    const next = this.resolveTarget(value, this.current);
    this.current = next;
    this.target = next;
    this.velocity = 0;
    this.animation = null;
    return next;
  }

  animateTo(value, duration = 1.6, { overshootScale = 0.16, overshootMax = 0.18 } = {}) {
    // animateTo 用于“自动居中吸附”这类带仪式感的滚动动作。
    // 它不是简单地把 target 改过去，而是创建一个两段式动画：
    // 1. current -> overshoot，略微冲过头
    // 2. overshoot -> final，再轻轻回落到最终位置
    const finalTarget = this.resolveTarget(value, this.current);
    const distance = finalTarget - this.current;

    if (Math.abs(distance) <= 1e-6 || duration <= 1e-6) {
      return this.jumpTo(finalTarget);
    }

    // overshoot 的幅度与移动距离相关，但会被最大值限制住，
    // 避免长距离吸附时冲得太夸张。
    const overshootDistance = Math.min(Math.abs(distance) * overshootScale, overshootMax);
    const overshootTarget = this.wrap
      ? finalTarget + Math.sign(distance || 1) * overshootDistance
      : clamp(
        finalTarget + Math.sign(distance || 1) * overshootDistance,
        this.min,
        this.max
      );

    this.target = finalTarget;
    this.animation = {
      start: this.current,
      overshoot: overshootTarget,
      final: finalTarget,
      duration: Math.max(duration, 0.01),
      elapsed: 0
    };

    return finalTarget;
  }

  isAnimating() {
    return Boolean(this.animation);
  }

  step(delta) {
    // step 会在每帧推进一次滚动状态。
    const previous = this.current;

    if (this.animation) {
      // 自动吸附期间，优先按显式动画推进。
      this.animation.elapsed += delta;
      // phaseSplit 控制两段动画的时间分配。
      // 第一段更长，用于快速接近目标；
      // 第二段较短，用于把 overshoot 收回来。
      const phaseSplit = 0.72;
      const phaseOneDuration = this.animation.duration * phaseSplit;
      const phaseTwoDuration = Math.max(this.animation.duration - phaseOneDuration, 0.01);

      if (this.animation.elapsed < phaseOneDuration) {
        const phaseProgress = clamp(this.animation.elapsed / phaseOneDuration, 0, 1);
        this.current = this.animation.start
          + (this.animation.overshoot - this.animation.start) * easeOutCubic(phaseProgress);
      } else if (this.animation.elapsed < this.animation.duration) {
        const phaseProgress = clamp(
          (this.animation.elapsed - phaseOneDuration) / phaseTwoDuration,
          0,
          1
        );
        this.current = this.animation.overshoot
          + (this.animation.final - this.animation.overshoot) * easeOutCubic(phaseProgress);
      } else {
        this.current = this.animation.final;
        this.target = this.animation.final;
        this.animation = null;
      }
    } else {
      // 普通模式下，current 通过阻尼平滑追随 target。
      this.current = damp(this.current, this.target, this.damping, delta);
    }

    // velocity 由“这一帧 current 改变了多少”估算出来，
    // 再经过一次 damp 平滑，避免单帧尖峰太敏感。
    const frameVelocity = clamp(Math.abs(this.current - previous) * 18, 0, 1);
    this.velocity = damp(this.velocity, frameVelocity, this.damping * 0.8, delta);

    if (this.velocity < 0.001) {
      // 足够小时直接归零，方便上层做“是否静止”的判断。
      this.velocity = 0;
    }

    return this.current;
  }

  getSnapshot() {
    // 提供给调试器或上层运行时读取当前滚动状态。
    return {
      current: this.current,
      target: this.target,
      velocity: this.velocity,
      min: this.min,
      max: this.max,
      wrap: this.wrap,
      animating: this.isAnimating()
    };
  }
}
