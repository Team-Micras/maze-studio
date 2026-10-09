/**
 * A board placed in the world: its drawing, of the geometry's size, fitted into a world rectangle
 * and centred there as an SVG's `viewBox` is by default. These map the pointer, in world units, to
 * the maze, and a cell of the maze back to the world and to the screen.
 *
 * @module
 */

import type { Cell, CellArea, Maze } from '@/maze';

import type { WorldPoint, WorldRect } from './camera';
import { toBoardPoint, toMazePoint, type BoardGeometry, type MazePoint } from './geometry';
import type { FindingFocus } from './overlay-layers';

/**
 * The smallest side of a cell on screen, in CSS pixels, at which a touch edits (DESIGN.md 10):
 * below it the finger covers more than one wall slot.
 */
export const MIN_TOUCH_CELL = 28;

/** Where the drawing lies in the world: its top-left corner and world units per board unit. */
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

function placement(geometry: BoardGeometry, rect: WorldRect): Placement {
  const scale = Math.min(rect.width / geometry.width, rect.height / geometry.height);
  return {
    x: rect.x + (rect.width - geometry.width * scale) / 2,
    y: rect.y + (rect.height - geometry.height * scale) / 2,
    scale,
  };
}

/** The maze point under a world point, for a board drawn with `geometry` in `rect`. */
export function mazePointAt(
  geometry: BoardGeometry,
  rect: WorldRect,
  point: WorldPoint
): MazePoint {
  const place = placement(geometry, rect);
  return toMazePoint(geometry, {
    x: (point.x - place.x) / place.scale,
    y: (point.y - place.y) / place.scale,
  });
}

/** The world rectangle a cell covers, from post centre to post centre. */
export function cellInWorld(geometry: BoardGeometry, rect: WorldRect, cell: Cell): WorldRect {
  const place = placement(geometry, rect);
  const corner = toBoardPoint(geometry, { u: cell.x, v: cell.y + 1 });
  return {
    x: place.x + corner.x * place.scale,
    y: place.y + corner.y * place.scale,
    width: geometry.pitch * place.scale,
    height: geometry.pitch * place.scale,
  };
}

/** The side of a cell on screen, in CSS pixels, at the camera's zoom `k`. */
export function cellOnScreen(geometry: BoardGeometry, rect: WorldRect, k: number): number {
  return geometry.pitch * placement(geometry, rect).scale * k;
}

/** The world rectangle the cells of `area` cover. */
export function areaInWorld(geometry: BoardGeometry, rect: WorldRect, area: CellArea): WorldRect {
  const from = cellInWorld(geometry, rect, area.from);
  const to = cellInWorld(geometry, rect, area.to);
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return {
    x,
    y,
    width: Math.max(from.x, to.x) + from.width - x,
    height: Math.max(from.y, to.y) + from.height - y,
  };
}

/**
 * The cells around what a finding points at: its cells, the cells on both sides of its edges and
 * the cells around its posts, as one rectangle inside the maze; `undefined` when it points at
 * nothing.
 */
export function focusArea(
  maze: Pick<Maze, 'width' | 'height'>,
  focus: FindingFocus
): CellArea | undefined {
  const cells: Cell[] = [
    ...focus.cells,
    ...focus.edges.flatMap((edge) =>
      edge.direction === 'horizontal'
        ? [
            { x: edge.x, y: edge.y - 1 },
            { x: edge.x, y: edge.y },
          ]
        : [
            { x: edge.x - 1, y: edge.y },
            { x: edge.x, y: edge.y },
          ]
    ),
    ...focus.posts.flatMap((post) => [
      { x: post.x - 1, y: post.y - 1 },
      { x: post.x, y: post.y },
    ]),
  ];

  if (cells.length === 0) {
    return undefined;
  }

  const clampX = (x: number): number => Math.min(Math.max(x, 0), maze.width - 1);
  const clampY = (y: number): number => Math.min(Math.max(y, 0), maze.height - 1);
  return {
    from: {
      x: clampX(Math.min(...cells.map((cell) => cell.x))),
      y: clampY(Math.min(...cells.map((cell) => cell.y))),
    },
    to: {
      x: clampX(Math.max(...cells.map((cell) => cell.x))),
      y: clampY(Math.max(...cells.map((cell) => cell.y))),
    },
  };
}
