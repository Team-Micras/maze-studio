import { expect, test } from 'vitest';

import { fitHomography, rectify } from '@/photo';

test('straightens the board out of the photo, NaN where the photo stops', () => {
  const width = 40;
  const photo = {
    width,
    height: 20,
    data: Float32Array.from({ length: width * 20 }, (_, index) => (index % width) / (width - 1)),
  };
  const board = fitHomography(
    [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ],
    [
      { x: 0, y: 0 },
      { x: 39, y: 0 },
      { x: 39, y: 19 },
      { x: 0, y: 19 },
    ]
  );
  const straight = rectify(photo, board, 2, 4);
  expect(straight.width).toBe(8);
  expect(straight.height).toBe(8);
  expect(straight.data[3 * 8]).toBeCloseTo(1 / 16, 5);
  expect(straight.data[3 * 8 + 7]).toBeCloseTo(15 / 16, 5);

  const wider = fitHomography(
    [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ],
    [
      { x: 0, y: 0 },
      { x: 78, y: 0 },
      { x: 78, y: 19 },
      { x: 0, y: 19 },
    ]
  );
  expect(rectify(photo, wider, 2, 4).data[7]).toBeNaN();
});
