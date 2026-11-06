/**
 * The measures of `eval.ts`, apart from its files and its browser: the corners a person might
 * click, the confidence and the broken rules of a wrong edge, and the summary of a set of frames
 * with its spread over events.
 *
 * @module
 */

import {
  cellIndex,
  createMaze,
  hasWall,
  loosePosts,
  openNeighbours,
  type Cell,
  type Edge,
  type Maze,
} from '@/maze';
import type { Point, Recognition } from '@/photo';

/** A rule of a runnable maze that a recognised maze breaks at an edge. */
export type BrokenRule = 'lonePost' | 'unreachable' | 'startOpen' | 'goalWall';

/** How far a jittered corner may move, as a share of the side that starts at it. */
export const JITTER = 0.01;

/** The seeds of the jittered corners. */
export const JITTER_SEEDS = [1, 2, 3, 4] as const;

/**
 * A generator of numbers from −1 to 1, the Park–Miller one, which the first held-out report and the
 * jitter of PR #91 used, so their numbers can be met again.
 */
export function random(seed: number): () => number {
  let state = (seed * 7919) % 2147483647;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state / 2147483647) * 2 - 1;
  };
}

/**
 * `corners` each moved at random by up to `share` of the side from it to the next, in `x` and `y`
 * apart, as a person dragging handles would leave them.
 */
export function jitterCorners(
  corners: readonly [Point, Point, Point, Point],
  seed: number,
  share = JITTER
): [Point, Point, Point, Point] {
  const next = random(seed);
  const [a, b, c, d] = corners.map(({ x, y }, index) => {
    const side = Math.hypot(corners[(index + 1) % 4].x - x, corners[(index + 1) % 4].y - y);
    return { x: x + next() * share * side, y: y + next() * share * side };
  });
  return [a, b, c, d];
}

/** How sure `recognition` is of `edge`, from 0 to 1. */
export function edgeConfidence(recognition: Recognition, edge: Edge): number {
  const { width } = recognition.maze;
  return edge.direction === 'horizontal'
    ? recognition.confidence.horizontal[edge.y * width + edge.x]
    : recognition.confidence.vertical[edge.y * (width + 1) + edge.x];
}

function reachable(maze: Maze, start: Cell): Set<number> {
  const seen = new Set([cellIndex(maze.width, start)]);
  const queue = [start];

  for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
    for (const next of openNeighbours(maze, cell)) {
      if (!seen.has(cellIndex(maze.width, next))) {
        seen.add(cellIndex(maze.width, next));
        queue.push(next);
      }
    }
  }

  return seen;
}

/**
 * The rules `found` breaks at an edge, judged with the start and goals of `truth` (the south-west
 * corner when it has no start): a post at either end with no wall, outside the middle of the goal;
 * a cell on either side that the start cannot reach; the start, open on more than one side, on
 * either side; a wall between two goal cells.
 */
export function brokenRules(found: Maze, truth: Maze): (edge: Edge) => BrokenRule[] {
  const start = truth.start ?? { x: 0, y: 0 };
  const judged = createMaze({ ...found, start, goals: truth.goals });
  const lone = new Set(loosePosts(judged).map((post) => `${post.x},${post.y}`));
  const seen = reachable(judged, start);
  const startOpen = openNeighbours(judged, start).length > 1;
  const goals = new Set(truth.goals.map((goal) => cellIndex(truth.width, goal)));

  return (edge) => {
    const sides: [Cell, Cell] =
      edge.direction === 'horizontal'
        ? [
            { x: edge.x, y: edge.y - 1 },
            { x: edge.x, y: edge.y },
          ]
        : [
            { x: edge.x - 1, y: edge.y },
            { x: edge.x, y: edge.y },
          ];
    const ends =
      edge.direction === 'horizontal'
        ? [`${edge.x},${edge.y}`, `${edge.x + 1},${edge.y}`]
        : [`${edge.x},${edge.y}`, `${edge.x},${edge.y + 1}`];
    const inside = sides.filter(
      (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < found.width && cell.y < found.height
    );
    const broken: BrokenRule[] = [];

    if (ends.some((end) => lone.has(end))) {
      broken.push('lonePost');
    }

    if (inside.some((cell) => !seen.has(cellIndex(found.width, cell)))) {
      broken.push('unreachable');
    }

    if (startOpen && inside.some((cell) => cell.x === start.x && cell.y === start.y)) {
      broken.push('startOpen');
    }

    if (
      hasWall(found, edge) &&
      inside.length === 2 &&
      inside.every((cell) => goals.has(cellIndex(found.width, cell)))
    ) {
      broken.push('goalWall');
    }

    return broken;
  };
}

/** A scored frame, as the summary needs it. */
export interface ScoredFrame {
  readonly event: string;
  readonly score: number;
  readonly wrong: number;
}

/** A set of frames in a few numbers. */
export interface Summary {
  readonly frames: number;
  readonly events: number;
  /** The share of frames with no wrong edge: the headline. */
  readonly zeroErrorRate: number;
  readonly meanScore: number;
  readonly wrongEdges: number;
  /** The lowest and highest zero-error rate with one event left out, `null` with one event. */
  readonly leaveOneEventOut: readonly [number, number] | null;
  /** The 5th and 95th percentiles of the zero-error rate over events drawn with replacement. */
  readonly bootstrap90: readonly [number, number];
}

/** How many times the events are drawn for the bootstrap. */
export const BOOTSTRAP_DRAWS = 2000;

const zeroRate = (frames: readonly ScoredFrame[]) =>
  frames.length === 0
    ? Number.NaN
    : frames.filter((frame) => frame.wrong === 0).length / frames.length;

/**
 * `frames` summarised, with the spread of the zero-error rate over their events: left out one at
 * a time, and drawn with replacement {@link BOOTSTRAP_DRAWS} times from `seed`, every frame of a
 * drawn event counting.
 */
export function summarise(frames: readonly ScoredFrame[], seed = 1): Summary {
  const names = [...new Set(frames.map((frame) => frame.event))];
  const events = names.map((event) => frames.filter((frame) => frame.event === event));
  const next = random(seed);
  const rates = Array.from({ length: BOOTSTRAP_DRAWS }, () =>
    zeroRate(events.flatMap(() => events[Math.floor(((next() + 1) / 2) * events.length)] ?? []))
  ).toSorted((a, b) => a - b);
  const leftOut = names.map((event) => zeroRate(frames.filter((frame) => frame.event !== event)));

  return {
    frames: frames.length,
    events: events.length,
    zeroErrorRate: zeroRate(frames),
    meanScore: frames.reduce((sum, frame) => sum + frame.score, 0) / frames.length,
    wrongEdges: frames.reduce((sum, frame) => sum + frame.wrong, 0),
    leaveOneEventOut: events.length > 1 ? [Math.min(...leftOut), Math.max(...leftOut)] : null,
    bootstrap90: [
      rates[Math.floor(0.05 * (rates.length - 1))],
      rates[Math.ceil(0.95 * (rates.length - 1))],
    ],
  };
}
