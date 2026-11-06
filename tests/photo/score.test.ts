import { describe, expect, test } from 'vitest';

import { createMaze, setWall } from '@/maze';
import { scoreRecognition, wrongEdges } from '@/photo';
import { randomMaze } from '@tests/support/photo/random-maze';

describe('scoring a recognition', () => {
  test('counts the share of internal edges right, the border left out', () => {
    const truth = randomMaze(4, 9);
    expect(scoreRecognition(truth, truth)).toBe(1);

    const edge = { direction: 'vertical', x: 2, y: 1 } as const;
    const flipped = setWall(truth, edge, !truth.vertical.get(1 * 5 + 2));
    expect(wrongEdges(flipped, truth)).toEqual([edge]);
    expect(scoreRecognition(flipped, truth)).toBe(1 - 1 / 24);

    const unbordered = setWall(truth, { direction: 'horizontal', x: 0, y: 0 }, false);
    expect(scoreRecognition(unbordered, truth)).toBe(1);
  });

  test('refuses mazes of different sizes', () => {
    expect(() => scoreRecognition(createMaze({ width: 4, height: 4 }), randomMaze(5, 1))).toThrow(
      RangeError
    );
  });
});
