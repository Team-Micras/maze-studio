/**
 * The classic micromouse search, as the Micras firmware runs it: a robot that knows only the
 * border, its start cell and the goal area floods the maze from the goals, taking every unknown
 * wall as open, and steps to the neighbour of lowest cost, sensing the walls in front and on both
 * sides of each cell it enters, until it enters a goal cell.
 *
 * The robot starts in the start cell facing its exit, the first open side of north, east, south
 * and west, and takes the start cell's other sides as walls and the walls between two goal cells as
 * open. On a tie it goes forward, then left, then right, then back.
 *
 * @module
 */

import type { CellSide, Edge } from './edges';
import { horizontalEdgeCount, verticalEdgeCount, type Cell, type Maze } from './maze';

/** A cell the robot is in, and the way it faces, the way it moved to get there. */
export interface ExplorationStep extends Cell {
  readonly heading: CellSide;
}

/** The search from the start to the first goal cell the robot enters. */
export interface Exploration {
  /** The cells in the order the robot is in them, the start first and a goal last. */
  readonly steps: readonly ExplorationStep[];
  /** The moves from one cell to the next: one less than the steps. */
  readonly moves: number;
  /** The distinct cells visited, the start and the goal included. */
  readonly cells: number;
  /** The share of the wall places known at the end, 0 to 1. */
  readonly seen: number;
  /** Every wall of the maze, with the step at which the robot knew it. */
  readonly walls: readonly SeenWall[];
}

/**
 * A wall and the step at which the robot knew it: 0 for what it knows before it moves,
 * {@link NEVER_SEEN} for what it never learns.
 */
export interface SeenWall extends Edge {
  readonly seenAt: number;
}

/** The step of an edge the robot never learns. */
export const NEVER_SEEN = 0xffff;

const SIDES: readonly CellSide[] = ['north', 'east', 'south', 'west'];
const DX = [0, 1, 0, -1];
const DY = [1, 0, -1, 0];
const UNKNOWN = 0;
const WALL = 1;
const OPEN = 2;
const FAR = 0xffff;

function wallsOf(maze: Maze, direction: Edge['direction'], seenAt: Uint16Array): SeenWall[] {
  const walls = direction === 'horizontal' ? maze.horizontal : maze.vertical;
  const columns = direction === 'horizontal' ? maze.width : maze.width + 1;
  return [...seenAt].flatMap((at, index) =>
    walls.get(index)
      ? [{ direction, x: index % columns, y: Math.floor(index / columns), seenAt: at }]
      : []
  );
}

function search(maze: Maze, start: Cell): Exploration | null {
  const { width, height } = maze;
  const horizontalKnown = new Uint8Array(horizontalEdgeCount(width, height));
  const verticalKnown = new Uint8Array(verticalEdgeCount(width, height));
  const horizontalSeenAt = new Uint16Array(horizontalKnown.length).fill(NEVER_SEEN);
  const verticalSeenAt = new Uint16Array(verticalKnown.length).fill(NEVER_SEEN);
  const edge = (x: number, y: number, side: number): readonly [vertical: boolean, index: number] =>
    side === 0 || side === 2
      ? [false, (y + (side === 0 ? 1 : 0)) * width + x]
      : [true, y * (width + 1) + x + (side === 1 ? 1 : 0)];
  const known = (x: number, y: number, side: number): number => {
    const [vertical, index] = edge(x, y, side);
    return (vertical ? verticalKnown : horizontalKnown)[index];
  };
  const real = (x: number, y: number, side: number): boolean => {
    const [vertical, index] = edge(x, y, side);
    return (vertical ? maze.vertical : maze.horizontal).get(index);
  };
  const cell = (x: number, y: number): number => y * width + x;
  const blocked = new Uint8Array(width * height);
  const learn = (x: number, y: number, side: number, value: number, step: number): void => {
    const [vertical, index] = edge(x, y, side);
    (vertical ? verticalKnown : horizontalKnown)[index] = value;
    (vertical ? verticalSeenAt : horizontalSeenAt)[index] = step;
    const nx = x + DX[side];
    const ny = y + DY[side];

    if (value === WALL) {
      blocked[cell(x, y)] |= 1 << side;

      if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
        blocked[cell(nx, ny)] |= 1 << ((side + 2) % 4);
      }
    }
  };
  const goals = new Set(maze.goals.map((goal) => cell(goal.x, goal.y)));

  for (let x = 0; x < width; x++) {
    learn(x, 0, 2, WALL, 0);
    learn(x, height - 1, 0, WALL, 0);
  }

  for (let y = 0; y < height; y++) {
    learn(0, y, 3, WALL, 0);
    learn(width - 1, y, 1, WALL, 0);
  }

  const exit = [0, 1, 2, 3].find((side) => !real(start.x, start.y, side));

  if (exit === undefined) {
    return null;
  }

  for (let side = 0; side < 4; side++) {
    learn(start.x, start.y, side, side === exit ? OPEN : WALL, 0);
  }

  for (const goal of maze.goals) {
    for (let side = 0; side < 4; side++) {
      if (goals.has(cell(goal.x + DX[side], goal.y + DY[side]))) {
        learn(goal.x, goal.y, side, OPEN, 0);
      }
    }
  }

  const costs = new Uint16Array(width * height);
  const queue = new Int32Array(width * height);
  const flood = (): void => {
    costs.fill(FAR);
    let tail = 0;

    for (const goal of goals) {
      costs[goal] = 0;
      queue[tail++] = goal;
    }

    for (let head = 0; head < tail; head++) {
      const at = queue[head];

      for (let side = 0; side < 4; side++) {
        const next = at + DY[side] * width + DX[side];

        if (!(blocked[at] & (1 << side)) && costs[next] === FAR) {
          costs[next] = costs[at] + 1;
          queue[tail++] = next;
        }
      }
    }
  };

  const steps: ExplorationStep[] = [{ x: start.x, y: start.y, heading: SIDES[exit] }];
  const visited = new Set([cell(start.x, start.y)]);
  const limit = 8 * width * height;
  let x = start.x + DX[exit];
  let y = start.y + DY[exit];
  let heading = exit;

  while (steps.length <= limit) {
    const step = steps.length;
    steps.push({ x, y, heading: SIDES[heading] });
    visited.add(cell(x, y));

    if (goals.has(cell(x, y))) {
      return {
        steps,
        moves: steps.length - 1,
        cells: visited.size,
        seen:
          (horizontalSeenAt.filter((at) => at !== NEVER_SEEN).length +
            verticalSeenAt.filter((at) => at !== NEVER_SEEN).length) /
          (horizontalSeenAt.length + verticalSeenAt.length),
        walls: [
          ...wallsOf(maze, 'horizontal', horizontalSeenAt),
          ...wallsOf(maze, 'vertical', verticalSeenAt),
        ],
      };
    }

    for (const side of [heading, (heading + 3) % 4, (heading + 1) % 4]) {
      if (known(x, y, side) === UNKNOWN) {
        learn(x, y, side, real(x, y, side) ? WALL : OPEN, step);
      }
    }

    flood();
    let best = -1;
    let bestCost = FAR;

    for (const side of [heading, (heading + 3) % 4, (heading + 1) % 4, (heading + 2) % 4]) {
      const cost =
        blocked[cell(x, y)] & (1 << side) ? FAR : costs[cell(x + DX[side], y + DY[side])];

      if (cost < bestCost) {
        best = side;
        bestCost = cost;
      }
    }

    if (best < 0) {
      return null;
    }

    heading = best;
    x += DX[best];
    y += DY[best];
  }

  return null;
}

const memo = new WeakMap<Maze, Exploration | null | undefined>();

/**
 * The flood-fill search of `maze` from the start to a goal: `undefined` when it has no start or
 * no goal, `null` when the robot cannot reach a goal. Remembered per maze, which never changes.
 */
export function explore(maze: Maze): Exploration | null | undefined {
  if (!memo.has(maze)) {
    memo.set(
      maze,
      maze.start === undefined || maze.goals.length === 0 ? undefined : search(maze, maze.start)
    );
  }

  return memo.get(maze);
}

/** Whether the search of `maze` is already known, run here or remembered. */
export function explorationKnown(maze: Maze): boolean {
  return memo.has(maze);
}

/** Remembers `exploration` as the search of `maze`, run elsewhere, as in a worker. */
export function rememberExploration(maze: Maze, exploration: Exploration | null | undefined): void {
  memo.set(maze, exploration);
}
