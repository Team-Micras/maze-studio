/**
 * Edges of the grid by their coordinates, the unit of every wall edit.
 *
 * @module
 */

import { horizontalEdgeIndex, verticalEdgeIndex, type Cell, type Maze } from './maze';

/**
 * An edge of the grid. A `horizontal` edge `(x, y)` runs east–west on the south side of cell
 * `(x, y)`, with `y` from 0 (the south border) to `height` (the north border); a `vertical` edge
 * `(x, y)` runs north–south on the west side of cell `(x, y)`, with `x` from 0 (the west border)
 * to `width` (the east border).
 */
export interface Edge {
  readonly direction: 'horizontal' | 'vertical';
  readonly x: number;
  readonly y: number;
}

/** A side of a cell. */
export type CellSide = 'north' | 'east' | 'south' | 'west';

/** The edge on a side of a cell. */
export function edgeOfCell(cell: Cell, side: CellSide): Edge {
  switch (side) {
    case 'north':
      return { direction: 'horizontal', x: cell.x, y: cell.y + 1 };
    case 'south':
      return { direction: 'horizontal', x: cell.x, y: cell.y };
    case 'west':
      return { direction: 'vertical', x: cell.x, y: cell.y };
    default:
      return { direction: 'vertical', x: cell.x + 1, y: cell.y };
  }
}

/** Whether `edge` is an edge of `maze`, border edges included. */
export function isMazeEdge(maze: Pick<Maze, 'width' | 'height'>, edge: Edge): boolean {
  const [columns, rows] =
    edge.direction === 'horizontal' ? [maze.width, maze.height + 1] : [maze.width + 1, maze.height];
  return (
    Number.isInteger(edge.x) &&
    Number.isInteger(edge.y) &&
    edge.x >= 0 &&
    edge.y >= 0 &&
    edge.x < columns &&
    edge.y < rows
  );
}

/**
 * The index of `edge` in the wall set of its direction.
 *
 * @throws {RangeError} When the edge is not one of `maze`.
 */
export function edgeIndex(maze: Maze, edge: Edge): number {
  if (!isMazeEdge(maze, edge)) {
    throw new RangeError(
      `${edge.direction} edge (${edge.x}, ${edge.y}) is outside a ${maze.width}×${maze.height} maze`
    );
  }

  return edge.direction === 'horizontal'
    ? horizontalEdgeIndex(maze.width, edge.x, edge.y)
    : verticalEdgeIndex(maze.width, edge.x, edge.y);
}

/**
 * Whether there is a wall on `edge`.
 *
 * @throws {RangeError} When the edge is not one of `maze`.
 */
export function hasWall(maze: Maze, edge: Edge): boolean {
  const index = edgeIndex(maze, edge);
  return edge.direction === 'horizontal' ? maze.horizontal.get(index) : maze.vertical.get(index);
}
