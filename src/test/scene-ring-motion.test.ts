import { describe, expect, it } from 'vitest';
import { RING_COUNT, SLIDE_DURATION, clampCard, curveCard, dragCard } from '@/lib/scene-ring-motion';
describe('Concave scene strip', () => {
  it('has eight cards', () => { expect(RING_COUNT).toBe(8); });
  it('moves between endpoints without wrapping', () => { expect(clampCard(-1)).toBe(0); expect(clampCard(8)).toBe(7); });
  it('keeps the active card facing front at full size', () => { expect(curveCard(0, false)).toEqual({angle: -0, scale: 1, opacity: 1}); });
  it('tilts neighboring cards inward by 22 degrees', () => { expect(curveCard(-1, false).angle).toBe(22); expect(curveCard(1, false).angle).toBe(-22); });
  it('caps desktop curvature at 55 degrees', () => { expect(curveCard(7, false).angle).toBe(-55); });
  it('caps mobile curvature at 35 degrees', () => { expect(curveCard(-7, true).angle).toBe(35); });
  it('dims and scales the side cards', () => { expect(curveCard(1, false).scale).toBe(0.94); expect(curveCard(1, false).opacity).toBe(0.7); expect(curveCard(2, false).opacity).toBe(0.4); });
  it('uses a 900ms transition', () => { expect(SLIDE_DURATION).toBe(900); });
  it('snaps low-sensitivity drag to the nearest card', () => { expect(dragCard(2, -200, 300)).toBe(3); expect(dragCard(2, -40, 300)).toBe(2); });
});
