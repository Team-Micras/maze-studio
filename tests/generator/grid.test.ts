import { describe, expect, test } from 'vitest';

import { fromMaze, toMaze } from '@/generator';
import { setWall } from '@/generator/grid';
import { closedBoard } from '@/generator/rules';
import { createMaze, hasWall, mazesEqual, presetMaze, setWall as setMazeWall } from '@/maze';

describe('the grid of the generator', () => {
  test('reads a maze with its outer walls, start and goals', () => {
    const maze = setMazeWall(presetMaze('classic'), { direction: 'horizontal', x: 3, y: 5 }, true);
    const g = fromMaze(maze);
    expect([g.width, g.height]).toEqual([16, 16]);
    expect(g.start).toBe(0);
    expect(g.goals).toEqual([119, 120, 135, 136]);
    expect(g.walls[4 * 16 + 3] & 1).toBe(1);
    expect(g.walls[5 * 16 + 3] & 4).toBe(4);
    expect(g.walls[15] & 2).toBe(2);
  });

  test('writes the maze a grid draws, (0, 0) in the south-west corner', () => {
    const g = closedBoard(16);
    setWall(g, 0, 0, 0);
    const maze = toMaze(g);
    expect(maze.start).toEqual({ x: 0, y: 0 });
    expect(maze.goals).toEqual([
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 8 },
      { x: 8, y: 8 },
    ]);
    expect(hasWall(maze, { direction: 'horizontal', x: 0, y: 1 })).toBe(false);
    expect(hasWall(maze, { direction: 'vertical', x: 1, y: 0 })).toBe(true);
    expect(hasWall(maze, { direction: 'vertical', x: 8, y: 7 })).toBe(false);
    expect(fromMaze(maze).walls).toEqual(g.walls);
  });

  test('round-trips a maze through a grid', () => {
    const maze = createMaze({
      width: 5,
      height: 3,
      start: { x: 0, y: 0 },
      goals: [{ x: 4, y: 2 }],
    });
    const walled = toMaze(fromMaze(maze));
    expect(mazesEqual(walled, toMaze(fromMaze(walled)))).toBe(true);
    expect(walled.start).toEqual(maze.start);
    expect(walled.goals).toEqual(maze.goals);
  });
});
