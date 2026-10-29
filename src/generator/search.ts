/**
 * What a robot that starts without a map finds: a wall follower, and a flood-fill search to the
 * goal and back. The search senses the four walls of every cell it enters, takes unseen walls as
 * open while it searches and as closed for the fast run, as the firmware's pessimistic solve does.
 *
 * @module
 */

import { BIT, bfs, neighbourTable, type Grid } from './grid';
import { PROFILES, fastestRoute, type Profile } from './racing';

/** The side a flood fill tries first on a tie: 1 right, 3 left. */
export type Side = 1 | 3;

/**
 * Whether a left-hand or right-hand wall follower reaches the goal from the start. IEEE rule R2
 * places the goal so that it cannot; about 77 % of the finals in the corpus hold it.
 */
export function followerReaches(g: Grid): boolean {
  const w = g.width;
  const size = w * g.height;
  const step = [w, 1, -w, -1];
  let first = -1;
  for (let d = 0; d < 4 && first < 0; d++) {
    if (!(g.walls[g.start] & BIT[d])) {
      first = d;
    }
  }
  if (first < 0) {
    return false;
  }
  for (const hand of [3, 1]) {
    let c = g.start;
    let h = first;
    for (let moves = 0; moves <= 4 * size; moves++) {
      if (g.goals.includes(c)) {
        return true;
      }
      const wall = g.walls[c];
      let d = (h + hand) % 4;
      if (wall & BIT[d]) {
        d = h;
        if (wall & BIT[d]) {
          d = (h + 4 - hand) % 4;
          if (wall & BIT[d]) {
            d = (h + 2) % 4;
          }
        }
      }
      h = d;
      c += step[d];
    }
  }
  return false;
}

interface RoundTrip {
  /** Per cell, the sides seen. */
  readonly known: Uint8Array;
  /** Per cell, the walls found. */
  readonly wall: Uint8Array;
  readonly steps: number;
  /** The cells driven, start first. */
  readonly trail: number[];
  /** The index in `trail` where it turned back at the goal. */
  readonly turn: number;
}

/**
 * A flood-fill search from the start to the goal and back, re-flooding the known map from the
 * target whenever a new wall cuts a step of the flood; at each cell it goes straight, then to the
 * `side`, the other side or back toward the target.
 */
function roundTrip(g: Grid, side: Side): RoundTrip {
  const size = g.width * g.height;
  const next = neighbourTable(g);
  const known = new Uint8Array(size);
  const wall = new Uint8Array(size);
  const buffers = { walls: wall, dist: new Int32Array(size), order: new Int32Array(size) };
  const dist = buffers.dist;
  let fresh = true;
  const sense = (c: number) => {
    for (let d = 0; d < 4; d++) {
      if (known[c] & BIT[d]) {
        continue;
      }
      known[c] |= BIT[d];
      const n = next[c * 4 + d];
      if (n >= 0) {
        known[n] |= BIT[(d + 2) % 4];
      }
      if (g.walls[c] & BIT[d]) {
        wall[c] |= BIT[d];
        if (n >= 0) {
          wall[n] |= BIT[(d + 2) % 4];
        }
        if (n >= 0 && Math.abs(dist[c] - dist[n]) === 1) {
          fresh = true;
        }
      }
    }
  };
  let c = g.start;
  let h = [0, 1, 2, 3].find((d) => !(g.walls[c] & BIT[d])) ?? 0;
  let steps = 0;
  const trail = [c];
  let turn = 0;
  sense(c);
  for (const targets of [g.goals, [g.start]]) {
    if (targets !== g.goals) {
      turn = trail.length - 1;
    }
    fresh = true;
    while (steps < 8 * size) {
      if (fresh) {
        bfs(g, targets, buffers);
        fresh = false;
      }
      if (dist[c] <= 0) {
        break;
      }
      let d = h;
      for (const x of [h, (h + side) % 4, (h + 4 - side) % 4, (h + 2) % 4]) {
        d = x;
        if (!(wall[c] & BIT[x]) && dist[next[c * 4 + x]] === dist[c] - 1) {
          break;
        }
      }
      h = d;
      c = next[c * 4 + d];
      steps++;
      trail.push(c);
      sense(c);
    }
  }
  return { known, wall, steps, trail, turn };
}

/** What a flood-fill robot races after one round trip ({@link searchRun}). */
export interface SearchRun {
  /** How much slower than the profile's true fastest route, %; Infinity when out of reach. */
  readonly loss: number;
  /** The route raced, start first; empty when the goal cannot be reached. */
  readonly route: number[];
  /** The cells driven on the round trip, start first. */
  readonly trail: number[];
  /** The index in `trail` where it turned back at the goal. */
  readonly turn: number;
  /** Per cell, the sides seen. */
  readonly known: Uint8Array;
}

/**
 * What a flood-fill robot races after one round trip: the fastest route of a profile (by default
 * the racing robot's) on the map it knows, unseen walls closed, and how much slower that is than
 * the profile's true fastest route, in %. A flood fill breaks ties between equal cells by a side,
 * so the robot is run with the right first and with the left first and the smaller loss counts: a
 * trap must catch both. 0 means one round trip already shows the best route.
 *
 * @param optimum The profile's true fastest time, when already known.
 * @param sides The tie-breaks tried, right first and left first by default.
 */
export function searchRun(
  g: Grid,
  optimum?: number,
  pr: Profile = PROFILES.diagonal,
  sides: readonly Side[] = [1, 3]
): SearchRun {
  const best = optimum ?? fastestRoute(g, pr).time;
  let found: SearchRun | null = null;
  for (const side of sides) {
    if (found?.loss === 0) {
      break;
    }
    const { known, wall, trail, turn } = roundTrip(g, side);
    if (!Number.isFinite(best)) {
      return { loss: Infinity, route: [], trail, turn, known };
    }
    const pessimistic = { ...g, walls: wall.map((w, c) => w | (~known[c] & 15)) };
    const raced = fastestRoute(pessimistic, pr);
    const run = { loss: 100 * (raced.time / best - 1), route: raced.route, trail, turn, known };
    if (!found || run.loss < found.loss) {
      found = run;
    }
  }
  if (!found) {
    throw new RangeError('a search run needs at least one side');
  }
  return found;
}
