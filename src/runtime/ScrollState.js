import { damp, clamp } from '../utils/math.js';

/**
 * ScrollState 用一个“平滑逼近”的数值状态来描述首页滚动。
 *
 * 这里并不直接使用浏览器原生滚动容器，而是把首页 section
 * 映射到一条自定义的连续坐标轴上：
 * - current: 当前真实位置
 * - target: 目标位置
 * - velocity: 近似滚动速度，主要给 UI / shader / 自动吸附逻辑使用
 *
 * 用户输入只修改 target，真正的 current 每帧通过 damp 渐近过去。
 */
export class ScrollState {
  constructor({ min = 0, max = 0, damping = 7.5 } = {}) {
    this.min = min;
    this.max = max;
    // damping 越大，current 追 target 越快。
    this.damping = damping;
    // 初始化时 current / target 都从最小值起步，并保证在合法范围内。
    this.current = clamp(min, min, max);
    this.target = clamp(min, min, max);
    this.velocity = 0;
  }

  setBounds(min, max) {
    // 当首页 section 总长度变化时，可以动态重设滚动边界。
    this.min = min;
    this.max = max;
    this.current = clamp(this.current, min, max);
    this.target = clamp(this.target, min, max);
  }

  setTarget(value) {
    // 所有滚动目标都先被钳制到合法区间内。
    this.target = clamp(value, this.min, this.max);
    return this.target;
  }

  nudge(delta) {
    // nudge 是相对位移，适合滚轮 / 键盘这种增量输入。
    return this.setTarget(this.target + delta);
  }

  jumpTo(value) {
    // jumpTo 是“立即跳到某位置”，不会保留惯性，常用于 route 切换或强制定位。
    const next = clamp(value, this.min, this.max);
    this.current = next;
    this.target = next;
    this.velocity = 0;
    return next;
  }

  step(delta) {
    // 每帧让 current 朝 target 渐近，形成平滑滚动体验。
    const previous = this.current;
    this.current = damp(this.current, this.target, this.damping, delta);
    // velocity 并不是物理学意义上的速度，而是“当前帧移动强度”的平滑近似值。
    // 它主要用于：
    // - MainController 判断是否仍在滚动中
    // - HomeSceneRenderer 给过渡 shader 提供速度感
    const frameVelocity = clamp(Math.abs(this.current - previous) * 18, 0, 1);
    this.velocity = damp(this.velocity, frameVelocity, this.damping * 0.8, delta);

    if (this.velocity < 0.001) {
      this.velocity = 0;
    }

    return this.current;
  }

  getSnapshot() {
    // 对外暴露一个只读快照，方便调试或状态观察。
    return {
      current: this.current,
      target: this.target,
      velocity: this.velocity,
      min: this.min,
      max: this.max
    };
  }
}
