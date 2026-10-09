import { describe, expect, test } from 'vitest';

import {
  Bits,
  cellAt,
  cellIndex,
  createMaze,
  horizontalEdgeCount,
  horizontalEdgeIndex,
  isMazeSide,
  mazesEqual,
  verticalEdgeCount,
  verticalEdgeIndex,
} from '@/maze';

describe('the maze model', () => {
  test('counts and indexes edges from the south-west corner', () => {
    expect(horizontalEdgeCount(3, 2)).toBe(9);
    expect(verticalEdgeCount(3, 2)).toBe(8);
    expect(horizontalEdgeIndex(3, 2, 2)).toBe(8);
    expect(verticalEdgeIndex(3, 3, 1)).toBe(7);
    expect(cellIndex(3, { x: 2, y: 1 })).toBe(5);
    expect(cellAt(3, 5)).toEqual({ x: 2, y: 1 });
  });

  test('takes 1 to 64 cells a side', () => {
    expect([0, 1, 64, 65, 1.5].map(isMazeSide)).toEqual([false, true, true, false, false]);
    expect(createMaze({ width: 1, height: 64 }).vertical.length).toBe(128);
    expect(() => createMaze({ width: 0, height: 4 })).toThrow(RangeError);
    expect(() => createMaze({ width: 4, height: 65 })).toThrow(RangeError);
  });

  test('starts with no walls, no start and no goals, and never changes', () => {
    const maze = createMaze({ width: 2, height: 3 });
    expect(maze.horizontal.equals(Bits.from(8))).toBe(true);
    expect(maze.vertical.equals(Bits.from(9))).toBe(true);
    expect(maze.start).toBeUndefined();
    expect(maze.goals).toEqual([]);
    expect(Object.isFrozen(maze)).toBe(true);
    expect(Object.isFrozen(maze.goals)).toBe(true);
  });

  test('sorts the goals by cell index', () => {
    const maze = createMaze({
      width: 4,
      height: 4,
      goals: [
        { x: 1, y: 2 },
        { x: 3, y: 0 },
        { x: 2, y: 1 },
      ],
    });
    expect(maze.goals).toEqual([
      { x: 3, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  test('refuses wall sets of the wrong size, cells outside, repeated goals and a goal on the start', () => {
    expect(() => createMaze({ width: 2, height: 2, horizontal: Bits.from(5) })).toThrow(RangeError);
    expect(() => createMaze({ width: 2, height: 2, vertical: Bits.from(5) })).toThrow(RangeError);
    expect(() => createMaze({ width: 2, height: 2, start: { x: 2, y: 0 } })).toThrow(RangeError);
    expect(() => createMaze({ width: 2, height: 2, goals: [{ x: 0, y: -1 }] })).toThrow(RangeError);
    expect(() =>
      createMaze({
        width: 2,
        height: 2,
        goals: [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
      })
    ).toThrow(RangeError);
    expect(() =>
      createMaze({ width: 2, height: 2, start: { x: 0, y: 0 }, goals: [{ x: 0, y: 0 }] })
    ).toThrow(RangeError);
  });

  test('compares mazes by size, walls, start and goals', () => {
    const maze = createMaze({
      width: 2,
      height: 2,
      start: { x: 0, y: 0 },
      goals: [{ x: 1, y: 1 }],
    });
    const same = createMaze({
      width: 2,
      height: 2,
      start: { x: 0, y: 0 },
      goals: [{ x: 1, y: 1 }],
    });
    expect(mazesEqual(maze, same)).toBe(true);
    expect(mazesEqual(maze, createMaze({ ...maze, start: undefined }))).toBe(false);
    expect(mazesEqual(maze, createMaze({ ...maze, goals: [] }))).toBe(false);
    expect(
      mazesEqual(maze, createMaze({ ...maze, horizontal: maze.horizontal.with(0, true) }))
    ).toBe(false);
    expect(mazesEqual(maze, createMaze({ width: 2, height: 3 }))).toBe(false);
  });
});
