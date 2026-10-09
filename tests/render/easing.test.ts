import { describe, expect, test } from 'vitest';

import { cubicBezier, EASE_FLIGHT, EASE_OUT } from '@/render';

describe('cubicBezier', () => {
  test('is the identity for the linear curve', () => {
    const linear = cubicBezier(0, 0, 1, 1);

    for (const progress of [0, 0.1, 0.33, 0.5, 0.9, 1]) {
      expect(linear(progress)).toBeCloseTo(progress, 6);
    }
  });

  test('matches the CSS ease curve, solved by bisection to 1e-6', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);

    expect(ease(0.25)).toBeCloseTo(0.408511, 5);
    expect(ease(0.5)).toBeCloseTo(0.802403, 5);
    expect(ease(0.75)).toBeCloseTo(0.960459, 5);
  });

  test('is 0 before the start and 1 after the end', () => {
    expect(EASE_FLIGHT(-1)).toBe(0);
    expect(EASE_FLIGHT(0)).toBe(0);
    expect(EASE_FLIGHT(1)).toBe(1);
    expect(EASE_FLIGHT(2)).toBe(1);
  });

  test.each([
    ['flight', EASE_FLIGHT],
    ['ease-out', EASE_OUT],
  ])('the %s curve never goes back', (_, easing) => {
    const values = Array.from({ length: 201 }, (__, step) => easing(step / 200));

    expect(values.every((value, index) => index === 0 || value >= (values[index - 1] ?? 0))).toBe(
      true
    );
  });

  test('the flight starts slow and ends slow, the ease-out starts fast', () => {
    expect(EASE_FLIGHT(0.1)).toBeLessThan(0.1);
    expect(EASE_FLIGHT(0.9)).toBeGreaterThan(0.9);
    expect(EASE_OUT(0.1)).toBeGreaterThan(0.3);
  });
});
