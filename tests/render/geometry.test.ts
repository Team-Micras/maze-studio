import { describe, expect, test } from 'vitest';

import { createMaze } from '@/maze';
import {
  ARTBOARD_SIZE,
  boardGeometry,
  cellAtPoint,
  cellRect,
  nearestCell,
  nearestEdge,
  slotRect,
  toBoardPoint,
  toMazePoint,
  wallRect,
} from '@/render';

const SQUARE = createMaze({ width: 16, height: 16 });
const WIDE = createMaze({ width: 10, height: 5 });

describe('boardGeometry', () => {
  test.each([
    [16, 16],
    [21, 21],
    [32, 32],
    [10, 5],
    [1, 64],
  ])('draws a %i×%i maze with its longest side 640 units long', (width, height) => {
    const geometry = boardGeometry({ width, height });

    expect(Math.max(geometry.width, geometry.height)).toBeCloseTo(ARTBOARD_SIZE, 9);
    expect(geometry.width).toBeCloseTo(width * geometry.pitch + 2 * geometry.margin, 9);
    expect(geometry.height).toBeCloseTo(height * geometry.pitch + 2 * geometry.margin, 9);
  });

  test('keeps the track proportions of DESIGN.md 2.2 for the board and the thumbnail', () => {
    const board = boardGeometry(SQUARE);
    const thumbnail = boardGeometry(SQUARE, { scale: 'thumbnail', size: 128 });

    expect(board.wall / board.pitch).toBeCloseTo(0.08, 9);
    expect(board.post / board.pitch).toBeCloseTo(0.13, 9);
    expect(board.postOutline / board.pitch).toBeCloseTo(0.022, 9);
    expect(board.rails).toBe(true);
    expect(thumbnail.wall / thumbnail.pitch).toBeCloseTo(0.14, 9);
    expect(thumbnail.post / thumbnail.pitch).toBeCloseTo(0.14, 9);
    expect(thumbnail.postOutline).toBe(0);
    expect(thumbnail.rails).toBe(false);
    expect(thumbnail.width).toBeCloseTo(128, 9);
  });

  test('leaves room for the border posts and a little more', () => {
    const geometry = boardGeometry(SQUARE);

    expect(geometry.margin).toBeGreaterThan(geometry.post / 2);
  });
});

describe('Board and maze points', () => {
  const geometry = boardGeometry(WIDE);

  test('put the south-west corner at the bottom left and north up', () => {
    expect(toBoardPoint(geometry, { u: 0, v: 0 }).x).toBeCloseTo(geometry.margin, 9);
    expect(toBoardPoint(geometry, { u: 0, v: 0 }).y).toBeCloseTo(
      geometry.height - geometry.margin,
      9
    );
    expect(toBoardPoint(geometry, { u: 10, v: 5 }).x).toBeCloseTo(
      geometry.width - geometry.margin,
      9
    );
    expect(toBoardPoint(geometry, { u: 10, v: 5 }).y).toBeCloseTo(geometry.margin, 9);
  });

  test('turn into each other and back', () => {
    for (const point of [
      { u: 0, v: 0 },
      { u: 3.25, v: 4.5 },
      { u: -1, v: 7 },
    ]) {
      const back = toMazePoint(geometry, toBoardPoint(geometry, point));
      expect(back.u).toBeCloseTo(point.u, 9);
      expect(back.v).toBeCloseTo(point.v, 9);
    }
  });

  test('place a cell between its posts, its top edge on the north side', () => {
    const rect = cellRect(geometry, { x: 2, y: 1 });
    expect(rect).toEqual({
      x: toBoardPoint(geometry, { u: 2, v: 2 }).x,
      y: toBoardPoint(geometry, { u: 2, v: 2 }).y,
      width: geometry.pitch,
      height: geometry.pitch,
    });
  });

  test('place a wall over its whole pitch and a slot between the posts', () => {
    const edge = { direction: 'horizontal', x: 3, y: 2 } as const;
    const wall = wallRect(geometry, edge);
    const slot = slotRect(geometry, edge);

    expect(wall.width).toBeCloseTo(geometry.pitch, 9);
    expect(wall.height).toBeCloseTo(geometry.wall, 9);
    expect(slot.width).toBeCloseTo(geometry.pitch - geometry.post, 9);
    expect(slot.x).toBeCloseTo(wall.x + geometry.post / 2, 9);
    expect(slotRect(geometry, edge, 2).width).toBeCloseTo(slot.width + 4, 9);
  });
});

describe('nearestEdge', () => {
  test('picks the edge within 0.32 cell and nothing farther', () => {
    expect(nearestEdge(SQUARE, { u: 3.5, v: 2.3 })).toEqual({
      direction: 'horizontal',
      x: 3,
      y: 2,
    });
    expect(nearestEdge(SQUARE, { u: 4.31, v: 2.5 })).toEqual({
      direction: 'vertical',
      x: 4,
      y: 2,
    });
    expect(nearestEdge(SQUARE, { u: 3.5, v: 2.33 })).toBeUndefined();
    expect(nearestEdge(SQUARE, { u: 3.5, v: 2.5 })).toBeUndefined();
  });

  test('picks the closer of the two near a post, the east–west one on a tie', () => {
    expect(nearestEdge(SQUARE, { u: 4.1, v: 2.2 })).toEqual({
      direction: 'vertical',
      x: 4,
      y: 2,
    });
    expect(nearestEdge(SQUARE, { u: 4.2, v: 2.1 })).toEqual({
      direction: 'horizontal',
      x: 4,
      y: 2,
    });
    expect(nearestEdge(SQUARE, { u: 4.25, v: 2.25 })?.direction).toBe('horizontal');
  });

  test('picks border edges and never an edge outside the maze', () => {
    expect(nearestEdge(WIDE, { u: 0.5, v: -0.2 })).toEqual({
      direction: 'horizontal',
      x: 0,
      y: 0,
    });
    expect(nearestEdge(WIDE, { u: 10.2, v: 4.5 })).toEqual({
      direction: 'vertical',
      x: 10,
      y: 4,
    });
    expect(nearestEdge(WIDE, { u: 10.5, v: 5.1 })).toBeUndefined();
    expect(nearestEdge(WIDE, { u: -0.4, v: 2.5 })).toBeUndefined();
  });

  test('takes another tolerance', () => {
    expect(nearestEdge(SQUARE, { u: 3.5, v: 2.45 }, 0.5)).toEqual({
      direction: 'horizontal',
      x: 3,
      y: 2,
    });
  });
});

describe('Cells under a point', () => {
  test('cellAtPoint has none outside the maze', () => {
    expect(cellAtPoint(WIDE, { u: 9.99, v: 4.99 })).toEqual({ x: 9, y: 4 });
    expect(cellAtPoint(WIDE, { u: 10, v: 2 })).toBeUndefined();
    expect(cellAtPoint(WIDE, { u: 2, v: -0.01 })).toBeUndefined();
  });

  test('nearestCell takes the nearest cell of the maze from outside', () => {
    expect(nearestCell(WIDE, { u: 12, v: -3 })).toEqual({ x: 9, y: 0 });
    expect(nearestCell(WIDE, { u: -1, v: 9 })).toEqual({ x: 0, y: 4 });
    expect(nearestCell(WIDE, { u: 2.5, v: 3.5 })).toEqual({ x: 2, y: 3 });
  });
});
