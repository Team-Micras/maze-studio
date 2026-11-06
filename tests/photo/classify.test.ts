import { describe, expect, test } from 'vitest';

import {
  fitHomography,
  lightness,
  normaliseLocally,
  otsuThreshold,
  rectify,
  scoreEdges,
} from '@/photo';
import { drawBoard } from '@tests/support/photo/draw-board';
import { randomMaze } from '@tests/support/photo/random-maze';

function wall(index: number): boolean {
  return index % 3 === 0;
}

function split(values: Float32Array): boolean[] {
  const threshold = otsuThreshold(values);
  return Array.from(values, (value) => value > threshold);
}

describe('classifying edges', () => {
  test('splits two clusters between them', () => {
    const threshold = otsuThreshold([0.1, 0.12, 0.08, 0.11, 0.7, 0.72, 0.69, Number.NaN]);
    expect(threshold).toBeGreaterThanOrEqual(0.12);
    expect(threshold).toBeLessThan(0.69);
    expect(otsuThreshold([0.3, 0.3])).toBe(0.3);
    expect(otsuThreshold([])).toBeNaN();
  });

  test('scores walls high and gaps low, in the order of the wall sets', () => {
    const maze = randomMaze(4, 3);
    const scale = 16;
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const board = fitHomography(
      square,
      square.map((point) => ({ x: 10 + point.x * 40, y: 10 + point.y * 40 }))
    );
    const plane = lightness(drawBoard(maze, board, 180, 180));
    const scores = scoreEdges(rectify(plane, board, 4, scale), 4, scale);

    const walls: number[] = [];
    const gaps: number[] = [];

    for (let y = 1; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        (maze.horizontal.get(y * 4 + x) ? walls : gaps).push(scores.horizontal[y * 4 + x]);
      }
    }

    for (let y = 0; y < 4; y++) {
      for (let x = 1; x < 4; x++) {
        (maze.vertical.get(y * 5 + x) ? walls : gaps).push(scores.vertical[y * 5 + x]);
      }
    }

    expect(walls.length).toBeGreaterThan(2);
    expect(gaps.length).toBeGreaterThan(2);
    expect(Math.min(...walls)).toBeGreaterThan(Math.max(...gaps) + 0.2);
  });

  test('split a glared half and a clear half at one threshold once each is set against its neighbours', () => {
    const size = 8;
    const score = (index: number, x: number) =>
      (wall(index) ? 0.8 : 0.1) * (x < size / 2 ? 0.25 : 1);
    const scores = {
      horizontal: Float32Array.from({ length: (size + 1) * size }, (_, index) =>
        score(index, index % size)
      ),
      vertical: Float32Array.from({ length: size * (size + 1) }, (_, index) =>
        score(index, index % (size + 1))
      ),
    };
    const truth = Array.from(scores.horizontal, (_, index) => wall(index));

    expect(split(scores.horizontal)).not.toEqual(truth);
    expect(split(normaliseLocally(scores, size).horizontal)).toEqual(truth);
  });
});
