import { describe, expect, test } from 'vitest';

import { lightness, sampleBilinear } from '@/photo';

describe('images', () => {
  test('read a pixel as its largest channel', () => {
    const plane = lightness({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 51, 102, 0, 255]),
    });
    expect(Array.from(plane.data)).toEqual([1, 0.4000000059604645]);
  });

  test('interpolate between pixel centres and see nothing outside', () => {
    const plane = { width: 2, height: 2, data: new Float32Array([0, 1, 1, 0]) };
    expect(sampleBilinear(plane, 0, 0)).toBe(0);
    expect(sampleBilinear(plane, 0.5, 0)).toBe(0.5);
    expect(sampleBilinear(plane, 1, 1)).toBe(0);
    expect(sampleBilinear(plane, 0.5, 0.5)).toBe(0.5);
    expect(sampleBilinear(plane, -0.1, 0)).toBeNaN();
    expect(sampleBilinear(plane, 0, 1.1)).toBeNaN();
  });
});
