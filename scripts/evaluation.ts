/**
 * The measures of `eval.ts`, apart from its files and its browser: the corners a person might
 * click, the confidence and the broken rules of a wrong edge, and the summary of a set of frames
 * with its spread over events.
 *
 * @module
 */

import type { Edge } from '@/maze';
import type { BrokenRule, Point, Recognition } from '@/photo';

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

/** The rules `recognition` reports broken at `edge`. */
export function edgeRules(recognition: Recognition, edge: Edge): readonly BrokenRule[] {
  return (
    recognition.broken.find(
      (entry) =>
        entry.edge.direction === edge.direction &&
        entry.edge.x === edge.x &&
        entry.edge.y === edge.y
    )?.rules ?? []
  );
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
