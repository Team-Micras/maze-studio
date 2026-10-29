/**
 * The run time of a route for a robot profile, after the time-based planner of MicrasFirmware
 * (micras-lib 3447ba9, `motion_limits.cpp`, `turn_table.hpp`): every turn is taken at the speed
 * its curvature and the robot's grip allow, `v = √(grip × radius)`, capped at the top speed, and
 * lasts its curve length over that speed; between two turns the robot speeds up from the first
 * turn's speed and brakes to the next one's at one acceleration, under one top speed for straights
 * and diagonals. A turn takes the half cell before it and the half cell after it, so a straight
 * between two turns runs one cell less than the cell centres it joins. A profile without
 * diagonals takes every zigzag as a chain of 90 degree turns. The firmware's clothoids, two-bend
 * turns and motor roll-off are left out.
 *
 * @module
 */

import { routeGeometry, type Geometry } from './analysis';
import { bfs, dirTo, neighbourTable, type Grid } from './grid';

/** A robot class. */
export interface Robot {
  readonly name: string;
  /** m/s², speeding up and braking. */
  readonly accel: number;
  /** m/s on straights and diagonals. */
  readonly vmax: number;
  /** m/s² of lateral acceleration the turns may ask for. */
  readonly grip: number;
}

/** The robot classes. */
export type RobotClass = 'weak' | 'mid' | 'strong';

/** The two ways a robot runs a zigzag. */
export type RunKind = 'orthogonal' | 'diagonal';

/**
 * A robot class running zigzags as diagonals or as 90 degree turns; with `distance` the "time" is
 * the length driven, in metres, each turn of `ENDS` carrying its `footprint`.
 */
export interface Profile extends Robot {
  readonly diagonals: boolean;
  readonly robot: string;
  readonly distance?: boolean;
  readonly footprint?: readonly number[];
}

/** A turn of the turn table: peak curvature radius and curve length, m. */
export interface Turn {
  readonly radius: number;
  readonly length: number;
}

/**
 * Turns of the firmware's turn table on 180 mm cells (micras-lib `turn_table.hpp`): SS90S for the
 * 90 degree turn, SD45 and DS45 into and out of a diagonal, DS135 out of one. The 90 degree turn
 * between two diagonals counts as a 135 and a 45.
 */
export const TURNS: Readonly<Record<'t90' | 't45' | 't135', Turn>> = {
  t90: { radius: 0.08, length: 0.145 },
  t45: { radius: 0.284, length: 0.242 },
  t135: { radius: 0.09, length: 0.232 },
};

/**
 * Three robot classes, so a maze rewards bold, powerful robots as well as smart ones:
 * - weak: Micras on its normal run profile (0.35 of the tires' 1.07 g, 1.5 m/s), a beginner's mouse;
 * - mid: a mature mouse without a fan, about 0.6 g and 3 m/s, its 90 degree turn at 0.69 m/s;
 * - strong: a finalist with a suction fan, 20 m/s² and 5 m/s, 50 m/s² in the turns.
 *
 * mid is the class the generator builds for; the others are measured on the result.
 */
export const ROBOTS: Readonly<Record<RobotClass, Robot>> = {
  weak: { name: 'Weak', accel: 3.67, vmax: 1.5, grip: 3.67 },
  mid: { name: 'Mid', accel: 6, vmax: 3, grip: 6 },
  strong: { name: 'Strong, fan', accel: 20, vmax: 5, grip: 50 },
};

const CELL = 0.18;

const profile = (robot: RobotClass, diagonals: boolean): Profile => ({
  ...ROBOTS[robot],
  robot,
  diagonals,
  name: `${ROBOTS[robot].name}, ${diagonals ? 'diagonal' : 'orthogonal'}`,
});

/** Every robot class without and with diagonals. */
export const RACERS: Readonly<Record<RobotClass, Readonly<Record<RunKind, Profile>>>> = {
  weak: { orthogonal: profile('weak', false), diagonal: profile('weak', true) },
  mid: { orthogonal: profile('mid', false), diagonal: profile('mid', true) },
  strong: { orthogonal: profile('strong', false), diagonal: profile('strong', true) },
};

/**
 * The two robots the generator builds for: the mid class without and with diagonals, which
 * differ in that ability only, so a route choice rewards a strategy and no particular robot.
 */
export const PROFILES = RACERS.mid;

/**
 * Length driven instead of time, for the robots that plan the shortest route. Without diagonals
 * every move is a cell; with them it is the line through the middles of the walls the route
 * crosses, a cell along a straight and half a diagonal of a cell wherever the route turns.
 */
const DISTANCE: Readonly<Record<RunKind, Profile>> = {
  orthogonal: {
    name: 'Distance, orthogonal',
    robot: 'distance',
    diagonals: false,
    distance: true,
    accel: 1,
    vmax: 1,
    grip: 1,
    footprint: [CELL, 0, 0],
  },
  diagonal: {
    name: 'Distance, diagonal',
    robot: 'distance',
    diagonals: true,
    distance: true,
    accel: 1,
    vmax: 1,
    grip: 1,
    footprint: [CELL / Math.SQRT2, CELL / (2 * Math.SQRT2), (3 * CELL) / (2 * Math.SQRT2)],
  },
};

const K = 256;
const STATES = 180 * K + 1;
const S = 0;
const T = 1;
const D = 2;
const U_TURN = -2;
const ENDS = ['t90', 't45', 't135'] as const;
const E90 = 0;
const E45 = 1;
const E135 = 2;

/**
 * A run state packed in one integer: kind, direction `d`, previous direction `p` (-1 for none),
 * the turn `e` the straight started from (`ENDS`) and `k` moves. S: straight along `d` for `k`
 * moves. T: one move along `d` after a straight of `k` moves along `p`. D: zigzag of `k` moves
 * alternating `p` and `d`, last move along `d`, entered by a 45. -1 is the state before the first
 * move.
 */
const pack = (kind: number, d: number, p: number, e: number, k: number): number =>
  (((kind * 4 + d) * 5 + p + 1) * 3 + e) * K + k;

const turnSpeed = (pr: Profile, e: number): number =>
  Math.min(pr.vmax, Math.sqrt(pr.grip * TURNS[ENDS[e]].radius));

const turnTime = (pr: Profile, e: number): number =>
  pr.distance ? (pr.footprint?.[e] ?? 0) : TURNS[ENDS[e]].length / turnSpeed(pr, e);

/**
 * Time over `metres` from speed `v1` to `v2` at the profile's acceleration and top speed. A run
 * too short to change the speed between its turns is taken at their mean speed, which is
 * optimistic where the robot could not brake that much.
 */
function segment(pr: Profile, metres: number, v1: number, v2: number): number {
  if (pr.distance) {
    return metres;
  }
  if (Math.abs(v2 * v2 - v1 * v1) >= 2 * pr.accel * metres) {
    return metres > 0 ? (2 * metres) / (v1 + v2) : 0;
  }
  const peak = Math.min(pr.vmax, Math.sqrt(pr.accel * metres + (v1 * v1 + v2 * v2) / 2));
  return (
    (2 * peak - v1 - v2) / pr.accel +
    (metres - (2 * peak * peak - v1 * v1 - v2 * v2) / (2 * pr.accel)) / peak
  );
}

interface RunTimes {
  readonly straight: Float64Array[];
  readonly diagonal: Float64Array[];
  readonly turn: number[];
}

const runTables = new Map<Profile, RunTimes>();

/**
 * Times of straights and zigzags by moves, per profile: straights by start and end turn (`ENDS`,
 * start × 3 + end), zigzags (entered by a 45) by end turn. A straight of k moves joins k + 1 cell
 * centres and the turns at its ends take a half cell each, so it runs k - 1 cells. The start and
 * the goal count as 90 degree ends too, which shortens every route by the same cell.
 */
function runTimes(pr: Profile): RunTimes {
  let r = runTables.get(pr);
  if (!r) {
    const v = ENDS.map((_, e) => (pr.distance ? 1 : turnSpeed(pr, e)));
    const table: RunTimes = {
      straight: [],
      diagonal: [],
      turn: ENDS.map((_, e) => turnTime(pr, e)),
    };
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        table.straight.push(
          Float64Array.from({ length: K }, (_, k) =>
            segment(pr, Math.max(k - 1, 0) * CELL, v[a], v[b])
          )
        );
      }
      table.diagonal.push(
        Float64Array.from({ length: K }, (_, k) =>
          segment(pr, (Math.max(k - 1, 1) * CELL) / Math.SQRT2, v[E45], v[a])
        )
      );
    }
    runTables.set(pr, table);
    r = table;
  }
  return r;
}

let cost = 0;

/**
 * The run state after moving along `nd` from state `st`; leaves the time of the run it closes in
 * `cost`. `U_TURN` when `nd` goes back.
 */
function step(pr: Profile, st: number, nd: number): number {
  cost = 0;
  if (st < 0) {
    return pack(S, nd, -1, E90, 1);
  }
  const k = st % K;
  let r = (st - k) / K;
  const e = r % 3;
  r = (r - e) / 3;
  const p = (r % 5) - 1;
  r = (r - p - 1) / 5;
  const d = r % 4;
  const kind = (r - d) / 4;
  if (nd === (d + 2) % 4) {
    return U_TURN;
  }
  if (kind === S) {
    return nd === d ? pack(S, d, -1, e, k + 1) : pack(T, nd, d, e, k);
  }
  const { straight, diagonal, turn } = runTimes(pr);
  if (kind === T) {
    if (nd === p && pr.diagonals) {
      cost = straight[e * 3 + E45][k] + turn[E45];
      return pack(D, p, d, E45, 2);
    }
    cost = straight[e * 3 + E90][k] + turn[E90];
    return nd === d ? pack(S, d, -1, E90, 2) : pack(T, nd, d, E90, 1);
  }
  if (nd === p) {
    return pack(D, p, d, E45, k + 1);
  }
  if (nd === d) {
    cost = diagonal[E45][k] + turn[E45];
    return pack(S, d, -1, E45, 2);
  }
  cost = diagonal[E135][k] + turn[E135];
  return pack(S, nd, -1, E135, 1);
}

function finish(pr: Profile, st: number): number {
  const k = st % K;
  const r = Math.floor(st / K);
  const e = r % 3;
  const kind = Math.floor(r / 60);
  const { straight, diagonal, turn } = runTimes(pr);
  if (kind === S) {
    return straight[e * 3 + E90][k];
  }
  if (kind === T) {
    return straight[e * 3 + E90][k] + turn[E90] + straight[E90 * 3 + E90][1];
  }
  return diagonal[E45][k] + turn[E45];
}

/** The run time of a route given as cells, start first; Infinity when it turns back. */
export function routeTime(g: Grid, route: readonly number[], pr: Profile): number {
  let st = -1;
  let time = 0;
  for (let i = 1; i < route.length; i++) {
    st = step(pr, st, dirTo(g, route[i - 1], route[i]));
    if (st === U_TURN) {
      return Infinity;
    }
    time += cost;
  }
  return st >= 0 ? time + finish(pr, st) : 0;
}

const table = {
  slots: 1 << 14,
  shift: 18,
  keys: new Int32Array(1 << 14),
  times: new Float64Array(1 << 14),
  parents: new Int32Array(1 << 14),
  stamps: new Uint32Array(1 << 14),
  stamp: 0,
  used: 0,
};

function slot(key: number): number {
  const t = table;
  let i = Math.imul(key, 0x9e3779b1) >>> t.shift;
  while (t.stamps[i] === t.stamp) {
    if (t.keys[i] === key) {
      return i;
    }
    i = (i + 1) & (t.slots - 1);
  }
  t.stamps[i] = t.stamp;
  t.keys[i] = key;
  t.times[i] = Infinity;
  t.parents[i] = -1;
  t.used++;
  return i;
}

function grow(): void {
  const { keys, times, parents, stamps, stamp } = table;
  Object.assign(table, {
    slots: table.slots * 2,
    shift: table.shift - 1,
    keys: new Int32Array(table.slots * 2),
    times: new Float64Array(table.slots * 2),
    parents: new Int32Array(table.slots * 2),
    stamps: new Uint32Array(table.slots * 2),
    stamp: 1,
    used: 0,
  });
  for (let i = 0; i < keys.length; i++) {
    if (stamps[i] !== stamp) {
      continue;
    }
    const j = slot(keys[i]);
    table.times[j] = times[i];
    table.parents[j] = parents[i];
  }
}

const heap = { time: new Float64Array(1 << 12), key: new Int32Array(1 << 12), size: 0 };

function push(time: number, key: number): void {
  if (heap.size === heap.time.length) {
    const t = new Float64Array(2 * heap.size);
    t.set(heap.time);
    const k = new Int32Array(2 * heap.size);
    k.set(heap.key);
    Object.assign(heap, { time: t, key: k });
  }
  const { time: ht, key: hk } = heap;
  ht[heap.size] = time;
  hk[heap.size] = key;
  for (let i = heap.size++; i > 0;) {
    const up = (i - 1) >> 1;
    if (ht[up] <= ht[i]) {
      break;
    }
    [ht[up], ht[i]] = [ht[i], ht[up]];
    [hk[up], hk[i]] = [hk[i], hk[up]];
    i = up;
  }
}

function pop(): void {
  const { time: ht, key: hk } = heap;
  const n = --heap.size;
  if (!n) {
    return;
  }
  ht[0] = ht[n];
  hk[0] = hk[n];
  for (let i = 0; ;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    if (l < n && ht[l] < ht[m]) {
      m = l;
    }
    if (r < n && ht[r] < ht[m]) {
      m = r;
    }
    if (m === i) {
      break;
    }
    [ht[m], ht[i]] = [ht[i], ht[m]];
    [hk[m], hk[i]] = [hk[i], hk[m]];
    i = m;
  }
}

const TIE = 1e-9;

/** A route, start first, and its time. */
export interface TimedRoute {
  readonly route: number[];
  readonly time: number;
}

/**
 * The fastest route from the start to the goal for a profile: Dijkstra over (cell, run state).
 * With `tie` (a profile with the same diagonals) routes equal under `pr` are told apart by their
 * time under it, and the time returned holds a trace of it: measure the route with
 * {@link routeTime}. An empty route and Infinity when the goal cannot be reached.
 */
export function fastestRoute(g: Grid, pr: Profile, tie?: Profile): TimedRoute {
  const next = neighbourTable(g);
  const isGoal = new Uint8Array(g.width * g.height);
  for (const c of g.goals) {
    isGoal[c] = 1;
  }
  table.stamp++;
  table.used = 0;
  heap.size = 0;
  const startKey = g.start * STATES;
  table.times[slot(startKey)] = 0;
  push(0, startKey);
  while (heap.size) {
    const time = heap.time[0];
    const k = heap.key[0];
    pop();
    if (time > table.times[slot(k)]) {
      continue;
    }
    const st = (k % STATES) - 1;
    const c = (k - st - 1) / STATES;
    if (st >= 0 && isGoal[c]) {
      const route = [c];
      for (let p = table.parents[slot(k)]; p >= 0; p = table.parents[slot(p)]) {
        route.push((p - (p % STATES)) / STATES);
      }
      return { route: route.toReversed(), time };
    }
    const w = g.walls[c];
    for (let d = 0; d < 4; d++) {
      if (w & (1 << d)) {
        continue;
      }
      const n = next[c * 4 + d];
      if (n < 0) {
        continue;
      }
      const nst = step(pr, st, d);
      if (nst === U_TURN) {
        continue;
      }
      let t = time + cost + (isGoal[n] ? finish(pr, nst) : 0);
      if (tie) {
        step(tie, st, d);
        t += TIE * (cost + (isGoal[n] ? finish(tie, nst) : 0));
      }
      const nk = n * STATES + nst + 1;
      if (2 * table.used > table.slots) {
        grow();
      }
      const i = slot(nk);
      if (t >= table.times[i]) {
        continue;
      }
      table.times[i] = t;
      table.parents[i] = k;
      push(t, nk);
    }
  }
  return { route: [], time: Infinity };
}

/** The route choice of a maze: each robot's fastest route and what the other's costs it. */
export interface RouteChoice {
  /** The fastest route of the careful robot, start first. */
  readonly careful: number[];
  /** The fastest route of the racing robot, start first. */
  readonly racing: number[];
  /** s, the racing robot on its own route. */
  readonly racingTime: number;
  /** Longest stretch of the racing route off the careful one, over the racing route's moves. */
  readonly detour: number;
  /** Cells between the two routes at their furthest, Chebyshev distance. */
  readonly apart: number;
  /** How much faster the racing robot is on its route than on the careful one, %. */
  readonly racingGain: number;
  /** How much slower the careful robot is on the racing route than on its own, %. */
  readonly carefulLoss: number;
  readonly racingShape: Geometry;
  readonly carefulShape: Geometry;
}

/**
 * The route choice of a maze for a robot class, the generator's by default. A real choice splits
 * the routes and makes each robot lose on the other's route. Null when the goal is out of reach.
 */
export function routeChoice(g: Grid, robot: RobotClass = 'mid'): RouteChoice | null {
  const { orthogonal, diagonal } = RACERS[robot];
  const careful = fastestRoute(g, orthogonal);
  if (!careful.route.length) {
    return null;
  }
  const racing = fastestRoute(g, diagonal);
  const w = g.width;
  const onCareful = new Uint8Array(w * g.height);
  for (const c of careful.route) {
    onCareful[c] = 1;
  }
  let run = 0;
  let longest = 0;
  let apart = 0;
  for (const c of racing.route) {
    if (onCareful[c]) {
      run = 0;
      continue;
    }
    longest = Math.max(longest, ++run);
    const x = c % w;
    const y = (c - x) / w;
    let nearest = Infinity;
    for (const a of careful.route) {
      const ax = a % w;
      nearest = Math.min(nearest, Math.max(Math.abs(ax - x), Math.abs((a - ax) / w - y)));
    }
    apart = Math.max(apart, nearest);
  }
  return {
    careful: careful.route,
    racing: racing.route,
    racingTime: racing.time,
    detour: longest / Math.max(1, racing.route.length - 1),
    apart,
    racingGain: 100 * (routeTime(g, careful.route, diagonal) / racing.time - 1),
    carefulLoss: 100 * (routeTime(g, racing.route, orthogonal) / careful.time - 1),
    racingShape: routeGeometry(g, racing.route),
    carefulShape: routeGeometry(g, careful.route),
  };
}

/**
 * The fastest route of a profile among those with the fewest cells: the route a flood-fill robot
 * races on a maze it knows.
 */
export function fewestCells(g: Grid, pr: Profile): TimedRoute {
  const from = bfs(g, [g.start]).dist;
  const to = bfs(g, g.goals).dist;
  const cells = to[g.start];
  const next = neighbourTable(g);
  const walls = g.walls.slice();
  for (let c = 0; c < walls.length; c++) {
    for (let d = 0; d < 4; d++) {
      const n = next[c * 4 + d];
      if (!(n >= 0 && from[c] >= 0 && from[n] === from[c] + 1 && from[c] + 1 + to[n] === cells)) {
        walls[c] |= 1 << d;
      }
    }
  }
  return fastestRoute({ ...g, walls }, pr);
}

/**
 * The length of a route on the lattice of a robot that plans by distance, m: the move count
 * without diagonals, the line through the middles of the walls crossed with them.
 */
export const routeLength = (g: Grid, route: readonly number[], diagonals: boolean): number =>
  routeTime(g, route, DISTANCE[diagonals ? 'diagonal' : 'orthogonal']);

/** One reference behaviour: its route, start first, its cells and its run time in s. */
export interface Reference {
  readonly route: number[];
  readonly cells: number;
  readonly time: number;
}

/** The four reference behaviours of a robot class. */
export interface References {
  readonly shortest: Readonly<Record<RunKind, Reference>>;
  readonly fastest: Readonly<Record<RunKind, Reference>>;
}

/** Fastest routes already searched, by how they run zigzags. */
export type KnownRoutes = Partial<Record<RunKind, number[]>>;

/**
 * The four reference behaviours of a robot class: the shortest route with 90 degree turns only
 * (fewest cells, the best time among them), the shortest with diagonals (the shortest line on the
 * diagonal lattice, the best time among equals) and the fastest by time without and with
 * diagonals. Null when the goal cannot be reached.
 *
 * @param fastest Fastest routes already searched.
 */
export function references(
  g: Grid,
  robot: RobotClass = 'mid',
  fastest: KnownRoutes = {}
): References | null {
  const behaviours = (key: RunKind) => {
    const pr = RACERS[robot][key];
    const short = fastestRoute(g, DISTANCE[key], pr).route;
    if (!short.length) {
      return null;
    }
    const route = fastest[key] ?? fastestRoute(g, pr).route;
    return {
      shortest: { route: short, cells: short.length - 1, time: routeTime(g, short, pr) },
      fastest: { route, cells: route.length - 1, time: routeTime(g, route, pr) },
    };
  };
  const orthogonal = behaviours('orthogonal');
  const diagonal = orthogonal && behaviours('diagonal');
  if (!orthogonal || !diagonal) {
    return null;
  }
  return {
    shortest: { orthogonal: orthogonal.shortest, diagonal: diagonal.shortest },
    fastest: { orthogonal: orthogonal.fastest, diagonal: diagonal.fastest },
  };
}

/** What the shortest-route robot loses against the time-fastest one, %, and the extra cells. */
export interface Losing {
  readonly loss: number;
  readonly extra: number;
}

/**
 * "Shortest is not fastest" for one robot class, without and with diagonals: what the
 * shortest-route robot loses against the time-fastest one, in %, and how many cells longer than
 * the shortest path the time-fastest route is.
 */
export type ShortestCost = Readonly<Record<RunKind, Losing>>;

/** "Shortest is not fastest" of a maze for a robot class ({@link references}). */
export function shortestCost(
  g: Grid,
  robot: RobotClass = 'mid',
  fastest: KnownRoutes = {}
): ShortestCost | null {
  const r = references(g, robot, fastest);
  if (!r) {
    return null;
  }
  const cells = r.shortest.orthogonal.cells;
  const of = (key: RunKind): Losing => ({
    loss: 100 * (r.shortest[key].time / r.fastest[key].time - 1),
    extra: r.fastest[key].cells - cells,
  });
  return { orthogonal: of('orthogonal'), diagonal: of('diagonal') };
}

/**
 * Distinct routes of a profile within `slack` of its fastest time: the fastest route, then, for
 * one of its edges in every stride (about 40 edges in all), the fastest route with that edge
 * closed, counted when it differs from every route counted so far in 4 cells or more.
 *
 * @param enough Stops counting there, when only "at least" matters.
 */
export function nearTies(g: Grid, pr: Profile, slack = 0.05, enough = Infinity): number {
  const best = fastestRoute(g, pr);
  if (!best.route.length) {
    return 0;
  }
  const goal = new Set(g.goals);
  const limit = best.time * (1 + slack);
  const found = [new Set(best.route)];
  const walls = g.walls.slice();
  const h = { ...g, walls };
  const route = best.route;
  const stride = Math.max(1, Math.round(route.length / 40));
  for (let i = 0; i + 1 < route.length && found.length < enough; i += stride) {
    const [a, b] = [route[i], route[i + 1]];
    if (goal.has(a) && goal.has(b)) {
      continue;
    }
    const d = dirTo(g, a, b);
    walls[a] |= 1 << d;
    walls[b] |= 1 << ((d + 2) % 4);
    const r = fastestRoute(h, pr);
    walls[a] = g.walls[a];
    walls[b] = g.walls[b];
    if (r.time > limit) {
      continue;
    }
    const cells = new Set(r.route);
    const apart = (f: Set<number>) => {
      let diff = 0;
      for (const c of cells) {
        if (!f.has(c)) {
          diff++;
        }
      }
      for (const c of f) {
        if (!cells.has(c)) {
          diff++;
        }
      }
      return diff >= 4;
    };
    if (found.every(apart)) {
      found.push(cells);
    }
  }
  return found.length;
}
