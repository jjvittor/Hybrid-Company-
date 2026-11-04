export const RING_COUNT = 8;
export const SLIDE_DURATION = 900;
export const clampCard = (index: number) => ((Math.round(index) % RING_COUNT) + RING_COUNT) % RING_COUNT;
export const circularDistance = (index: number, active: number) => clampCard(index - active + RING_COUNT / 2) - RING_COUNT / 2;
export const dragCard = (start: number, pixels: number, width: number) => clampCard(start - pixels / Math.max(width * 0.8, 1));
export const curveCard = (distance: number, mobile: boolean) => ({
  angle: -Math.sign(distance) * Math.min(Math.abs(distance) * 22, mobile ? 35 : 55),
  scale: distance === 0 ? 1 : 0.94,
  opacity: distance === 0 ? 1 : Math.abs(distance) === 1 ? 0.7 : 0.4,
});
