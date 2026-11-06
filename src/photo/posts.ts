/**
 * Fitting the board to the posts the photo shows, which corrects corners placed a little off.
 *
 * @module
 */

import { applyHomography, fitHomography, type Homography, type Point } from './homography';
import { sampleBilinear, type Plane } from './image';

/** How far from its predicted spot a post is looked for, as a share of a cell. */
const SEARCH_REACH = 0.4;

/** The step of the search, as a share of a cell. */
const SEARCH_STEP = 0.025;

/** Where the floor is read around a post, diagonally, as a share of a cell. */
const DIAGONAL = 0.35;

/** How much a share of a cell away from the predicted spot costs a candidate. */
const DISTANCE_COST = 0.1;

/** A found post's residual, past this many times the median, makes it an outlier. */
const OUTLIER_FACTOR = 2.5;

/** How post-like the board looks at `point`: light there and dark on the four diagonals. */
function postResponse(photo: Plane, board: Homography, point: Point): number {
  const at = (dx: number, dy: number) => {
    const p = applyHomography(board, { x: point.x + dx, y: point.y + dy });
    return sampleBilinear(photo, p.x, p.y);
  };
  const diagonals = [
    at(-DIAGONAL, -DIAGONAL),
    at(DIAGONAL, -DIAGONAL),
    at(-DIAGONAL, DIAGONAL),
    at(DIAGONAL, DIAGONAL),
  ];
  return at(0, 0) - diagonals.reduce((sum, value) => sum + value, 0) / diagonals.length;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The homography from board coordinates (cells, `(0, 0)` at the north-west corner) to photo
 * pixels refitted on the posts of a `size × size` board: each post is looked for near where
 * `board` puts it, as the most post-like spot, the fit drops the posts that disagree with it, and
 * the refit is kept only when it lies closer to the posts found than `board` does.
 */
export function refinePosts(photo: Plane, board: Homography, size: number): Homography {
  const grid: Point[] = [];
  const found: Point[] = [];
  const steps = Math.round(SEARCH_REACH / SEARCH_STEP);

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      let best = { response: Number.NEGATIVE_INFINITY, point: { x, y } };

      for (let dy = -steps; dy <= steps; dy++) {
        for (let dx = -steps; dx <= steps; dx++) {
          const point = { x: x + dx * SEARCH_STEP, y: y + dy * SEARCH_STEP };
          const response =
            postResponse(photo, board, point) - DISTANCE_COST * distance(point, { x, y });

          if (response > best.response) {
            best = { response, point };
          }
        }
      }

      if (Number.isFinite(best.response)) {
        grid.push({ x, y });
        found.push(applyHomography(board, best.point));
      }
    }
  }

  if (grid.length < 4) {
    return board;
  }

  const residuals = (h: Homography, indices: readonly number[]) =>
    indices.map((index) => distance(applyHomography(h, grid[index]), found[index]));
  let inliers = grid.map((_, index) => index);
  let fitted = board;

  for (let round = 0; round < 3 && inliers.length >= 4; round++) {
    fitted = fitHomography(
      inliers.map((index) => grid[index]),
      inliers.map((index) => found[index])
    );
    const errors = residuals(fitted, inliers);
    const limit = OUTLIER_FACTOR * Math.max(median(errors), 0.5);
    inliers = inliers.filter((_, k) => errors[k] <= limit);
  }

  return median(residuals(fitted, inliers)) < median(residuals(board, inliers)) ? fitted : board;
}
