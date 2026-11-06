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

/** The height of the walls as a share of a cell, 50 mm on 180. */
const WALL_HEIGHT = 50 / 180;

/** The steps a ray is followed in from the plane of the wall tops down to the floor. */
const RAY_STEPS = 32;

/**
 * A `width × height` photo of `maze` standing on its board, seen through a pinhole of focal
 * length `focal` pixels at the photo's centre, from `tilt` degrees off the vertical and `distance`
 * cells from the middle of the board, to its south: wall tops of grey `top`, the sides the camera
 * sees of grey `side`, on a floor of grey 40. Also returns where the photo shows each board point
 * of the wall tops.
 */
export function drawStandingBoard(
  maze: Maze,
  {
    width,
    height,
    focal,
    tilt,
    distance,
  }: {
    width: number;
    height: number;
    focal: number;
    tilt: number;
    distance: number;
  },
  { top, side }: { top: number; side: number }
): { photo: Photo; tops: Homography } {
  const size = maze.width;
  const angle = (tilt * Math.PI) / 180;
  const eye = [size / 2, size / 2 + distance * Math.sin(angle), distance * Math.cos(angle)];
  const rows = [
    [1, 0, 0],
    [0, Math.cos(angle), -Math.sin(angle)],
    [0, -Math.sin(angle), -Math.cos(angle)],
  ];
  const plane = (z: number): Homography => {
    const origin = rows.map((row) => -row[0] * eye[0] - row[1] * eye[1] + row[2] * (z - eye[2]));
    const columns = [rows.map((row) => row[0]), rows.map((row) => row[1]), origin];
    const shift = [(width - 1) / 2, (height - 1) / 2, 1];
    const h = [0, 1, 2].flatMap((row) =>
      columns.map((column) =>
        row === 2 ? column[2] : focal * column[row] + shift[row] * column[2]
      )
    );
    return h.map((value) => value / h[8]);
  };
  const tops = plane(0);
  const [fromTop, fromFloor] = [invertHomography(tops), invertHomography(plane(-WALL_HEIGHT))];
  const shares = Array.from({ length: RAY_STEPS + 1 }, (_, step) => step / RAY_STEPS);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const upper = applyHomography(fromTop, { x, y });
      const lower = applyHomography(fromFloor, { x, y });
      const hit = shares.find((share) =>
        onWall(maze, upper.x + (lower.x - upper.x) * share, upper.y + (lower.y - upper.y) * share)
      );
      const value = hit === undefined ? 40 : hit === 0 ? top : side;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }

  return { photo: { width, height, data }, tops };
}
