import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  borderedMaze,
  explore,
  NEVER_SEEN,
  parseMazeText,
  presetMaze,
  setWall,
  type Maze,
} from '@/maze';

const MAZEFILES = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles');

function textMaze(text: string, path = 'test.txt'): Maze {
  const result = parseMazeText(text, path);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value.maze;
}

const SMALL = [
  'o---o---o---o',
  '|   |     G |',
  'o   o   o   o',
  '|           |',
  'o   o   o   o',
  '| S |       |',
  'o---o---o---o',
  '',
].join('\n');

const seenAt = (direction: 'horizontal' | 'vertical', x: number, y: number) =>
  explore(textMaze(SMALL))!.walls.find(
    (wall) => wall.direction === direction && wall.x === x && wall.y === y
  )?.seenAt;

describe('explore', () => {
  test('goes forward on a tie, backs out of a dead end and stops in the goal', () => {
    const exploration = explore(textMaze(SMALL))!;

    expect(exploration.steps).toEqual([
      { x: 0, y: 0, heading: 'north' },
      { x: 0, y: 1, heading: 'north' },
      { x: 0, y: 2, heading: 'north' },
      { x: 0, y: 1, heading: 'south' },
      { x: 1, y: 1, heading: 'east' },
      { x: 2, y: 1, heading: 'east' },
      { x: 2, y: 2, heading: 'north' },
    ]);
    expect(exploration.moves).toBe(6);
    expect(exploration.cells).toBe(6);
    expect(exploration.seen).toBeCloseTo(22 / 24, 9);
  });

  test('records the step at which each wall became known', () => {
    expect(seenAt('horizontal', 0, 0)).toBe(0);
    expect(seenAt('vertical', 1, 0)).toBe(0);
    expect(seenAt('vertical', 1, 2)).toBe(2);
    expect(seenAt('horizontal', 0, 1)).toBeUndefined();
  });

  test('never sees a wall it never comes beside', () => {
    const maze = setWall(textMaze(SMALL), { direction: 'vertical', x: 2, y: 0 }, true);

    expect(
      explore(maze)!.walls.find((wall) => wall.direction === 'vertical' && wall.x === 2)?.seenAt
    ).toBe(NEVER_SEEN);
  });

  test('reaches the goal of a classic final with every move to a neighbour', () => {
    const path = 'classic/japan2019.txt';
    const maze = textMaze(readFileSync(join(MAZEFILES, path), 'utf8'), path);
    const exploration = explore(maze)!;
    const last = exploration.steps.at(-1)!;

    expect(maze.goals).toContainEqual({ x: last.x, y: last.y });
    expect(
      exploration.steps
        .slice(1)
        .every(
          (step, index) =>
            Math.abs(step.x - exploration.steps[index].x) +
              Math.abs(step.y - exploration.steps[index].y) ===
            1
        )
    ).toBe(true);
    expect(exploration.seen).toBeGreaterThan(0);
    expect(exploration.seen).toBeLessThan(1);
  });

  test('is undefined without a start or a goal', () => {
    expect(explore(borderedMaze(16, 16))).toBeUndefined();
  });

  test('is null when the goal is walled off', () => {
    const maze = presetMaze('classic');
    const shut = [
      { direction: 'horizontal', x: 7, y: 7 },
      { direction: 'horizontal', x: 8, y: 7 },
      { direction: 'horizontal', x: 7, y: 9 },
      { direction: 'horizontal', x: 8, y: 9 },
      { direction: 'vertical', x: 7, y: 7 },
      { direction: 'vertical', x: 7, y: 8 },
      { direction: 'vertical', x: 9, y: 7 },
      { direction: 'vertical', x: 9, y: 8 },
    ] as const;

    expect(explore(shut.reduce((walled, edge) => setWall(walled, edge, true), maze))).toBe(null);
  });

  test('remembers the search of a maze', () => {
    const maze = presetMaze('classic');

    expect(explore(maze)).toBe(explore(maze));
  });
});
