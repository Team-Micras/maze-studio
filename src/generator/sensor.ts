/**
 * Sensor challenges on the racing robot's route: stretches where the robot has no side wall to
 * re-centre on or to reset its odometry at a wall edge, as the finals build them. Three motifs,
 * each measured as its longest stretch on the route, in cells:
 * - zigzag: a slalom, a corridor two cells wide with one-cell stubs hanging from either side in
 *   turn, offset by a cell, so the route must weave from side to side every cell (`zigzagTurns`:
 *   heading changes of the racing line per cell of the route inside it). The route must run it
 *   end to end;
 * - fishbone: a straight run open on both sides, lined with perpendicular stubs;
 * - dashed: an open area of broken wall segments, every corner post of its cells holding one wall
 *   at most, whose dash rows the route crosses through the gaps between two wall ends; measured in
 *   dash rows crossed, at least 2 cells wide both ways.
 *
 * Each is measured on the racing robot's route and, when given, the other robot's fastest route.
 * `bare` is the share of the route's cells with no wall on either side of the robot's heading.
 *
 * @module
 */

import { isOpen, neighbour, type Grid } from './grid';

/** The motifs, in the order the settings and tags use. */
export const MOTIFS = ['zigzag', 'dashed', 'fishbone'] as const;

/** A sensor motif. */
export type Motif = (typeof MOTIFS)[number];

/**
 * The least staircase on the route, in cells, that counts as one: a diagonal of 5 moves, the floor
 * of the medium diagonal level. Staircases are no sensor motif; the diagonals range drives them.
 */
export const STAIRCASE_MIN = 5;

/**
 * The least stretch that counts as a motif: a slalom 5 cells long, a fishbone of 3 cells, a dashed
 * area whose dash rows the route crosses 4 times.
 */
export const MOTIF_MIN: Readonly<Record<Motif, number>> = { zigzag: 5, dashed: 4, fishbone: 3 };

/** The cells of each longest stretch, for drawing. */
export type SensorCells = Record<Motif | 'staircase', number[]>;

/**
 * The sensor challenges of a route: the longest stretch of each motif, cells; the heading changes
 * per cell of the racing line in the longest slalom; the longest staircase; the share of the
 * route's cells with no side wall, 0 to 1; and the cells of each longest stretch.
 */
export interface Sensor extends Record<Motif | 'staircase', number> {
  zigzagTurns: number;
  bare: number;
  cells: SensorCells;
}

function postWalls(g: Grid, c: number): number {
  const w = g.width;
  const [x, y] = [c % w, Math.floor(c / w)];
  if (x + 1 >= w || y + 1 >= g.height) {
    return 4;
  }
  const ne = c + w + 1;
  return (
    Number(!isOpen(g, c, 0)) +
    Number(!isOpen(g, c, 1)) +
    Number(!isOpen(g, ne, 2)) +
    Number(!isOpen(g, ne, 3))
  );
}

function dashedCell(g: Grid, c: number): boolean {
  const w = g.width;
  if (c % w === 0 || c < w) {
    return false;
  }
  return [c, c - 1, c - w, c - w - 1].every((p) => postWalls(g, p) <= 1);
}

function crossesDash(g: Grid, c: number, d: number): boolean {
  return [(d + 1) % 4, (d + 3) % 4].every((s) => {
    const side = neighbour(g, c, s);
    return side >= 0 && neighbour(g, side, d) >= 0 && !isOpen(g, side, d);
  });
}

/**
 * The slaloms the route runs end to end, from the walls: in every strip two cells wide, along it,
 * the runs of cell boundaries closed on one side only, the side alternating, with the strip open
 * across at every cell. Returns the cells of the longest such strip with a cell of the route in
 * every column. A column of two cells of a dashed area breaks the strip.
 */
function slalom(g: Grid, onRoute: Set<number>, areas: Set<number>): number[] {
  const w = g.width;
  let best: number[] = [];
  for (const [along, across] of [
    [1, 0],
    [0, 1],
  ]) {
    for (let row = 0; row + 1 < w; row++) {
      const at = (k: number, side: number) =>
        along === 1 ? (row + side) * w + k : k * w + row + side;
      const kind = (k: number) => {
        const [a, b] = [!isOpen(g, at(k, 0), along), !isOpen(g, at(k, 1), along)];
        return a === b ||
          !isOpen(g, at(k, 0), across) ||
          !isOpen(g, at(k + 1, 0), across) ||
          (areas.has(at(k, 0)) && areas.has(at(k, 1)))
          ? -1
          : a
            ? 0
            : 1;
      };
      let from = 0;
      for (let k = 0; k < w; k++) {
        const t = k + 1 < w ? kind(k) : -1;
        if (t >= 0 && (k === from || t !== kind(k - 1))) {
          continue;
        }
        const columns = k - from + 1;
        const cells = Array.from({ length: columns }, (_, j) => [at(from + j, 0), at(from + j, 1)]);
        const through = cells.every((pair) => pair.some((c) => onRoute.has(c)));
        if (columns - 1 >= 4 && through && 2 * columns > best.length) {
          best = cells.flat();
        }
        from = t >= 0 ? k : k + 1;
      }
    }
  }
  return best;
}

function turnsIn(g: Grid, route: readonly number[], area: Set<number>): number {
  let turns = 0;
  let cells = 0;
  let last: string | null = null;
  for (let i = 1; i + 1 < route.length; i++) {
    if (!area.has(route[i])) {
      continue;
    }
    cells++;
    const step = [route[i - 1], route[i], route[i + 1]].map((c) => [
      c % g.width,
      Math.floor(c / g.width),
    ]);
    const heading = `${step[2][0] - step[0][0]},${step[2][1] - step[0][1]}`;
    if (last !== null && heading !== last) {
      turns++;
    }
    last = heading;
  }
  return cells ? turns / cells : 0;
}

/**
 * The sensor challenges of the racing route, each motif also on the other fastest route when
 * given: a motif counts on either robot's route, never off them.
 *
 * @param route Start first.
 * @param other The other robot's fastest route.
 */
export function sensor(g: Grid, route: readonly number[], other?: readonly number[]): Sensor {
  const routes = other?.length ? [route, other] : [route];
  const areas = new Set<number>();
  const found = routes.map((r) => dashedAreas(g, r, areas));
  const out = measure(g, route, areas);
  Object.assign(out, { dashed: found[0].rows, cells: { ...out.cells, dashed: found[0].cells } });
  if (!other || routes.length === 1) {
    return out;
  }
  const more = { ...measure(g, other, areas), dashed: found[1].rows };
  more.cells.dashed = found[1].cells;
  for (const k of MOTIFS) {
    if (more[k] <= out[k]) {
      continue;
    }
    out[k] = more[k];
    out.cells[k] = more.cells[k];
    if (k === 'zigzag') {
      out.zigzagTurns = more.zigzagTurns;
    }
  }
  return out;
}

/**
 * The dashed area whose dash rows a route crosses most, as rows crossed and cells; adds to `areas`
 * every area crossed `MOTIF_MIN.dashed` times or more with the cells open to it, which no slalom or
 * fishbone of either route then counts.
 */
function dashedAreas(
  g: Grid,
  route: readonly number[],
  areas: Set<number>
): { rows: number; cells: number[] } {
  const goal = new Set(g.goals);
  const best = { rows: 0, cells: [] as number[] };
  const index = new Map(route.map((c, i) => [c, i]));
  const seen = new Uint8Array(g.width * g.height);
  const near = route.flatMap((c) => [
    c,
    ...[0, 1, 2, 3].filter((k) => isOpen(g, c, k)).map((k) => neighbour(g, c, k)),
  ]);
  for (const start of near) {
    if (seen[start] || goal.has(start) || !dashedCell(g, start)) {
      continue;
    }
    const area = [start];
    seen[start] = 1;
    for (let i = 0; i < area.length; i++) {
      for (let k = 0; k < 4; k++) {
        const n = neighbour(g, area[i], k);
        if (n < 0 || seen[n] || goal.has(n) || !isOpen(g, area[i], k) || !dashedCell(g, n)) {
          continue;
        }
        seen[n] = 1;
        area.push(n);
      }
    }
    const xs = area.map((c) => c % g.width);
    const ys = area.map((c) => Math.floor(c / g.width));
    if (Math.max(...xs) === Math.min(...xs) || Math.max(...ys) === Math.min(...ys)) {
      continue;
    }
    const inside = new Set(
      area.flatMap((c) => [
        c,
        ...[0, 1, 2, 3].filter((k) => isOpen(g, c, k)).map((k) => neighbour(g, c, k)),
      ])
    );
    let rows = 0;
    for (const c of inside) {
      const i = index.get(c);
      if (i === undefined || i + 1 >= route.length || !inside.has(route[i + 1])) {
        continue;
      }
      const d = [0, 1, 2, 3].find((k) => neighbour(g, c, k) === route[i + 1]) ?? -1;
      if (crossesDash(g, c, d)) {
        rows++;
      }
    }
    if (rows >= MOTIF_MIN.dashed) {
      for (const c of inside) {
        areas.add(c);
      }
    }
    if (rows > best.rows) {
      Object.assign(best, { rows, cells: area });
    }
  }
  return best;
}

function measure(g: Grid, route: readonly number[], areas: Set<number>): Sensor {
  const goal = new Set(g.goals);
  const out: Sensor = {
    zigzag: 0,
    zigzagTurns: 0,
    dashed: 0,
    fishbone: 0,
    staircase: 0,
    bare: 0,
    cells: { zigzag: [], dashed: [], fishbone: [], staircase: [] },
  };
  const keep = (k: 'fishbone' | 'staircase', cells: number[]) => {
    if (cells.length <= out[k]) {
      return;
    }
    out[k] = cells.length;
    out.cells[k] = cells;
  };
  if (route.length < 3) {
    return out;
  }
  let bare = 0;
  let fish: number[] = [];
  let stairs: number[] = [];
  let lastTurn = -1;
  let heading = -1;
  for (let i = 1; i + 1 < route.length; i++) {
    const c = route[i];
    const d = [0, 1, 2, 3].find((k) => neighbour(g, c, k) === route[i + 1]) ?? -1;
    const e = [0, 1, 2, 3].find((k) => neighbour(g, route[i - 1], k) === c) ?? -1;
    const sides = [0, 1, 2, 3].filter((k) => k !== d && k !== (e + 2) % 4);
    const open = sides.filter((k) => isOpen(g, c, k));
    if (open.length === sides.length) {
      bare++;
    }
    const straight = d === e;
    stairs = straight || goal.has(c) ? [] : d === lastTurn ? [...stairs, c] : [c];
    lastTurn = straight ? -1 : e;
    keep('staircase', stairs);
    if (!straight || d !== heading) {
      fish = [];
    }
    heading = straight ? d : -1;
    if (!straight || goal.has(c)) {
      continue;
    }
    fish = open.length === 2 && !areas.has(c) ? [...fish, c] : [];
    keep('fishbone', fish);
  }
  const strip = slalom(g, new Set(route), areas);
  if (strip.length) {
    out.zigzag = strip.length / 2;
    out.cells.zigzag = strip;
    out.zigzagTurns = turnsIn(g, route, new Set(strip));
  }
  out.bare = bare / (route.length - 2);
  return out;
}

/** The motifs of a measured route long enough to count ({@link MOTIF_MIN}). */
export const motifsOf = (m: Sensor): Motif[] => MOTIFS.filter((k) => m[k] >= MOTIF_MIN[k]);
