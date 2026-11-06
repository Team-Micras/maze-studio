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

describe('recognising a maze', () => {
  test('moves the board onto the posts when the corners are a little off', () => {
    const truth = cameraOf(CORNERS);
    const off = cameraOf(OFF);
    const refined = refinePosts(lightness(PHOTO), off, SIZE);
    expect(worstError(off, truth)).toBeGreaterThan(7);
    expect(worstError(refined, truth)).toBeLessThan(5.5);
  });

  test('finds the posts of a half-size board from corners a third of a cell off', () => {
    const size = 32;
    const square = [
      { x: 0, y: 0 },
      { x: size, y: 0 },
      { x: size, y: size },
      { x: 0, y: size },
    ];
    const truth = {
      homography: fitHomography(square, [
        { x: 160, y: 40 },
        { x: 820, y: 60 },
        { x: 920, y: 700 },
        { x: 50, y: 680 },
      ]),
      lens: lensOf(960, 720),
    };
    const photo = lightness(drawBoard(randomMaze(size, 5), truth.homography, 960, 720));
    const cell = 25;
    const corners = square.map((corner, index) => {
      const seen = project(truth, corner);
      return { x: seen.x + 0.35 * cell, y: seen.y + (index % 2 === 0 ? 0.2 : -0.2) * cell };
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

    expect(worst).toBeLessThan(0.1 * cell);
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

  test.each([
    ['three on a line', [CORNERS[0], { x: 300, y: 50 }, CORNERS[1], CORNERS[3]]],
    ['two the same', [CORNERS[0], CORNERS[0], CORNERS[2], CORNERS[3]]],
    ['two swapped', [CORNERS[0], CORNERS[2], CORNERS[1], CORNERS[3]]],
    ['one not a number', [CORNERS[0], CORNERS[1], { x: Number.NaN, y: 0 }, CORNERS[3]]],
  ] as const)('refuses corners with %s', (_, corners) => {
    expect(() => recogniseMaze(PHOTO, { size: SIZE, corners })).toThrow(RangeError);
  });
});
