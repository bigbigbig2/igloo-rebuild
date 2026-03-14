export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

export function damp(current, target, smoothing, delta) {
  const factor = 1 - Math.exp(-smoothing * delta);
  return lerp(current, target, factor);
}
