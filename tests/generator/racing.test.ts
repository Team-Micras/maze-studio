import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { fromMaze, PROFILES, RACERS, type Grid, type Profile } from '@/generator';
import { bfs, setWall } from '@/generator/grid';
import { fastestRoute, references, routeTime, TURNS } from '@/generator/racing';
import { parseMazeText } from '@/maze';

const CLASSIC = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles', 'classic');

const FINALS = /^alljapan-\d+-(19|20)\d\d-(exp-)?fin\.txt$|^japan\d{4}-?ef\.txt$/;

const CLASSES = ['weak', 'mid', 'strong'] as const;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const v90 = (pr: Profile) => Math.min(pr.vmax, Math.sqrt(pr.grip * TURNS.t90.radius));

/** A board of `size` with only the cells of `route` joined, start first, goal its last cell. */
function corridor(size: number, route: readonly number[]): Grid {
  const g: Grid = {
    width: size,
    height: size,
    walls: new Uint8Array(size * size).fill(15),
    start: route[0],
    goals: [route.at(-1) ?? 0],
  };
  for (let i = 1; i < route.length; i++) {
    const delta = route[i] - route[i - 1];
    setWall(g, route[i - 1], delta === size ? 0 : delta === 1 ? 1 : delta === -size ? 2 : 3, 0);
  }
  return g;
}

/** A staircase north, east, north, east… of `moves` moves from the south-west corner. */
function stairs(size: number, moves: number): number[] {
  const route = [0];
  for (let i = 0; i < moves; i++) {
    route.push((route.at(-1) ?? 0) + (i % 2 ? 1 : size));
  }
  return route;
}

/** The line through the middles of the walls a route crosses: a cell along, half a diagonal at a turn. */
function lattice(route: readonly number[]): number {
  let length = 0;
  for (let i = 2; i < route.length; i++) {
    const straight = route[i] - route[i - 1] === route[i - 1] - route[i - 2];
    length += straight ? 0.18 : 0.18 / Math.SQRT2;
  }
  return length;
}

/** The shortest such line, by a Dijkstra over (cell, heading) of its own. */
function shortestLine(g: Grid): number {
  const best = new Map([[g.start * 5 + 4, 0]]);
  const queue: [number, number, number][] = [[0, g.start, 4]];
  const goal = new Set(g.goals);
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [length, c, h] = queue.shift() ?? [0, 0, 0];
    if (length > (best.get(c * 5 + h) ?? Infinity)) {
      continue;
    }
    if (goal.has(c)) {
      return length;
    }
    for (let d = 0; d < 4; d++) {
      if (g.walls[c] & (1 << d) || (h < 4 && d === (h + 2) % 4)) {
        continue;
      }
      const n = c + [g.width, 1, -g.width, -1][d];
      const l = length + (h === 4 ? 0 : h === d ? 0.18 : 0.18 / Math.SQRT2);
      if (l < (best.get(n * 5 + d) ?? Infinity) - 1e-12) {
        best.set(n * 5 + d, l);
        queue.push([l, n, d]);
      }
    }
  }
  return Infinity;
}

function finals(): { name: string; grid: Grid }[] {
  return readdirSync(CLASSIC)
    .filter((f) => FINALS.test(f))
    .flatMap((name) => {
      const result = parseMazeText(readFileSync(join(CLASSIC, name), 'utf8'), `classic/${name}`);
      if (!result.ok || !result.value.maze.start || result.value.maze.goals.length === 0) {
        return [];
      }
      return [{ name, grid: fromMaze(result.value.maze) }];
    });
}

describe('the run-time model', () => {
  test.each(Object.entries(RACERS))(
    'gives the %s class two profiles that differ in the diagonals only',
    (_robot, pair) => {
      const { name: _o, diagonals: orthogonalDiagonals, ...orthogonal } = pair.orthogonal;
      const { name: _d, diagonals: diagonalDiagonals, ...diagonal } = pair.diagonal;
      expect([orthogonalDiagonals, diagonalDiagonals]).toEqual([false, true]);
      expect(orthogonal).toEqual(diagonal);
    }
  );

  test('builds for the mid class, and names no team', () => {
    expect(PROFILES).toBe(RACERS.mid);
    expect(JSON.stringify(PROFILES)).not.toMatch(/micras/i);
  });

  test.each(Object.entries(RACERS))(
    'charges the %s class one turn per cell of a 90 degree zigzag, at its traction speed',
    (_robot, { orthogonal: pr, diagonal: pd }) => {
      const zigzag = (moves: number) => fastestRoute(corridor(12, stairs(12, moves)), pr).time;
      for (const moves of [6, 8, 10]) {
        expect(zigzag(moves + 2) - zigzag(moves)).toBeCloseTo((2 * TURNS.t90.length) / v90(pr), 9);
      }
      expect(fastestRoute(corridor(12, stairs(12, 12)), pd).time).toBeLessThan(zigzag(12));
    }
  );

  test.each(Object.entries(RACERS))(
    'runs a straight of the %s class as a trapezoid between turn speeds',
    (_robot, { orthogonal: pr }) => {
      for (const n of [2, 5, 11]) {
        const route = Array.from({ length: n + 1 }, (_, i) => i * 12);
        const [metres, v, a] = [(n - 1) * 0.18, v90(pr), pr.accel];
        const peak = Math.min(pr.vmax, Math.sqrt(a * metres + v * v));
        const trapezoid = (2 * (peak - v)) / a + (metres - (peak * peak - v * v) / a) / peak;
        expect(routeTime(corridor(12, route), route, pr)).toBeCloseTo(trapezoid, 9);
      }
    }
  );

  test('turns faster with more grip, the weak class at the firmware’s 0.54 m/s', () => {
    expect(v90(RACERS.weak.orthogonal)).toBeLessThan(v90(RACERS.mid.orthogonal));
    expect(v90(RACERS.mid.orthogonal)).toBeLessThan(v90(RACERS.strong.orthogonal));
    expect(v90(RACERS.weak.orthogonal)).toBeCloseTo(0.54, 2);
  });

  test('agrees with its search on a corner after any straight', () => {
    for (const k of [2, 4, 7]) {
      const route = [0];
      for (let i = 0; i < k; i++) {
        route.push((route.at(-1) ?? 0) + 12);
      }
      for (let i = 0; i < 5; i++) {
        route.push((route.at(-1) ?? 0) + 1);
      }
      const g = corridor(12, route);
      expect(routeTime(g, route, PROFILES.orthogonal)).toBeCloseTo(
        fastestRoute(g, PROFILES.orthogonal).time,
        9
      );
    }
  });

  test('agrees with its search and orders the classes on the All Japan finals', () => {
    const wrong: string[] = [];
    for (const { name, grid: g } of finals()) {
      const careful = fastestRoute(g, PROFILES.orthogonal);
      const racing = fastestRoute(g, PROFILES.diagonal);
      if (!close(routeTime(g, careful.route, PROFILES.orthogonal), careful.time)) {
        wrong.push(`${name}: careful route time`);
      }
      if (!close(routeTime(g, racing.route, PROFILES.diagonal), racing.time)) {
        wrong.push(`${name}: racing route time`);
      }
      const [weak, mid, strong] = CLASSES.map((k) => fastestRoute(g, RACERS[k].diagonal).time);
      if (!(weak > mid && mid > strong)) {
        wrong.push(`${name}: classes out of order`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('finds the four reference behaviours on the All Japan finals', () => {
    const wrong: string[] = [];
    for (const { name, grid: g } of finals().slice(0, 9)) {
      const ref = references(g);
      const cells = bfs(g, [g.start]).dist;
      if (!ref) {
        wrong.push(`${name}: no references`);
        continue;
      }
      if (ref.shortest.orthogonal.cells !== Math.min(...g.goals.map((c) => cells[c]))) {
        wrong.push(`${name}: the shortest route is not the fewest cells`);
      }
      if (
        ref.shortest.orthogonal.time < ref.fastest.orthogonal.time - 1e-9 ||
        ref.shortest.diagonal.time < ref.fastest.diagonal.time - 1e-9
      ) {
        wrong.push(`${name}: a shortest route beats the fastest`);
      }
      if (Math.abs(lattice(ref.shortest.diagonal.route) - shortestLine(g)) >= 1e-9) {
        wrong.push(`${name}: the diagonal shortest route is not the shortest line`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('gives the diagonal robot of the mid class about 12 % on the All Japan finals', () => {
    const gains = finals().map(({ grid: g }) => {
      const careful = fastestRoute(g, PROFILES.orthogonal);
      const racing = fastestRoute(g, PROFILES.diagonal);
      return 100 * (careful.time / racing.time - 1);
    });
    const median = gains.toSorted((a, b) => a - b)[gains.length >> 1];
    expect(gains.length).toBeGreaterThanOrEqual(25);
    expect(median).toBeGreaterThanOrEqual(8);
    expect(median).toBeLessThanOrEqual(16);
  });
});
