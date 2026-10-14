import { describe, expect, test } from 'vitest';

import { artboardLabel, categoryLabel, sizeLabel } from '@/ui/labels';

describe('The words for a maze', () => {
  test('name its folder and its size', () => {
    expect(categoryLabel('halfsize')).toBe('Half size');
    expect(categoryLabel('elsewhere')).toBe('elsewhere');
    expect(sizeLabel(16, 16)).toBe('16 × 16');
  });

  test('read a maze aloud with its competition when the name tells it (DESIGN.md 13)', () => {
    expect(
      artboardLabel({ name: 'japan2011hef', competition: 'Japan', width: 32, height: 32 })
    ).toBe('japan2011hef, Japan, 32 by 32');
    expect(artboardLabel({ name: 'Club final', width: 5, height: 3 })).toBe('Club final, 5 by 3');
  });
});
