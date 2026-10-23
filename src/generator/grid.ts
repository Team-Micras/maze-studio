/**
 * The cell grid of the analysis and the generator: one byte of walls per cell, the bitmask of the
 * mazefiles binary format (north 1, east 2, south 4, west 8). Cell `i = y × width + x`, `(0, 0)`
 * being the south-west corner. Directions are indexed 0 north, 1 east, 2 south, 3 west. Outer
 * edges are always walls here, whatever the maze says.
 *
 * @module
 */

import { Bits, createMaze, horizontalEdgeIndex, verticalEdgeIndex, type Maze } from '@/maze';

/**
 * A board: its walls per cell, the start and goal cells by index, and, on a generated board, a
 * walled-off `room` (1 per cell) with the count of its cells, `closed` (rules `closedBoard`).
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly walls: Uint8Array;
  readonly start: number;
  readonly goals: readonly number[];
  readonly room?: Uint8Array | null;
  readonly closed?: number;
}

/** The wall bit of each direction. */
export const BIT: readonly number[] = [1, 2, 4, 8];
const DX = [0, 1, 0, -1];
const DY = [1, 0, -1, 0];

/** The size of a grid, all that neighbour lookups need. */
export type GridSize = Pick<Grid, 'width' | 'height'>;

/** The neighbour of cell `i` in direction `d`, or -1 outside the grid. */
export function neighbour(g: GridSize, i: number, d: number): number {
  const x = (i % g.width) + DX[d];
  const y = Math.floor(i / g.width) + DY[d];
  return x < 0 || y < 0 || x >= g.width || y >= g.height ? -1 : y * g.width + x;
}

const neighbourTables = new Map<string, Int32Array>();

/** The neighbour table of a board size, -1 outside: `table[c × 4 + d]`. Shared; never modify it. */
export function neighbourTable(g: GridSize): Int32Array {
  const id = `${g.width}x${g.height}`;
  let t = neighbourTables.get(id);
  if (!t) {
    t = new Int32Array(g.width * g.height * 4);
    for (let c = 0; c < g.width * g.height; c++) {
      for (let d = 0; d < 4; d++) {
        t[c * 4 + d] = neighbour(g, c, d);
      }
    }
    neighbourTables.set(id, t);
  }
  return t;
}

/** Buffers and options of {@link bfs}. */
export interface BfsOptions {
  /** Walls that stand in for the grid's, as a robot's known map does. */
  readonly walls?: Uint8Array;
  readonly dist?: Int32Array;
  readonly order?: Int32Array;
  /** The search stops once it takes this cell from the queue. */
  readonly stop?: number;
}

/** The result of {@link bfs}. */
export interface BfsResult {
  /** Moves from the nearest source, -1 where not reached. */
  readonly dist: Int32Array;
  /** The cells reached, nearest first; the first `count` are set. */
  readonly order: Int32Array;
  readonly count: number;
}

/**
 * Breadth-first search over the open edges from `sources`, the one every stage shares: `dist`
 * gets the moves from the nearest source and `order` the cells reached, nearest first.
 */
export function bfs(
  g: Grid,
  sources: Iterable<number>,
  {
    walls = g.walls,
    dist = new Int32Array(g.width * g.height),
    order = new Int32Array(g.width * g.height),
    stop = -1,
  }: BfsOptions = {}
): BfsResult {
  const next = neighbourTable(g);
  dist.fill(-1);
  let tail = 0;
  for (const c of sources) {
    if (dist[c] === 0) {
      continue;
    }
    dist[c] = 0;
    order[tail++] = c;
  }
  for (let head = 0; head < tail; head++) {
    const c = order[head];
    if (c === stop) {
      break;
    }
    const w = walls[c];
    for (let d = 0; d < 4; d++) {
      if (w & BIT[d]) {
        continue;
      }
      const n = next[c * 4 + d];
      if (n < 0 || dist[n] >= 0) {
        continue;
      }
      dist[n] = dist[c] + 1;
      order[tail++] = n;
    }
  }
  return { dist, order, count: tail };
}

/** The direction from cell `a` to its neighbour `b`. */
export const dirTo = (g: GridSize, a: number, b: number): number =>
  b - a === g.width ? 0 : b - a === 1 ? 1 : b - a === -g.width ? 2 : 3;

/** Whether cell `i` has no wall in direction `d`. */
export const isOpen = (g: Grid, i: number, d: number): boolean => (g.walls[i] & BIT[d]) === 0;

/**
 * Opens (`value` 0) or closes (`value` 1) the wall between cell `i` and its neighbour in direction
 * `d`, on both sides.
 */
export function setWall(g: Grid, i: number, d: number, value: number): void {
  const n = neighbour(g, i, d);
  if (n < 0) {
    return;
  }
  const o = (d + 2) % 4;
  if (value) {
    g.walls[i] |= BIT[d];
    g.walls[n] |= BIT[o];
  } else {
    g.walls[i] &= ~BIT[d];
    g.walls[n] &= ~BIT[o];
  }
}

/** The grid of a maze of maze-studio, with walls on its outer edges whatever the maze says. */
export function fromMaze(maze: Maze): Grid {
  const { width: w, height: h, horizontal, vertical } = maze;
  const walls = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const north = y === h - 1 || horizontal.get(horizontalEdgeIndex(w, x, y + 1));
      const east = x === w - 1 || vertical.get(verticalEdgeIndex(w, x + 1, y));
      const south = y === 0 || horizontal.get(horizontalEdgeIndex(w, x, y));
      const west = x === 0 || vertical.get(verticalEdgeIndex(w, x, y));
      walls[y * w + x] = (north ? 1 : 0) | (east ? 2 : 0) | (south ? 4 : 0) | (west ? 8 : 0);
    }
  }
  return {
    width: w,
    height: h,
    walls,
    start: maze.start ? maze.start.y * w + maze.start.x : -1,
    goals: maze.goals.map(({ x, y }) => y * w + x),
  };
}

/** The maze of maze-studio that a grid draws, its start dropped when it is also a goal. */
export function toMaze(g: Grid): Maze {
  const { width: w, height: h, walls } = g;
  const cell = (i: number) => ({ x: i % w, y: Math.floor(i / w) });
  const wall = (c: number, bit: number) => (walls[c] & bit) !== 0;
  return createMaze({
    width: w,
    height: h,
    horizontal: Bits.from((h + 1) * w, (i) => {
      const [x, y] = [i % w, Math.floor(i / w)];
      return (y < h && wall(y * w + x, 4)) || (y > 0 && wall((y - 1) * w + x, 1));
    }),
    vertical: Bits.from(h * (w + 1), (i) => {
      const [x, y] = [i % (w + 1), Math.floor(i / (w + 1))];
      return (x < w && wall(y * w + x, 8)) || (x > 0 && wall(y * w + x - 1, 2));
    }),
    start: g.start >= 0 && !g.goals.includes(g.start) ? cell(g.start) : undefined,
    goals: [...new Set(g.goals)].map(cell),
  });
}
