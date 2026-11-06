import { describe, expect, test } from 'vitest';

import {
  distort,
  fitHomography,
  foldRadius,
  lensOf,
  lightness,
  locateBoard,
  project,
  undistort,
  type Camera,
  type Point,
} from '@/photo';
import { drawBoard } from '@tests/support/photo/draw-board';
import { randomMaze } from '@tests/support/photo/random-maze';

const WIDTH = 640;
const HEIGHT = 480;
const SIZE = 16;

const SQUARE = [
  { x: 0, y: 0 },
  { x: SIZE, y: 0 },
  { x: SIZE, y: SIZE },
  { x: 0, y: SIZE },
];

const BOARD = fitHomography(SQUARE, [
  { x: 150, y: 40 },
  { x: 500, y: 55 },
  { x: 600, y: 440 },
  { x: 50, y: 420 },
]);

const MAZE = randomMaze(SIZE, 7);

function worstError(found: Camera, truth: Camera): number {
  let worst = 0;

  for (let y = 0; y <= SIZE; y++) {
    for (let x = 0; x <= SIZE; x++) {
      const a = project(found, { x, y });
      const b = project(truth, { x, y });
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }

  return worst;
}

function cornersSeen(truth: Camera): Point[] {
  return SQUARE.map((corner) => project(truth, corner));
}

describe('a radial lens', () => {
  test('centres on the middle pixel and measures the radius as half the diagonal', () => {
    const lens = lensOf(WIDTH, HEIGHT, -0.1);
    expect(lens.centre).toEqual({ x: 319.5, y: 239.5 });
    expect(lens.radius).toBe(400);
  });

  test.each([-0.35, -0.06, 0.04])('undoes its own distortion inside the fold, k1 = %f', (k1) => {
    const lens = lensOf(WIDTH, HEIGHT, k1);
    const reach = 0.95 * Math.min(foldRadius(lens), lens.radius);

    for (const angle of [0, 1, 2.5, 4]) {
      const point = {
        x: lens.centre.x + reach * Math.cos(angle),
        y: lens.centre.y + reach * Math.sin(angle),
      };
      const back = undistort(lens, distort(lens, point));
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  test('refuses points past the fold radius, where a farther point would be seen nearer', () => {
    const lens = lensOf(WIDTH, HEIGHT, -0.3);
    const fold = foldRadius(lens);
    expect(fold).toBeCloseTo(400 / Math.sqrt(0.9), 9);
    expect(foldRadius(lensOf(WIDTH, HEIGHT, 0.1))).toBe(Number.POSITIVE_INFINITY);

    const inside = distort(lens, { x: lens.centre.x + 0.99 * fold, y: lens.centre.y });
    expect(Number.isFinite(inside.x)).toBe(true);
    expect(distort(lens, { x: lens.centre.x + 1.01 * fold, y: lens.centre.y }).x).toBeNaN();

    const farthest = inside.x - lens.centre.x;
    expect(undistort(lens, { x: lens.centre.x + 1.05 * farthest, y: lens.centre.y }).x).toBeNaN();
  });
});

describe('fitting the board and the lens to the posts', () => {
  test('keeps no lens on an undistorted board', () => {
    const truth = { homography: BOARD, lens: lensOf(WIDTH, HEIGHT) };
    const photo = lightness(drawBoard(MAZE, BOARD, WIDTH, HEIGHT));
    const found = locateBoard(photo, cornersSeen(truth), SIZE);
    expect(found.lens.k1).toBe(0);
    expect(worstError(found, truth)).toBeLessThan(1);
  });

  test('recovers the lens of a board drawn through one, from the corner posts as seen', () => {
    const k1 = -0.25;
    const truth = { homography: BOARD, lens: lensOf(WIDTH, HEIGHT, k1) };
    const photo = lightness(drawBoard(MAZE, BOARD, WIDTH, HEIGHT, k1));
    const plain = {
      homography: fitHomography(SQUARE, cornersSeen(truth)),
      lens: lensOf(WIDTH, HEIGHT),
    };
    expect(worstError(plain, truth)).toBeGreaterThan(10);

    const found = locateBoard(photo, cornersSeen(truth), SIZE);
    expect(Math.abs(found.lens.k1 - k1)).toBeLessThan(0.02);
    expect(worstError(found, truth)).toBeLessThan(1.5);
  });
});
