/**
 * Routes-first construction, as human designers are thought to work (Sonobe, UEC 2015): a racing
 * route of long straights and 45 degree staircases on one side of a line from the split to the
 * goal, a careful route of short straights and 90 degree turns on the other. Both share the stem
 * from the start and meet only at the goal entrance. The rest of the board is a depth-first forest
 * hanging off the route cells, so it cannot shortcut a route, and the loops inside one hanging
 * tree keep the routes as they are.
 *
 * @module
 */

import { overCap, pathGeometry, type Geometry } from './analysis';
import { BIT, dirTo, neighbour, neighbourTable, setWall, type Grid } from './grid';
import { RACERS, routeLength, routeTime, type RobotClass, type RunKind } from './racing';
import {
  bareEndPost,
  closedBoard,
  cycleLength,
  goalCentre,
  goalPerimeter,
  isStartEast,
  type CellEdge,
} from './rules';
import { followerReaches } from './search';
import type {
  BoardParts,
  Classes,
  LosingKind,
  Shape,
  ShortestTarget,
  Targets,
  Trace,
} from './types';

/** A seeded random number in `[0, 1)`. */
export type Random = () => number;

const pick = <T>(rnd: Random, list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

/** An integer in `[lo, hi]`. */
export const between = (rnd: Random, lo: number, hi: number): number =>
  lo + Math.floor(rnd() * (hi - lo + 1));

/** How the racing route of a layout is drawn. */
export type RacingStyle = 'mixed' | 'lane' | 'perimeter' | 'stairs';

/** The layout of a seed: where the routes part and the sides of the board each takes. */
export interface Layout {
  /**
   * Where the routes part: up the west column, along the second row, after a stem that bends
   * once or twice, or after a stem that wraps around the board along its edges.
   */
  readonly split: 'west' | 'south' | 'late' | 'wrap';
  /** Cells from the start to the split, shared by both routes. */
  readonly stem: number[];
  /** The rest of the west column above a split partway up it, a dead end. */
  readonly spur: number[];
  /** Per leg, 1 on the cells the racing route may use: one leg, or two with a waypoint. */
  readonly racingSides: Uint8Array[];
  /** The same for the careful route. */
  readonly carefulSides: Uint8Array[];
  /** The cell where the two routes cross and swap sides, -1 for none. */
  readonly waypoint: number;
  /** Of the moves after the stem, the share aimed at before the waypoint. */
  readonly share: number;
  readonly racing: RacingStyle;
  /** The first moves of the racing route with the lane and perimeter styles. */
  readonly lane: number[] | null;
}

const cross = ([px, py]: readonly number[], [qx, qy]: readonly number[], x: number, y: number) =>
  ((qx - px) * (y - py) - (qy - py) * (x - px)) /
  Math.sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py));

const bothSides = (m: Uint8Array, n: Uint8Array) => m.map((v, c) => v & n[c]);

const area = (m: Uint8Array) => m.reduce((sum, v) => sum + v, 0);

const repeat = (d: number, n: number) => Array.from({ length: n }, () => d);

function halves(
  size: number,
  [ax, ay]: readonly number[],
  [bx, by]: readonly number[],
  bend: number
): { left: Uint8Array; right: Uint8Array; along: Float64Array } {
  const length = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
  const [mx, my] = [(ax + bx) / 2 - bend * uy, (ay + by) / 2 + bend * ux];
  const along = new Float64Array(size * size);
  const side = new Float64Array(size * size);
  for (let c = 0; c < size * size; c++) {
    const [x, y] = [c % size, Math.floor(c / size)];
    along[c] = (x - ax) * ux + (y - ay) * uy;
    side[c] =
      along[c] < length / 2 ? cross([ax, ay], [mx, my], x, y) : cross([mx, my], [bx, by], x, y);
  }
  return {
    left: Uint8Array.from(side, (v) => (v >= -0.75 ? 1 : 0)),
    right: Uint8Array.from(side, (v) => (v <= 0.75 ? 1 : 0)),
    along,
  };
}

/**
 * Share of the route primitives that run along the outer ring a route passes over, per board side;
 * on 16 × 16 the edge stem also keeps a cell in from the edges but for the start's column.
 */
const RIM_SKIP: Readonly<Record<number, number>> = { 16: 0.3, 32: 0 };

/**
 * A stem along the board edges for `reach` moves, clockwise or anticlockwise, `inset` cells in
 * from the edges, stopping a quarter of the board short of the start. A leg longer than the
 * straight level jogs one cell in and back out. With `lane` it runs clockwise on the edges, so it
 * opens with a straight up the west edge as long as the level allows; with `west` it runs
 * clockwise from the start up the west column.
 */
function wrapStem(
  size: number,
  rnd: Random,
  t: Targets,
  reach: number,
  lane: boolean,
  west = lane
): number[] {
  const clockwise = west || rnd() < 0.5;
  const inset =
    lane || (west && !RIM_SKIP[size])
      ? 0
      : between(rnd, RIM_SKIP[size] ? 1 : 0, Math.max(1, size / 8 - 1));
  const stem = clockwise ? [0] : [0, size];
  let [x, y] = [0, clockwise ? 0 : 1];
  const go = (d: number) => {
    [x, y] = [x + [0, 1, 0, -1][d], y + [1, 0, -1, 0][d]];
    stem.push(y * size + x);
  };
  for (const [k, d] of (clockwise ? [0, 1, 2, 3] : [1, 0, 3, 2]).entries()) {
    const inside = clockwise ? (d + 1) % 4 : (d + 3) % 4;
    const room =
      [size - 1 - inset - y, size - 1 - inset - x, y - inset, x - inset][d] -
      (k === 3 ? size / 4 : 0);
    let left = Math.min(room, reach - stem.length + 1);
    if (left < 2) {
      break;
    }
    for (let jogs = 0; left > 0; jogs++) {
      const run = Math.min(left, t.straight[1]);
      for (let i = 0; i < run; i++) {
        go(d);
      }
      left -= run;
      if (left > 0) {
        go(jogs % 2 ? (inside + 2) % 4 : inside);
      }
    }
  }
  return stem;
}

/**
 * The longest stretch of the path, as a share of the cells, that two separate routes are built
 * for: a longer path gets a shared stem along the edges for all but `SPLIT_ROOM` of it.
 */
export const ROUTE_ROOM = 0.28;

const SPLIT_ROOM = 0.2;

/** Options of {@link layout}. */
export interface LayoutOptions {
  /** The stem runs up the whole west column, or the edge stem starts there. */
  readonly west?: boolean;
  /** The goal's centre, the board's by default. */
  readonly centre?: readonly number[];
  /** Any style gets the stem of the late style. */
  readonly late?: boolean;
}

/**
 * The layout of a seed for a generation style. The split: up the west column or along the second
 * row, 1 to size / 4 cells from the start; late, after a stem of up to a third of the path that
 * runs north, east and north again or east, north and east again; or after a stem that wraps along
 * the board edges, with the late style for 40 to 60 % of the path, and with every style when the
 * path aimed at is longer than two routes fit side by side, for all but `SPLIT_ROOM` of it. Each
 * route takes one side of the line from the split to the goal centre, bent by up to size / 8
 * cells. With the crossing style the line is straight and the routes cross at a waypoint 50 to
 * 70 % of the way along it, where they swap sides. The lane runs along the west or south edge; the
 * perimeter is a lane that reaches the corner and turns along the next edge.
 *
 * @param path The path length aimed at.
 */
export function layout(
  size: number,
  rnd: Random,
  t: Targets,
  path: number,
  style = 'split',
  {
    west = false,
    centre: [cx, cy] = [(size - 1) / 2, (size - 1) / 2],
    late = style === 'late',
  }: LayoutOptions = {}
): Layout {
  const need = path - Math.round(ROUTE_ROOM * size * size);
  const wrap = late || need > 0;
  const split: Layout['split'] = wrap
    ? 'wrap'
    : west
      ? 'west'
      : pick(
          rnd,
          style === 'split' || style === 'stairs' || style === 'tie'
            ? (['west', 'south', 'late'] as const)
            : (['west', 'south'] as const)
        );
  const legs: [number, number][] = [];
  if (split === 'west') {
    legs.push([0, west ? size - 1 : between(rnd, 1, size / 4)]);
  }
  if (split === 'south') {
    legs.push([0, 1], [1, between(rnd, 1, size / 4)]);
  }
  if (split === 'late') {
    const reach = Math.max(4, Math.round(path / 3));
    const along = between(rnd, 3, Math.min(t.straight[1], size - 2));
    const across = between(rnd, 1, size / 4);
    const again = Math.min(
      reach - along - across,
      size - 1 - along,
      between(rnd, 0, Math.min(t.straight[1] - 1, size / 2 - 1))
    );
    const [a, b] = rnd() < 0.5 ? [0, 1] : [1, 0];
    if (a) {
      legs.push([0, 1]);
    }
    legs.push([a, along], [b, across], [a, again]);
  }
  const reach = Math.max(
    need > 0 ? path - Math.round(SPLIT_ROOM * size * size) + between(rnd, 0, 4) : 0,
    late ? Math.round(path * (0.4 + 0.2 * rnd())) : 0
  );
  const stem = wrap ? wrapStem(size, rnd, t, reach, style === 'lane', west) : [0];
  for (const [d, n] of legs) {
    for (let i = 0; i < n; i++) {
      stem.push(stem[stem.length - 1] + (d ? 1 : size));
    }
  }
  const end = stem[stem.length - 1];
  const [sx, sy] = [end % size, Math.floor(end / size)];
  const k = split === 'south' ? sx : sy;
  const column = split === 'west';
  const shortest = Math.max(t.straight[0], Math.round(size * 0.6));
  const longest = Math.min(t.straight[1], size - 1 - (column ? 0 : k));
  const laneFits = !west && (split === 'west' || split === 'south') && shortest <= longest;
  const racingLeft = style === 'lane' && laneFits ? column : rnd() < 0.5;
  let racing: RacingStyle = style === 'stairs' ? 'stairs' : 'mixed';
  if (
    laneFits &&
    racingLeft === column &&
    (style === 'lane' || (style === 'bait' && rnd() < 0.5))
  ) {
    racing = pick(rnd, ['lane', 'perimeter'] as const);
  }
  const corner = size - 1 - (column ? 0 : k);
  if (racing === 'perimeter' && longest < corner) {
    racing = 'lane';
  }
  const run =
    (racing === 'perimeter' ? corner : between(rnd, shortest, longest)) - (column ? k : 0);
  const turn: number[] =
    racing === 'perimeter'
      ? Array.from({ length: between(rnd, 3, Math.min(t.straight[1], size / 2)) }, () =>
          column ? 1 : 0
        )
      : [];
  const lane =
    racing === 'mixed' || racing === 'stairs'
      ? null
      : column
        ? [...Array.from({ length: run }, () => 0), ...turn]
        : [2, ...Array.from({ length: run }, () => 1), ...turn];
  const crossing = style === 'crossing';
  const { left, right, along } = halves(
    size,
    [sx, sy],
    [cx, cy],
    crossing ? 0 : (rnd() - 0.5) * (size / 4)
  );
  const [mine, other] = racingLeft ? [left, right] : [right, left];
  const high = Math.max(...stem.filter((c) => c % size === 0)) / size;
  const spur = west ? Array.from({ length: size - 1 - high }, (_, j) => (high + 1 + j) * size) : [];
  if (!crossing) {
    return {
      split,
      stem,
      spur,
      racingSides: [mine],
      carefulSides: [other],
      waypoint: -1,
      share: 1,
      racing,
      lane,
    };
  }
  const f = 0.5 + 0.2 * rnd();
  const waypoint = Math.round(sy + f * (cy - sy)) * size + Math.round(sx + f * (cx - sx));
  const before = Uint8Array.from(along, (v) => (v <= along[waypoint] + 1 ? 1 : 0));
  const after = Uint8Array.from(along, (v) => (v >= along[waypoint] - 1 ? 1 : 0));
  const racingSides = [bothSides(mine, before), bothSides(other, after)];
  return {
    split,
    stem,
    spur,
    racingSides,
    carefulSides: [bothSides(other, before), bothSides(mine, after)],
    waypoint,
    share: area(racingSides[0]) / (area(racingSides[0]) + area(racingSides[1])),
    racing,
    lane,
  };
}

function distanceTo(g: Grid, to: number, free: Uint8Array, from: number): Int32Array {
  const next = neighbourTable(g);
  const dist = new Int32Array(g.width * g.height).fill(-1);
  const queue = new Int32Array(g.width * g.height);
  let tail = 0;
  queue[tail++] = to;
  dist[to] = 0;
  for (let head = 0; head < tail; head++) {
    const c = queue[head];
    for (let d = 0; d < 4; d++) {
      const n = next[c * 4 + d];
      if (n < 0 || dist[n] >= 0 || !(free[n] || n === from) || isStartEast(c, d)) {
        continue;
      }
      dist[n] = dist[c] + 1;
      if (n === from) {
        return dist;
      }
      queue[tail++] = n;
    }
  }
  return dist;
}

type RouteKind = 'racing' | 'careful';

/**
 * The move list of one primitive leaving heading `h`. Racing: a straight of 3 to `straight[1]`
 * moves after a turn, or a staircase sized so that the zigzag stays within the diagonal level.
 * Careful: a straight of 2 to 5 moves after a 90 degree turn, sometimes 5 to 8, or a short jog of
 * 3 to 4 moves, none when the diagonal level stops below 5.
 */
function primitive(
  rnd: Random,
  h: number,
  kind: RouteKind,
  t: Targets,
  style: RacingStyle
): number[] {
  const p = pick(rnd, h < 0 ? [0, 1, 2, 3] : [(h + 1) % 4, (h + 3) % 4]);
  const r = rnd();
  const stair = (a: number, b: number, n: number) => {
    const moves = repeat(a, n);
    for (let i = 1; i < n; i += 2) {
      moves[i] = b;
    }
    return moves;
  };
  const [d0, d1] = t.diagonal;
  if (kind === 'racing') {
    if (h >= 0 && r < (style === 'stairs' ? 0.7 : 0.35)) {
      return stair(p, h, between(rnd, Math.max(2, d0 - 1), Math.max(2, d1 - 3)));
    }
    return repeat(p, between(rnd, 3, t.straight[1]));
  }
  if (h >= 0 && r < (d1 >= 5 ? 0.3 : 0)) {
    return stair(p, h, between(rnd, 2, 3));
  }
  return repeat(p, r < 0.45 ? between(rnd, 5, 8) : between(rnd, 2, 5));
}

const RIM_RUN = 3;

/**
 * Carves one route from `from` to `to` of about `want` moves out of primitives, on the cells open
 * in `free`: a depth-first search over primitives that backs up when it paints itself into a
 * corner, within a budget of tried primitives. Near the end it finishes along a BFS shortest path
 * that keeps going straight when it can, a racing route only up to its longest straight. `first`
 * forces the opening primitive (the lane). Returns the cells after `from`, ending with `to`.
 */
function carveRoute(
  g: Grid,
  rnd: Random,
  from: number,
  to: number,
  free: Uint8Array,
  want: number,
  kind: RouteKind,
  t: Targets,
  style: RacingStyle,
  first: number[] | null
): number[] | null {
  const w = g.width;
  const onRim = (c: number) => c % w === 0 || c % w === w - 1 || c < w || c >= w * (g.height - 1);
  const open = free.slice();
  open[to] = 1;
  const cells: number[] = [];
  let budget = 400;
  const finish = (start: number, heading: number, dist: Int32Array) => {
    let c = start;
    let h = heading;
    const tail: number[] = [];
    let run = 0;
    for (
      let i = cells.length - 1;
      i >= 0 && dirTo(g, i ? cells[i - 1] : from, cells[i]) === h;
      i--
    ) {
      run++;
    }
    while (c !== to) {
      const capped = kind === 'racing' && run >= t.straight[1];
      const order =
        h < 0
          ? [0, 1, 2, 3]
          : capped
            ? [...[0, 1, 2, 3].filter((x) => x !== h), h]
            : [h, 0, 1, 2, 3];
      const at = c;
      const d = order.find((x) => {
        const n = neighbour(g, at, x);
        return n >= 0 && dist[n] === dist[at] - 1 && !isStartEast(at, x);
      });
      if (d === undefined) {
        return null;
      }
      run = d === h ? run + 1 : 1;
      c = neighbour(g, c, d);
      h = d;
      tail.push(c);
    }
    return tail;
  };
  const next = neighbourTable(g);
  const extend = (c: number, h: number, dist = distanceTo(g, to, open, c)): boolean => {
    if (dist[c] < 0) {
      return false;
    }
    if (cells.length + dist[c] >= want - 2) {
      const tail = finish(c, h, dist);
      if (!tail) {
        return false;
      }
      cells.push(...tail);
      return true;
    }
    for (let k = 0; k < 12 && budget > 0; k++) {
      budget--;
      const moves =
        first && cells.length === 0 && k === 0
          ? first
          : primitive(rnd, h, k < 8 ? kind : 'careful', t, style);
      const trail: number[] = [];
      let x = c;
      for (const d of moves) {
        const n = next[x * 4 + d];
        if (n < 0 || n === to || !open[n] || isStartEast(x, d)) {
          break;
        }
        trail.push(n);
        x = n;
      }
      if (trail.length !== moves.length) {
        continue;
      }
      if (trail.filter(onRim).length >= RIM_RUN && rnd() < RIM_SKIP[w]) {
        continue;
      }
      for (const n of trail) {
        open[n] = 0;
      }
      const after = distanceTo(g, to, open, x);
      if (after[x] >= 0 && cells.length + trail.length + after[x] <= want + 4) {
        cells.push(...trail);
        if (extend(x, moves[moves.length - 1], after)) {
          return true;
        }
        cells.length -= trail.length;
      }
      for (const n of trail) {
        open[n] = 1;
      }
    }
    return false;
  };
  return extend(from, -1) ? cells : null;
}

/**
 * The most degrees a racing route may sweep around the goal centre while within 3 cells of the
 * goal: the finals' p75 (153, p90 204).
 */
const WINDING = 160;

/**
 * The angle of `(x, y)` in radians, as `Math.atan2`, from + - × / and the square root only, which
 * every engine rounds the same way: two half-angle steps bring the tangent below tan(π / 16),
 * where its series converges to 1e-15.
 */
export function angleOf(y: number, x: number): number {
  if (x === 0 && y === 0) {
    return 0;
  }
  const [ax, ay] = [Math.abs(x), Math.abs(y)];
  let t = ay > ax ? ax / ay : ay / ax;
  for (let i = 0; i < 2; i++) {
    t /= 1 + Math.sqrt(1 + t * t);
  }
  let term = t;
  let sum = 0;
  for (let n = 1; n < 30; n += 2, term *= -t * t) {
    sum += term / n;
  }
  let a = 4 * sum;
  if (ay > ax) {
    a = Math.PI / 2 - a;
  }
  if (x < 0) {
    a = Math.PI - a;
  }
  return y < 0 ? -a : a;
}

/** The degrees a route sweeps around the goal centre while it runs within 3 cells of the goal. */
export function winding(g: Grid, route: readonly number[]): number {
  const [cx, cy, half] = goalCentre(g);
  let sweep = 0;
  let last: number | null = null;
  for (const c of route) {
    const [x, y] = [c % g.width, Math.floor(c / g.width)];
    const ring = Math.max(Math.abs(x - cx), Math.abs(y - cy)) - half;
    if (ring < 1 || ring > 3) {
      last = null;
      continue;
    }
    const angle = angleOf(y - cy, x - cx);
    if (last !== null) {
      sweep += angle - last - 2 * Math.PI * Math.round((angle - last) / (2 * Math.PI));
    }
    last = angle;
  }
  return (Math.abs(sweep) * 180) / Math.PI;
}

/** The robots that must lose on the shortest route, per kind of loss. */
export const PAYERS: Readonly<Record<LosingKind, readonly RunKind[]>> = {
  orthogonal: ['orthogonal'],
  diagonal: ['diagonal'],
  both: ['orthogonal', 'diagonal'],
};

/** The most a tied pair's two routes differ in run time, for either robot, in %. */
export const TIE = 5;

const cheb = (g: Grid, a: number, b: number) =>
  Math.max(
    Math.abs((a % g.width) - (b % g.width)),
    Math.abs(Math.floor(a / g.width) - Math.floor(b / g.width))
  );

function openRoute(board: Grid, route: readonly number[], step?: (cell: number) => void): void {
  for (let i = 1; i < route.length; i++) {
    setWall(board, route[i - 1], dirTo(board, route[i - 1], route[i]), 0);
    step?.(route[i]);
  }
}

/** A pair of routes on a board that holds only them. */
export interface Carved {
  /** The board holding only the two routes. */
  readonly g: Grid;
  /** 1 on the route cells outside the goal. */
  readonly taken: Uint8Array;
  /** The racing route, start first. */
  readonly racing: number[];
  /** The careful route, start first. */
  readonly careful: number[];
}

/** What {@link carveRoutes} aims a pair of routes at. */
export interface CarveAim {
  /** The path length to aim at. */
  path: number;
  /** Least racing gain, 0 for none. */
  readonly trapGain: number;
  readonly bait: boolean;
  readonly tie: boolean;
  /** Least distance between the routes. */
  readonly apart: number;
  readonly shape: Shape;
  readonly shortest?: ShortestTarget | null;
  readonly classes?: Classes | null;
}

interface Carving extends Geometry {
  readonly route: number[];
  readonly own: Set<number>;
  readonly moves: number[];
  readonly length: number;
  readonly line: number;
  readonly racing: number;
  readonly careful: number;
  readonly times: Record<RobotClass, Record<RunKind, number>>;
}

/**
 * Picks a pair of routes, or null: carves pools of careful and racing routes on their sides of the
 * layout, all from the split to the same goal entrance (through the waypoint when the layout has
 * one), then pairs them; a side that gives no route in a third of its tries gives up the layout.
 * With the follower rule the door lies beyond the goal seen from the split. The shorter route is
 * the shortest path and must meet the path range; the racing route must meet the straight and
 * diagonal levels; the routes must be disjoint and `apart` cells apart somewhere. A route choice
 * pair: the racing robot gains `gain` % on its route, the careful robot loses `loss` % on it. A
 * bait pair: the careful route is the bait, at least 2 cells shorter, and both robots are faster on
 * the racing route. A tied pair: two routes each robot runs within `TIE` % of each other. With
 * `shortest` the shorter route must lose for the robots it names; with `classes` the pairs where
 * the weak and strong classes keep or lose the floors, as the seed drew, come first. Of the pairs
 * that pass, one of the three whose racing route has the fewest corners among those that keep a
 * wall follower out of the goal. Each route drawn is shown to `trace` as a `candidate`, with its
 * cells and kind, before it is judged.
 *
 * @param pool Routes per side.
 */
export function carveRoutes(
  s: BoardParts,
  rnd: Random,
  t: Targets,
  lay: Layout,
  aim: CarveAim,
  pool: number,
  trace?: Trace
): Carved | null {
  const g = closedBoard(s.size, s.goals, s.room);
  const goal = new Set(g.goals);
  if (lay.stem.some((c) => g.room?.[c] || goal.has(c))) {
    return null;
  }
  const stem = new Set([...lay.stem, ...lay.spur]);
  const split = lay.stem[lay.stem.length - 1];
  const xy = (c: number) => [c % g.width, Math.floor(c / g.width)];
  const [sx, sy] = xy(split);
  const [cx, cy] = goalCentre(g);
  const beyond = ([c, d]: CellEdge) => {
    const [x, y] = xy(neighbour(g, c, d));
    return (x - cx) * (cx - sx) + (y - cy) * (cy - sy) > 0;
  };
  const [door, out] = pick(
    rnd,
    goalPerimeter(g).filter((e) => !t.follower || beyond(e))
  );
  const entry = neighbour(g, door, out);
  const [p0, p1] = t.path;
  const free = (side: Uint8Array) =>
    side.map((ok, c) =>
      ok && !stem.has(c) && !goal.has(c) && c !== lay.waypoint && !g.room?.[c] ? 1 : 0
    );
  const carefulFree = lay.carefulSides.map(free);
  const racingFree = lay.racingSides.map(free);
  const legs = (
    kind: RouteKind,
    sides: Uint8Array[],
    moves: number,
    first: number[] | null
  ): number[] | null => {
    if (lay.waypoint < 0) {
      return carveRoute(g, rnd, split, entry, sides[0], moves, kind, t, lay.racing, first);
    }
    const head = carveRoute(
      g,
      rnd,
      split,
      lay.waypoint,
      sides[0],
      Math.round(moves * lay.share),
      kind,
      t,
      lay.racing,
      first
    );
    if (!head) {
      return null;
    }
    const rest = sides[1].slice();
    for (const c of head) {
      rest[c] = 0;
    }
    const tail = carveRoute(
      g,
      rnd,
      lay.waypoint,
      entry,
      rest,
      moves - head.length,
      kind,
      t,
      lay.racing,
      null
    );
    return tail && [...head, ...tail];
  };
  const carve = (
    kind: RouteKind,
    sides: Uint8Array[],
    want: number,
    first: number[] | null
  ): Carving | null => {
    const cells = legs(kind, sides, want - lay.stem.length, first);
    if (!cells) {
      return null;
    }
    const route = [...lay.stem, ...cells, door];
    trace?.('candidate', g.walls, { route, kind });
    const moves = route.slice(1).map((c, i) => dirTo(g, route[i], c));
    if (kind === 'racing' && winding(g, route) > WINDING) {
      return null;
    }
    const own = new Set(cells.slice(0, -1));
    own.delete(lay.waypoint);
    const timeOf = (robot: RobotClass) => ({
      orthogonal: routeTime(g, route, RACERS[robot].orthogonal),
      diagonal: routeTime(g, route, RACERS[robot].diagonal),
    });
    const times = { weak: timeOf('weak'), mid: timeOf('mid'), strong: timeOf('strong') };
    return {
      route,
      own,
      moves,
      length: moves.length,
      line: routeLength(g, route, true),
      ...pathGeometry(moves, g.width / 4),
      racing: times.mid.diagonal,
      careful: times.mid.orthogonal,
      times,
    };
  };
  const inLevel = (r: Carving) =>
    r.maxStraight >= t.straight[0] &&
    r.maxStraight <= t.straight[1] &&
    r.maxDiagonal >= t.diagonal[0] &&
    r.maxDiagonal <= t.diagonal[1];
  const careful: Carving[] = [];
  const racing: Carving[] = [];
  const longCareful = !aim.bait && aim.shortest?.kind === 'orthogonal';
  for (let k = 0; k < pool * 6 && careful.length < pool && (careful.length || k < pool * 2); k++) {
    const r = carve(
      aim.tie ? 'racing' : 'careful',
      carefulFree,
      longCareful
        ? between(rnd, aim.path + 2, aim.path + 8)
        : between(rnd, aim.path - 2, aim.path + 3),
      null
    );
    if (r && overCap(r, aim.shape.careful) === 0) {
      careful.push(r);
    }
  }
  if (!careful.length) {
    return null;
  }
  for (let k = 0; k < pool * 6 && racing.length < pool && (racing.length || k < pool * 2); k++) {
    const r = carve(
      'racing',
      racingFree,
      aim.tie
        ? between(rnd, aim.path - 2, aim.path + 6)
        : longCareful
          ? between(rnd, aim.path - 2, aim.path + 4)
          : between(rnd, aim.path - 4 + (aim.bait ? 4 : 0), aim.path + 14),
      lay.lane
    );
    if (r && (aim.tie || inLevel(r)) && overCap(r, aim.shape.racing) === 0) {
      racing.push(r);
    }
  }
  const losing = (c: Carving, r: Carving, k: RobotClass, want: ShortestTarget) =>
    PAYERS[want.kind].every((robot) => {
      const shorter = robot === 'orthogonal' ? c.length <= r.length : c.line <= r.line;
      const [short, long] = shorter ? [c, r] : [r, c];
      return (
        long.length - Math.min(c.length, r.length) >= want.cells &&
        100 * (short.times[k][robot] / long.times[k][robot] - 1) >= want.loss
      );
    });
  const keeps = (c: Carving, r: Carving, k: RobotClass) =>
    (!t.choice ||
      (100 * (c.times[k].diagonal / r.times[k].diagonal - 1) >= t.choice.gain[0] &&
        100 * (r.times[k].orthogonal / c.times[k].orthogonal - 1) >= t.choice.loss[0])) &&
    (!aim.shortest || losing(c, r, k, aim.shortest));
  const pairs: [Carving, Carving, number, number][] = [];
  for (const c of careful) {
    for (const r of racing) {
      const short = c.length < r.length ? c : r.length < c.length ? r : c.turns <= r.turns ? c : r;
      if (short.length < p0 || short.length > p1) {
        continue;
      }
      const gain = 100 * (c.racing / r.racing - 1);
      const loss = 100 * (r.careful / c.careful - 1);
      if (aim.tie) {
        if (Math.abs(gain) > TIE || Math.abs(loss) > TIE || !inLevel(short)) {
          continue;
        }
      } else if (
        aim.bait
          ? c.length + (aim.shortest?.cells ?? 2) > r.length || gain < aim.trapGain || loss > -3
          : !t.choice ||
            gain < Math.max(t.choice.gain[0], aim.trapGain) ||
            gain > t.choice.gain[1] ||
            loss < t.choice.loss[0] ||
            loss > t.choice.loss[1]
      ) {
        continue;
      }
      if (aim.shortest && !losing(c, r, 'mid', aim.shortest)) {
        continue;
      }

      let shared = false;
      for (const x of r.own) {
        if (c.own.has(x)) {
          shared = true;
        }
      }
      if (shared) {
        continue;
      }
      let apart = 0;
      for (const x of r.own) {
        let near = Infinity;
        for (const y of c.own) {
          near = Math.min(near, cheb(g, x, y));
        }
        apart = Math.max(apart, near);
      }
      if (apart >= aim.apart) {
        pairs.push([
          c,
          r,
          r.corners,
          !aim.classes ||
          (keeps(c, r, 'weak') && keeps(c, r, 'strong')) === (aim.classes === 'hold')
            ? 0
            : 1,
        ]);
      }
    }
  }
  pairs.sort((a, b) => a[3] - b[3] || a[2] - b[2]);
  const safe: (typeof pairs)[number][] = [];
  for (const pair of pairs) {
    if (safe.length === 3) {
      break;
    }
    const board = { ...g, walls: g.walls.slice() };
    openRoute(board, pair[0].route);
    openRoute(board, pair[1].route);
    if (!t.follower || !followerReaches(board)) {
      safe.push(pair);
    }
  }
  if (!safe.length) {
    return null;
  }
  const [c, r] = pick(rnd, safe);
  const taken = new Uint8Array(g.width * g.height);
  if (lay.spur.length) {
    openRoute(g, [lay.spur[0] - g.width, ...lay.spur]);
  }
  for (const x of lay.spur) {
    taken[x] = 1;
  }
  for (const [i, route] of [c.route, r.route].entries()) {
    openRoute(g, route, (cell) => trace?.('routes', g.walls, { cell, route: i }));
    for (const x of route) {
      if (!goal.has(x)) {
        taken[x] = 1;
      }
    }
  }
  return { g, taken, racing: r.route, careful: c.route };
}

const EDGE_RUN = 3;

/** The fill textures of a forest's zones. */
export type FillKind = 'straight' | 'twisty' | 'branchy' | 'lines' | 'rings' | 'stairs';

/**
 * The fill textures of the forest, with the chance of each per zone. A forest draws 1 to 3 zones
 * (the cells nearest each of 1 to 3 random points) and a texture per zone, so two mazes rarely
 * share one. Each texture weighs the directions of the depth-first growth:
 * - straight: keeps its heading 2 to 6 times as often as it turns;
 * - twisty: turns 4 times as often as it keeps its heading;
 * - branchy: half the time grows from a random cell of the forest rather than the newest;
 * - lines: moves along one axis 12 times as often as across it;
 * - rings: moves around the zone's point (on its square ring) 12 times as often;
 * - stairs: takes the next step of a staircase 6 times as often.
 */
export const FILLS: readonly (readonly [chance: number, kind: FillKind])[] = [
  [0.3, 'straight'],
  [0.1, 'twisty'],
  [0.15, 'branchy'],
  [0.15, 'lines'],
  [0.15, 'rings'],
  [0.15, 'stairs'],
];

/** The texture of one zone of a forest. */
export interface Zone {
  readonly kind: FillKind;
  /** The column of its point. */
  readonly x: number;
  /** The row of its point. */
  readonly y: number;
  /** How much more often a straight forest keeps its heading. */
  readonly bias: number;
  /** The axis of the lines: 0 north-south, 1 east-west. */
  readonly axis: 0 | 1;
}

/** The zones and textures of one forest: per cell the index of its zone, and the zones. */
export function drawFill(w: number, rnd: Random): { zone: Uint8Array; zones: Zone[] } {
  const zones = Array.from({ length: [1, 1, 2, 3][Math.floor(rnd() * 4)] }, (): Zone => {
    let r = rnd();
    const kind = FILLS.find(([chance]) => (r -= chance) < 0)?.[1] ?? 'straight';
    return {
      kind,
      x: Math.floor(rnd() * w),
      y: Math.floor(rnd() * w),
      bias: 2 + 4 * rnd(),
      axis: rnd() < 0.5 ? 0 : 1,
    };
  });
  const zone = new Uint8Array(w * w);
  for (let c = 0; c < w * w; c++) {
    const [x, y] = [c % w, Math.floor(c / w)];
    let best = Infinity;
    for (const [k, z] of zones.entries()) {
      const d = (x - z.x) * (x - z.x) + (y - z.y) * (y - z.y);
      if (d < best) {
        [best, zone[c]] = [d, k];
      }
    }
  }
  return { zone, zones };
}

function textureWeight(
  z: Zone,
  w: number,
  c: number,
  d: number,
  heading: number,
  before: number
): number {
  if (z.kind === 'straight') {
    return d === heading ? z.bias : 1;
  }
  if (z.kind === 'twisty') {
    return d === heading ? 0.25 : 1;
  }
  if (z.kind === 'lines') {
    return d % 2 === z.axis ? 12 : 1;
  }
  if (z.kind === 'stairs') {
    return heading >= 0 && d === before && (d + heading) % 2 === 1 ? 6 : d === heading ? 0.5 : 1;
  }
  if (z.kind === 'rings') {
    const [x, y] = [c % w, Math.floor(c / w)];
    const [nx, ny] = [x + [0, 1, 0, -1][d], y + [1, 0, -1, 0][d]];
    return Math.max(Math.abs(nx - z.x), Math.abs(ny - z.y)) ===
      Math.max(Math.abs(x - z.x), Math.abs(y - z.y))
      ? 12
      : 1;
  }
  return 1;
}

/**
 * A forest grown from every route cell over the free cells, depth first, with the textures of
 * {@link drawFill}. Each tree touches the routes at its root only, so it adds dead ends but no
 * shortcut. A branch runs at most `EDGE_RUN` cells along the outer wall on its first pass; a
 * second pass without that limit reaches the cells the first one left. With `plain` the whole
 * forest is the straight texture of bias 3. Cells marked 2 in `taken` are stubs: no tree grows
 * into or out of them, but a pocket of free cells that only stubs reach hangs off one of them.
 * Returns the root of every cell, -1 in the goal.
 */
export function fillForest(
  g: Grid,
  rnd: Random,
  taken: Uint8Array,
  trace?: Trace,
  plain = false
): Int32Array {
  const size = g.width * g.height;
  const w = g.width;
  const root = new Int32Array(size).fill(-1);
  const heading = new Int8Array(size).fill(-1);
  const before = new Int8Array(size).fill(-1);
  const along = new Int32Array(size);
  const goal = new Set(g.goals);
  const { zone, zones } = plain
    ? {
        zone: new Uint8Array(size),
        zones: [{ kind: 'straight', x: 0, y: 0, bias: 3, axis: 0 } as const],
      }
    : drawFill(w, rnd);
  trace?.('texture', g.walls, { zone: Array.from(zone), zones });
  const roots: number[] = [];
  for (let c = 0; c < size; c++) {
    if (taken[c] === 1) {
      roots.push(c);
    }
  }
  for (let i = roots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [roots[i], roots[j]] = [roots[j], roots[i]];
  }
  for (const c of roots) {
    root[c] = c;
  }
  const rim = (c: number, d: number) =>
    d % 2 ? c < w || c >= size - w : c % w === 0 || c % w === w - 1;
  const weights = [0, 0, 0, 0];
  const grow = (active: number[], capped: boolean) => {
    while (active.length) {
      const top = active.length - 1;
      const i =
        zones[zone[active[top]]].kind === 'branchy' && rnd() < 0.5
          ? Math.floor(rnd() * active.length)
          : top;
      const c = active[i];
      const z = zones[zone[c]];
      let total = 0;
      for (let d = 0; d < 4; d++) {
        const n = neighbour(g, c, d);
        const blocked =
          n < 0 ||
          taken[n] ||
          goal.has(n) ||
          g.room?.[n] ||
          root[n] >= 0 ||
          isStartEast(c, d) ||
          (capped && rim(c, d) && along[c] >= EDGE_RUN);
        weights[d] = blocked ? 0 : textureWeight(z, w, c, d, heading[c], before[c]);
        total += weights[d];
      }
      if (total === 0) {
        active.splice(i, 1);
        continue;
      }
      let r = rnd() * total;
      let d = 0;
      while (r >= weights[d]) {
        r -= weights[d++];
      }
      const n = neighbour(g, c, d);
      setWall(g, c, d, 0);
      root[n] = root[c];
      heading[n] = d;
      before[n] = heading[c];
      along[n] = rim(c, d) ? along[c] + 1 : 0;
      active.push(n);
      trace?.('filler', g.walls, { cell: n, root: root[n] });
    }
  };
  grow(roots.slice(), true);
  const reached: number[] = [];
  for (let c = 0; c < size; c++) {
    if (root[c] >= 0) {
      reached.push(c);
    }
  }
  grow(reached, false);
  const behind: number[] = [];
  for (let c = 0; c < size; c++) {
    if (root[c] >= 0 || taken[c] || goal.has(c) || g.room?.[c]) {
      continue;
    }
    const d = [0, 1, 2, 3].find((k) => taken[neighbour(g, c, k)] === 2 && !isStartEast(c, k));
    if (d === undefined) {
      continue;
    }
    setWall(g, c, d, 0);
    root[c] = c;
    behind.push(c);
  }
  grow(behind, false);
  return root;
}

/** Where {@link lineRun} may place a motif. */
export interface LineRunWhere {
  /** The distance band to the edge of the motif's cell nearest it. */
  readonly band?: readonly [number, number];
  /** The cells of both routes, tried first. */
  readonly shared?: Set<number>;
  /** Cells a bend must not touch (the racing route's one straight within the level). */
  readonly keep?: Set<number>;
}

/**
 * Lines a straight run of the route before the forest grows: a zigzag slalom `cells` cells long, a
 * fishbone corridor of `cells` cells with stubs on both sides, or a dashed area the route crosses
 * `cells` dash rows of. Each stub opens toward the route only and is marked 2 in `taken`, so no
 * tree reaches it and the motif adds no shortcut. The motif's cells sit with their cell nearest
 * the board's edge `band[0]` to `band[1]` cells in. Tries the runs of the route in random order,
 * the runs both routes share first, never one through `keep` with a slalom or a dashed area;
 * returns the cells used, 0 when no run has room.
 */
export function lineRun(
  g: Grid,
  rnd: Random,
  taken: Uint8Array,
  route: readonly number[],
  cells: number,
  kind: 'zigzag' | 'fishbone' | 'dashed',
  { band = [0, Infinity], shared = new Set(), keep = new Set() }: LineRunWhere = {}
): number {
  const goal = new Set(g.goals);
  const length = kind === 'dashed' ? cells + 1 : cells;
  const starts: number[] = [];
  for (let i = 1; i + length < route.length; i++) {
    if (kind !== 'fishbone' && route.slice(i, i + length).some((c) => keep.has(c))) {
      continue;
    }
    starts.push(i);
  }
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [starts[i], starts[j]] = [starts[j], starts[i]];
  }
  const both = (i: number) => route.slice(i, i + length).every((c) => shared.has(c));
  starts.sort((a, b) => Number(both(b)) - Number(both(a)));
  const w = g.width;
  const edge = (c: number) =>
    Math.min(c % w, w - 1 - (c % w), Math.floor(c / w), g.height - 1 - Math.floor(c / w));
  const placed = (list: readonly number[]) => {
    const near = Math.min(...list.map(edge));
    return near >= band[0] && near <= band[1];
  };
  const free = (n: number) => n >= 0 && !taken[n] && !goal.has(n) && !g.room?.[n] && n !== 1;
  for (const i of starts) {
    const run = route.slice(i, i + length);
    const d = dirTo(g, route[i - 1], run[0]);
    if (
      run.some(
        (c, k) =>
          goal.has(c) ||
          (kind === 'zigzag' && c % g.width === 0) ||
          dirTo(g, k ? run[k - 1] : route[i - 1], c) !== d
      ) ||
      dirTo(g, run[run.length - 1], route[i + length]) !== d
    ) {
      continue;
    }
    if (kind === 'dashed') {
      if (dashField(g, rnd, taken, run, d, free, placed)) {
        return cells;
      }
      continue;
    }
    const [left, right] = rnd() < 0.5 ? [(d + 1) % 4, (d + 3) % 4] : [(d + 3) % 4, (d + 1) % 4];
    const sides = kind === 'zigzag' ? [[left], [right]] : [[left, right]];
    const fit = sides.find(
      (pair) =>
        run.every((c) => pair.every((e) => free(neighbour(g, c, e)))) &&
        placed(kind === 'zigzag' ? [...run, ...run.map((c) => neighbour(g, c, pair[0]))] : run)
    );
    if (!fit) {
      continue;
    }
    for (const [k, c] of run.entries()) {
      for (const e of fit) {
        const n = neighbour(g, c, e);
        taken[n] = 2;
        setWall(g, c, e, 0);
        if (kind === 'zigzag' && k % 2 === 1) {
          setWall(g, n, (d + 2) % 4, 0);
        }
      }
      if (kind === 'zigzag' && k % 2 === 1) {
        setWall(g, run[k - 1], d, 1);
      }
    }
    return cells;
  }
  return 0;
}

/**
 * A dashed area on a straight run of the racing route, as the half-size finals build them: the
 * run and a row on either side of it with a framing row beyond each (where the board has no room,
 * the run and one row beside it, framed on both sides), opened along the run, and every line
 * across the run holding a wall at every other row, offset by one from line to line, so no wall
 * runs along the route and every post inside holds one wall. Every cell is marked 1 in `taken`,
 * as a route cell. False when the rows beside the run are not free.
 */
function dashField(
  g: Grid,
  rnd: Random,
  taken: Uint8Array,
  run: readonly number[],
  d: number,
  free: (c: number) => boolean,
  placed: (cells: readonly number[]) => boolean
): boolean {
  const e = rnd() < 0.5 ? (d + 1) % 4 : (d + 3) % 4;
  const shift = (cell: number, k: number) => {
    let c = cell;
    for (let j = 0; j < Math.abs(k) && c >= 0; j++) {
      c = neighbour(g, c, k > 0 ? e : (e + 2) % 4);
    }
    return c;
  };
  for (const rows of [
    [-2, -1, 0, 1, 2],
    [-1, 0, 1, 2],
    [-2, -1, 0, 1],
  ]) {
    const field = run.map((c) => rows.map((r) => shift(c, r)));
    if (field.some((column) => column.some((n, k) => rows[k] !== 0 && !free(n)))) {
      continue;
    }
    if (!placed(field.slice(1, -1).flatMap((column) => column.slice(1, -1)))) {
      continue;
    }
    const phase = rnd() < 0.5 ? 0 : 1;
    for (const [j, column] of field.entries()) {
      for (const [k, n] of column.entries()) {
        taken[n] = 1;
        if (k + 1 < column.length) {
          setWall(g, n, e, 0);
        }
        if (j + 1 < field.length) {
          setWall(g, n, d, (j + k + phase) % 2);
        }
      }
    }
    return true;
  }
  return false;
}

/**
 * Opens `count` walls between two cells of the same hanging tree, so the routes keep their shape,
 * never baring a post and never closing a cycle under 6 cells; prefers dead ends.
 */
export function addTreeLoops(
  g: Grid,
  rnd: Random,
  root: Int32Array,
  taken: Uint8Array,
  count: number,
  trace?: Trace
): void {
  const isDeadEnd = (c: number) => [7, 11, 13, 14].includes(g.walls[c]);
  const candidates: [number, number, number][] = [];
  for (let c = 0; c < g.width * g.height; c++) {
    for (const d of [0, 1]) {
      const n = neighbour(g, c, d);
      if (
        n < 0 ||
        !(g.walls[c] & BIT[d]) ||
        root[c] < 0 ||
        root[c] !== root[n] ||
        (taken[c] && taken[n])
      ) {
        continue;
      }
      candidates.push([c, d, n]);
    }
  }
  let opened = 0;
  for (let tries = 0; tries < 400 && opened < count && candidates.length; tries++) {
    const k = Math.floor(rnd() * candidates.length);
    const [c, d, n] = candidates[k];
    if (!(g.walls[c] & BIT[d]) || (!isDeadEnd(c) && !isDeadEnd(n) && rnd() < 0.7)) {
      continue;
    }
    if (cycleLength(g, c, n) < 6) {
      continue;
    }
    setWall(g, c, d, 0);
    if (bareEndPost(g, c, d)) {
      setWall(g, c, d, 1);
      continue;
    }
    candidates.splice(k, 1);
    opened++;
    trace?.('loop', g.walls, { edge: [c, d] });
  }
}

/**
 * The walls between cells of different hanging trees (or a tree and another route cell), as
 * `[cell, 0 north | 1 east]`: opening one makes a loop through the routes.
 */
export function crossWalls(g: Grid, root: Int32Array): CellEdge[] {
  const out: CellEdge[] = [];
  for (let c = 0; c < g.width * g.height; c++) {
    for (const d of [0, 1]) {
      const n = neighbour(g, c, d);
      if (
        n >= 0 &&
        g.walls[c] & BIT[d] &&
        root[c] >= 0 &&
        root[n] >= 0 &&
        root[c] !== root[n] &&
        !isStartEast(c, d)
      ) {
        out.push([c, d]);
      }
    }
  }
  return out;
}
