import { describe, expect, test } from 'vitest';

import { createMaze, edgeIndex, edgeOfCell, hasWall, isMazeEdge, setWall } from '@/maze';

const MAZE = createMaze({ width: 3, height: 2 });

describe('edges', () => {
  test('name the four sides of a cell', () => {
    const cell = { x: 1, y: 0 };
    expect(edgeOfCell(cell, 'south')).toEqual({ direction: 'horizontal', x: 1, y: 0 });
    expect(edgeOfCell(cell, 'north')).toEqual({ direction: 'horizontal', x: 1, y: 1 });
    expect(edgeOfCell(cell, 'west')).toEqual({ direction: 'vertical', x: 1, y: 0 });
    expect(edgeOfCell(cell, 'east')).toEqual({ direction: 'vertical', x: 2, y: 0 });
  });

  test('include the borders and nothing past them', () => {
    expect(isMazeEdge(MAZE, { direction: 'horizontal', x: 2, y: 2 })).toBe(true);
    expect(isMazeEdge(MAZE, { direction: 'horizontal', x: 3, y: 0 })).toBe(false);
    expect(isMazeEdge(MAZE, { direction: 'horizontal', x: 0, y: 3 })).toBe(false);
    expect(isMazeEdge(MAZE, { direction: 'vertical', x: 3, y: 1 })).toBe(true);
    expect(isMazeEdge(MAZE, { direction: 'vertical', x: 0, y: 2 })).toBe(false);
    expect(isMazeEdge(MAZE, { direction: 'vertical', x: -1, y: 0 })).toBe(false);
    expect(isMazeEdge(MAZE, { direction: 'vertical', x: 0.5, y: 0 })).toBe(false);
  });

  test('index into the wall set of their direction', () => {
    expect(edgeIndex(MAZE, { direction: 'horizontal', x: 2, y: 2 })).toBe(8);
    expect(edgeIndex(MAZE, { direction: 'vertical', x: 3, y: 1 })).toBe(7);
    expect(() => edgeIndex(MAZE, { direction: 'vertical', x: 4, y: 0 })).toThrow(RangeError);
  });

  test('tell whether they hold a wall', () => {
    const walled = setWall(MAZE, { direction: 'vertical', x: 3, y: 1 }, true);
    expect(hasWall(walled, { direction: 'vertical', x: 3, y: 1 })).toBe(true);
    expect(hasWall(walled, { direction: 'vertical', x: 3, y: 0 })).toBe(false);
    expect(hasWall(MAZE, { direction: 'vertical', x: 3, y: 1 })).toBe(false);
  });
});
