export const TOTAL_DURATION = 9.2;

export const RING_PULSES = [
  { start: 2.0, inDuration: 0.5, outStart: 2.5, outDuration: 0.4 },
  { start: 2.95, inDuration: 0.5, outStart: 3.45, outDuration: 0.4 },
  { start: 3.8, inDuration: 0.5, outStart: 4.3, outDuration: 0.6 }
];

export const SQUARE_EVENTS = [
  { time: 2.0, scale: 1 },
  { time: 2.95, scale: 1 },
  { time: 3.8, scaleForward: 0.5, scaleBackward: 1 },
  { time: 4.9, scale: 0.5 }
];
