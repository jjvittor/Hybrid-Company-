export const RING_COUNT = 8;
export const RING_STEP = 360 / RING_COUNT;
export const SCROLL_ROTATION = 300;
export const ROTATION_LERP = 0.07;
export const DRAG_SENSITIVITY = 0.15;
export const DRAG_FRICTION = 0.92;
export const SNAP_DELAY = 200;
export const SNAP_DURATION = 600;

export const scrollRotation = (progress: number) => Math.max(0, Math.min(1, progress)) * SCROLL_ROTATION;
export const nearestCard = (rotation: number) => Math.round(rotation / RING_STEP) * RING_STEP;
export const snapRotation = (from: number, to: number, elapsed: number) => {
  const t = Math.max(0, Math.min(1, elapsed / SNAP_DURATION));
  return from + (to - from) * (1 - (1 - t) ** 3);
};
export const cardDepth = (angle: number) => {
  const distance = Math.abs(((angle % 360) + 540) % 360 - 180);
  const t = Math.min(distance / 100, 1);
  return { hidden: distance > 100, scale: 1 - 0.18 * t, opacity: distance > 100 ? 0 : 1 - 0.65 * t, blur: 2 * t };
};