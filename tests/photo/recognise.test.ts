import { describe, expect, test } from 'vitest';

import type { Edge } from '@/maze';
import {
  fitHomography,
  lensOf,
  lightness,
  locateBoard,
  project,
  recogniseMaze,
  refinePosts,
  scoreRecognition,
  wrongEdges,
  type Camera,
  type Plane,
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

/** A maze with a wall at every post, which the repair of lone posts leaves as it is. */
const MAZE = randomMaze(SIZE, 901);

const PHOTO = drawBoard(MAZE, fitHomography(SQUARE, CORNERS), 600, 460);

const LONELY = randomMaze(SIZE, 42);

function key(edge: Edge): string {
  return `${edge.direction} ${edge.x} ${edge.y}`;
}

function cameraOf(corners: readonly Point[]): Camera {
  return { homography: fitHomography(SQUARE, corners), lens: lensOf(600, 460) };
}

function worstError(board: Camera, truth: Camera): number {
  let worst = 0;

  for (let y = 0; y <= SIZE; y++) {
    for (let x = 0; x <= SIZE; x++) {
      const a = project(board, { x, y });
      const b = project(truth, { x, y });
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

/** A 960 × 720 photo of a `size × size` board seen through a lens of `k1`, and its camera. */
function shiftBoard(size: number, k1 = 0): { photo: Plane; truth: Camera; cell: number } {
  const square = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const seen = [
    { x: 160, y: 40 },
    { x: 820, y: 60 },
    { x: 920, y: 700 },
    { x: 50, y: 680 },
  ];
  const truth = { homography: fitHomography(square, seen), lens: lensOf(960, 720, k1) };
  const cell =
    seen.reduce(
      (sum, corner, index) =>
        sum + Math.hypot(seen[(index + 1) % 4].x - corner.x, seen[(index + 1) % 4].y - corner.y),
      0
    ) /
    (4 * size);
  return {
    photo: lightness(drawBoard(randomMaze(size, 5), truth.homography, 960, 720, k1)),
    truth,
    cell,
  };
}

const SHIFTED = { 16: shiftBoard(16), 32: shiftBoard(32) };

const DIRECTIONS = [
  ['east', 1, 0],
  ['west', -1, 0],
  ['south', 0, 1],
  ['north', 0, -1],
] as const;

/** The largest distance, in cells, between the posts found from corners shifted and the true ones. */
function shiftError(
  { photo, truth, cell }: ReturnType<typeof shiftBoard>,
  size: number,
  share: number,
  dx: number,
  dy: number
): number {
  const corners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ].map((corner) => {
    const at = project(truth, corner);
    return { x: at.x + dx * share * cell, y: at.y + dy * share * cell };
  });
  const found = locateBoard(photo, corners, size);
  let worst = 0;

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      const a = project(found, { x, y });
      const b = project(truth, { x, y });
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }

  return worst / cell;
}

describe('finding the posts from corners all shifted the same way', () => {
  test.each(
    ([16, 32] as const).flatMap((size) =>
      (
        [
          ['a third', 1 / 3],
          ['a quarter', 1 / 4],
          ['0.15', 0.15],
        ] as const
      ).flatMap(([amount, share]) =>
        DIRECTIONS.map(([name, dx, dy]) => ({ size, amount, share, name, dx, dy }))
      )
    )
  )('$size × $size, $amount of a cell $name', ({ size, share, dx, dy }) => {
    expect(shiftError(SHIFTED[size], size, share, dx, dy)).toBeLessThan(0.1);
  });

  test.fails('a fisheye board, 16 × 16 at k1 −0.3, shifted a third of a cell south (known limit)', () => {
    expect(shiftError(shiftBoard(16, -0.3), 16, 1 / 3, 0, 1)).toBeLessThan(0.1);
  });
});

describe('recognising a maze', () => {
  test('moves the board onto the posts when the corners are a little off', () => {
    const truth = cameraOf(CORNERS);
    const off = cameraOf(OFF);
    const refined = refinePosts(lightness(PHOTO), off, SIZE);
    expect(worstError(off, truth)).toBeGreaterThan(7);
    expect(worstError(refined, truth)).toBeLessThan(5.5);
  });

  test('keeps the board when no post is there to fit', () => {
    const dark = { width: 600, height: 460, data: new Uint8ClampedArray(600 * 460 * 4) };
    const off = cameraOf(OFF);
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

  test('walls the posts left with no wall and reports the rules the maze still breaks', () => {
    const found = recogniseMaze(drawBoard(LONELY, fitHomography(SQUARE, CORNERS), 600, 460), {
      size: SIZE,
      corners: OFF,
    });
    expect(found.walled.length).toBeGreaterThan(0);
    expect(wrongEdges(found.maze, LONELY).map(key).toSorted()).toEqual(
      found.walled.map(key).toSorted()
    );
    expect(found.broken.length).toBeGreaterThan(0);
    expect(found.broken.flatMap((entry) => entry.rules)).not.toContain('lonePost');
    expect(found.broken.every((entry) => entry.rules.length > 0)).toBe(true);
  });

  test('gives the maze the middle four goals when none are given, and keeps those given', () => {
    const found = recogniseMaze(PHOTO, { size: SIZE, corners: OFF });
    expect(found.maze.goals).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
    const start = { x: 1, y: 0 };
    const goals = [{ x: 6, y: 6 }];
    const given = recogniseMaze(PHOTO, { size: SIZE, corners: OFF, start, goals });
    expect(given.maze.start).toEqual(start);
    expect(given.maze.goals).toEqual(goals);
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
