import { describe, expect, test } from 'vitest';

import {
  fitHomography,
  recogniseMaze,
  refinePosts,
  lightness,
  applyHomography,
  scoreRecognition,
  type Point,
} from '@/photo';
import { drawBoard } from '@tests/support/photo/draw-board';
import { randomMaze } from '@tests/support/photo/random-maze';

const SIZE = 8;

const CORNERS: [Point, Point, Point, Point] = [
  { x: 130, y: 40 },
  { x: 470, y: 60 },
  { x: 560, y: 420 },
  { x: 40, y: 380 },
];

const SQUARE = [
  { x: 0, y: 0 },
  { x: SIZE, y: 0 },
  { x: SIZE, y: SIZE },
  { x: 0, y: SIZE },
];

const MAZE = randomMaze(SIZE, 42);

const PHOTO = drawBoard(MAZE, fitHomography(SQUARE, CORNERS), 600, 460);

function worstError(board: readonly number[], truth: readonly number[]): number {
  let worst = 0;

  for (let y = 0; y <= SIZE; y++) {
    for (let x = 0; x <= SIZE; x++) {
      const a = applyHomography(board, { x, y });
      const b = applyHomography(truth, { x, y });
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }

  return worst;
}

const OFF: [Point, Point, Point, Point] = [
  { x: 134, y: 36 },
  { x: 466, y: 64 },
  { x: 564, y: 424 },
  { x: 44, y: 376 },
];

describe('recognising a maze', () => {
  test('moves the board onto the posts when the corners are a little off', () => {
    const truth = fitHomography(SQUARE, CORNERS);
    const off = fitHomography(SQUARE, OFF);
    const refined = refinePosts(lightness(PHOTO), off, SIZE);
    expect(worstError(off, truth)).toBeGreaterThan(7);
    expect(worstError(refined, truth)).toBeLessThan(5.5);
  });

  test('keeps the board when no post is there to fit', () => {
    const dark = { width: 600, height: 460, data: new Uint8ClampedArray(600 * 460 * 4) };
    const off = fitHomography(SQUARE, OFF);
    expect(refinePosts(lightness(dark), off, SIZE)).toBe(off);
  });

  test('reads every wall of a clean photo, from corners a little off', () => {
    const found = recogniseMaze(PHOTO, { size: SIZE, corners: OFF });
    expect(scoreRecognition(found.maze, MAZE)).toBe(1);
    expect(found.maze.start).toBeUndefined();
    expect(found.confidence.horizontal).toHaveLength(MAZE.horizontal.length);
    expect(found.confidence.vertical).toHaveLength(MAZE.vertical.length);
    const confidence = [...found.confidence.horizontal, ...found.confidence.vertical];
    expect(Math.min(...confidence)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...confidence)).toBeLessThanOrEqual(1);
    expect(found.confidence.horizontal[0]).toBe(1);
  });

  test.each([
    ['three on a line', [CORNERS[0], { x: 300, y: 50 }, CORNERS[1], CORNERS[3]]],
    ['two the same', [CORNERS[0], CORNERS[0], CORNERS[2], CORNERS[3]]],
    ['two swapped', [CORNERS[0], CORNERS[2], CORNERS[1], CORNERS[3]]],
    ['one not a number', [CORNERS[0], CORNERS[1], { x: Number.NaN, y: 0 }, CORNERS[3]]],
  ] as const)('refuses corners with %s', (_, corners) => {
    expect(() => recogniseMaze(PHOTO, { size: SIZE, corners })).toThrow(RangeError);
  });
});
