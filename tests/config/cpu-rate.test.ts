import { describe, expect, test } from 'vitest';

import { REFERENCE_BENCHMARK_MS, TARGET_SLOWDOWN, throttleRate } from '@tests/support/cpu-rate';

describe('The throttle of the frame gates', () => {
  test('is the full slowdown on the reference notebook', () => {
    expect(throttleRate(REFERENCE_BENCHMARK_MS)).toBe(TARGET_SLOWDOWN);
  });

  test('throttles a machine twice as slow half as much', () => {
    expect(throttleRate(80, 40, 4)).toBe(2);
  });

  test('never goes past the target on a faster machine, nor below 1 on a very slow one', () => {
    expect(throttleRate(20, 40, 4)).toBe(4);
    expect(throttleRate(400, 40, 4)).toBe(1);
  });
});
