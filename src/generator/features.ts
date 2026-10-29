/**
 * Plain-language features of a maze: short sentences a room can discuss, ranked by how much they
 * set the maze apart, and the tags of a card. All copy lives in {@link TEXT}.
 *
 * The two routes are named by robot, never by colour alone: the route without diagonals is the
 * fastest of a robot that does not run diagonals (white on the board), the diagonal route the
 * fastest of one that does (amber). The colour appears in parentheses only where the text is about
 * the lines drawn on the board.
 *
 * @module
 */

import { symmetry } from './analysis';
import { CHOICE, SHORTEST, TRAP } from './generator';
import { isOpen, type Grid } from './grid';
import { goalPerimeter, doorCount } from './rules';
import { STAIRCASE_MIN, motifsOf, type Motif } from './sensor';
import type { Analysis, Settings, Style } from './types';

/** The share of the diagonal route that must leave the route without diagonals before the maze has two routes. */
export const SPLIT = 0.25;

const pct = (n: number) => `${Math.round(n)} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One of the two routes, as numbers the sentences use. */
export interface RouteText {
  readonly cells: number;
  readonly turns: number;
}

/** The tags a card shows. */
export type Tag = 'choice' | 'trap' | 'contest' | 'shortest' | Motif | 'staircase';

/** Every sentence and label that depends on numbers. */
export const TEXT = {
  sides: ['north', 'east', 'south', 'west'],
  styles: {
    split: 'Routes split early',
    lane: 'Long straight along the edge',
    stairs: 'Diagonal staircases',
    late: 'Routes part near the goal',
    crossing: 'Routes cross and swap sides',
    bait: 'A bait route for quick explorers',
    tie: 'Two near-tied routes',
    annealed: 'Classic grown maze',
    variation: 'Reworked in places',
  } satisfies Record<Style, string>,
  twoRoutes: (white: RouteText, amber: RouteText & { best: string }) =>
    `Two routes: without diagonals ${white.cells} cells with ${plural(white.turns, 'turn', 'turns')}, with diagonals ${amber.cells} cells with ${amber.best}`,
  straightOf: (n: number) => `a ${n}-move straight`,
  diagonalOf: (n: number) => `a ${n}-move diagonal`,
  tradeOff: (gain: number, loss: number) =>
    `With diagonals, the diagonal route is ${pct(gain)} faster; without diagonals it is ${pct(loss)} slower`,
  oneRoute: (paths: number) =>
    paths > 1
      ? `One main route, ${plural(paths, 'shortest path', 'shortest paths')}`
      : 'One main route',
  trap: (loss: number) =>
    `A robot that explores little loses ${pct(loss)} on the route it finds (Explorer route)`,
  noTrap: 'Exploring little costs almost nothing',
  straight: (n: number) => `Longest straight ${n} moves`,
  diagonal: (n: number) => (n ? `Longest diagonal ${n} moves` : 'No diagonal of 3 moves or more'),
  loops: (n: number) => plural(n, 'loop', 'loops'),
  goalDoor: (side: string) => `Goal opens to the ${side}`,
  walledOff: (n: number) => `${plural(n, 'cell', 'cells')} walled off from the goal`,
  room: (n: number) => `${n} cells in walled-off open areas`,
  ties: (n: number) => `${n} routes within 5 % of the fastest with diagonals`,
  symmetric: (part: number) =>
    `Partly mirrored: ${pct(100 * part)} of the walls repeat across the start–goal diagonal`,
  westStart: 'The start runs up the whole west column',
  twoDoors: (n: number) => `Goal opens through ${n} doors`,
  path: (cells: number, turns: number) =>
    `${cells} cells to the goal, ${plural(turns, 'turn', 'turns')}`,
  tags: {
    choice: 'Route choice',
    trap: 'Search trap',
    contest: 'Never trivial',
    shortest: 'Shortest is not fastest',
    zigzag: 'Zigzag',
    dashed: 'Dashed walls',
    fishbone: 'Fishbone corridor',
    staircase: 'Staircase',
  } satisfies Record<Tag, string>,
} as const;

function goalSide(g: Grid): string | null {
  const open = goalPerimeter(g).filter(([c, d]) => isOpen(g, c, d));
  return open.length === 1 ? TEXT.sides[open[0][1]] : null;
}

/** Both routes of a maze that splits them, as the sentences use them. */
export interface TwoRoutes {
  readonly white: RouteText;
  readonly amber: RouteText & { best: string };
  readonly gain: number;
  readonly loss: number;
}

/** Both routes, when the maze splits them, as numbers the sentences use. */
export function routes(a: Analysis): TwoRoutes | null {
  const c = a.choice;
  if (!c || c.detour < SPLIT) {
    return null;
  }
  const r = c.racingShape;
  return {
    white: { cells: c.careful.length - 1, turns: c.carefulShape.turns },
    amber: {
      cells: c.racing.length - 1,
      turns: r.turns,
      best:
        r.maxDiagonal >= r.maxStraight
          ? TEXT.diagonalOf(r.maxDiagonal)
          : TEXT.straightOf(r.maxStraight),
    },
    gain: c.racingGain,
    loss: c.carefulLoss,
  };
}

/** Whether the shortest route loses for one of the robots of the mid class. */
export const shortestLoses = (a: Analysis): boolean =>
  Object.values(a.slow?.mid ?? {}).some(
    (x) => x.loss >= SHORTEST.loss && x.extra >= SHORTEST.cells
  );

/**
 * What a maze has, measured on it whatever the settings asked, so the room can pick: a route
 * choice (the two routes apart, the diagonal one faster with diagonals and slower without by at least
 * the floors of the settings' gain and loss), a search trap, never trivial, a shortest route that
 * loses, and the sensor motifs and a staircase on the racing route.
 *
 * @param s The settings the maze was made for, whose gain and loss ranges the route choice uses.
 */
export function tags(a: Analysis, s?: Settings): Tag[] {
  const two = routes(a);
  const [gain, loss] = [(s?.racingGain ?? CHOICE.gain)[0], (s?.carefulLoss ?? CHOICE.loss)[0]];
  const out: (Tag | false)[] = [
    Boolean(two && two.gain >= gain && two.loss >= loss) && 'choice',
    (a.trap ?? Number.NaN) >= TRAP.loss && 'trap',
    Boolean(a.contest) && 'contest',
    shortestLoses(a) && 'shortest',
    ...(a.sensor ? motifsOf(a.sensor) : []),
    (a.sensor?.staircase ?? Number.NaN) >= STAIRCASE_MIN && 'staircase',
  ];
  return out.filter((tag): tag is Tag => tag !== false);
}

/** A feature of a maze: its id, its sentence and a weight. */
export interface Feature {
  readonly id: string;
  readonly text: string;
  readonly weight: number;
}

/**
 * The features of a maze, the most telling first. A gallery shows the first three, a focus view
 * all of them.
 */
export function features(a: Analysis, g: Grid): Feature[] {
  const out: Feature[] = [];
  const two = routes(a);
  const { maxStraight, maxDiagonal } = a.choice ? a.choice.racingShape : a;
  if (two) {
    out.push({
      id: 'routes',
      text: TEXT.twoRoutes(two.white, two.amber),
      weight: 100,
    });
    out.push({
      id: 'tradeOff',
      text: TEXT.tradeOff(two.gain, two.loss),
      weight: 70 + Math.min(two.gain, two.loss),
    });
  } else {
    out.push({ id: 'routes', text: TEXT.oneRoute(a.pathCount), weight: 40 });
  }
  if (a.ties !== undefined && a.ties >= 2) {
    out.push({ id: 'ties', text: TEXT.ties(a.ties), weight: two ? 25 : 50 });
  }
  const mirror = symmetry(g);
  if (mirror >= 0.62) {
    out.push({
      id: 'symmetric',
      text: TEXT.symmetric(mirror),
      weight: 20 + 100 * (mirror - 0.62),
    });
  }
  let column = 0;
  while (column < g.height - 1 && isOpen(g, column * g.width, 0)) {
    column++;
  }
  if (column === g.height - 1) {
    out.push({ id: 'westStart', text: TEXT.westStart, weight: 18 });
  }
  const doors = doorCount(g);
  if (doors > 1) {
    out.push({ id: 'door', text: TEXT.twoDoors(doors), weight: 66 });
  }
  if (a.trap !== undefined) {
    const t = Math.round(a.trap);
    out.push(
      t >= 5
        ? { id: 'trap', text: TEXT.trap(t), weight: 60 + t }
        : { id: 'trap', text: TEXT.noTrap, weight: 10 }
    );
  }
  const told = two ? (maxDiagonal >= maxStraight ? 'diagonal' : 'straight') : null;
  out.push({
    id: 'straight',
    text: TEXT.straight(maxStraight),
    weight: told === 'straight' ? 5 : 30 + (60 * maxStraight) / g.width,
  });
  out.push({
    id: 'diagonal',
    text: TEXT.diagonal(maxDiagonal),
    weight: told === 'diagonal' ? 5 : 30 + (80 * maxDiagonal) / g.width,
  });
  const side = goalSide(g);
  if (side) {
    out.push({
      id: 'door',
      text: TEXT.goalDoor(side),
      weight: side === 'south' || side === 'west' ? 65 : 15,
    });
  }
  out.push({ id: 'path', text: TEXT.path(a.shortest, a.turns), weight: 20 });
  if (g.closed) {
    out.push({ id: 'room', text: TEXT.room(g.closed), weight: 22 });
  }
  if (a.unreachable > (g.closed ?? 0)) {
    out.push({
      id: 'walledOff',
      text: TEXT.walledOff(a.unreachable - (g.closed ?? 0)),
      weight: 200,
    });
  }
  out.push({ id: 'loops', text: TEXT.loops(a.loops), weight: 12 });
  return out.toSorted((x, y) => y.weight - x.weight);
}
