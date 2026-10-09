/**
 * The edits of the editor, as pure functions: each takes a maze and returns the edited maze, or
 * the very same maze when the edit changes nothing, so that a caller can tell a no-op by identity.
 * Cells and edges outside the maze throw a `RangeError`.
 *
 * The start and the goals never overlap: putting the start on a goal takes that cell out of the
 * goals, and making the start a goal leaves the maze with no start.
 *
 * @module
 */

import { edgeIndex, hasWall, type Edge } from './edges';
import { cellIndex, createMaze, mazesEqual, type Cell, type Maze } from './maze';

/** A rectangle of cells between two opposite corners, both included, given in any order. */
export interface CellArea {
  readonly from: Cell;
  readonly to: Cell;
}

interface Bounds {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

function checkCell(maze: Maze, cell: Cell): void {
  if (
    !Number.isInteger(cell.x) ||
    !Number.isInteger(cell.y) ||
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= maze.width ||
    cell.y >= maze.height
  ) {
    throw new RangeError(
      `cell (${cell.x}, ${cell.y}) is outside a ${maze.width}×${maze.height} maze`
    );
  }
}

function bounds(maze: Maze, area: CellArea): Bounds {
  checkCell(maze, area.from);
  checkCell(maze, area.to);
  return {
    west: Math.min(area.from.x, area.to.x),
    east: Math.max(area.from.x, area.to.x),
    south: Math.min(area.from.y, area.to.y),
    north: Math.max(area.from.y, area.to.y),
  };
}

function unlessEqual(maze: Maze, next: Maze): Maze {
  return mazesEqual(maze, next) ? maze : next;
}

function* range(first: number, last: number): Generator<number> {
  for (let value = first; value <= last; value++) {
    yield value;
  }
}

function* perimeter({ west, east, south, north }: Bounds): Generator<Edge> {
  for (const x of range(west, east)) {
    yield { direction: 'horizontal', x, y: south };
    yield { direction: 'horizontal', x, y: north + 1 };
  }

  for (const y of range(south, north)) {
    yield { direction: 'vertical', x: west, y };
    yield { direction: 'vertical', x: east + 1, y };
  }
}

function* interior({ west, east, south, north }: Bounds): Generator<Edge> {
  for (const y of range(south + 1, north)) {
    for (const x of range(west, east)) {
      yield { direction: 'horizontal', x, y };
    }
  }

  for (const y of range(south, north)) {
    for (const x of range(west + 1, east)) {
      yield { direction: 'vertical', x, y };
    }
  }
}

/**
 * Puts `value` on every edge in `edges`: a wall when `true`, none when `false`. This is the edit
 * of a drag: the editor decides the value from the first edge it touches and lists every edge
 * the pointer crossed; which edges a pointer path crosses is the geometry's business, not this.
 * Edges may repeat.
 */
export function paintWalls(maze: Maze, edges: Iterable<Edge>, value: boolean): Maze {
  const horizontal: number[] = [];
  const vertical: number[] = [];

  for (const edge of edges) {
    (edge.direction === 'horizontal' ? horizontal : vertical).push(edgeIndex(maze, edge));
  }

  const nextHorizontal = maze.horizontal.withAll(horizontal, value);
  const nextVertical = maze.vertical.withAll(vertical, value);

  return nextHorizontal === maze.horizontal && nextVertical === maze.vertical
    ? maze
    : createMaze({ ...maze, horizontal: nextHorizontal, vertical: nextVertical });
}

/** Puts a wall on `edge` when `value` is `true`, or takes it away when `false`. */
export function setWall(maze: Maze, edge: Edge, value: boolean): Maze {
  return paintWalls(maze, [edge], value);
}

/** Puts a wall on `edge` if it has none, or takes it away if it has one. */
export function toggleWall(maze: Maze, edge: Edge): Maze {
  return setWall(maze, edge, !hasWall(maze, edge));
}

/** Walls in the outline of `area`, leaving the edges inside it as they are. */
export function wallRectangle(maze: Maze, area: CellArea): Maze {
  return paintWalls(maze, perimeter(bounds(maze, area)), true);
}

/** Takes away every wall between two cells of `area`, leaving its outline as it is. */
export function clearArea(maze: Maze, area: CellArea): Maze {
  return paintWalls(maze, interior(bounds(maze, area)), false);
}

/** Walls the whole border of the maze. */
export function fillBorder(maze: Maze): Maze {
  return wallRectangle(maze, {
    from: { x: 0, y: 0 },
    to: { x: maze.width - 1, y: maze.height - 1 },
  });
}

/**
 * Makes `cell` the start, taking it out of the goals if it was one, or leaves the maze with no
 * start when `cell` is `undefined`.
 */
export function moveStart(maze: Maze, cell: Cell | undefined): Maze {
  if (cell !== undefined) {
    checkCell(maze, cell);
  }

  const index = cell === undefined ? undefined : cellIndex(maze.width, cell);
  return unlessEqual(
    maze,
    createMaze({
      ...maze,
      start: cell,
      goals: maze.goals.filter((goal) => cellIndex(maze.width, goal) !== index),
    })
  );
}

/**
 * Makes `cells` the goals, in place of the ones before. Repeated cells count once; when the start
 * is among them, the maze is left with no start.
 */
export function setGoals(maze: Maze, cells: Iterable<Cell>): Maze {
  const goals = new Map<number, Cell>();

  for (const cell of cells) {
    checkCell(maze, cell);
    goals.set(cellIndex(maze.width, cell), cell);
  }

  const start =
    maze.start !== undefined && goals.has(cellIndex(maze.width, maze.start))
      ? undefined
      : maze.start;
  return unlessEqual(maze, createMaze({ ...maze, start, goals: goals.values() }));
}

/** Makes `cell` a goal if it is not one, or takes it out of the goals if it is. */
export function toggleGoal(maze: Maze, cell: Cell): Maze {
  checkCell(maze, cell);
  const index = cellIndex(maze.width, cell);
  const isGoal = maze.goals.some((goal) => cellIndex(maze.width, goal) === index);

  return setGoals(
    maze,
    isGoal
      ? maze.goals.filter((goal) => cellIndex(maze.width, goal) !== index)
      : [...maze.goals, cell]
  );
}
