/**
 * From a photo of a maze and its four outer corners to the maze.
 *
 * @module
 */

import { Bits, createMaze, type Maze } from '@/maze';

import { otsuThreshold, scoreEdges, type EdgeScores } from './classify';
import { fitHomography, type Point } from './homography';
import { lightness, type Photo } from './image';
import { refinePosts } from './posts';
import { rectify } from './rectify';

/** Where the maze is in the photo. */
export interface MazeOutline {
  /** Cells a side: 16 for a classic maze, 32 for a half-size one. */
  readonly size: number;
  /**
   * The outer corners at the top of their posts, in photo pixels, in the order of the maze file
   * as it is printed: north-west, north-east, south-east, south-west. A corner may lie outside
   * the photo.
   */
  readonly corners: readonly [Point, Point, Point, Point];
}

/** A recognised maze and how sure the recogniser is of each edge. */
export interface Recognition {
  /** The walls found, the border always walled; no start and no goals. */
  readonly maze: Maze;
  /**
   * From 0 (a coin toss) to 1 (sure) per edge, in the order of the maze's wall sets; the border
   * is 1, and an edge the photo does not show is 0.
   */
  readonly confidence: EdgeScores;
}

/** Board pixels a cell: a wall top, a fifteenth of a cell, covers one or two. */
const SCALE = 24;

/** How many times the board is refitted to the posts, each search starting from the last fit. */
const POST_ROUNDS = 2;

function convexInOrder(corners: readonly Point[]): boolean {
  const turns = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const after = corners[(index + 2) % corners.length];
    return (next.x - corner.x) * (after.y - next.y) - (next.y - corner.y) * (after.x - next.x);
  });

  return (
    corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y)) &&
    (turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0))
  );
}

/**
 * Recognises the walls of a maze from `photo` and its `outline`: straightens the board from the
 * four corners, fits the homography to the posts found near where it puts them, scores every edge
 * by how much lighter its wall top is than the floor, and splits the scores at Otsu's threshold.
 *
 * The corners may run either way round the board: the reverse order reads the maze mirrored.
 *
 * @throws {RangeError} When the corners are not finite or do not outline a convex quadrilateral in
 * order, as when two coincide, three lie on a line, or two adjacent ones are swapped.
 */
export function recogniseMaze(photo: Photo, outline: MazeOutline): Recognition {
  const { size, corners } = outline;

  if (!convexInOrder(corners)) {
    throw new RangeError('the four corners must outline a convex quadrilateral, in order');
  }

  const plane = lightness(photo);
  let board = fitHomography(
    [
      { x: 0, y: 0 },
      { x: size, y: 0 },
      { x: size, y: size },
      { x: 0, y: size },
    ],
    corners
  );

  for (let round = 0; round < POST_ROUNDS; round++) {
    board = refinePosts(plane, board, size);
  }

  const scores = scoreEdges(rectify(plane, board, size, SCALE), size, SCALE);
  const horizontalBorder = (index: number) => index < size || index >= size * size;
  const verticalBorder = (index: number) => index % (size + 1) === 0 || index % (size + 1) === size;
  const internal = [
    ...scores.horizontal.filter((_, index) => !horizontalBorder(index)),
    ...scores.vertical.filter((_, index) => !verticalBorder(index)),
  ];
  const threshold = otsuThreshold(internal);
  const spread =
    (mean(internal.filter((value) => value > threshold)) -
      mean(internal.filter((value) => value <= threshold))) /
    2;
  const sure = (value: number) =>
    Number.isNaN(value) || !(spread > 0) ? 0 : Math.min(1, Math.abs(value - threshold) / spread);

  return {
    maze: createMaze({
      width: size,
      height: size,
      horizontal: Bits.from(
        scores.horizontal.length,
        (index) => horizontalBorder(index) || scores.horizontal[index] > threshold
      ),
      vertical: Bits.from(
        scores.vertical.length,
        (index) => verticalBorder(index) || scores.vertical[index] > threshold
      ),
    }),
    confidence: {
      horizontal: scores.horizontal.map((value, index) =>
        horizontalBorder(index) ? 1 : sure(value)
      ),
      vertical: scores.vertical.map((value, index) => (verticalBorder(index) ? 1 : sure(value))),
    },
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
