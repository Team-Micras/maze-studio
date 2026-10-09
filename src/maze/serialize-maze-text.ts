/**
 * Writing a maze document in the canonical mazefiles text.
 *
 * @module
 */

import { cellIndex, horizontalEdgeIndex, verticalEdgeIndex, type Maze } from './maze';
import type { MazeText } from './maze-text';
import {
  BLANK,
  GOAL_MARK,
  HORIZONTAL_WALL,
  NO_HORIZONTAL_WALL,
  POST,
  START_MARK,
  VERTICAL_WALL,
} from './text-layout';

function marks(maze: Maze): Map<number, string> {
  const found = new Map(maze.goals.map((goal) => [cellIndex(maze.width, goal), GOAL_MARK]));

  if (maze.start !== undefined) {
    found.set(cellIndex(maze.width, maze.start), START_MARK);
  }

  return found;
}

function postLine(maze: Maze, y: number): string {
  let line = POST;

  for (let x = 0; x < maze.width; x++) {
    const wall = maze.horizontal.get(horizontalEdgeIndex(maze.width, x, y));
    line += (wall ? HORIZONTAL_WALL : NO_HORIZONTAL_WALL) + POST;
  }

  return line;
}

function cellLine(maze: Maze, y: number, cellMarks: ReadonlyMap<number, string>): string {
  const wall = (x: number) =>
    maze.vertical.get(verticalEdgeIndex(maze.width, x, y)) ? VERTICAL_WALL : BLANK;
  let line = '';

  for (let x = 0; x < maze.width; x++) {
    line += `${wall(x)}${BLANK}${cellMarks.get(cellIndex(maze.width, { x, y })) ?? BLANK}${BLANK}`;
  }

  return line + wall(maze.width);
}

/** The grid of `maze` in the canonical text, its lines joined by line feeds, with no final one. */
export function mazeGridText(maze: Maze): string {
  const cellMarks = marks(maze);
  const lines = [postLine(maze, maze.height)];

  for (let y = maze.height - 1; y >= 0; y--) {
    lines.push(cellLine(maze, y, cellMarks), postLine(maze, y));
  }

  return lines.join('\n');
}

/**
 * The text of a maze document: the canonical grid in line feeds, then the trailer as it is. A file
 * read with no irregularities, no carriage returns and a final line feed comes back byte for byte.
 */
export function serializeMazeText(document: Pick<MazeText, 'maze' | 'trailer'>): string {
  return `${mazeGridText(document.maze)}\n${document.trailer}`;
}
