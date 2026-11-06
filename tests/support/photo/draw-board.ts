/**
 * A synthetic photo of a maze: light wall tops and posts on a dark floor, drawn through a
 * homography from board coordinates (cells, `(0, 0)` at the north-west corner) to undistorted
 * pixels, and a radial lens from those to photo pixels.
 *
 * @module
 */

import { hasWall, type Maze } from '@/maze';
import {
  applyHomography,
  invertHomography,
  lensOf,
  undistort,
  type Homography,
  type Photo,
} from '@/photo';

/** Half the thickness of a wall top, as a share of a cell. */
const HALF_WALL = 0.04;

/** Whether board point `(u, v)` lies on a wall top or a post of `maze`. */
function onWall(maze: Maze, u: number, v: number): boolean {
  const size = maze.width;
  const column = Math.round(u);
  const row = Math.round(v);
  const nearColumn = Math.abs(u - column) <= HALF_WALL;
  const nearRow = Math.abs(v - row) <= HALF_WALL;

  if (u < -HALF_WALL || v < -HALF_WALL || u > size + HALF_WALL || v > size + HALF_WALL) {
    return false;
  }

  if (nearColumn && nearRow) {
    return true;
  }

  const x = Math.floor(u);
  const cell = Math.floor(v);

  if (nearRow && x >= 0 && x < size && row >= 0 && row <= size) {
    return hasWall(maze, { direction: 'horizontal', x, y: size - row });
  }

  if (nearColumn && cell >= 0 && cell < size && column >= 0 && column <= size) {
    return hasWall(maze, { direction: 'vertical', x: column, y: size - 1 - cell });
  }

  return false;
}

/**
 * A `width × height` photo of `maze` seen through `board` and a lens of coefficient `k1`, walls
 * white on a floor of grey 40.
 */
export function drawBoard(
  maze: Maze,
  board: Homography,
  width: number,
  height: number,
  k1 = 0
): Photo {
  const back = invertHomography(board);
  const lens = lensOf(width, height, k1);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = applyHomography(back, undistort(lens, { x, y }));
      const value = onWall(maze, at.x, at.y) ? 240 : 40;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }

  return { width, height, data };
}
