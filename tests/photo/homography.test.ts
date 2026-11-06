import { describe, expect, test } from 'vitest';

import { applyHomography, fitHomography, invertHomography, type Point } from '@/photo';

const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 16 },
  { x: 0, y: 16 },
];

const PHOTO: Point[] = [
  { x: 900.5, y: 115.5 },
  { x: 1819, y: 181 },
  { x: 1199.5, y: 943 },
  { x: 149.5, y: 545 },
];

function expectClose(actual: Point, expected: Point, digits = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

describe('homographies', () => {
  test('map four points exactly onto four others', () => {
    const h = fitHomography(SQUARE, PHOTO);
    SQUARE.forEach((point, index) => expectClose(applyHomography(h, point), PHOTO[index]));
    expect(h[8]).toBe(1);
  });

  test('fit many noisy pairs by least squares, close to the true map', () => {
    const truth = fitHomography(SQUARE, PHOTO);
    const grid: Point[] = [];
    const seen: Point[] = [];

    for (let y = 0; y <= 16; y++) {
      for (let x = 0; x <= 16; x++) {
        const p = applyHomography(truth, { x, y });
        const wobble = ((x * 7 + y * 13) % 5) - 2;
        grid.push({ x, y });
        seen.push({ x: p.x + wobble * 0.3, y: p.y - wobble * 0.3 });
      }
    }

    const fitted = fitHomography(grid, seen);
    expectClose(applyHomography(fitted, { x: 8, y: 8 }), applyHomography(truth, { x: 8, y: 8 }), 0);
    const error = grid.reduce((worst, point) => {
      const a = applyHomography(fitted, point);
      const b = applyHomography(truth, point);
      return Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }, 0);
    expect(error).toBeLessThan(0.5);
  });

  test('invert', () => {
    const h = fitHomography(SQUARE, PHOTO);
    expectClose(applyHomography(invertHomography(h), applyHomography(h, { x: 3, y: 11 })), {
      x: 3,
      y: 11,
    });
  });

  test('refuse too few or degenerate pairs', () => {
    expect(() => fitHomography(SQUARE.slice(0, 3), PHOTO.slice(0, 3))).toThrow(RangeError);
    const line = [0, 1, 2, 3].map((x) => ({ x, y: x }));
    expect(() => fitHomography(line, PHOTO)).toThrow(RangeError);
  });
});
