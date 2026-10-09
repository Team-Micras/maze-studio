/**
 * Where in the maze a position of the text falls, so that what the file says about a line and a
 * column can be pointed at in the maze.
 *
 * @module
 */

import type { Edge } from './edges';
import type { Cell, Maze } from './maze';
import { COLUMNS_PER_CELL } from './text-layout';

/** The cell or edge of `maze` under a line and column of its text, both from 1. */
export interface TextPlace {
  readonly cell?: Cell;
  readonly edge?: Edge;
}

/**
 * The cell or edge of `maze` at a line and column of its canonical text, both from 1; empty for
 * a post, or a position outside the grid.
 */
export function placeOfText(maze: Maze, line: number, column: number): TextPlace {
  const row = line - 1;
  const offset = column - 1;
  const across = Math.floor(offset / COLUMNS_PER_CELL);
  const onPostColumn = offset % COLUMNS_PER_CELL === 0;

  if (row < 0 || offset < 0 || row > 2 * maze.height) {
    return {};
  }

  if (row % 2 === 0) {
    const y = maze.height - row / 2;
    return onPostColumn || across >= maze.width
      ? {}
      : { edge: { direction: 'horizontal', x: across, y } };
  }

  const y = maze.height - 1 - (row - 1) / 2;

  if (onPostColumn) {
    return across > maze.width ? {} : { edge: { direction: 'vertical', x: across, y } };
  }

  return across >= maze.width ? {} : { cell: { x: across, y } };
}
