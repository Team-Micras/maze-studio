/**
 * The maze model: a grid of cells, the walls on the edges between them, the start cell and the
 * goal cells. A maze never changes; every edit makes a new one.
 *
 * Cells are `(x, y)` with `(0, 0)` in the south-west corner. Walls live on edges, in two bit sets:
 * `horizontal` holds the `(height + 1) × width` edges that run east–west, edge `(x, y)` at index
 * `y × width + x` being the south side of cell `(x, y)`; `vertical` holds the
 * `height × (width + 1)` edges that run north–south, edge `(x, y)` at index `y × (width + 1) + x`
 * being the west side of cell `(x, y)`.
 *
 * @module
 */

import { Bits } from './bits';

/** The fewest cells a side of a maze has. */
export const MIN_SIDE = 1;

/** The most cells a side of a maze has. */
export const MAX_SIDE = 64;

/** A cell of the grid, `(0, 0)` being the south-west corner. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A maze. Build one with {@link createMaze}, which checks it. */
export interface Maze {
  /** Cells from west to east, 1 to 64. */
  readonly width: number;
  /** Cells from south to north, 1 to 64. */
  readonly height: number;
  /** The east–west edges, with a bit set where there is a wall. */
  readonly horizontal: Bits;
  /** The north–south edges, with a bit set where there is a wall. */
  readonly vertical: Bits;
  /** The start cell, if the maze has one. */
  readonly start: Cell | undefined;
  /** The goal cells in ascending {@link cellIndex} order, never including the start. */
  readonly goals: readonly Cell[];
}

/** What a maze is made of; the walls default to none and the goals to none. */
export interface MazeParts {
  readonly width: number;
  readonly height: number;
  readonly horizontal?: Bits;
  readonly vertical?: Bits;
  readonly start?: Cell;
  readonly goals?: Iterable<Cell>;
}

/** Whether `side` is a whole number of cells a maze can have on a side. */
export function isMazeSide(side: number): boolean {
  return Number.isInteger(side) && side >= MIN_SIDE && side <= MAX_SIDE;
}

/** How many east–west edges a maze of this size has. */
export function horizontalEdgeCount(width: number, height: number): number {
  return (height + 1) * width;
}

/** How many north–south edges a maze of this size has. */
export function verticalEdgeCount(width: number, height: number): number {
  return height * (width + 1);
}

/** The index in `horizontal` of the east–west edge on the south side of cell `(x, y)`. */
export function horizontalEdgeIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

/** The index in `vertical` of the north–south edge on the west side of cell `(x, y)`. */
export function verticalEdgeIndex(width: number, x: number, y: number): number {
  return y * (width + 1) + x;
}

/** The index of a cell in a maze `width` cells wide, row by row from the south-west corner. */
export function cellIndex(width: number, cell: Cell): number {
  return cell.y * width + cell.x;
}

/** The cell at `index` in a maze `width` cells wide. */
export function cellAt(width: number, index: number): Cell {
  return { x: index % width, y: Math.floor(index / width) };
}

/**
 * A maze made of `parts`, checked: the sides are 1 to 64, the wall sets have the edge counts of
 * that size, every cell is inside the grid, no goal repeats and the start is not a goal.
 *
 * @throws {RangeError} When the parts break one of those rules.
 */
export function createMaze(parts: MazeParts): Maze {
  const { width, height } = parts;

  if (!isMazeSide(width) || !isMazeSide(height)) {
    throw new RangeError(`a maze is 1 to 64 cells a side, not ${width}×${height}`);
  }

  const horizontal = parts.horizontal ?? Bits.from(horizontalEdgeCount(width, height));
  const vertical = parts.vertical ?? Bits.from(verticalEdgeCount(width, height));

  if (horizontal.length !== horizontalEdgeCount(width, height)) {
    throw new RangeError(
      `a ${width}×${height} maze has ${horizontalEdgeCount(width, height)} east–west edges, not ${horizontal.length}`
    );
  }

  if (vertical.length !== verticalEdgeCount(width, height)) {
    throw new RangeError(
      `a ${width}×${height} maze has ${verticalEdgeCount(width, height)} north–south edges, not ${vertical.length}`
    );
  }

  const inside = (cell: Cell): Cell => {
    if (
      !Number.isInteger(cell.x) ||
      !Number.isInteger(cell.y) ||
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= width ||
      cell.y >= height
    ) {
      throw new RangeError(`cell (${cell.x}, ${cell.y}) is outside a ${width}×${height} maze`);
    }

    return Object.freeze({ x: cell.x, y: cell.y });
  };

  const start = parts.start === undefined ? undefined : inside(parts.start);
  const goals = [...(parts.goals ?? [])]
    .map(inside)
    .toSorted((left, right) => cellIndex(width, left) - cellIndex(width, right));

  const taken = new Set(start === undefined ? [] : [cellIndex(width, start)]);

  for (const goal of goals) {
    const index = cellIndex(width, goal);

    if (taken.has(index)) {
      throw new RangeError(
        `cell (${goal.x}, ${goal.y}) is a goal twice, or both the start and a goal`
      );
    }

    taken.add(index);
  }

  return Object.freeze({ width, height, horizontal, vertical, start, goals: Object.freeze(goals) });
}

function sameCell(left: Cell | undefined, right: Cell | undefined): boolean {
  return left?.x === right?.x && left?.y === right?.y;
}

/** Whether two mazes have the same size, walls, start and goals. */
export function mazesEqual(left: Maze, right: Maze): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.horizontal.equals(right.horizontal) &&
    left.vertical.equals(right.vertical) &&
    sameCell(left.start, right.start) &&
    left.goals.length === right.goals.length &&
    left.goals.every((goal, index) => sameCell(goal, right.goals[index]))
  );
}
