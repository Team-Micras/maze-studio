import { describe, expect, test } from 'vitest';

import { createMaze } from '@/maze';
import {
  artboardIn,
  boardGeometry,
  cellInWorld,
  cellOnScreen,
  mazePointAt,
  toBoardPoint,
} from '@/render';

const CELL = { x: 1000, y: 420 };

describe('A board placed in the world', () => {
  test('maps the world back to the maze, on a square board', () => {
    const maze = createMaze({ width: 16, height: 16 });
    const geometry = boardGeometry(maze);
    const rect = artboardIn(CELL, maze);
    const corner = toBoardPoint(geometry, { u: 3, v: 5 });
    const point = mazePointAt(geometry, rect, { x: rect.x + corner.x, y: rect.y + corner.y });

    expect(point.u).toBeCloseTo(3, 9);
    expect(point.v).toBeCloseTo(5, 9);
  });

  test('centres a board that is wider than tall, as the SVG does, and keeps cells square', () => {
    const maze = createMaze({ width: 21, height: 7 });
    const geometry = boardGeometry(maze);
    const rect = artboardIn(CELL, maze);
    const first = cellInWorld(geometry, rect, { x: 0, y: 0 });
    const last = cellInWorld(geometry, rect, { x: 20, y: 6 });
    const left = first.x - rect.x;
    const right = rect.x + rect.width - (last.x + last.width);
    const top = last.y - rect.y;
    const bottom = rect.y + rect.height - (first.y + first.height);

    expect(first.width).toBeCloseTo(first.height, 9);
    expect(left).toBeCloseTo(right, 9);
    expect(top).toBeCloseTo(bottom, 9);
    expect(mazePointAt(geometry, rect, { x: first.x, y: first.y + first.height }).u).toBeCloseTo(
      0,
      9
    );
    expect(mazePointAt(geometry, rect, { x: last.x + last.width, y: last.y }).v).toBeCloseTo(7, 9);
  });

  test('gives a cell its side on screen at the zoom', () => {
    const maze = createMaze({ width: 16, height: 16 });
    const geometry = boardGeometry(maze);
    const rect = artboardIn(CELL, maze);
    const side = cellInWorld(geometry, rect, { x: 0, y: 0 }).width;

    expect(cellOnScreen(geometry, rect, 1)).toBeCloseTo(side, 9);
    expect(cellOnScreen(geometry, rect, 0.5)).toBeCloseTo(side / 2, 9);
  });
});
