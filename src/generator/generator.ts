/**
 * The maze generator. Each seed draws a generation style ({@link STYLES}), so a batch is varied
 * rather than all alike. The routes-first styles build two routes first (`routes.ts`): a racing and
 * a careful route on the two sides of a layout, a forest hanging off them, loops inside the forest
 * and across it, then an annealing repair against every target. The annealed style, and every seed
 * whose construction fails, grows a tree around a 2 × 2 goal with one entrance, adds loops chosen
 * by the shortcut they create, anneals, opens a second route and anneals again. {@link vary}
 * reworks regions of a maze the room liked. Pure and deterministic: the same settings and seed
 * give the same maze on every engine, and every candidate carries its recipe.
 *
 * @module
 */

import { analyse, flood, overCap, symmetry, type ShapeCap } from './analysis';
import { BIT, bfs, dirTo, isOpen, neighbour, setWall, type Grid } from './grid';
import {
  PROFILES,
  fastestRoute,
  fewestCells,
  nearTies,
  routeChoice,
  routeTime,
  shortestCost,
  type RouteChoice,
  type ShortestCost,
} from './racing';
import {
  PAYERS,
  ROUTE_ROOM,
  addTreeLoops,
  between,
  carveRoutes,
  crossWalls,
  fillForest,
  layout,
  lineRun,
  type CarveAim,
  type Random,
} from './routes';
import {
  bareEndPost,
  centreGoal,
  closedBoard,
  cycleLength,
  doorCount,
  goalCentre,
  goalPerimeter,
  isStartEast,
  type CellEdge,
} from './rules';
import { followerReaches, searchRun } from './search';
import { MOTIFS, sensor, type Motif, type Sensor } from './sensor';
import type {
  Analysis,
  BoardParts,
  ChoiceTarget,
  Level,
  LosingKind,
  Motifs,
  Range,
  Seed,
  SeedLike,
  Settings,
  Shape,
  ShortestTarget,
  Style,
  Targets,
  Trace,
} from './types';

/**
 * The version of the generator in every recipe. A recipe rebuilds its maze only under the version
 * that made it: whenever a change makes some seed build another maze, this goes up, and a recipe
 * of an older version opens the walls it saved. 7: three robot classes and turns at their traction
 * speed, "shortest is not fastest", the classes kept or flipped by preference, a bait re-measured on
 * the whole maze, a contest at 3 %, an annealing schedule without the engine's `Math.pow` and
 * `Math.log`, and the wall hash in the recipe.
 */
export const GENERATOR_VERSION = 7;

/**
 * The hash of a maze's walls and goal cells (FNV-1a, 32 bits, as 8 hex digits), stored in the
 * recipe so a rebuild can tell whether it made the same maze.
 */
export function wallHash(g: Grid): string {
  let h = 0x811c9dc5;
  for (const v of [...g.walls, 255, ...g.goals.flatMap((c) => [c & 255, c >> 8])]) {
    h = Math.imul(h ^ v, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * e^x from + - × / only, which every engine rounds the same way, unlike `Math.exp`: x = k ln 2 + r
 * with |r| ≤ ln 2 / 2, a Taylor series of r to 1e-15, then k halvings or doublings, which are exact.
 */
export function expOf(x: number): number {
  if (x === -Infinity) {
    return 0;
  }
  const k = Math.round(x / Math.LN2);
  const r = x - k * Math.LN2;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 18; n++) {
    sum += term *= r / n;
  }
  for (let i = 0; i < Math.abs(k); i++) {
    sum = k > 0 ? sum * 2 : sum / 2;
  }
  return sum;
}

/**
 * The natural log of x > 0 from + - × / only, unlike `Math.log`: x = m 2^k with m in [1, 2) by
 * exact halvings or doublings, then ln m = 2 atanh((m - 1) / (m + 1)) by its series, to 1e-15.
 * -Infinity at 0.
 */
export function logOf(value: number): number {
  if (value <= 0) {
    return -Infinity;
  }
  let x = value;
  let k = 0;
  while (x >= 2) {
    [x, k] = [x / 2, k + 1];
  }
  while (x < 1) {
    [x, k] = [x * 2, k - 1];
  }
  const z = (x - 1) / (x + 1);
  let term = z;
  let sum = 0;
  for (let n = 1; n < 40; n += 2, term *= z * z) {
    sum += term / n;
  }
  return 2 * sum + k * Math.LN2;
}

/**
 * The generation styles, one drawn per seed among those the settings allow ({@link stylesFor}),
 * all of them under the same targets and hard rules. Routes-first, with the route choice:
 * - split: one route on each side of a bent line from an early split to the goal;
 * - lane: the racing route opens with a long straight along the west or south edge;
 * - stairs: the racing route is mostly 45 degree staircases;
 * - late: a long shared stem wraps along the board edges and the routes part near the goal;
 * - crossing: the routes part, cross at a waypoint and swap sides.
 *
 * Without it: bait (a seed with a search trap or a losing shortest route), a shorter, slower bait
 * route that a flood-fill round trip takes; tie (a seed with neither), two routes that each robot
 * runs within routes `TIE` % of each other. annealed: the growing tree tuned by annealing, drawn on
 * 16 × 16 only and at half the weight of the others, as it takes most of the time of a batch.
 */
export const STYLES: readonly Style[] = [
  'split',
  'lane',
  'stairs',
  'late',
  'crossing',
  'bait',
  'tie',
  'annealed',
];

/** Ranges per level, by board size, from the corpus (classic finals p10, median and p90). */
export const LEVELS: Readonly<
  Record<16 | 32, Readonly<Record<'straights' | 'diagonals', Readonly<Record<Level, Range>>>>>
> = {
  16: {
    straights: { low: [2, 6], medium: [7, 10], high: [11, 15] },
    diagonals: { low: [0, 4], medium: [5, 8], high: [9, 16] },
  },
  32: {
    straights: { low: [3, 8], medium: [9, 14], high: [15, 31] },
    diagonals: { low: [0, 6], medium: [7, 12], high: [13, 40] },
  },
};

const BIAS: Readonly<Record<Level, number>> = { low: 0.4, medium: 1.5, high: 5 };

const LEVEL_NAMES: readonly Level[] = ['low', 'medium', 'high'];

/** The range of moves the settings ask for the longest straight or diagonal. */
export const levelRange = (
  s: Pick<Settings, 'size' | 'straights' | 'diagonals'>,
  key: 'straights' | 'diagonals'
): Range => {
  const v = s[key];
  return typeof v === 'string' ? LEVELS[s.size][key][v] : v;
};

function bias(
  s: Pick<Settings, 'size' | 'straights' | 'diagonals'>,
  key: 'straights' | 'diagonals'
) {
  const v = s[key];
  if (typeof v === 'string') {
    return BIAS[v];
  }
  const levels = LEVELS[s.size][key];
  return BIAS[LEVEL_NAMES.find((k) => v[1] <= levels[k][1]) ?? 'high'];
}

/** A small fast seeded PRNG (mulberry32), uniform in `[0, 1)`. */
export function random(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const outside = (v: number, [lo, hi]: Range): number => (v < lo ? lo - v : v > hi ? v - hi : 0);

/**
 * The texture of the whole board: dead ends and straight corridors in % of the cells that reach
 * the goal. 16 × 16: the 105 Japanese mazes, p10 to p90. 32 × 32: the 12 Japanese half-size
 * finals that use the whole board.
 */
export const TEXTURE: Readonly<Record<16 | 32, { deadEnds: Range; corridors: Range }>> = {
  16: { deadEnds: [3, 13], corridors: [26, 59] },
  32: { deadEnds: [3, 7], corridors: [32, 56] },
};

/**
 * The route choice target, from the finals where the field split: one stretch off the careful
 * route of 53 to 96 % of the racing route, 6 to 8 cells apart; the racing robot's gain 4 to 20 %,
 * and what the careful robot loses on the racing route 2 to 10 %.
 */
export const CHOICE: ChoiceTarget = { detour: 50, apart: 5, gain: [4, 20], loss: [2, 10] };

/**
 * The route choice of the late and crossing styles: the racing route leaves the careful one in a
 * shorter stretch, after the long stem or on each side of the crossing.
 */
export const CHOICE_SHORT: ChoiceTarget = { ...CHOICE, detour: 30, apart: 3 };

/**
 * The shape caps of the two routes, so the racing route reads as a racing line and neither route
 * fills its side in rows, combs or spirals; calibrated near the finals' p90, but for the racing
 * hairpins, at most 2 long legs back and forth.
 */
const SHAPE: Shape = {
  racing: { corners: 0.25, bends: 1, hairpins: 2, coil: 3 },
  careful: { corners: 0.25, bends: 3, hairpins: 3, coil: 3 },
};

/**
 * The search trap: how much the racing robot must lose on the route a flood-fill search knows
 * after one round trip. A seed asks for one with the share of `Settings.trap` (`share` when the
 * switch is just on) and then for `loss` % or more; the bait style asks for `deep.loss` % on
 * `BAIT_DEEP` of its seeds.
 */
export const TRAP = { share: 0.35, loss: 10, deep: { loss: 20 } } as const;

/**
 * "Shortest is not fastest": the time-fastest route of a robot is `cells` or more cells longer
 * than the shortest path, and the robot that runs the shortest route loses `loss` % or more
 * against it.
 */
export const SHORTEST = { loss: 5, cells: 2 } as const;

const BAIT_DEEP = 0.7;

/**
 * The longest shortest path, as a share of the cells, that the routes-first construction starts
 * from: two routes side by side hold about 70 cells at 16 × 16, and a shared stem adds about 45.
 */
const ROUTES_REACH = 0.45;

/**
 * Sensor motifs, by board size: the length in cells on the route (the dashed area: dash rows the
 * route crosses), drawn from these ranges (p50 to p90 of the finals that have the motif) unless
 * the settings give one.
 */
export const MOTIF_CELLS: Readonly<Record<16 | 32, Readonly<Record<Motif, Range>>>> = {
  16: { zigzag: [5, 11], dashed: [4, 6], fishbone: [3, 7] },
  32: { zigzag: [5, 11], dashed: [6, 12], fishbone: [4, 11] },
};

const MOTIF_EDGE: Readonly<Record<Motif, readonly number[]>> = {
  zigzag: [0.18, 0.36, 0.46],
  dashed: [0, 0.17, 0.83],
  fishbone: [0, 0.4, 0.6],
};

/**
 * The least near-tied routes per board (racing `nearTies`, the racing robot within 5 % of its
 * fastest). Under the run + search time scoring the default is one more.
 */
export const TIES: Readonly<Record<16 | 32, number>> = { 16: 2, 32: 2 };

/**
 * What makes a maze a contest rather than trivial: the two robots' fastest routes share less than
 * `shared` of their cells, or a flood-fill round trip leaves either robot `loss` % or more off its
 * fastest route.
 */
export const CONTEST = { shared: 0.8, loss: 3 } as const;

function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new RangeError(`the generator needs ${what}`);
  }
  return value;
}

const choiceOf = (g: Grid): RouteChoice => need(routeChoice(g), 'a maze whose goal can be reached');

const isMotif = (k: string): k is Motif => (MOTIFS as readonly string[]).includes(k);

const motifEntries = (motifs: Motifs | null): [Motif, Range][] =>
  Object.entries(motifs ?? {}).flatMap(([k, range]): [Motif, Range][] =>
    isMotif(k) && range ? [[k, range]] : []
  );

/**
 * Whether the maze is a contest ({@link CONTEST}): the two robots race routes apart, or one round
 * trip of a flood fill does not show one of them its fastest route.
 */
export function isContest(g: Grid, choice: RouteChoice): boolean {
  const careful = new Set(choice.careful);
  const racing = new Set(choice.racing);
  let both = 0;
  for (const c of racing) {
    if (careful.has(c)) {
      both++;
    }
  }
  if (both < CONTEST.shared * (careful.size + racing.size - both)) {
    return true;
  }
  if (searchRun(g, choice.racingTime).loss >= CONTEST.loss) {
    return true;
  }
  return (
    searchRun(g, routeTime(g, choice.careful, PROFILES.orthogonal), PROFILES.orthogonal).loss >=
    CONTEST.loss
  );
}

const SYMMETRY: readonly (readonly [chance: number, window: Range])[] = [
  [0.65, [62, 70]],
  [0.15, [70, 80]],
  [0.2, [80, 92]],
];

const spread = ([lo, hi]: Range, f: number): Range => [
  Math.round(lo + f * Math.max(0, hi - lo - 3)),
  hi,
];

/**
 * The share of the seeds a setting asks for: a number is the share itself, `true` the generator's
 * default for it, `false` or nothing 0.
 */
export const share = (v: boolean | number | undefined, standard: number): number =>
  v === true ? standard : typeof v === 'number' ? v : 0;

/** The share of the seeds with a route choice. */
export const choiceShare = (s: Pick<SeedLike, 'choice'>): number => share(s.choice, 1);

/** The share of the seeds with a search trap. */
export const trapShare = (s: Pick<SeedLike, 'trap'>): number => share(s.trap, TRAP.share);

const boardOf = (s: BoardParts): Grid => closedBoard(s.size, s.goals, s.room);

function offCentreGoal(size: number, rnd: Random): number[] {
  const off = () => Math.round((rnd() < 0.5 ? -1 : 1) * rnd() * ((10 * size) / 32));
  const [x, y] = [size / 2 - 2 + off(), size / 2 - 2 + off()];
  return [0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => (y + dy) * size + x + dx));
}

type AreaShape = 'rectangle' | 'notched' | 'staircase';

/**
 * The open areas of the half-size finals: each final walls off 3 to 16 areas without inner walls,
 * 4 to 21 % of the cells together. Three patterns: `varied`, 3 to 5 areas of 9 to 60 cells, some
 * notched or cut by a staircase; `repeated`, 4 to 6 equal squares and up to 3 smaller ones;
 * `lattice`, up to 16 small 3 × 3 squares on a regular lattice. `mirrored` of the boards place
 * every area with its twin across the start-goal diagonal.
 */
const AREAS = {
  patterns: [
    [0.55, 'varied'],
    [0.25, 'repeated'],
    [0.2, 'lattice'],
  ] as const,
  shapes: [
    [0.5, 'rectangle'],
    [0.3, 'notched'],
    [0.2, 'staircase'],
  ] as const,
  mirrored: 0.33,
};

function drawOf<T>(list: readonly (readonly [number, T])[], rnd: Random): T {
  let r = rnd();
  for (const [chance, item] of list) {
    if ((r -= chance) < 0) {
      return item;
    }
  }
  return list[list.length - 1][1];
}

function areaCells(w: number, h: number, shape: AreaShape, rnd: Random): [number, number][] {
  const corner = Math.floor(rnd() * 4);
  const [nw, nh] = [Math.ceil(w * (0.3 + 0.2 * rnd())), Math.ceil(h * (0.3 + 0.2 * rnd()))];
  const leg = Math.round(Math.min(w, h) * (0.5 + 0.3 * rnd()));
  const out: [number, number][] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const [x, y] = [corner & 1 ? w - 1 - dx : dx, corner & 2 ? h - 1 - dy : dy];
      if (shape === 'notched' && Math.min(w, h) >= 4 && x < nw && y < nh) {
        continue;
      }
      if (shape === 'staircase' && Math.min(w, h) >= 4 && x + y < leg) {
        continue;
      }
      out.push([dx, dy]);
    }
  }
  return out;
}

/**
 * Walled-off open areas of about `part` of the cells (0.75 to 1.25 times) in one of the `AREAS`
 * patterns, spread over the board: each 2 cells or more in from the edges, with a corridor of a
 * cell or more around it, 3 cells or more from the goal, and leaving the rest of the board in one
 * piece. Null when none fits.
 */
function openAreas(
  size: number,
  goals: readonly number[],
  part: number,
  rnd: Random
): Uint8Array | null {
  let left = part * size * size * (0.75 + 0.5 * rnd());
  const pattern = drawOf(AREAS.patterns, rnd);
  const wanted: [number, number, AreaShape][] = [];
  const add = (w: number, h: number, shape: AreaShape = 'rectangle') => {
    wanted.push([w, h, shape]);
    return w * h;
  };
  if (pattern === 'lattice') {
    while (wanted.length < 16 && left > 0) {
      left -= add(3, 3);
    }
  }
  if (pattern === 'repeated') {
    const [big, small] = [rnd() < 0.7 ? 5 : 4, rnd() < 0.5 ? 3 : 4];
    for (let k = 4 + Math.floor(rnd() * 3); k > 0 && left > 0; k--) {
      left -= add(big, big);
    }
    for (let k = 3; k > 0 && left > 0; k--) {
      left -= add(small, small);
    }
  }
  if (pattern === 'varied') {
    const parts = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => 0.4 + rnd());
    const sum = parts.reduce((a, b) => a + b, 0);
    const total = left;
    for (const piece of parts) {
      const area = Math.max(9, (total * piece) / sum);
      const stretch = rnd();
      const long = Math.min(
        Math.floor(size / 3),
        Math.round(Math.sqrt(area * (1 + 2 * stretch * stretch)))
      );
      const short = Math.max(3, Math.round(area / long));
      const shape = drawOf(AREAS.shapes, rnd);
      left -= rnd() < 0.5 ? add(long, short, shape) : add(short, long, shape);
    }
  }
  const room = new Uint8Array(size * size);
  const near = new Uint8Array(size * size);
  for (const c of goals) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const [x, y] = [(c % size) + dx, Math.floor(c / size) + dy];
        if (x >= 0 && y >= 0 && x < size && y < size) {
          near[y * size + x] = 1;
        }
      }
    }
  }
  const period = 5 + Math.floor(rnd() * 2);
  const [ox, oy] = [2 + Math.floor(rnd() * (period - 1)), 2 + Math.floor(rnd() * (period - 1))];
  const mirrored = rnd() < AREAS.mirrored;
  const twin = (c: number) => (c % size) * size + Math.floor(c / size);
  let placed = 0;
  for (const [k, [w, h, shape]] of wanted.entries()) {
    if (mirrored && k % 2) {
      continue;
    }
    const cells = areaCells(w, h, shape, rnd);
    for (let tries = 0; tries < 60; tries++) {
      let x0 = 2 + Math.floor(rnd() * (size - 3 - w));
      let y0 = 2 + Math.floor(rnd() * (size - 3 - h));
      if (pattern === 'lattice') {
        [x0, y0] = [
          ox + period * Math.floor(rnd() * (size / period)),
          oy + period * Math.floor(rnd() * (size / period)),
        ];
      }
      if (x0 < 2 || y0 < 2 || x0 + w > size - 2 || y0 + h > size - 2) {
        continue;
      }
      const own = cells.map(([dx, dy]) => (y0 + dy) * size + x0 + dx);
      const pair = new Set(mirrored ? own.map(twin) : []);
      const at = [...new Set([...own, ...pair])];
      const ring = [-size - 1, -size, -size + 1, -1, 0, 1, size - 1, size, size + 1];
      const touching =
        own.some((c) => ring.some((o) => pair.has(c + o))) && !own.some((c) => pair.has(c));
      const clear = at.every((c) => !near[c] && ring.every((o) => !room[c + o]));
      if (!clear || touching) {
        continue;
      }
      for (const c of at) {
        room[c] = 1;
      }
      if (oneFreePiece(size, room)) {
        placed++;
        break;
      }
      for (const c of at) {
        room[c] = 0;
      }
    }
  }
  return placed ? room : null;
}

function oneFreePiece(size: number, room: Uint8Array): boolean {
  const seen = new Uint8Array(size * size);
  const queue = [0];
  seen[0] = 1;
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    const steps: [number, boolean][] = [
      [c + size, c + size < size * size],
      [c - size, c >= size],
      [c + 1, (c + 1) % size !== 0],
      [c - 1, c % size !== 0],
    ];
    for (const [n, ok] of steps) {
      if (!ok || seen[n] || room[n]) {
        continue;
      }
      seen[n] = 1;
      queue.push(n);
    }
  }
  return queue.length === room.length - room.reduce((n, v) => n + v, 0);
}

/**
 * Draws what a seed asks for beyond the settings' ranges, each role from its own draw, then the
 * board: a 3 × 3 goal off the centre with `goal` 3, walled-off open areas with `room`. A search
 * trap needs a path the routes-first styles reach; the start up the whole west column needs
 * straights up to the board side; a second door needs the one-entry rule off; a board with a
 * 3 × 3 goal or a room, or a sensor motif asked of every seed, keeps its symmetry below
 * `MIRRORED`. Only seeds without a route choice aim at a symmetry, at a share raised so that
 * `symmetric` of all seeds do.
 *
 * @param path The least path of the seed's window.
 */
export function drawSeed(s: Settings, rnd: Random, path: number): Seed {
  const [choiceDraw, trapDraw, westDraw, doorDraw, symmetricDraw, windowDraw, placeDraw] =
    Array.from({ length: 7 }, rnd);
  const place = random(Math.floor(placeDraw * 4294967296));
  const motifDraw = random(Math.floor(placeDraw * 2147483648) ^ 0x5e45);
  const routeDraw = random(Math.floor(placeDraw * 2147483648) ^ 0x7a11);
  const motifs: Motifs = Object.fromEntries(
    MOTIFS.filter((k) => motifDraw() < share(s[k], 1)).map((k) => [
      k,
      s[`${k}Cells`] ?? MOTIF_CELLS[s.size][k],
    ])
  );
  const goals = s.goal === 3 ? offCentreGoal(s.size, place) : undefined;
  const choice = choiceDraw < choiceShare(s);
  const symmetricShare = Math.min(1, share(s.symmetric, 0) / Math.max(1e-9, 1 - choiceShare(s)));
  const symmetric = !choice && symmetricDraw < symmetricShare;
  let window = 0;
  while (
    window < SYMMETRY.length - 1 &&
    windowDraw > SYMMETRY.slice(0, window + 1).reduce((sum, [chance]) => sum + chance, 0)
  ) {
    window++;
  }
  const low = Boolean(goals || s.room || MOTIFS.some((k) => motifs[k] && share(s[k], 1) >= 1));
  if (low) {
    window = 0;
  }
  const trap = trapDraw < trapShare(s) && path <= trapReach({ ...s, choice });
  const mirrors = low ? 0 : symmetricShare * (1 - SYMMETRY[0][0]);
  const losing = drawLosing(
    s,
    choice,
    path,
    routeDraw,
    symmetric && !goals && SYMMETRY[window][1][0] >= MIRRORED,
    mirrors
  );
  return {
    ...s,
    choice,
    trap,
    losing,
    classes: choice || losing ? (routeDraw() < (s.classFlip ?? 0) ? 'flip' : 'hold') : null,
    westStart: westDraw < share(s.westStart, 0) && levelRange(s, 'straights')[1] >= s.size - 1,
    twoDoors: !s.oneEntry && doorDraw < share(s.twoDoors, 0),
    symmetry: symmetric ? spread(SYMMETRY[window][1], symmetricDraw / symmetricShare) : null,
    goals,
    room: s.room ? openAreas(s.size, goals ?? centreGoal(s.size), s.room, place) : null,
    motifs: Object.keys(motifs).length ? motifs : null,
  };
}

/**
 * Who loses on the shortest route of a seed, with the shares of `Settings.shortestLoses`: a seed
 * with the route choice can have it for one robot, one without for either or both (a bait). A seed
 * without the route choice whose path no routes-first style reaches, or that is mirrored, gets
 * none, and the others without it take the mirrored seeds' share (`mirrors`).
 */
function drawLosing(
  s: Settings,
  choice: boolean,
  path: number,
  rnd: Random,
  mirrored: boolean,
  mirrors: number
): LosingKind | null {
  const { orthogonal = 0, diagonal = 0, both = 0 } = s.shortestLoses ?? {};
  const rest = Math.max(1e-9, 1 - choiceShare(s));
  const lone = Math.max(0, diagonal - trapShare(s) * rest);
  const r = rnd();
  if (choice) {
    return r < lone ? 'diagonal' : r < lone + orthogonal ? 'orthogonal' : null;
  }
  if (mirrored || path > ROUTES_REACH * s.size * s.size) {
    return null;
  }
  const open = Math.max(1e-9, 1 - mirrors);
  const [b, o] = [both / rest / open, orthogonal / open];
  return r < b ? 'both' : r < b + o ? 'orthogonal' : r < b + o + lone / open ? 'diagonal' : null;
}

const CHOICE_TRAP_REACH = 0.33;

/**
 * The longest shortest path, in cells, of a seed that may still get a search trap: the
 * routes-first styles with the route choice, the bait style alone without it. Longer seeds get no
 * trap.
 *
 * @param s Settings with the route choice of the seed, or of every seed when its share is 1.
 */
export const trapReach = (s: Pick<SeedLike, 'choice' | 'size'>): number =>
  Math.floor((share(s.choice, 1) >= 1 ? CHOICE_TRAP_REACH : ROUTE_ROOM) * s.size * s.size);

/**
 * The styles a seed may draw: the routes-first ones need a path the construction reaches and a
 * level that fits (lane: a straight of 60 % of the board; stairs: diagonals of 5 moves or more;
 * crossing and bait: a path short enough for two separate routes). A seed with the route choice
 * draws the routes-first choice styles; one with a trap or a losing shortest route and no route
 * choice draws bait; one with neither draws tie or annealed. On 32 × 32 the annealed style is
 * drawn only when no other style fits. A single style for the whole range is worth a warning.
 *
 * @param s Settings with the seed's route choice and search trap.
 * @param path The least path of the seed, by default the range's.
 */
export function stylesFor(s: SeedLike, path: number = s.path[0]): Style[] {
  if (path > ROUTES_REACH * s.size * s.size) {
    return ['annealed'];
  }
  const fits: Partial<Record<Style, boolean>> = {
    lane: levelRange(s, 'straights')[1] >= Math.round(0.6 * s.size),
    stairs: levelRange(s, 'diagonals')[1] >= 5,
    crossing: path <= ROUTE_ROOM * s.size * s.size,
  };
  const bait = (s.trap && fits.crossing) || s.losing;
  const list: Style[] = s.choice
    ? STYLES.filter((x) => x !== 'bait' && x !== 'tie' && x !== 'annealed' && fits[x] !== false)
    : bait
      ? ['bait']
      : ['tie', 'annealed'];
  return s.size === 32 && list.length > 1 ? list.filter((x) => x !== 'annealed') : list;
}

function pickStyle(list: readonly Style[], rnd: Random): Style {
  const weight = (x: Style) => (x === 'annealed' && list.length > 1 ? 0.5 : 1);
  let r = rnd() * list.reduce((sum, x) => sum + weight(x), 0);
  for (const x of list) {
    if ((r -= weight(x)) < 0) {
      return x;
    }
  }
  return list[list.length - 1];
}

/**
 * The targets resolved from the settings and the style; the search trap is drawn per seed by
 * {@link generate}. The late and crossing styles, and every style whose path is long enough to
 * need a shared stem, ask for the shorter detour of {@link CHOICE_SHORT}.
 *
 * @param path The longest path aimed at, by default the range's.
 */
export function targets(s: SeedLike, style: Style = 'split', path: number = s.path[1]): Targets {
  const choice =
    style === 'late' || style === 'crossing' || path > ROUTE_ROOM * s.size * s.size
      ? CHOICE_SHORT
      : CHOICE;
  const bait = style === 'bait';
  const routes = Boolean(s.choice) && !bait && style !== 'tie';
  const ties = s.ties ?? TIES[s.size] + (s.scoring === 'search' ? 1 : 0);
  return {
    path: s.path,
    straight: levelRange(s, 'straights'),
    diagonal: levelRange(s, 'diagonals'),
    levelsOn: routes || bait ? 'racing' : 'shortest',
    loops: s.loopsRequired ? s.loops : [0, s.loops[1]],
    choice: routes
      ? { ...choice, gain: s.racingGain ?? choice.gain, loss: s.carefulLoss ?? choice.loss }
      : null,
    shape: routes || bait ? SHAPE : null,
    deadEnds: s.deadEnds ?? TEXTURE[s.size].deadEnds,
    corridors: s.corridors ?? TEXTURE[s.size].corridors,
    follower: s.follower ?? s.competition,
    trap: null,
    ties: ties || null,
    contest: s.contest !== false && !routes && !bait,
    doors: s.twoDoors ? 2 : null,
    symmetry: s.symmetry ?? null,
    motifs: s.motifs ?? null,
    shortest: s.losing && (routes || bait) ? { kind: s.losing, ...SHORTEST } : null,
    bait,
    classes: (s.losing && (routes || bait)) || routes ? (s.classes ?? null) : null,
  };
}

function shortestMiss(cost: ShortestCost | undefined, want: ShortestTarget): number {
  const measured = need(cost, 'the shortest route measured');
  let miss = 0;
  for (const robot of PAYERS[want.kind]) {
    miss +=
      outside(measured[robot].loss, [want.loss, Infinity]) / want.loss +
      (measured[robot].extra < want.cells ? 1 : 0);
  }
  return miss;
}

/**
 * The energy of the annealing: the weighted distance of each number to its range; 0 means every
 * target is met. The search trap, the near ties, the contest, the bait and the losing shortest
 * route are costly, so until they are measured each counts as missed, 1. Goal doors and symmetry
 * count when asked for. A maze that a wall follower solves is infinite when the targets forbid it.
 * Straights and diagonals on the racing route count 0 until the route choice is measured, so the
 * energy without it is a lower bound.
 */
export function energy(a: Analysis, t: Targets): number {
  if (a.shortest < 0 || (t.follower && a.follower)) {
    return Infinity;
  }
  const levels = t.levelsOn === 'racing' ? a.choice?.racingShape : a;
  let e = outside(a.shortest, t.path) + outside(a.loops, t.loops);
  if (levels) {
    e += 2 * outside(levels.maxStraight, t.straight) + 2 * outside(levels.maxDiagonal, t.diagonal);
  }
  e +=
    (a.dist.length / 256) *
    (outside(a.deadEnds, t.deadEnds) + outside(a.corridors, t.corridors) / 2);
  if (t.choice) {
    if (!a.choice) {
      return Infinity;
    }
    const { detour, apart, racingGain, carefulLoss } = a.choice;
    e +=
      outside(100 * detour, [t.choice.detour, 100]) / 2 +
      2 * outside(apart, [t.choice.apart, Infinity]) +
      outside(racingGain, t.choice.gain) +
      outside(carefulLoss, t.choice.loss);
  }
  if (t.shape && a.choice) {
    e +=
      overCap(a.choice.racingShape, t.shape.racing) +
      overCap(a.choice.carefulShape, t.shape.careful);
  }
  if (t.doors) {
    e += Math.abs((a.doors ?? 1) - t.doors);
  }
  for (const [k, range] of motifEntries(t.motifs)) {
    e += a.sensor ? Math.min(2, outside(a.sensor[k], range) / 2) : 1;
  }
  if (t.symmetry) {
    e += a.symmetry === undefined ? 0 : outside(a.symmetry, t.symmetry) / 2;
  }
  if (t.shortest) {
    e += a.slow === undefined ? 1 : Math.min(1, shortestMiss(a.slow.mid, t.shortest));
  }
  if (t.bait) {
    e += a.bait === undefined ? 1 : a.bait > 0 ? 0 : 1;
  }
  if (t.trap) {
    e += a.trap === undefined ? 1 : Math.min(1, outside(a.trap, t.trap) / 10);
  }
  if (t.ties) {
    e += a.ties === undefined ? 1 : Math.min(1, outside(a.ties, [t.ties, Infinity]) / 2);
  }
  if (t.contest && !a.contest) {
    e += 1;
  }
  return e;
}

/**
 * The least symmetry target, %, that the annealed style reaches from a mirrored tree rather than
 * by mirror moves from a plain one; seeds that ask for it always draw the annealed style.
 */
const MIRRORED = 70;

const COOLING = logOf(0.02);

const COSTLY: Readonly<Record<16 | 32, number>> = { 16: 200, 32: 40 };

const cheap = (t: Targets): Targets => ({
  ...t,
  shortest: null,
  bait: false,
  trap: null,
  ties: null,
  contest: false,
});

const costly = (t: Targets): boolean =>
  Boolean(t.shortest || t.bait || t.trap || t.ties || t.contest);

/**
 * Whether the targets ask for a route choice with the shorter detour of {@link CHOICE_SHORT}
 * rather than the full one of {@link CHOICE}, so the screen can say so.
 */
export const relaxedChoice = (t: Targets | null | undefined): boolean =>
  Boolean(t?.choice && (t.choice.detour < CHOICE.detour || t.choice.apart < CHOICE.apart));

/** A part of the route choice target a maze misses. */
export type ChoiceMiss = 'routes' | 'detour' | 'apart' | 'gain' | 'loss' | 'shape';

/**
 * The parts of the route choice target the maze misses, in the order {@link energy} adds them:
 * no route choice measured, the detour, the distance, the gain, the loss, then a route over its
 * shape caps. Empty when it is met or not asked for.
 */
export function choiceMisses(a: Analysis, t: Targets): ChoiceMiss[] {
  const c = a.choice;
  if (t.choice && !c) {
    return ['routes'];
  }
  const out: ChoiceMiss[] = [];
  if (t.choice && c) {
    if (outside(100 * c.detour, [t.choice.detour, 100])) {
      out.push('detour');
    }
    if (outside(c.apart, [t.choice.apart, Infinity])) {
      out.push('apart');
    }
    if (outside(c.racingGain, t.choice.gain)) {
      out.push('gain');
    }
    if (outside(c.carefulLoss, t.choice.loss)) {
      out.push('loss');
    }
  }
  if (
    t.shape &&
    c &&
    (overCap(c.racingShape, t.shape.racing) || overCap(c.carefulShape, t.shape.careful))
  ) {
    out.push('shape');
  }
  return out;
}

/** Per target, whether a maze meets it; null when not asked for or not measured yet. */
export interface Report {
  /** Every cell reaches the goal and, when forbidden, no wall follower does. */
  readonly rules: boolean;
  readonly path: boolean;
  readonly straight: boolean | null;
  readonly diagonal: boolean | null;
  readonly loops: boolean;
  /** Dead ends and corridors. */
  readonly deadEnds: boolean;
  readonly choice: boolean | null;
  readonly ties: boolean | null;
  readonly contest: boolean | null;
  readonly trap: boolean | null;
  /** The goal doors, the symmetry and the sensor motifs asked for. */
  readonly board: boolean | null;
  /** The losing shortest route and the bait. */
  readonly shortest: boolean | null;
}

/** Per target, whether the maze meets it: every target is true or null exactly when the energy is 0. */
export function report(a: Analysis, t: Targets): Report {
  const levels = t.levelsOn === 'racing' ? a.choice?.racingShape : a;
  const motifs = motifEntries(t.motifs);
  const board =
    !t.doors && !t.symmetry && !motifs.length
      ? null
      : (!t.doors || a.doors === t.doors) &&
        (!t.symmetry || (a.symmetry !== undefined && !outside(a.symmetry, t.symmetry))) &&
        motifs.every(([k, range]) => a.sensor && !outside(a.sensor[k], range));
  return {
    rules: a.shortest >= 0 && !(t.follower && a.follower),
    path: a.shortest >= 0 && !outside(a.shortest, t.path),
    straight: levels ? !outside(levels.maxStraight, t.straight) : null,
    diagonal: levels ? !outside(levels.maxDiagonal, t.diagonal) : null,
    loops: !outside(a.loops, t.loops),
    deadEnds: !outside(a.deadEnds, t.deadEnds) && !outside(a.corridors, t.corridors),
    choice: t.choice || t.shape ? choiceMisses(a, t).length === 0 : null,
    ties: t.ties ? (a.ties === undefined ? null : a.ties >= t.ties) : null,
    contest: t.contest ? (a.contest ?? null) : null,
    trap: t.trap ? (a.trap === undefined ? null : !outside(a.trap, t.trap)) : null,
    board,
    shortest:
      t.shortest || t.bait
        ? a.slow === undefined && a.bait === undefined
          ? null
          : (!t.shortest || (a.slow !== undefined && shortestMiss(a.slow.mid, t.shortest) === 0)) &&
            (!t.bait || (a.bait !== undefined && a.bait > 0))
        : null,
  };
}

function growTree(
  g: Grid,
  rnd: Random,
  straight: number,
  zigzag: number,
  trace?: Trace,
  skip?: (c: number) => boolean
): void {
  const size = g.width * g.height;
  const visited = new Uint8Array(size);
  const heading = new Int8Array(size).fill(-1);
  const before = new Int8Array(size).fill(-1);
  for (const c of g.goals) {
    visited[c] = 1;
  }
  for (let c = 0; c < size; c++) {
    if (g.room?.[c] || skip?.(c)) {
      visited[c] = 1;
    }
  }
  const doors = goalPerimeter(g).filter(([c, d]) => !skip?.(neighbour(g, c, d)));
  const [door, out] = doors[Math.floor(rnd() * doors.length)];
  const first = neighbour(g, door, out);
  setWall(g, door, out, 0);
  visited[first] = 1;
  heading[first] = out;
  const active = [first];
  const weights = [0, 0, 0, 0];
  while (active.length) {
    const c = active[active.length - 1];
    let total = 0;
    for (let d = 0; d < 4; d++) {
      const n = neighbour(g, c, d);
      weights[d] =
        n < 0 || visited[n] || (!skip && isStartEast(c, d))
          ? 0
          : d === heading[c]
            ? straight
            : d === before[c] && (d + heading[c]) % 2 === 1
              ? zigzag
              : 1;
      total += weights[d];
    }
    if (total === 0) {
      active.pop();
      continue;
    }
    let pick = rnd() * total;
    let d = 0;
    while (pick >= weights[d]) {
      pick -= weights[d++];
    }
    const n = neighbour(g, c, d);
    setWall(g, c, d, 0);
    visited[n] = 1;
    heading[n] = d;
    before[n] = heading[c];
    active.push(n);
    trace?.('tree', g.walls, { cell: n });
  }
}

const mirrorEdge = (g: Grid, c: number, d: number): CellEdge => [
  (c % g.width) * g.width + Math.floor(c / g.width),
  [1, 0, 3, 2][d],
];

function growMirrored(
  g: Grid,
  rnd: Random,
  straight: number,
  zigzag: number,
  oneEntry: boolean,
  trace?: Trace
): void {
  const w = g.width;
  const lower = (c: number) => c % w >= Math.floor(c / w);
  growTree(g, rnd, straight, zigzag, trace, (c) => !lower(c));
  for (let c = 0; c < w * w; c++) {
    for (const d of [0, 1]) {
      const n = neighbour(g, c, d);
      if (n < 0 || !lower(c) || !lower(n)) {
        continue;
      }
      const [mc, md] = mirrorEdge(g, c, d);
      if (mc !== c || md !== d) {
        setWall(g, mc, md, isOpen(g, c, d) ? 0 : 1);
      }
    }
  }
  setWall(g, 0, 1, 1);
  if (oneEntry) {
    const doors = goalPerimeter(g).filter(([c, d]) => isOpen(g, c, d));
    for (const [c, d] of doors.slice(1)) {
      setWall(g, c, d, 1);
    }
  }
  for (let k = 0; k + 1 < w; k++) {
    const c = k * w + k;
    if (isOpen(g, c, 1) && bareEndPost(g, c, 1)) {
      setWall(g, c, 1, 1);
    }
  }
  trace?.('tree', g.walls, { mirrored: true });
}

function mutableEdges(g: Grid, oneEntry: boolean): CellEdge[] {
  const goal = new Set(g.goals);
  const list: CellEdge[] = [];
  for (let c = 0; c < g.width * g.height; c++) {
    for (const d of [0, 1]) {
      const n = neighbour(g, c, d);
      if (n < 0 || isStartEast(c, d) || g.room?.[c] || g.room?.[n]) {
        continue;
      }
      if (goal.has(c) && goal.has(n)) {
        continue;
      }
      if (oneEntry && goal.has(c) !== goal.has(n)) {
        continue;
      }
      list.push([c, d]);
    }
  }
  return list;
}

function addLoops(
  g: Grid,
  rnd: Random,
  count: number,
  edges: readonly CellEdge[],
  competition: boolean,
  trace?: Trace
): void {
  for (let i = 0; i < count; i++) {
    const { dist } = flood(g);
    const want = Math.max(3, Math.round(dist[g.start] / 5));
    let best: CellEdge | null = null;
    let bestScore = Infinity;
    for (let s = 0; s < 24; s++) {
      const [c, d] = edges[Math.floor(rnd() * edges.length)];
      if (isOpen(g, c, d)) {
        continue;
      }
      const n = neighbour(g, c, d);
      setWall(g, c, d, 0);
      const bare = competition && bareEndPost(g, c, d);
      setWall(g, c, d, 1);
      if (bare || cycleLength(g, c, n) < 6) {
        continue;
      }
      const score = Math.abs(Math.abs(dist[c] - dist[n]) - 1 - want);
      if (score < bestScore) {
        bestScore = score;
        best = [c, d];
      }
    }
    if (best) {
      setWall(g, best[0], best[1], 0);
      trace?.('loop', g.walls, { edge: best });
    }
  }
}

function reach(
  g: Grid,
  sources: readonly number[],
  pathIndex: Int32Array,
  offPath: number
): { dist: Int32Array; via: Int32Array } {
  const size = g.width * g.height;
  const dist = new Int32Array(size).fill(-1);
  const via = new Int32Array(size);
  const queue = [...sources];
  for (const c of sources) {
    dist[c] = 0;
    via[c] = pathIndex[c] >= 0 ? pathIndex[c] : offPath;
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (let d = 0; d < 4; d++) {
      if (g.walls[c] & BIT[d]) {
        continue;
      }
      const n = neighbour(g, c, d);
      if (n < 0 || dist[n] >= 0) {
        continue;
      }
      dist[n] = dist[c] + 1;
      via[n] = pathIndex[n] >= 0 ? pathIndex[n] : via[c];
      queue.push(n);
    }
  }
  return { dist, via };
}

const SEED = { longer: 20, shared: 20 } as const;

/**
 * The closed walls of the tree that would open a second route close in length to the shortest
 * path and leaving it for most of its cells. In a tree each wall closes exactly one cycle, so
 * every closed wall is scored at once. Returns the walls within `SEED` in random order, else the
 * one sharing the least; it opens none.
 */
function rivalWalls(
  g: Grid,
  rnd: Random,
  edges: readonly CellEdge[],
  competition: boolean
): CellEdge[] {
  const { path, shortest } = analyse(g);
  if (shortest < 0) {
    return [];
  }
  const pathIndex = new Int32Array(g.width * g.height).fill(-1);
  for (const [k, c] of path.entries()) {
    pathIndex[c] = k;
  }
  const from = reach(g, [g.start], pathIndex, 0);
  const to = reach(g, g.goals, pathIndex, path.length - 1);
  const good: CellEdge[] = [];
  let least: CellEdge | null = null;
  let fewest = Infinity;
  for (const [c, d] of edges) {
    if (isOpen(g, c, d)) {
      continue;
    }
    setWall(g, c, d, 0);
    const bare = competition && bareEndPost(g, c, d);
    setWall(g, c, d, 1);
    if (bare) {
      continue;
    }
    const n = neighbour(g, c, d);
    for (const [a, b] of [
      [c, n],
      [n, c],
    ]) {
      if (from.via[a] >= to.via[b]) {
        continue;
      }
      const length = from.dist[a] + 1 + to.dist[b];
      if (100 * (length - shortest) > SEED.longer * shortest) {
        continue;
      }
      const shared = (from.via[a] + path.length - 1 - to.via[b]) / path.length;
      if (100 * shared <= SEED.shared) {
        good.push([c, d]);
      } else if (shared < fewest) {
        fewest = shared;
        least = [c, d];
      }
    }
  }
  if (!good.length) {
    return least ? [least] : [];
  }
  for (let i = good.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [good[i], good[j]] = [good[j], good[i]];
  }
  return good;
}

function sides(g: Grid, edges: readonly CellEdge[]): Uint8Array {
  const m = new Uint8Array(g.width * g.height * 4);
  for (const [c, d] of edges) {
    m[c * 4 + d] = 1;
    m[neighbour(g, c, d) * 4 + ((d + 2) % 4)] = 1;
  }
  return m;
}

function pathEdges(g: Grid, mutable: Uint8Array, a: number, b: number): CellEdge[] | null {
  const from = new Int32Array(g.width * g.height).fill(-1);
  from[a] = a;
  const queue = [a];
  for (let head = 0; head < queue.length && from[b] < 0; head++) {
    const c = queue[head];
    for (let d = 0; d < 4; d++) {
      if (g.walls[c] & BIT[d]) {
        continue;
      }
      const n = neighbour(g, c, d);
      if (n >= 0 && from[n] < 0) {
        from[n] = c;
        queue.push(n);
      }
    }
  }
  if (from[b] < 0) {
    return null;
  }
  const out: CellEdge[] = [];
  for (let c = b; c !== a; c = from[c]) {
    const p = from[c];
    const d = dirTo(g, p, c);
    if (mutable[p * 4 + d]) {
      out.push([p, d]);
    }
  }
  return out;
}

const component = (g: Grid, a: number): Uint8Array =>
  Uint8Array.from(bfs(g, [a]).dist, (v) => (v >= 0 ? 1 : 0));

const exits = (w: number): number => 4 - ((w & 1) + ((w >> 1) & 1) + ((w >> 2) & 1) + (w >> 3));

/** A wall set by a move: cell, direction and 1 for a wall, 0 for an opening. */
type Change = [cell: number, direction: number, wall: number];

function swapOpen(
  g: Grid,
  rnd: Random,
  mutable: Uint8Array,
  c: number,
  d: number,
  competition: boolean,
  junctions = false
): Change[] | null {
  const cycle = pathEdges(g, mutable, c, neighbour(g, c, d));
  if (!cycle || !cycle.length) {
    return null;
  }
  setWall(g, c, d, 0);
  if (competition && bareEndPost(g, c, d)) {
    setWall(g, c, d, 1);
    return null;
  }
  const wide = junctions
    ? cycle.filter(([a, k]) => exits(g.walls[a]) >= 3 && exits(g.walls[neighbour(g, a, k)]) >= 3)
    : [];
  const pool = wide.length ? wide : cycle;
  const [x, y] = pool[Math.floor(rnd() * pool.length)];
  setWall(g, x, y, 1);
  return [
    [c, d, 0],
    [x, y, 1],
  ];
}

function swapClose(
  g: Grid,
  rnd: Random,
  mutable: Uint8Array,
  c: number,
  d: number,
  competition: boolean
): Change[] | null {
  setWall(g, c, d, 1);
  const side = component(g, c);
  if (side[neighbour(g, c, d)]) {
    return [[c, d, 1]];
  }
  const across: CellEdge[] = [];
  for (let a = 0; a < side.length; a++) {
    if (!side[a]) {
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const b = neighbour(g, a, k);
      if (b >= 0 && !side[b] && mutable[a * 4 + k] && !(a === c && k === d)) {
        across.push([a, k]);
      }
    }
  }
  for (let tries = 0; tries < 4 && across.length; tries++) {
    const [a, k] = across[Math.floor(rnd() * across.length)];
    setWall(g, a, k, 0);
    if (!competition || !bareEndPost(g, a, k)) {
      return [
        [c, d, 1],
        [a, k, 0],
      ];
    }
    setWall(g, a, k, 1);
  }
  setWall(g, c, d, 0);
  return null;
}

function undo(g: Grid, changes: readonly Change[]): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    setWall(g, changes[i][0], changes[i][1], changes[i][2] ? 0 : 1);
  }
}

function keepsRoutes(g: Grid, choice: RouteChoice, changes: readonly Change[]): boolean {
  for (const [c, d, wall] of changes) {
    if (!wall) {
      return false;
    }
    const n = neighbour(g, c, d);
    for (const route of [choice.careful, choice.racing]) {
      for (let i = 1; i < route.length; i++) {
        const [a, b] = [route[i - 1], route[i]];
        if ((a === c && b === n) || (a === n && b === c)) {
          return false;
        }
      }
    }
  }
  return true;
}

function routeEdges(g: Grid, mutable: Uint8Array, route: readonly number[]): CellEdge[] {
  const out: CellEdge[] = [];
  for (let i = 1; i < route.length; i++) {
    const d = dirTo(g, route[i - 1], route[i]);
    if (mutable[route[i - 1] * 4 + d]) {
      out.push([route[i - 1], d]);
    }
  }
  return out;
}

const sensorOf = (g: Grid, a: Analysis): Sensor =>
  sensor(
    g,
    a.choice?.racing ?? fastestRoute(g, PROFILES.diagonal).route,
    a.choice?.careful ?? fastestRoute(g, PROFILES.orthogonal).route
  );

/**
 * "Shortest is not fastest" of the mid class (`Analysis.slow`), and with `classes` that of the
 * weak and strong classes with their route choice (`Analysis.classChoice`).
 */
export function measureShortest(g: Grid, a: Analysis, classes: boolean): void {
  const mid = a.choice ?? choiceOf(g);
  a.slow = {
    mid: need(
      shortestCost(g, 'mid', { orthogonal: mid.careful, diagonal: mid.racing }),
      'a maze whose goal can be reached'
    ),
  };
  if (!classes) {
    return;
  }
  a.classChoice = {};
  for (const robot of ['weak', 'strong'] as const) {
    const c = need(routeChoice(g, robot), 'a maze whose goal can be reached');
    a.classChoice[robot] = { racingGain: c.racingGain, carefulLoss: c.carefulLoss };
    a.slow[robot] = need(
      shortestCost(g, robot, { orthogonal: c.careful, diagonal: c.racing }),
      'a maze whose goal can be reached'
    );
  }
}

function baitLoss(g: Grid, a: Analysis): number {
  const bait = fewestCells(g, PROFILES.diagonal);
  const fast = a.choice?.racing ?? fastestRoute(g, PROFILES.diagonal).route;
  if (fast.length <= bait.route.length) {
    return -Infinity;
  }
  return 100 * (bait.time / routeTime(g, fast, PROFILES.diagonal) - 1);
}

function measureBoard(g: Grid, a: Analysis, t: Targets): void {
  if (t.follower) {
    a.follower = followerReaches(g);
  }
  if (t.motifs) {
    a.sensor = sensorOf(g, a);
  }
  if (t.doors) {
    a.doors = doorCount(g);
  }
  if (t.symmetry) {
    a.symmetry = 100 * symmetry(g);
  }
}

/**
 * The bait and the losing shortest route when the targets ask for them, the first costly numbers;
 * true when both hold, the bait measured first and the shortest route only when it holds.
 */
export function measureLosing(g: Grid, a: Analysis, t: Targets): boolean {
  if (t.bait) {
    a.bait = baitLoss(g, a);
  }
  if (t.bait && !(a.bait !== undefined && a.bait > 0)) {
    return false;
  }
  if (t.shortest) {
    measureShortest(g, a, false);
  }
  return !t.shortest || shortestMiss(a.slow?.mid, t.shortest) === 0;
}

function measureCostly(g: Grid, a: Analysis, t: Targets): void {
  if (!measureLosing(g, a, t)) {
    return;
  }
  if (t.trap && a.choice) {
    a.trap = searchRun(g, a.choice.racingTime).loss;
  }
  if (t.trap && outside(a.trap ?? Number.NaN, t.trap)) {
    return;
  }
  if (t.ties) {
    a.ties = nearTies(g, PROFILES.diagonal, 0.05, t.ties);
  }
  if (t.contest && !(t.ties && (a.ties ?? Number.NaN) < t.ties)) {
    a.contest = isContest(g, a.choice ?? choiceOf(g));
  }
}

const westColumn = (size: number): CellEdge[] =>
  Array.from({ length: size - 1 }, (_, y): CellEdge => [y * size, 0]);

function openWestColumn(g: Grid): void {
  for (const [c, d] of westColumn(g.width)) {
    setWall(g, c, d, 0);
    if (bareEndPost(g, c, d)) {
      setWall(g, c + 1, 0, 1);
    }
  }
}

/**
 * The mix of moves of the annealing, as chances that add up to at most 1; the rest are single
 * wall flips. swap: a wall swap from a random closed wall; cut: cut and reconnect from a random
 * open wall; route: cut and reconnect from an edge of a route while the route choice is off
 * target; dead: a wall swap from a wall of a dead end while there are too many; mirror (drawn
 * first, below the symmetry target): a swap or cut that gives an edge the wall of its mirror.
 */
const MOVES = { swap: 0.4, cut: 0.15, route: 0.1, dead: 0.2, mirror: 0.5 } as const;

/** The board and rules an annealer moves walls under. */
interface AnnealBoard extends BoardParts {
  readonly westStart?: boolean | number;
  readonly oneEntry: boolean;
  readonly competition: boolean;
}

/** The lowest energy state an annealing saw. */
interface Lowest {
  readonly walls: Uint8Array;
  readonly analysis: Analysis;
  readonly energy: number;
}

type Evaluate = (g: Grid, target: Targets) => Analysis;

type Anneal = (
  g: Grid,
  target: Targets,
  steps: number,
  hold?: Targets | null,
  stage?: string
) => Lowest;

/**
 * Annealing toward targets over one board, with the evaluation it shares with the construction.
 * With `allow`, only the edges between two allowed cells move. `evaluate` runs the analysis plus
 * what the targets ask for, the costly numbers once every other target is met. `anneal` runs
 * simulated annealing of moves and leaves the lowest energy state on the grid: the Metropolis rule
 * draws its random number first, so a step already above the threshold without the route choice
 * is refused before the route searches; it stops after `COSTLY` measures of the costly targets;
 * with `hold`, a step whose numbers under `hold` end up worse than at the start (plus a little
 * slack) is refused too. `shake` makes random wall swaps and cuts that keep every cell reachable.
 */
function annealer(settings: AnnealBoard, rnd: Random, trace?: Trace, allow?: Uint8Array) {
  const stats = { evaluations: 0 };
  const board = boardOf(settings);
  const fixed = new Set(settings.westStart ? westColumn(settings.size).map(([c]) => c) : []);
  const edges = mutableEdges(board, settings.oneEntry).filter(
    ([c, d]) =>
      !(d === 0 && fixed.has(c)) && (!allow || (allow[c] && allow[neighbour(board, c, d)]))
  );
  const mutable = sides(board, edges);
  const comp = settings.competition;

  const evaluate: Evaluate = (g, target) => {
    stats.evaluations++;
    const a: Analysis = analyse(g);
    if (a.unreachable > (g.closed ?? 0)) {
      return a;
    }
    if (target.levelsOn === 'racing') {
      a.choice = routeChoice(g);
    }
    measureBoard(g, a, target);
    if (energy(a, cheap(target)) === 0) {
      measureCostly(g, a, target);
    }
    return a;
  };

  const move = (g: Grid, current: Analysis, target: Targets): Change[] | null => {
    if (
      target.symmetry &&
      (current.symmetry ?? Number.NaN) < target.symmetry[0] &&
      rnd() < MOVES.mirror
    ) {
      const [c, d] = edges[Math.floor(rnd() * edges.length)];
      const [mc, md] = mirrorEdge(g, c, d);
      if (isOpen(g, c, d) === isOpen(g, mc, md)) {
        return null;
      }
      return isOpen(g, mc, md)
        ? swapOpen(g, rnd, mutable, c, d, comp)
        : swapClose(g, rnd, mutable, c, d, comp);
    }
    const r = rnd();
    if (target.choice && current.choice && r < MOVES.route) {
      const on = routeEdges(
        g,
        mutable,
        rnd() < 0.5 ? current.choice.careful : current.choice.racing
      );
      if (!on.length) {
        return null;
      }
      const [c, d] = on[Math.floor(rnd() * on.length)];
      return swapClose(g, rnd, mutable, c, d, comp);
    }
    if (r < MOVES.route + MOVES.dead && current.deadEnds > target.deadEnds[1]) {
      const c = Math.floor(rnd() * g.walls.length);
      const w = g.walls[c];
      const d = Math.floor(rnd() * 4);
      if (exits(w) !== 1 || !(w & BIT[d]) || !mutable[c * 4 + d]) {
        return null;
      }
      return swapOpen(g, rnd, mutable, c, d, comp, true);
    }
    const [c, d] = edges[Math.floor(rnd() * edges.length)];
    const opening = !isOpen(g, c, d);
    if (r < MOVES.route + MOVES.dead + MOVES.swap && opening) {
      return swapOpen(g, rnd, mutable, c, d, comp);
    }
    if (r < MOVES.route + MOVES.dead + MOVES.swap + MOVES.cut && !opening) {
      return swapClose(g, rnd, mutable, c, d, comp);
    }
    setWall(g, c, d, opening ? 0 : 1);
    if (opening && comp && bareEndPost(g, c, d)) {
      setWall(g, c, d, 1);
      return null;
    }
    return [[c, d, opening ? 0 : 1]];
  };

  const anneal: Anneal = (g, target, steps, hold = null, stage = 'tune') => {
    let current = evaluate(g, target);
    const limit = hold ? energy(current, hold) + 3 : Infinity;
    let e = energy(current, target);
    let lowest: Lowest = { walls: g.walls.slice(), analysis: current, energy: e };
    const plain = { ...cheap(target), choice: null };
    let left = COSTLY[settings.size];
    for (let step = 0; step < steps && lowest.energy > 0 && left > 0; step++) {
      const temperature = 3 * expOf((step / steps) * COOLING);
      const changes = move(g, current, target);
      if (!changes) {
        continue;
      }
      const threshold = e - temperature * logOf(rnd());
      const next: Analysis = analyse(g);
      stats.evaluations++;
      let ne = Infinity;
      if (next.unreachable === (g.closed ?? 0) && (!hold || energy(next, hold) <= limit)) {
        measureBoard(g, next, target);
        ne = energy(next, plain);
        if (ne <= threshold) {
          if (target.levelsOn === 'racing') {
            next.choice =
              current.choice && keepsRoutes(g, current.choice, changes)
                ? current.choice
                : routeChoice(g);
          }
          if (energy(next, cheap(target)) === 0 && costly(target)) {
            measureCostly(g, next, target);
            left--;
          }
          ne = energy(next, target);
        }
      }
      if (ne < Infinity && ne <= threshold) {
        current = next;
        e = ne;
        trace?.(stage, g.walls, {
          edge: changes[0].slice(0, 2),
          opening: !changes[0][2],
          energy: e,
        });
        if (e < lowest.energy) {
          lowest = { walls: g.walls.slice(), analysis: current, energy: e };
        }
      } else {
        undo(g, changes);
      }
    }
    g.walls.set(lowest.walls);
    return lowest;
  };

  const shake = (g: Grid, count: number): void => {
    for (let i = 0; i < count; i++) {
      const [c, d] = edges[Math.floor(rnd() * edges.length)];
      const changes = isOpen(g, c, d)
        ? swapClose(g, rnd, mutable, c, d, comp)
        : swapOpen(g, rnd, mutable, c, d, comp);
      if (changes) {
        trace?.('tune', g.walls, { edge: [c, d], opening: !changes[0][2] });
      }
    }
  };

  return { evaluate, anneal, shake, edges, stats };
}

/**
 * What regenerates a candidate: `generate(settings, seed)`, or `vary(settings, seed, base,
 * strength, {}, goals)` for a variation, under the generator `version` that made it.
 */
export interface Recipe {
  /** The {@link GENERATOR_VERSION} of the generator that made it. */
  readonly version: number;
  readonly settings: Settings;
  readonly seed: number;
  /** The walls of the maze varied. */
  readonly base?: number[];
  readonly strength?: number;
  /** The goal cells of the maze varied. */
  readonly goals?: readonly number[];
  /** The {@link wallHash} of the maze it made, so a rebuild can tell whether it made the same one. */
  readonly hash?: string;
}

/** A generated maze with its numbers. */
export interface Candidate {
  readonly seed: number;
  /** How it was built; a routes-first seed whose construction failed reports annealed. */
  readonly style: Style;
  readonly recipe: Recipe;
  readonly grid: Grid;
  /** With the search trap whenever the racing route is measured, and the style. */
  readonly analysis: Analysis;
  /** 0 when every target is met. */
  readonly energy: number;
  /** The targets of this seed, with its search trap. */
  readonly targets: Targets;
  /** Analyses run to find it. */
  readonly evaluations: number;
}

/** How hard the generator tries, for tests and probes. */
export interface Effort {
  /** Layouts tried by the construction. */
  readonly layouts?: number;
  /** Forests grown per pair of routes. */
  readonly fills?: number;
  /** Annealing steps of the repair and of each fallback pass. */
  readonly steps?: number;
  /** Restarts of the fallback. */
  readonly attempts?: number;
  /** Forces the style; the recipe then no longer regenerates the maze. */
  readonly style?: Style;
  readonly trace?: Trace;
}

function aimAt([lo, hi]: Range, rnd: Random): Range {
  const aim = lo + Math.floor(rnd() * (hi - lo + 1));
  const half = Math.max(2, Math.round((hi - lo) / 8));
  return [Math.max(lo, aim - half), Math.min(hi, aim + half)];
}

const take = ([lo, hi]: Range, v: number): Range => [Math.min(lo, v), Math.max(hi, v)];

const narrow = ([lo, hi]: Range, f: number): Range => [
  lo + (f * (hi - lo)) / 2,
  lo + ((1 + f) * (hi - lo)) / 2,
];

function drawTrap(s: Seed, style: Style, rnd: Random): Range | null {
  if (!s.trap || style === 'annealed' || style === 'tie') {
    return null;
  }
  const { loss, deep } = trapLosses(s);
  return [style === 'bait' && s.scoring !== 'search' && rnd() < BAIT_DEEP ? deep : loss, Infinity];
}

const trapLosses = (s: Pick<Settings, 'trapLoss'>): { loss: number; deep: number } => {
  const loss = s.trapLoss ?? TRAP.loss;
  return { loss, deep: Math.max(loss, TRAP.deep.loss) };
};

/**
 * The targets with only the sensor motifs the settings ask of every seed (share 1): a motif drawn
 * by share gives way in the later fills of a pair and in the fallback.
 */
function alwaysMotifs(s: Pick<Settings, Motif>, t: Targets): Targets {
  const kept = motifEntries(t.motifs).filter(([k]) => share(s[k], 1) >= 1);
  return { ...t, motifs: kept.length ? Object.fromEntries(kept) : null };
}

/** A maze built under its targets; the analysis is lost when a cross wall bared a post at Infinity. */
interface Built {
  readonly grid: Grid;
  readonly analysis: Analysis | null;
  readonly energy: number;
  readonly goal: Targets;
}

const analysisOf = (best: { analysis: Analysis | null }): Analysis =>
  need(best.analysis, 'the analysis of the maze built');

/**
 * Generates one maze: draws the path window, the seed's roles ({@link drawSeed}), the style (not
 * the annealed one when the seed drew a sensor motif), on 16 × 16 the texture windows and the
 * search trap; builds, repairs, and when a routes-first construction fails tries again with the
 * stem of the late style before the annealed fallback. On 32 × 32 a repaired construction is kept,
 * off target, and a bait there gets half the repair steps and no second pass. The fallback anneals
 * without the search trap, the losing shortest route, the classes and the sensor motifs, but its
 * maze is scored against the trap the seed drew and the motifs the settings ask of every seed.
 */
export function generate(settings: Settings, seed: number, effort: Effort = {}): Candidate {
  const steps = effort.steps ?? 8000;
  const trace = effort.trace;
  const rnd = random(seed);
  const window = aimAt(settings.path, rnd);
  const s = drawSeed(settings, rnd, window[0]);
  const list = stylesFor(s, window[0]);
  let style = pickStyle(
    s.motifs && list.length > 1 ? list.filter((x) => x !== 'annealed') : list,
    rnd
  );
  if (s.symmetry && s.symmetry[0] >= MIRRORED && !s.goals) {
    style = 'annealed';
  }
  if (effort.style) {
    style = effort.style;
  }
  const ranges = targets(s, style, window[1]);
  const texture =
    settings.size === 16
      ? { deadEnds: narrow(ranges.deadEnds, rnd()), corridors: narrow(ranges.corridors, rnd()) }
      : {};
  const full = { path: settings.path, deadEnds: ranges.deadEnds, corridors: ranges.corridors };
  let goal: Targets = { ...ranges, ...texture, path: window, trap: drawTrap(s, style, rnd) };
  trace?.('style', boardOf(s).walls, {
    style,
    path: window,
    trap: Boolean(goal.trap),
    targets: goal,
    goals: boardOf(s).goals,
  });
  const { evaluate, anneal, edges, stats } = annealer(s, rnd, trace);
  const met = (best: { analysis: Analysis | null; goal: Targets }) =>
    energy(analysisOf(best), { ...best.goal, ...full }) === 0;
  const finish = (
    best: { grid: Grid; analysis: Analysis | null },
    built: Style,
    aim: Targets
  ): Candidate => {
    const a = analysisOf(best);
    const t = { ...aim, ...full };
    measureBoard(best.grid, a, t);
    if (a.choice || t.trap) {
      ({ loss: a.trap, route: a.search } = searchRun(best.grid, a.choice?.racingTime));
    }
    a.ties = nearTies(best.grid, PROFILES.diagonal);
    a.sensor ??= sensorOf(best.grid, a);
    measureShortest(best.grid, a, true);
    if (t.contest) {
      a.contest = isContest(best.grid, a.choice ?? choiceOf(best.grid));
    }
    a.style = built;
    return {
      seed,
      style: built,
      recipe: { version: GENERATOR_VERSION, settings, seed, hash: wallHash(best.grid) },
      grid: best.grid,
      analysis: a,
      energy: energy(a, t),
      targets: t,
      evaluations: stats.evaluations,
    };
  };

  let repaired: (Lowest & { grid: Grid; goal: Targets }) | null = null;
  for (const retry of [false, true]) {
    if (
      style === 'annealed' ||
      (retry &&
        (style === 'late' ||
          !(goal.choice || style === 'tie' || style === 'bait') ||
          effort.style ||
          (style === 'bait' && repaired && settings.size === 32)))
    ) {
      break;
    }
    if (retry && style !== 'tie' && style !== 'bait') {
      style = 'late';
      goal = {
        ...targets(s, 'late', window[1]),
        ...texture,
        path: window,
        trap: goal.trap ? [trapLosses(s).loss, Infinity] : null,
      };
      trace?.('style', boardOf(s).walls, {
        style,
        path: window,
        trap: Boolean(goal.trap),
        retry: true,
        targets: goal,
        goals: boardOf(s).goals,
      });
    }
    const built = construct(s, rnd, goal, style, evaluate, effort, retry);
    if (built && met(built)) {
      return finish(built, style, built.goal);
    }
    if (built) {
      trace?.('repair', built.grid.walls, { energy: built.energy, motifs: built.goal.motifs });
      repaired = {
        ...anneal(
          built.grid,
          built.goal,
          style === 'bait' && settings.size === 32 ? steps / 2 : steps,
          null,
          'repair'
        ),
        grid: built.grid,
        goal: built.goal,
      };
      if (met(repaired)) {
        return finish(repaired, style, repaired.goal);
      }
    }
  }
  if (repaired && settings.size === 32 && !effort.style) {
    return finish(repaired, style, repaired.goal);
  }
  const plain: Targets = {
    ...targets(s, 'annealed', window[1]),
    ...texture,
    path: window,
    trap: null,
    motifs: null,
    shortest: null,
    classes: null,
    bait: false,
  };
  trace?.('fallback', boardOf(s).walls, { targets: plain });
  const plan = finish(
    fallback(s, rnd, plain, edges, evaluate, anneal, effort),
    'annealed',
    alwaysMotifs(settings, { ...plain, trap: goal.trap, motifs: goal.motifs })
  );
  if (!repaired) {
    return plan;
  }
  const built = finish(repaired, style, repaired.goal);
  return built.energy < plan.energy ? built : plan;
}

/**
 * The targets of a variation: the settings' targets widened to take in the maze varied, so it
 * keeps its character. The path stays within the settings' range and a few cells of the base's;
 * a base without a route choice or a trap does not ask for one.
 *
 * @throws {Error} When a cell of the base cannot reach the goal outside its walled-off areas.
 */
function around(s: Settings, g: Grid): Targets {
  const a = analyse(g);
  const c = routeChoice(g);
  if (!c || a.unreachable > (g.closed ?? 0)) {
    throw new Error('vary: every cell of the base maze must reach the goal');
  }
  const trap = searchRun(g, c.racingTime).loss;
  const losses = trapLosses(s);
  const routes = choiceShare(s) > 0 && c.racingGain >= (s.racingGain ?? CHOICE.gain)[0];
  const t = targets({ ...s, choice: routes }, 'split');
  const ties = nearTies(g, PROFILES.diagonal);
  const mirror = 100 * symmetry(g);
  const slack = Math.max(2, Math.round(0.05 * a.shortest));
  const levels = t.levelsOn === 'racing' ? c.racingShape : a;
  const cap = (k: 'racing' | 'careful'): ShapeCap => {
    const shape = k === 'racing' ? c.racingShape : c.carefulShape;
    return {
      corners: Math.max(SHAPE[k].corners, shape.corners),
      bends: Math.max(SHAPE[k].bends, shape.bends),
      hairpins: Math.max(SHAPE[k].hairpins, shape.hairpins),
      coil: Math.max(SHAPE[k].coil, shape.coil),
    };
  };
  return {
    ...t,
    path: [
      Math.max(Math.min(t.path[0], a.shortest), a.shortest - slack),
      Math.min(Math.max(t.path[1], a.shortest), a.shortest + slack),
    ],
    straight: take(t.straight, levels.maxStraight),
    diagonal: take(t.diagonal, levels.maxDiagonal),
    loops: take(t.loops, a.loops),
    deadEnds: take(t.deadEnds, a.deadEnds),
    corridors: take(t.corridors, a.corridors),
    choice:
      t.choice && c.racingGain >= t.choice.gain[0]
        ? {
            detour: Math.min(t.choice.detour, 100 * c.detour),
            apart: Math.min(t.choice.apart, c.apart),
            gain: take(t.choice.gain, c.racingGain),
            loss: take(t.choice.loss, c.carefulLoss),
          }
        : null,
    shape: t.shape && { racing: cap('racing'), careful: cap('careful') },
    trap:
      trapShare(s) > 0 && trap >= losses.loss
        ? [trap >= losses.deep ? losses.deep : losses.loss, Infinity]
        : null,
    ties: t.ties && Math.min(t.ties, ties),
    contest: t.contest && isContest(g, c),
    doors: doorCount(g) > 1 ? doorCount(g) : null,
    symmetry: mirror >= SYMMETRY[0][1][0] ? [mirror - 4, 100] : null,
  };
}

/**
 * A variation of a maze the room liked: reworks 1 to 3 square windows of it (more and larger with
 * `strength`), by random wall swaps and an annealing that moves only the walls inside them, toward
 * the settings' targets widened to take in the base. Everything outside the windows stays as it
 * was. Deterministic per base, seed and strength. Up to four sets of windows; keeps the best. The
 * cells that do not reach the goal in the base are its walled-off open areas and stay so.
 *
 * @param base The walls of the maze, one byte per cell.
 * @param strength 0 to 1.
 * @param goals The goal cells of the base, the 2 × 2 in the middle by default.
 * @throws {Error} When a cell of the base cannot reach the goal outside its walled-off areas.
 */
export function vary(
  settings: Settings,
  seed: number,
  base: ArrayLike<number>,
  strength = 0.3,
  effort: Effort = {},
  goals: readonly number[] = centreGoal(settings.size)
): Candidate {
  const steps = effort.steps ?? 4000;
  const rnd = random(seed);
  const size = settings.size;
  const walls = Uint8Array.from(base);
  const { dist } = flood({ ...closedBoard(size, goals), walls });
  const room = dist.some((v) => v < 0) ? Uint8Array.from(dist, (v) => (v < 0 ? 1 : 0)) : null;
  const original = { ...closedBoard(size, goals, room), walls };
  const goal = around(settings, original);
  const kept = {
    ...settings,
    westStart: westColumn(size).every(([c, d]) => isOpen(original, c, d)),
    goals,
    room,
  };
  let evaluations = 0;
  let best: (Lowest & { grid: Grid }) | null = null;
  for (let attempt = 0; attempt < 4 && !(best?.energy === 0); attempt++) {
    const allow = new Uint8Array(size * size);
    const count = 1 + Math.round(2 * strength);
    const side = Math.max(4, Math.round(size * (0.25 + 0.25 * strength)));
    for (let k = 0; k < count; k++) {
      const [x0, y0] = [
        Math.floor(rnd() * (size - side + 1)),
        Math.floor(rnd() * (size - side + 1)),
      ];
      for (let y = y0; y < y0 + side; y++) {
        for (let x = x0; x < x0 + side; x++) {
          allow[y * size + x] = 1;
        }
      }
    }
    const { anneal, shake, stats } = annealer(kept, rnd, effort.trace, allow);
    const g = { ...original, walls: original.walls.slice() };
    shake(g, Math.round(allow.reduce((sum, v) => sum + v, 0) * Math.max(0.1, strength)));
    const result = anneal(g, goal, steps);
    evaluations += stats.evaluations;
    if (!best || result.energy < best.energy) {
      best = { ...result, grid: g };
    }
  }
  const chosen = need(best, 'a variation');
  const a = chosen.analysis;
  measureBoard(chosen.grid, a, goal);
  if (a.choice) {
    ({ loss: a.trap, route: a.search } = searchRun(chosen.grid, a.choice.racingTime));
  }
  a.ties = nearTies(chosen.grid, PROFILES.diagonal);
  a.sensor ??= sensorOf(chosen.grid, a);
  measureShortest(chosen.grid, a, true);
  if (goal.contest) {
    a.contest = isContest(chosen.grid, a.choice ?? choiceOf(chosen.grid));
  }
  a.style = 'variation';
  return {
    seed,
    style: 'variation',
    recipe: {
      version: GENERATOR_VERSION,
      settings,
      seed,
      base: Array.from(base),
      strength,
      goals,
      hash: wallHash(chosen.grid),
    },
    grid: chosen.grid,
    analysis: a,
    energy: energy(a, goal),
    targets: goal,
    evaluations,
  };
}

function secondDoor(
  g: Grid,
  goal: Targets,
  evaluate: Evaluate,
  competition: boolean
): Analysis | null {
  let best: { c: number; d: number; a: Analysis; e: number } | null = null;
  for (const [door, out] of goalPerimeter(g)) {
    const [c, d] = out < 2 ? [door, out] : [neighbour(g, door, out), out - 2];
    if (isOpen(g, c, d)) {
      continue;
    }
    setWall(g, c, d, 0);
    if (!(competition && bareEndPost(g, c, d))) {
      const a = evaluate(g, goal);
      const e = energy(a, goal);
      if (!best || e < best.e) {
        best = { c, d, a, e };
      }
    }
    setWall(g, c, d, 1);
  }
  if (best) {
    setWall(g, best.c, best.d, 0);
  }
  return best?.a ?? null;
}

function loneStraight(route: readonly number[], least: number): number[] {
  const runs: number[][] = [];
  let from = 0;
  for (let i = 1; i <= route.length; i++) {
    if (i < route.length && i > 1 && route[i] - route[i - 1] === route[i - 1] - route[i - 2]) {
      continue;
    }
    if (i - 1 - from >= least) {
      runs.push(route.slice(from, i));
    }
    from = i - 1;
  }
  return runs.length === 1 ? runs[0] : [];
}

/**
 * The routes-first construction: per layout a pair of routes, then forests with loops inside them
 * and a few across them, each kept only when it does not take the maze further from the targets,
 * and the second goal door when asked. A seed with both the route choice and a search trap, or on
 * 16 × 16 with a losing shortest route, carves twice the routes per side. Returns the best maze and
 * the targets it was built for, or null when no layout gave a pair of routes.
 *
 * @param late The stem of the late style whatever the style.
 */
function construct(
  settings: Seed,
  rnd: Random,
  goal: Targets,
  style: Style,
  evaluate: Evaluate,
  effort: Effort,
  late = false
): Built | null {
  const layouts = effort.layouts ?? (settings.size === 32 ? 40 : 24);
  const fills = effort.fills ?? 8;
  const trace = effort.trace;
  const [p0, p1] = goal.path;
  const bait = style === 'bait';
  const pair: CarveAim = {
    path: between(rnd, p0, p1),
    trapGain: goal.trap ? goal.trap[0] : 0,
    bait,
    tie: style === 'tie',
    apart: goal.choice?.apart ?? 4,
    shape: goal.shape ?? SHAPE,
    shortest: goal.shortest,
    classes: goal.classes,
  };
  const [l0, l1] = goal.loops;
  let best: Built | null = null;
  let misses = 0;
  for (let k = 0; k < layouts && !(best?.energy === 0); k++) {
    const lay = layout(settings.size, rnd, goal, pair.path, style, {
      west: settings.westStart,
      centre: goalCentre(boardOf(settings)),
      late: late || style === 'late',
    });
    trace?.('board', boardOf(settings).walls, {
      attempt: k,
      attempts: layouts,
      split: lay.split,
      style: lay.racing,
    });
    const carved = carveRoutes(
      settings,
      rnd,
      goal,
      lay,
      pair,
      (pair.trapGain && !bait) || (goal.shortest && settings.size === 16) ? 48 : 24,
      trace
    );
    if (!carved) {
      trace?.('miss', boardOf(settings).walls, { attempt: k, attempts: layouts });
      misses++;
      if (!best) {
        pair.path = Math.max(p0, pair.path - 3);
      }
      if (!best && misses >= Math.round((2 * layouts) / 3)) {
        return null;
      }
      continue;
    }
    const shared = new Set(carved.careful);
    const keep = new Set(loneStraight(carved.racing, goal.straight[0]));
    for (let f = 0; f < fills && !(best?.energy === 0); f++) {
      const aim = f < fills / 2 ? goal : alwaysMotifs(settings, goal);
      const g = { ...carved.g, walls: carved.g.walls.slice() };
      const taken = carved.taken.slice();
      for (const kind of MOTIFS) {
        const range = aim.motifs?.[kind];
        if (!range) {
          continue;
        }
        const cells = between(rnd, ...range);
        const [ring, one] = MOTIF_EDGE[kind];
        const r = rnd();
        const band: Range = r < ring ? [0, 0] : r < ring + one ? [1, 1] : [2, Infinity];
        [band, undefined].some((b) =>
          [cells, range[0]].some((n) =>
            [carved.racing, carved.careful].some((route) => {
              const used = lineRun(g, rnd, taken, route, n, kind, { band: b, shared, keep });
              if (used) {
                trace?.('motif', g.walls, { kind, cells: used });
              }
              return used;
            })
          )
        );
      }
      const root = fillForest(g, rnd, taken, trace, f >= fills / 2);
      const quarter = Math.round((l1 - l0) / 4);
      const loops = between(rnd, Math.max(l0 + quarter, 1), Math.max(l1 - quarter, 1));
      const across = Math.min(
        loops - 1,
        settings.size === 32 ? between(rnd, 6, 14) : between(rnd, 2, 4)
      );
      addTreeLoops(g, rnd, root, taken, loops - 1 - across, trace);
      let a: Analysis | null = evaluate(g, aim);
      let e = energy(a, aim);
      const walls = crossWalls(g, root);
      for (
        let tries = 0, opened = 0;
        tries < (goal.trap ? 48 : 24) && opened < across && walls.length;
        tries++
      ) {
        const [c, d] = walls.splice(Math.floor(rnd() * walls.length), 1)[0];
        if (cycleLength(g, c, neighbour(g, c, d)) < 6) {
          continue;
        }
        setWall(g, c, d, 0);
        const na = bareEndPost(g, c, d) ? null : evaluate(g, aim);
        const ne = na ? energy(na, aim) : Infinity;
        if (ne > e) {
          setWall(g, c, d, 1);
          continue;
        }
        [a, e] = [na, ne];
        opened++;
        trace?.('loop', g.walls, { edge: [c, d], across: true });
      }
      if (goal.doors && doorCount(g) < goal.doors) {
        const door = secondDoor(g, aim, evaluate, settings.competition);
        if (door) {
          [a, e] = [door, energy(door, aim)];
        }
      }
      trace?.('filled', g.walls, { attempt: k, fill: f, energy: e, motifs: aim.motifs });
      if (!best || e < best.energy) {
        best = { grid: g, analysis: a, energy: e, goal: aim };
      }
    }
  }
  return best;
}

/**
 * The fallback: a growing tree, loops chosen by their shortcut, annealing with room in the
 * texture, then (with the route choice) the closed wall whose second route starts closest to the
 * targets and annealing again against all of them. Restarts and keeps the best; with the follower
 * rule it restarts up to four times as often while every maze so far is one a follower solves. On
 * 32 × 32 it makes 2 attempts rather than 8.
 */
function fallback(
  settings: Seed,
  rnd: Random,
  goal: Targets,
  edges: readonly CellEdge[],
  evaluate: Evaluate,
  anneal: Anneal,
  effort: Effort
): Lowest & { grid: Grid } {
  const steps = effort.steps ?? 8000;
  const attempts = effort.attempts ?? (settings.size === 32 ? 2 : 8);
  const trace = effort.trace;
  const base: Targets = { ...goal, choice: null, trap: null, levelsOn: 'shortest' };
  const [d0, d1] = base.deadEnds;
  const [c0, c1] = base.corridors;
  const hold: Targets = { ...base, ties: null, contest: false };
  const roomy: Targets = goal.choice
    ? {
        ...hold,
        deadEnds: [d0, (d0 + d1) / 2],
        corridors: [c0 + (c1 - c0) / 4, c1 - (c1 - c0) / 4],
      }
    : base;
  let best: (Lowest & { grid: Grid }) | null = null;
  for (
    let attempt = 0;
    attempt < (best?.energy === Infinity ? 4 * attempts : attempts) && !(best?.energy === 0);
    attempt++
  ) {
    const g = boardOf(settings);
    trace?.('board', g.walls, { attempt, attempts });
    const mirrored =
      goal.symmetry && goal.symmetry[0] >= MIRRORED && !settings.goals && !settings.room;
    if (mirrored) {
      growMirrored(
        g,
        rnd,
        bias(settings, 'straights'),
        bias(settings, 'diagonals'),
        settings.oneEntry,
        trace
      );
    } else {
      growTree(g, rnd, bias(settings, 'straights'), bias(settings, 'diagonals'), trace);
    }
    if (settings.westStart) {
      openWestColumn(g);
    }
    const [lo, hi] = goal.loops;
    const loops = lo + Math.floor(rnd() * (Math.min(hi, lo + 8) - lo + 1)) - (goal.choice ? 1 : 0);
    if (!mirrored) {
      addLoops(g, rnd, Math.max(0, loops), edges, settings.competition, trace);
    }
    let result = anneal(g, roomy, steps);
    trace?.('tuned', g.walls, { energy: result.energy });
    if (goal.choice) {
      let bestWall: CellEdge | null = null;
      let bestEnergy = Infinity;
      const sample = Array.from({ length: 24 }, () => edges[Math.floor(rnd() * edges.length)]);
      for (const [c, d] of [
        ...rivalWalls(g, rnd, edges, settings.competition).slice(0, 8),
        ...sample,
      ]) {
        if (isOpen(g, c, d)) {
          continue;
        }
        setWall(g, c, d, 0);
        if (settings.competition && bareEndPost(g, c, d)) {
          setWall(g, c, d, 1);
          continue;
        }
        const e = energy(evaluate(g, goal), goal);
        if (e < bestEnergy) {
          [bestEnergy, bestWall] = [e, [c, d]];
        }
        setWall(g, c, d, 1);
      }
      if (bestWall) {
        setWall(g, bestWall[0], bestWall[1], 0);
      }
      trace?.('seed', g.walls, { edge: bestWall });
      result = anneal(g, goal, steps, hold, 'choice');
      trace?.('chosen', g.walls, { energy: result.energy });
    }
    if (!best || result.energy < best.energy) {
      best = { ...result, grid: g };
    }
    trace?.('attempt-end', g.walls, { attempt, energy: result.energy });
  }
  return need(best, 'a fallback attempt');
}
