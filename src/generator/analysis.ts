/**
 * Flood fill and maze numbers, shared by the generator and its targets. Distances are in cells to
 * the goal by BFS over open edges, the goal cells worth 0; loops count the goal area as one node;
 * a diagonal is a maximal zigzag of at least 3 moves.
 *
 * @module
 */

import { BIT, bfs, dirTo, neighbour, type BfsResult, type Grid } from './grid';

/** The numbers of a maze that {@link analyse} measures. */
export interface BaseAnalysis {
  /** Distance to the goal per cell, -1 when the goal cannot be reached from it. */
  dist: Int32Array;
  /** Cells of the drawn shortest path, start first; empty when there is none. */
  path: number[];
  /** Cells moved along the shortest path (moves), -1 without a path. */
  shortest: number;
  /** Turns on the drawn path, the fewest of all shortest paths. */
  turns: number;
  /** Longest run of moves in one direction on the drawn path. */
  maxStraight: number;
  /** Longest zigzag on the drawn path, 0 when none reaches 3 moves. */
  maxDiagonal: number;
  /** Number of distinct shortest paths. */
  pathCount: number;
  /** Independent cycles among the cells that reach the goal, goal area contracted. */
  loops: number;
  /** Cells that cannot reach the goal. */
  unreachable: number;
  /** Share of the cells that reach the goal with three walls, the start left out, %. */
  deadEnds: number;
  /** Share of the cells that reach the goal with two opposite walls (straight passage), %. */
  corridors: number;
}

/** Turns, straights and zigzags of a list of moves. */
export interface Levels {
  turns: number;
  /** Longest run of moves in one direction. */
  maxStraight: number;
  /** Longest zigzag, 0 when none reaches 3 moves. */
  maxDiagonal: number;
}

/** The shape of a route: its {@link Levels} and what tells a twisty or coiled route apart. */
export interface Geometry extends Levels {
  /** 90 degree corners outside zigzags, per move: what makes a route twisty. */
  corners: number;
  /**
   * S-bends: a U-turn (two turns the same way, a link of at most 2 moves, arms of 2 or more)
   * followed right away by one the other way, the back-and-forth rows of a route filling an area.
   */
  bends: number;
  /** Longest chain of long legs, each going back the way the one before came: a comb. */
  hairpins: number;
  /** Most turns the same way in a row between runs of 2 moves or more: a spiral has 4 or more. */
  coil: number;
}

/** The caps on a route's shape that {@link overCap} measures against. */
export interface ShapeCap {
  readonly corners: number;
  readonly bends: number;
  readonly hairpins: number;
  readonly coil: number;
}

const INF = 0x3fffffff;

type Run = [direction: number, length: number];

/** Multi-source BFS from the goal cells; `order` lists the reached cells by distance. */
export const flood = (g: Grid): BfsResult => bfs(g, g.goals);

function levels(moves: readonly number[]): Levels {
  let turns = 0;
  let run = 1;
  let maxStraight = moves.length ? 1 : 0;
  for (let i = 1; i < moves.length; i++) {
    if (moves[i] === moves[i - 1]) {
      run++;
    } else {
      turns++;
      run = 1;
    }
    maxStraight = Math.max(maxStraight, run);
  }
  let maxDiagonal = 0;
  let i = 0;
  while (i < moves.length - 2) {
    let j = i + 1;
    if (moves[j] !== moves[i] && moves[j] % 2 !== moves[i] % 2) {
      while (j + 1 < moves.length && moves[j + 1] === moves[j - 1]) {
        j++;
      }
      if (j - i + 1 >= 3) {
        maxDiagonal = Math.max(maxDiagonal, j - i + 1);
        i = j;
        continue;
      }
    }
    i++;
  }
  return { turns, maxStraight, maxDiagonal };
}

function coils(runs: readonly Run[], leg: number): Pick<Geometry, 'hairpins' | 'coil'> {
  let hairpins = 0;
  let chain = 0;
  let last = -1;
  for (const [d, n] of runs) {
    if (n < leg) {
      continue;
    }
    chain = last >= 0 && d === (last + 2) % 4 ? chain + 1 : 1;
    hairpins = Math.max(hairpins, chain);
    last = d;
  }
  let coil = 0;
  let same = 0;
  let sense = 0;
  for (let i = 1; i < runs.length; i++) {
    const turn = (runs[i][0] - runs[i - 1][0] + 4) % 4;
    same = runs[i][1] < 2 || runs[i - 1][1] < 2 ? 0 : turn === sense ? same + 1 : 1;
    sense = turn;
    coil = Math.max(coil, same);
  }
  return { hairpins, coil };
}

function sBends(runs: readonly Run[]): number {
  let bends = 0;
  let last = -1;
  let lastSense = -1;
  for (let i = 2; i < runs.length; i++) {
    const [a, b, c] = [runs[i - 2], runs[i - 1], runs[i]];
    if (c[0] !== (a[0] + 2) % 4 || b[1] > 2 || a[1] < 2 || c[1] < 2) {
      continue;
    }
    const sense = (b[0] - a[0] + 4) % 4;
    if (i - last === 2 && sense !== lastSense) {
      bends++;
    }
    [last, lastSense] = [i, sense];
  }
  return bends;
}

/**
 * The geometry of a list of moves (directions 0 to 3).
 *
 * @param leg Least moves of a hairpin leg, a quarter of the board side.
 */
export function pathGeometry(moves: readonly number[], leg = 4): Geometry {
  let corners = 0;
  for (let k = 1; k < moves.length; k++) {
    if (moves[k] !== moves[k - 1] && moves[k + 1] !== moves[k - 1] && moves[k - 2] !== moves[k]) {
      corners++;
    }
  }
  const runs: Run[] = [];
  for (const d of moves) {
    if (runs.length && runs[runs.length - 1][0] === d) {
      runs[runs.length - 1][1]++;
    } else {
      runs.push([d, 1]);
    }
  }
  return {
    ...levels(moves),
    corners: moves.length ? corners / moves.length : 0,
    bends: sBends(runs),
    ...coils(runs, leg),
  };
}

/**
 * How far a route's shape goes past a cap: corners per move weighted 20 (a wall is worth about
 * 0.05 of them), S-bends, hairpins and coil by 1 each; 0 when the shape fits.
 */
export const overCap = (shape: Geometry, cap: ShapeCap): number =>
  20 * Math.max(0, shape.corners - cap.corners) +
  Math.max(0, shape.bends - cap.bends) +
  Math.max(0, shape.hairpins - cap.hairpins) +
  Math.max(0, shape.coil - cap.coil);

/**
 * The share of the walls that the mirror on the start-goal diagonal keeps, 0 to 1: the north and
 * east wall of every cell against the east and north wall of its mirror cell. A maze with no
 * symmetry keeps about 0.52 to 0.56; the finals 16 × 16 keep 0.61 at the median.
 *
 * @param g A square grid.
 */
export function symmetry(g: Grid): number {
  const w = g.width;
  let kept = 0;
  for (let c = 0; c < w * w; c++) {
    const m = g.walls[(c % w) * w + Math.floor(c / w)];
    const mirrored = ((m & 1) << 1) | ((m & 2) >> 1);
    kept += ((g.walls[c] ^ mirrored) & 1 ? 0 : 1) + ((g.walls[c] ^ mirrored) & 2 ? 0 : 1);
  }
  return kept / (2 * w * w);
}

/** The geometry of a route given as cells, start first. */
export function routeGeometry(g: Grid, route: readonly number[]): Geometry {
  const moves = route.slice(1).map((c, i) => dirTo(g, route[i], c));
  return pathGeometry(moves, g.width / 4);
}

/**
 * Flood fill plus the numbers of the maze. The drawn path is a shortest path with the fewest
 * turns; among those it keeps going straight, then prefers north, east, south, west.
 */
export function analyse(g: Grid): BaseAnalysis {
  const { dist, order, count } = flood(g);
  const size = g.width * g.height;
  const result: BaseAnalysis = {
    dist,
    path: [],
    shortest: -1,
    turns: 0,
    maxStraight: 0,
    maxDiagonal: 0,
    pathCount: 0,
    loops: 0,
    unreachable: size - count,
    deadEnds: 0,
    corridors: 0,
  };

  let edges = 0;
  let goalEdges = 0;
  for (let k = 0; k < count; k++) {
    const c = order[k];
    for (let d = 0; d < 2; d++) {
      if (g.walls[c] & BIT[d]) {
        continue;
      }
      const n = neighbour(g, c, d);
      if (n < 0) {
        continue;
      }
      edges++;
      if (dist[c] === 0 && dist[n] === 0) {
        goalEdges++;
      }
    }
  }
  const goalCells = g.goals.length ? new Set(g.goals).size : 0;
  if (goalCells) {
    result.loops = edges - goalEdges - (count - goalCells + 1) + 1;
  }

  let deadEnds = 0;
  let corridors = 0;
  for (let k = 0; k < count; k++) {
    const w = g.walls[order[k]];
    if ((w === 7 || w === 11 || w === 13 || w === 14) && order[k] !== g.start) {
      deadEnds++;
    } else if (w === 5 || w === 10) {
      corridors++;
    }
  }
  result.deadEnds = (100 * deadEnds) / count;
  result.corridors = (100 * corridors) / count;

  if (g.start < 0 || dist[g.start] < 0) {
    return result;
  }

  const turnsFrom = new Int32Array(size * 4).fill(INF);
  const paths = new Float64Array(size);
  for (let k = 0; k < count; k++) {
    const c = order[k];
    if (dist[c] === 0) {
      turnsFrom.fill(0, c * 4, c * 4 + 4);
      paths[c] = 1;
      continue;
    }
    for (let d = 0; d < 4; d++) {
      if (g.walls[c] & BIT[d]) {
        continue;
      }
      const n = neighbour(g, c, d);
      if (n < 0 || dist[n] !== dist[c] - 1) {
        continue;
      }
      paths[c] += paths[n];
      const after = turnsFrom[n * 4 + d];
      for (let h = 0; h < 4; h++) {
        const t = after + (h === d ? 0 : 1);
        if (t < turnsFrom[c * 4 + h]) {
          turnsFrom[c * 4 + h] = t;
        }
      }
    }
  }

  const moves: number[] = [];
  const path = [g.start];
  let c = g.start;
  let heading = -1;
  while (dist[c] > 0) {
    let best = -1;
    let bestCost = INF;
    const tries = heading < 0 ? [0, 1, 2, 3] : [heading, 0, 1, 2, 3];
    for (const d of tries) {
      if (g.walls[c] & BIT[d]) {
        continue;
      }
      const n = neighbour(g, c, d);
      if (n < 0 || dist[n] !== dist[c] - 1) {
        continue;
      }
      const cost = turnsFrom[n * 4 + d] + (heading < 0 || heading === d ? 0 : 1);
      if (cost < bestCost) {
        bestCost = cost;
        best = d;
      }
    }
    heading = best;
    moves.push(best);
    c = neighbour(g, c, best);
    path.push(c);
  }

  Object.assign(result, levels(moves), { path, shortest: moves.length, pathCount: paths[g.start] });
  return result;
}
