import { describe, expect, test } from 'vitest';

import { createMaze, hasWall, mazesEqual, setGoals, wallRectangle } from '@/maze';
import { cellEdit } from '@/ui/editor/use-cell-drawing';

const EMPTY = createMaze({ width: 6, height: 6 });
const WITH_GOALS = setGoals(EMPTY, [
  { x: 4, y: 4 },
  { x: 5, y: 5 },
]);

describe('A cell tool', () => {
  test('walls in the rectangle between its corners', () => {
    const maze = cellEdit(EMPTY, 'rectangle', { x: 3, y: 1 }, { x: 1, y: 2 }, false);

    expect(
      mazesEqual(maze, wallRectangle(EMPTY, { from: { x: 1, y: 1 }, to: { x: 3, y: 2 } }))
    ).toBe(true);
  });

  test('clears the walls inside an area and keeps its outline', () => {
    const walled = wallRectangle(EMPTY, { from: { x: 1, y: 1 }, to: { x: 1, y: 1 } });
    const maze = cellEdit(walled, 'clear', { x: 0, y: 0 }, { x: 2, y: 2 }, false);

    expect(hasWall(maze, { direction: 'horizontal', x: 1, y: 1 })).toBe(false);
    expect(hasWall(maze, { direction: 'vertical', x: 2, y: 1 })).toBe(false);
    expect(hasWall(maze, { direction: 'horizontal', x: 1, y: 3 })).toBe(false);
  });

  test('puts the start on the cell released on', () => {
    expect(cellEdit(EMPTY, 'start', { x: 0, y: 0 }, { x: 2, y: 3 }, false).start).toEqual({
      x: 2,
      y: 3,
    });
  });

  test('makes a clicked cell the only goal, and Shift adds or removes it', () => {
    expect(cellEdit(WITH_GOALS, 'goal', { x: 1, y: 1 }, { x: 1, y: 1 }, false).goals).toEqual([
      { x: 1, y: 1 },
    ]);
    expect(cellEdit(WITH_GOALS, 'goal', { x: 1, y: 1 }, { x: 1, y: 1 }, true).goals).toHaveLength(
      3
    );
    expect(cellEdit(WITH_GOALS, 'goal', { x: 4, y: 4 }, { x: 4, y: 4 }, true).goals).toEqual([
      { x: 5, y: 5 },
    ]);
  });

  test('makes a dragged area the goals, with Shift or without', () => {
    const plain = cellEdit(WITH_GOALS, 'goal', { x: 0, y: 0 }, { x: 1, y: 1 }, false);

    expect(plain.goals).toHaveLength(4);
    expect(
      mazesEqual(cellEdit(WITH_GOALS, 'goal', { x: 0, y: 0 }, { x: 1, y: 1 }, true), plain)
    ).toBe(true);
  });
});
