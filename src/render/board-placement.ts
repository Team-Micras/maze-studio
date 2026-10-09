/**
 * A board placed in the world: its drawing, of the geometry's size, fitted into a world rectangle
 * and centred there as an SVG's `viewBox` is by default. These map the pointer, in world units, to
 * the maze, and a cell of the maze back to the world and to the screen.
 *
 * @module
 */

import type { Cell } from '@/maze';

import type { WorldPoint, WorldRect } from './camera';
import { toBoardPoint, toMazePoint, type BoardGeometry, type MazePoint } from './geometry';

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
