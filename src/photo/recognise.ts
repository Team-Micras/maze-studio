/**
 * From a photo of a maze and its four outer corners to the maze.
 *
 * @module
 */

import { Bits, createMaze, type Cell, type Edge, type Maze } from '@/maze';

import { otsuThreshold, scoreEdges, type EdgeScores } from './classify';
import type { Point } from './homography';
import { lightness, type Photo } from './image';
import { locateBoard } from './posts';
import { rectify } from './rectify';
import { brokenRules, HALF_SIZE, repairLonePosts, type BrokenRule } from './rules';

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
  /** The start cell the rules are judged with; the south-west corner when left out. */
  readonly start?: Cell;
  /**
   * The goal cells the rules are judged with; when left out, the middle four cells of a maze
   * smaller than half size with an even side, and none otherwise.
   */
  readonly goals?: readonly Cell[];
}

/** A recognised maze and how sure the recogniser is of each edge. */
export interface Recognition {
  /** The walls found, the border always walled, with the start and goals the rules were judged with. */
  readonly maze: Maze;
  /**
   * From 0 (a coin toss) to 1 (sure) per edge, in the order of the maze's wall sets; the border
   * is 1, and an edge the photo does not show is 0.
   */
  readonly confidence: EdgeScores;
  /**
   * The walls added by the repair of a classic maze: one on the highest-scoring edge of each post
   * with no wall, and on the start's open sides but its lowest-scoring one; none for a half-size
   * maze.
   */
  readonly walled: readonly Edge[];
  /** Every edge at which the maze breaks a rule of a runnable maze, with the rules it breaks. */
  readonly broken: readonly { readonly edge: Edge; readonly rules: readonly BrokenRule[] }[];
}

/** Board pixels a cell: a wall top, a fifteenth of a cell, covers one or two. */
const SCALE = 24;

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
 * Recognises the walls of a maze from `photo` and its `outline`: fits the board and the lens to
 * the posts found from the four corners, straightens the board through them, scores every edge by
 * how much lighter its wall top is than the floor, splits the scores at Otsu's threshold, walls
 * the posts left with no wall, and reports the rules the maze still breaks.
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
  const camera = locateBoard(plane, corners, size);
  const scores = scoreEdges(rectify(plane, camera, size, SCALE), size, SCALE);
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

  const { maze, walled } = repairLonePosts(
    createMaze({
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
      start: outline.start,
      goals: outline.goals ?? middleGoals(size),
    }),
    scores
  );
  const rules = brokenRules(maze);

  return {
    maze,
    confidence: {
      horizontal: scores.horizontal.map((value, index) =>
        horizontalBorder(index) ? 1 : sure(value)
      ),
      vertical: scores.vertical.map((value, index) => (verticalBorder(index) ? 1 : sure(value))),
    },
    walled,
    broken: allEdges(size).flatMap((edge) => {
      const broken = rules(edge);
      return broken.length === 0 ? [] : [{ edge, rules: broken }];
    }),
  };
}

function middleGoals(size: number): Cell[] {
  const half = size / 2;
  return size >= HALF_SIZE || size % 2 !== 0
    ? []
    : [
        { x: half - 1, y: half - 1 },
        { x: half, y: half - 1 },
        { x: half - 1, y: half },
        { x: half, y: half },
      ];
}

function allEdges(size: number): Edge[] {
  return [
    ...Array.from({ length: (size + 1) * size }, (_, index): Edge => ({
      direction: 'horizontal',
      x: index % size,
      y: Math.floor(index / size),
    })),
    ...Array.from({ length: size * (size + 1) }, (_, index): Edge => ({
      direction: 'vertical',
      x: index % (size + 1),
      y: Math.floor(index / (size + 1)),
    })),
  ];
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
