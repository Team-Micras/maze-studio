import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  borderedMaze,
  createMaze,
  parseMazeText,
  presetMaze,
  setWall,
  shortestRoutes,
  type Maze,
  type Route,
} from '@/maze';

const MAZEFILES = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles');

function repoMaze(path: string): Maze {
  const result = parseMazeText(readFileSync(join(MAZEFILES, path), 'utf8'), path);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value.maze;
}

function halfSteps(route: Route): boolean {
  return route.points.slice(1).every((point, index) => {
    const before = route.points[index];
    const du = Math.abs(point.u - before.u);
    const dv = Math.abs(point.v - before.v);
    return du + dv === 0.5 || (du === 0.5 && dv === 0.5);
  });
}

function turns(route: Route): number {
  const headings = route.points
    .slice(1)
    .map((point, index) => `${point.u - route.points[index].u},${point.v - route.points[index].v}`);
  return headings.filter((heading, index) => index > 0 && heading !== headings[index - 1]).length;
}

describe('shortestRoutes', () => {
  test.each([
    ['classic/japan2019.txt', 75, 76],
    ['classic/apec2017.txt', 107, 107],
    ['classic/uk2019f.txt', 92, 92],
    ['halfsize/japan2019hef.txt', 181, 181],
  ])('finds both routes of %s, %i and %i cells', (path, cells, diagonalCells) => {
    const maze = repoMaze(path);
    const routes = shortestRoutes(maze);

    expect(routes).toBeTruthy();
    const { withoutDiagonals, withDiagonals } = routes!;
    expect(withoutDiagonals.cells).toBe(cells);
    expect(withDiagonals.cells).toBe(diagonalCells);
    expect(withoutDiagonals.length).toBeCloseTo(withoutDiagonals.cells, 9);
    expect(withDiagonals.length).toBeLessThanOrEqual(withoutDiagonals.length + 1e-9);

    for (const route of [withoutDiagonals, withDiagonals]) {
      expect(route.points[0]).toEqual({ u: maze.start!.x + 0.5, v: maze.start!.y + 0.5 });
      expect(maze.goals).toContainEqual({
        x: route.points.at(-1)!.u - 0.5,
        y: route.points.at(-1)!.v - 0.5,
      });
      expect(halfSteps(route)).toBe(true);
    }
  });

  test('turns once on an open board without diagonals and cuts across with them', () => {
    const maze = createMaze({
      width: 3,
      height: 3,
      start: { x: 0, y: 0 },
      goals: [{ x: 2, y: 2 }],
    });
    const { withoutDiagonals, withDiagonals } = shortestRoutes(maze)!;

    expect(withoutDiagonals.cells).toBe(4);
    expect(turns(withoutDiagonals)).toBe(1);
    expect(withDiagonals.length).toBeCloseTo(1 + 3 * Math.SQRT1_2, 9);
  });

  test('leaves the start facing north, so among equal routes it turns least from there', () => {
    const maze = createMaze({
      width: 3,
      height: 3,
      start: { x: 0, y: 0 },
      goals: [{ x: 2, y: 1 }],
    });

    expect(shortestRoutes(maze)?.withoutDiagonals.points[1]).toEqual({ u: 0.5, v: 1 });
  });

  test('is undefined without a start or a goal', () => {
    expect(shortestRoutes(borderedMaze(16, 16))).toBeUndefined();
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

    expect(shortestRoutes(shut.reduce((walled, edge) => setWall(walled, edge, true), maze))).toBe(
      null
    );
  });

  test('remembers the routes of a maze', () => {
    const maze = presetMaze('classic');

    expect(shortestRoutes(maze)).toBe(shortestRoutes(maze));
  });
});
