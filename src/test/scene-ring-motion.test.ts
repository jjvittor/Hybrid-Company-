import { describe, expect, it } from 'vitest';
import { RING_COUNT, SLIDE_DURATION, clampCard, circularDistance, curveCard, dragCard, dragOffset, inertialCard } from '@/lib/scene-ring-motion';
describe('Concave scene strip', () => {
  it('has eight cards', () => { expect(RING_COUNT).toBe(8); });
  it('wraps in both directions modulo eight', () => { expect(clampCard(-1)).toBe(7); expect(clampCard(8)).toBe(0); expect(clampCard(24)).toBe(0); expect(clampCard(-17)).toBe(7); });
  it('uses the shortest circular distance at both endpoints', () => { expect(circularDistance(0, 7)).toBe(1); expect(circularDistance(7, 0)).toBe(-1); });
  it('keeps circular distances between minus four and plus three', () => { expect(Array.from({ length: 8 }, (_, i) => circularDistance(i, 0))).toEqual([0, 1, 2, 3, -4, -3, -2, -1]); });
  it('wraps dragging through either endpoint', () => { expect(dragCard(7, -240, 300)).toBe(0); expect(dragCard(0, 240, 300)).toBe(7); });
  it('keeps the active card facing front at full size', () => { expect(curveCard(0, false)).toEqual({angle: -0, scale: 1, opacity: 1}); });
  it('tilts neighboring cards inward by 22 degrees', () => { expect(curveCard(-1, false).angle).toBe(22); expect(curveCard(1, false).angle).toBe(-22); });
  it('caps desktop curvature at 55 degrees', () => { expect(curveCard(7, false).angle).toBe(-55); });
  it('caps mobile curvature at 35 degrees', () => { expect(curveCard(-7, true).angle).toBe(35); });
  it('dims and scales the side cards', () => { expect(curveCard(1, false).scale).toBe(0.94); expect(curveCard(1, false).opacity).toBe(0.7); expect(curveCard(2, false).opacity).toBe(0.4); });
  it('uses a 900ms transition', () => { expect(SLIDE_DURATION).toBe(900); });
  it('snaps low-sensitivity drag to the nearest card', () => { expect(dragCard(2, -200, 300)).toBe(3); expect(dragCard(2, -40, 300)).toBe(2); });
});

describe('Scene drag sensitivity and inertia', () => {
  it('converts 300 pixels to one 45 degree card at 0.15 degrees per pixel', () => {
    expect(dragOffset(300)).toBe(1);
    expect(dragOffset(-300)).toBe(-1);
  });
  it('snaps with bounded momentum and wraps across both ends', () => {
    expect(inertialCard(7, -180, 0)).toBe(0);
    expect(inertialCard(0, 180, 0)).toBe(7);
    expect(inertialCard(0, -100, -0.5)).toBe(1);
    expect(inertialCard(0, -20, 0)).toBe(0);
  });
});
