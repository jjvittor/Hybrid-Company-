import { describe, expect, it } from 'vitest';
import { scrollRotation, nearestCard, snapRotation, cardDepth, ROTATION_LERP, DRAG_SENSITIVITY, DRAG_FRICTION, SNAP_DELAY, SNAP_DURATION } from '@/lib/scene-ring-motion';

describe('Scene ring motion', () => {
  it('maps the section scroll to 0–300 degrees without wrapping', () => {
    expect(scrollRotation(0)).toBe(0);
    expect(scrollRotation(0.5)).toBe(150);
    expect(scrollRotation(1)).toBe(300);
    expect(scrollRotation(2)).toBe(300);
  });
  it('uses 0.07 interpolation for displayed rotation', () => { expect(ROTATION_LERP).toBe(0.07); });
  it('uses low drag sensitivity of 0.15 degrees per pixel', () => { expect(100 * DRAG_SENSITIVITY).toBe(15); });
  it('retains 92 percent of drag velocity per frame', () => { expect(DRAG_FRICTION).toBe(0.92); });
  it('waits 200 milliseconds to snap', () => { expect(SNAP_DELAY).toBe(200); });
  it('snaps over 600ms with cubic ease-out', () => {
    expect(SNAP_DURATION).toBe(600);
    expect(snapRotation(0, 45, 300)).toBe(39.375);
    expect(snapRotation(0, 45, 600)).toBe(45);
  });
  it('snaps to one of eight cards', () => { expect(nearestCard(300)).toBe(315); expect(nearestCard(29)).toBe(45); });
  it('keeps the front card crisp and full size', () => { expect(cardDepth(0)).toEqual({ hidden: false, scale: 1, opacity: 1, blur: 0 }); });
  it('reduces depth to the requested minimums', () => {
    const depth = cardDepth(100);
    expect(depth.scale).toBeCloseTo(0.82);
    expect(depth.opacity).toBeCloseTo(0.35);
    expect(depth.blur).toBe(2);
  });
  it('hides rear cards past 100 degrees', () => { expect(cardDepth(101).hidden).toBe(true); expect(cardDepth(101).opacity).toBe(0); expect(cardDepth(100).hidden).toBe(false); });
});