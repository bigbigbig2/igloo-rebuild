import { damp, clamp } from '../utils/math.js';

export class ScrollState {
  constructor({ min = 0, max = 0, damping = 7.5 } = {}) {
    this.min = min;
    this.max = max;
    this.damping = damping;
    this.current = clamp(min, min, max);
    this.target = clamp(min, min, max);
    this.velocity = 0;
  }

  setBounds(min, max) {
    this.min = min;
    this.max = max;
    this.current = clamp(this.current, min, max);
    this.target = clamp(this.target, min, max);
  }

  setTarget(value) {
    this.target = clamp(value, this.min, this.max);
    return this.target;
  }

  nudge(delta) {
    return this.setTarget(this.target + delta);
  }

  jumpTo(value) {
    const next = clamp(value, this.min, this.max);
    this.current = next;
    this.target = next;
    this.velocity = 0;
    return next;
  }

  step(delta) {
    const previous = this.current;
    this.current = damp(this.current, this.target, this.damping, delta);
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
      max: this.max
    };
  }
}
