export const RING_COUNT = 8;
export const SLIDE_DURATION = 900;
export const clampCard = (index: number) => ((Math.round(index) % RING_COUNT) + RING_COUNT) % RING_COUNT;
export const circularDistance = (index: number, active: number) => clampCard(index - active + RING_COUNT / 2) - RING_COUNT / 2;
export const dragCard = (start: number, pixels: number, width: number) => clampCard(start - pixels / Math.max(width * 0.8, 1));
export const curveCard = (distance: number, mobile: boolean) => ({
  angle: -Math.sign(distance) * Math.min(Math.abs(distance) * 22, mobile ? 35 : 55),
  scale: 1 - Math.min(Math.abs(distance), 1) * 0.06,
  opacity: Math.abs(distance) <= 1 ? 1 - Math.abs(distance) * 0.3 : Math.max(0.4, 0.7 - (Math.abs(distance) - 1) * 0.3),
});

export const DRAG_DEGREES_PER_PIXEL = 0.15;
export const CARD_ANGLE = 360 / RING_COUNT;
export const dragOffset = (pixels: number) => pixels * DRAG_DEGREES_PER_PIXEL / CARD_ANGLE;
export const inertialCard = (start: number, pixels: number, velocity: number) => {
  const momentum = Math.max(-375, Math.min(375, velocity * 160));
  return clampCard(start - dragOffset(pixels + momentum));
};
