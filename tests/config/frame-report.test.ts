import { describe, expect, test } from 'vitest';

import { frameReport, medianRun } from '@tests/support/ui/frames';

describe('medianRun', () => {
  test('takes the middle run by slow frames first, then the worst frame, then the p95', () => {
    const smooth = frameReport(Array.from({ length: 100 }, () => 20));
    const oneSlow = frameReport([...Array.from({ length: 99 }, () => 22), 26]);
    const fiveSlow = frameReport([...Array.from({ length: 95 }, () => 10), 30, 30, 30, 30, 30]);

    expect(medianRun([fiveSlow, smooth, oneSlow])).toBe(oneSlow);
  });

  test('breaks a tie on slow frames by the worst frame, then by the p95', () => {
    const lowWorst = frameReport([...Array.from({ length: 99 }, () => 19), 26]);
    const highWorst = frameReport([...Array.from({ length: 99 }, () => 10), 32]);
    const mid = frameReport([...Array.from({ length: 99 }, () => 21), 28]);

    expect(medianRun([highWorst, lowWorst, mid])).toBe(mid);
  });
});
