import { damp, clamp } from '../utils/math.js';

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function positiveModulo(value, mod) {
  return ((value % mod) + mod) % mod;
}

/**
 * ScrollState 维护首页滚动的 current / target / velocity，
 * 同时支持普通 smooth scroll 和“自动居中吸附”的两段式动画。
 */
export class ScrollState {
  constructor({ min = 0, max = 0, damping = 7.5, wrap = false } = {}) {
    this.min = min;
    this.max = max;
    this.damping = damping;
    this.wrap = wrap;
    this.current = wrap ? min : clamp(min, min, max);
    this.target = wrap ? min : clamp(min, min, max);
    this.velocity = 0;
    this.animation = null;
  }

  getSpan() {
    return Math.max(this.max - this.min, 0);
  }

  normalize(value) {
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
    this.min = min;
    this.max = max;

    if (this.wrap) {
      this.current = this.resolveTarget(this.current, this.current);
      this.target = this.resolveTarget(this.target, this.current);
    } else {
      this.current = clamp(this.current, min, max);
      this.target = clamp(this.target, min, max);
    }

    if (this.animation) {
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
    this.animation = null;
    this.target = this.resolveTarget(value, this.target);
    return this.target;
  }

  nudge(delta) {
    return this.setTarget(this.target + delta);
  }

  jumpTo(value) {
    const next = this.resolveTarget(value, this.current);
    this.current = next;
    this.target = next;
    this.velocity = 0;
    this.animation = null;
    return next;
  }

  animateTo(value, duration = 1.6, { overshootScale = 0.16, overshootMax = 0.18 } = {}) {
    const finalTarget = this.resolveTarget(value, this.current);
    const distance = finalTarget - this.current;

    if (Math.abs(distance) <= 1e-6 || duration <= 1e-6) {
      return this.jumpTo(finalTarget);
    }

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
    const previous = this.current;

    if (this.animation) {
      this.animation.elapsed += delta;
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
      this.current = damp(this.current, this.target, this.damping, delta);
    }

    const frameVelocity = clamp(Math.abs(this.current - previous) * 18, 0, 1);
    this.velocity = damp(this.velocity, frameVelocity, this.damping * 0.8, delta);

    if (this.velocity < 0.001) {
      this.velocity = 0;
    }

    return this.current;
  }

  getSnapshot() {
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
