import { describe, expect, test } from 'vitest';

import {
  Bits,
  clearArea,
  createMaze,
  fillBorder,
  horizontalEdgeCount,
  moveStart,
  paintWalls,
  setGoals,
  setWall,
  toggleGoal,
  toggleWall,
  verticalEdgeCount,
  wallRectangle,
  type Edge,
  type Maze,
} from '@/maze';

function walls(maze: Maze): string[] {
  const found: string[] = [];

  for (let index = 0; index < maze.horizontal.length; index++) {
    if (maze.horizontal.get(index)) {
      found.push(`h${index % maze.width},${Math.floor(index / maze.width)}`);
    }
  }

  for (let index = 0; index < maze.vertical.length; index++) {
    if (maze.vertical.get(index)) {
      found.push(`v${index % (maze.width + 1)},${Math.floor(index / (maze.width + 1))}`);
    }
  }

  return found.toSorted();
}

function edge(name: string): Edge {
  const [, direction, x, y] = /^([hv])(\d+),(\d+)$/.exec(name) ?? [];
  return { direction: direction === 'h' ? 'horizontal' : 'vertical', x: Number(x), y: Number(y) };
}

function walled(width: number, height: number): Maze {
  return createMaze({
    width,
    height,
    horizontal: Bits.from(horizontalEdgeCount(width, height), () => true),
    vertical: Bits.from(verticalEdgeCount(width, height), () => true),
  });
}

const EMPTY = createMaze({ width: 4, height: 3 });

describe('wall edits', () => {
  test('set, take away and toggle one wall, leaving the original maze as it was', () => {
    const one = setWall(EMPTY, edge('v2,1'), true);
    expect(walls(one)).toEqual(['v2,1']);
    expect(walls(EMPTY)).toEqual([]);
    expect(walls(setWall(one, edge('v2,1'), false))).toEqual([]);
    expect(walls(toggleWall(one, edge('v2,1')))).toEqual([]);
    expect(walls(toggleWall(one, edge('h3,3')))).toEqual(['h3,3', 'v2,1']);
  });

  test('return the very same maze when nothing changes', () => {
    const one = setWall(EMPTY, edge('h0,0'), true);
    expect(setWall(one, edge('h0,0'), true)).toBe(one);
    expect(setWall(EMPTY, edge('h0,0'), false)).toBe(EMPTY);
    expect(paintWalls(one, [edge('h0,0'), edge('h0,0')], true)).toBe(one);
    expect(paintWalls(EMPTY, [], true)).toBe(EMPTY);
  });

  test('paint a list of edges, repeats included, with one value', () => {
    const painted = paintWalls(EMPTY, ['h1,1', 'v1,1', 'h1,1', 'v4,2'].map(edge), true);
    expect(walls(painted)).toEqual(['h1,1', 'v1,1', 'v4,2']);
    expect(walls(paintWalls(painted, ['h1,1', 'v4,2', 'h0,0'].map(edge), false))).toEqual(['v1,1']);
  });

  test('refuse an edge outside the maze and change nothing', () => {
    expect(() => paintWalls(EMPTY, [edge('h0,0'), edge('h4,0')], true)).toThrow(RangeError);
    expect(() => toggleWall(EMPTY, edge('v5,0'))).toThrow(RangeError);
    expect(() => setWall(EMPTY, edge('v0,3'), true)).toThrow(RangeError);
    expect(walls(EMPTY)).toEqual([]);
  });

  test('wall the outline of a rectangle given by any two opposite corners, and nothing inside', () => {
    const inner = setWall(EMPTY, edge('v2,1'), true);
    const boxed = wallRectangle(inner, { from: { x: 2, y: 0 }, to: { x: 1, y: 1 } });
    expect(walls(boxed)).toEqual(
      ['h1,0', 'h2,0', 'h1,2', 'h2,2', 'v1,0', 'v1,1', 'v3,0', 'v3,1', 'v2,1'].toSorted()
    );
    expect(walls(wallRectangle(EMPTY, { from: { x: 3, y: 2 }, to: { x: 3, y: 2 } }))).toEqual([
      'h3,2',
      'h3,3',
      'v3,2',
      'v4,2',
    ]);
  });

  test('clear the walls between the cells of an area, keeping its outline', () => {
    const cleared = clearArea(walled(4, 3), { from: { x: 1, y: 2 }, to: { x: 0, y: 1 } });
    const gone = ['h0,2', 'h1,2', 'v1,1', 'v1,2'];
    expect(walls(walled(4, 3)).filter((name) => !walls(cleared).includes(name))).toEqual(gone);
    expect(clearArea(walled(4, 3), { from: { x: 2, y: 2 }, to: { x: 2, y: 2 } })).toEqual(
      walled(4, 3)
    );
  });

  test('wall the whole border', () => {
    expect(walls(fillBorder(createMaze({ width: 3, height: 2 })))).toEqual(
      ['h0,0', 'h1,0', 'h2,0', 'h0,2', 'h1,2', 'h2,2', 'v0,0', 'v0,1', 'v3,0', 'v3,1'].toSorted()
    );
    const bordered = fillBorder(EMPTY);
    expect(fillBorder(bordered)).toBe(bordered);
    expect(walls(fillBorder(createMaze({ width: 1, height: 1 })))).toEqual([
      'h0,0',
      'h0,1',
      'v0,0',
      'v1,0',
    ]);
  });

  test('refuse an area with a corner outside the maze', () => {
    expect(() => wallRectangle(EMPTY, { from: { x: 0, y: 0 }, to: { x: 4, y: 0 } })).toThrow(
      RangeError
    );
    expect(() => clearArea(EMPTY, { from: { x: -1, y: 0 }, to: { x: 0, y: 0 } })).toThrow(
      RangeError
    );
  });
});

describe('start and goal edits', () => {
  const marked = createMaze({
    width: 4,
    height: 4,
    start: { x: 0, y: 0 },
    goals: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
  });

  test('move the start, or take it away', () => {
    expect(moveStart(marked, { x: 3, y: 0 }).start).toEqual({ x: 3, y: 0 });
    expect(moveStart(marked, undefined).start).toBeUndefined();
    expect(moveStart(marked, { x: 0, y: 0 })).toBe(marked);
    expect(moveStart(moveStart(marked, undefined), undefined).start).toBeUndefined();
    expect(() => moveStart(marked, { x: 4, y: 0 })).toThrow(RangeError);
  });

  test('take a goal out of the goals when the start moves onto it', () => {
    const moved = moveStart(marked, { x: 2, y: 2 });
    expect(moved.start).toEqual({ x: 2, y: 2 });
    expect(moved.goals).toEqual([{ x: 1, y: 1 }]);
  });

  test('set the goals, once each, in place of the old ones', () => {
    const goals = setGoals(marked, [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(goals.goals).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(goals.start).toEqual({ x: 0, y: 0 });
    expect(setGoals(marked, []).goals).toEqual([]);
    expect(
      setGoals(marked, [
        { x: 2, y: 2 },
        { x: 1, y: 1 },
      ])
    ).toBe(marked);
    expect(() => setGoals(marked, [{ x: 0, y: 4 }])).toThrow(RangeError);
  });

  test('take the start away when it becomes a goal', () => {
    const goals = setGoals(marked, [{ x: 0, y: 0 }]);
    expect(goals.start).toBeUndefined();
    expect(goals.goals).toEqual([{ x: 0, y: 0 }]);

    const toggled = toggleGoal(marked, { x: 0, y: 0 });
    expect(toggled.start).toBeUndefined();
    expect(toggled.goals).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  test('toggle one goal', () => {
    expect(toggleGoal(marked, { x: 1, y: 1 }).goals).toEqual([{ x: 2, y: 2 }]);
    expect(toggleGoal(marked, { x: 3, y: 1 }).goals).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(() => toggleGoal(marked, { x: 4, y: 4 })).toThrow(RangeError);
  });

  test('leave the walls alone', () => {
    const walledMarked = fillBorder(marked);
    expect(walls(moveStart(walledMarked, { x: 3, y: 3 }))).toEqual(walls(walledMarked));
    expect(walls(setGoals(walledMarked, [{ x: 3, y: 3 }]))).toEqual(walls(walledMarked));
  });
});
