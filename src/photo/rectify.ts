/**
 * The photo seen from straight above the wall tops.
 *
 * @module
 */

import { applyHomography, type Homography } from './homography';
import { sampleBilinear, type Plane } from './image';

const SUBSAMPLES = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const;

/**
 * The square board of `cells × scale` pixels on the plane of the wall tops, sampled from `photo`
 * through `board`, the homography from board coordinates (cells, `(0, 0)` at the north-west
 * corner, x east and y south) to photo pixels. Each board pixel averages four samples, so a photo
 * finer than the board does not alias.
 */
export function rectify(photo: Plane, board: Homography, cells: number, scale: number): Plane {
  const side = cells * scale;
  const data = new Float32Array(side * side);

  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      let sum = 0;

      for (const [dx, dy] of SUBSAMPLES) {
        const at = applyHomography(board, {
          x: (column + dx) / scale,
          y: (row + dy) / scale,
        });
        sum += sampleBilinear(photo, at.x, at.y);
      }

      data[row * side + column] = sum / SUBSAMPLES.length;
    }
  }

  return { width: side, height: side, data };
}
