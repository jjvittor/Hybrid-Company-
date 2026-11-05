import { describe, expect, it } from 'vitest';
import { showMobileChat } from '@/lib/utils';

describe('Mobile chat visibility', () => {
  it('appears only after 400px of page scrolling', () => {
    expect(showMobileChat(0)).toBe(false);
    expect(showMobileChat(400)).toBe(false);
    expect(showMobileChat(401)).toBe(true);
  });
});