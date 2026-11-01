/**
 * The two shortest routes from the start to the goal, independent of any robot: one without
 * diagonals, the fewest cells and among those the fewest turns, and one with diagonals, the
 * shortest by length.
 *
 * Both search the diagonal graph of the maze. Its nodes are the cell centres and the middles of
 * the open walls between two cells; in doubled coordinates a centre sits at (odd, odd) and the
 * middle of a wall at (odd, even) or (even, odd). A move is a half-step in one of 8 headings:
 * orthogonal, from a centre to a wall middle or back, 0.5 cell long, only through an open wall;
 * diagonal, from the middle of one wall to the middle of a neighbouring wall of the same cell,
 * √2/2 cell long. A route starts at the start cell's centre and ends at the centre of the first goal
 * cell it reaches; reversing is not a move. The robot starts facing north, so a first move another
 * way counts as a turn when equal routes are told apart by their turns.
 *
 * @module
 */

import { horizontalEdgeIndex, verticalEdgeIndex, type Cell, type Maze } from './maze';

/** A point of a route in cells: `u` east from the west border, `v` north from the south border. */
export interface RoutePoint {
  readonly u: number;
  readonly v: number;
}

/** A route from the start cell's centre to a goal cell's centre. */
export interface Route {
  /** Its nodes, one per half-step, the start centre first. */
  readonly points: readonly RoutePoint[];
  /** The cells entered after the start: the walls crossed. */
  readonly cells: number;
  /** Its length in cells, centre to centre. */
  readonly length: number;
}

/** The two routes of a maze. */
export interface ShortestRoutes {
  readonly withoutDiagonals: Route;
  readonly withDiagonals: Route;
}

const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [1, 1, 0, -1, -1, -1, 0, 1];
const START = 8;
const NORTH = 0;
const TURN_TIE = 1e-6;

const stepLength = (heading: number): number => (heading & 1 ? Math.SQRT1_2 : 0.5);

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const { keys, values } = this;
    keys.push(key);
    values.push(value);
    let i = keys.length - 1;

    while (i > 0) {
      const parent = (i - 1) >> 1;

      if (keys[parent] <= keys[i]) {
        break;
      }

      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): readonly [key: number, value: number] {
    const { keys, values } = this;
    const top = [keys[0], values[0]] as const;
    const lastKey = keys.pop() ?? 0;
    const lastValue = values.pop() ?? 0;

    if (keys.length > 0) {
      keys[0] = lastKey;
      values[0] = lastValue;
      let i = 0;

      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let least = i;

        if (left < keys.length && keys[left] < keys[least]) {
          least = left;
        }

        if (right < keys.length && keys[right] < keys[least]) {
          least = right;
        }

        if (least === i) {
          break;
        }

        this.swap(i, least);
        i = least;
      }
    }

    return top;
  }

  private swap(a: number, b: number): void {
    const { keys, values } = this;
    [keys[a], keys[b]] = [keys[b], keys[a]];
    [values[a], values[b]] = [values[b], values[a]];
  }
}

function search(maze: Maze, start: Cell, diagonals: boolean): Route | null {
  const { width, height } = maze;
  const span = 2 * width + 1;
  const centre = (x: number, y: number): number => (2 * y + 1) * span + 2 * x + 1;
  const isNode = (a: number, b: number): boolean => {
    if (a <= 0 || b <= 0 || a >= 2 * width || b >= 2 * height) {
      return false;
    }

    if (a & 1 && b & 1) {
      return true;
    }

    if (a & 1) {
      return !maze.horizontal.get(horizontalEdgeIndex(width, (a - 1) >> 1, b >> 1));
    }

    return b & 1 ? !maze.vertical.get(verticalEdgeIndex(width, a >> 1, (b - 1) >> 1)) : false;
  };
  const next = (node: number, heading: number): number => {
    const a = node % span;
    const b = Math.floor(node / span);
    const centred = a & 1 && b & 1;

    if (heading & 1 ? centred : !centred && (b & 1) === (heading === 0 || heading === 4 ? 1 : 0)) {
      return -1;
    }

    return isNode(a + DX[heading], b + DY[heading]) ? node + DY[heading] * span + DX[heading] : -1;
  };

  const startNode = centre(start.x, start.y);
  const goals = new Set(maze.goals.map((goal) => centre(goal.x, goal.y)));
  const best = new Map<number, number>();
  const previous = new Map<number, number>();
  const heap = new MinHeap();
  const first = startNode * 9 + START;
  best.set(first, 0);
  heap.push(0, first);

  while (heap.size > 0) {
    const [distance, state] = heap.pop();

    if (distance > (best.get(state) ?? Infinity)) {
      continue;
    }

    const node = Math.floor(state / 9);
    const heading = state % 9;

    if (goals.has(node)) {
      const nodes: number[] = [];

      for (let at: number | undefined = state; at !== undefined; at = previous.get(at)) {
        nodes.push(Math.floor(at / 9));
      }

      return routeOf(nodes.toReversed(), span);
    }

    for (let to = 0; to < 8; to++) {
      if ((to & 1 && !diagonals) || (heading !== START && (heading + 4) % 8 === to)) {
        continue;
      }

      const neighbour = next(node, to);

      if (neighbour < 0) {
        continue;
      }

      const reached = neighbour * 9 + to;
      const turned = (heading === START ? NORTH : heading) === to ? 0 : TURN_TIE;
      const cost = distance + stepLength(to) + turned;

      if (cost < (best.get(reached) ?? Infinity)) {
        best.set(reached, cost);
        previous.set(reached, state);
        heap.push(cost, reached);
      }
    }
  }

  return null;
}

function routeOf(nodes: readonly number[], span: number): Route {
  const doubled = nodes.map((node) => [node % span, Math.floor(node / span)] as const);
  let length = 0;
  let cells = 0;

  for (let i = 1; i < doubled.length; i++) {
    const [a, b] = doubled[i];
    length += a !== doubled[i - 1][0] && b !== doubled[i - 1][1] ? Math.SQRT1_2 : 0.5;
    cells += (a & 1) === (b & 1) ? 0 : 1;
  }

  return { points: doubled.map(([a, b]) => ({ u: a / 2, v: b / 2 })), cells, length };
}

const memo = new WeakMap<Maze, ShortestRoutes | null | undefined>();

function routesOf(maze: Maze): ShortestRoutes | null | undefined {
  const { start } = maze;

  if (start === undefined || maze.goals.length === 0) {
    return undefined;
  }

  const withoutDiagonals = search(maze, start, false);
  const withDiagonals = withoutDiagonals === null ? null : search(maze, start, true);
  return withoutDiagonals === null || withDiagonals === null
    ? null
    : { withoutDiagonals, withDiagonals };
}

/**
 * The shortest routes of `maze`: `undefined` when it has no start or no goal, `null` when no goal
 * is in reach of the start. Remembered per maze, which never changes.
 */
export function shortestRoutes(maze: Maze): ShortestRoutes | null | undefined {
  if (!memo.has(maze)) {
    memo.set(maze, routesOf(maze));
  }

  return memo.get(maze);
}
