import { describe, expect, test } from 'vitest';

import {
  borderedMaze,
  createMaze,
  hasWall,
  presetMaze,
  presetProfile,
  setGoalArea,
  setStart,
  validateMaze,
  type Maze,
} from '@/maze';

function wallCount(maze: Maze): number {
  let count = 0;

  for (let y = 0; y <= maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      count += hasWall(maze, { direction: 'horizontal', x, y }) ? 1 : 0;
    }
  }

  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x <= maze.width; x++) {
      count += hasWall(maze, { direction: 'vertical', x, y }) ? 1 : 0;
    }
  }

  return count;
}

describe('A new maze', () => {
  test('of any size has its border and nothing else', () => {
    const maze = borderedMaze(7, 5);

    expect([maze.width, maze.height]).toEqual([7, 5]);
    expect(wallCount(maze)).toBe(2 * 7 + 2 * 5);
    expect(maze.start).toBeUndefined();
    expect(maze.goals).toEqual([]);
  });

  test('Classic starts in (0, 0) walled east, with the goal from (7, 7) to (8, 8), and has no error', () => {
    const maze = presetMaze('classic');

    expect([maze.width, maze.height]).toEqual([16, 16]);
    expect(maze.start).toEqual({ x: 0, y: 0 });
    expect(hasWall(maze, { direction: 'vertical', x: 1, y: 0 })).toBe(true);
    expect(maze.goals).toEqual([
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 8 },
      { x: 8, y: 8 },
    ]);
    expect(wallCount(maze)).toBe(4 * 16 + 1);
    expect(
      validateMaze({ maze, profile: presetProfile('classic') }).filter(
        (finding) => finding.severity === 'error'
      )
    ).toEqual([]);
  });

  test('Half size is 32 × 32 with the goal from (15, 15) to (16, 16), and has no error', () => {
    const maze = presetMaze('halfsize');

    expect([maze.width, maze.height]).toEqual([32, 32]);
    expect(maze.start).toEqual({ x: 0, y: 0 });
    expect(maze.goals).toHaveLength(4);
    expect(maze.goals).toContainEqual({ x: 15, y: 15 });
    expect(maze.goals).toContainEqual({ x: 16, y: 16 });
    expect(
      validateMaze({ maze, profile: presetProfile('halfsize') }).filter(
        (finding) => finding.severity === 'error'
      )
    ).toEqual([]);
  });

  test('Training is 16 × 16 with the border only, checked by the training rules', () => {
    const maze = presetMaze('training');

    expect(wallCount(maze)).toBe(4 * 16);
    expect(maze.start).toBeUndefined();
    expect(presetProfile('training')).toBe('training');
  });
});

describe('A goal area', () => {
  test('replaces the goals with every cell between two corners in any order', () => {
    const maze = setGoalArea(createMaze({ width: 5, height: 5, goals: [{ x: 0, y: 4 }] }), {
      from: { x: 3, y: 2 },
      to: { x: 2, y: 1 },
    });

    expect(maze.goals).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  test('takes the start away when it covers it', () => {
    const started = setStart(createMaze({ width: 4, height: 4 }), { x: 1, y: 1 });

    expect(
      setGoalArea(started, { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }).start
    ).toBeUndefined();
  });
});
