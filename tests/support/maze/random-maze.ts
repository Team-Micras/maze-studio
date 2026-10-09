/**
 * Random mazes from a fixed seed, for property tests that must fail the same way every run.
 *
 * @module
 */

import {
  Bits,
  cellAt,
  createMaze,
  horizontalEdgeCount,
  MAX_SIDE,
  verticalEdgeCount,
  type Maze,
} from '@/maze';

/** A source of numbers in [0, 1). */
export type Random = () => number;

/** The mulberry32 generator: small, fast and the same on every engine for a given seed. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A whole number from `low` to `high`, both included. */
export function between(random: Random, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

type Border = 'closed' | 'open' | 'random';

const BORDERS: readonly Border[] = ['closed', 'open', 'random'];

function border(random: Random): Border {
  return BORDERS[between(random, 0, BORDERS.length - 1)] ?? 'random';
}

function wall(choice: Border, random: Random, density: number): boolean {
  return choice === 'closed' || (choice === 'random' && random() < density);
}

/**
 * A random maze: each side 1 to 64 cells unless given, a random wall density, each of the four
 * borders closed, open or random on its own, maybe a start and any number of goals.
 */
export function randomMaze(
  random: Random,
  size: { readonly width?: number; readonly height?: number } = {}
): Maze {
  const width = size.width ?? between(random, 1, MAX_SIDE);
  const height = size.height ?? between(random, 1, MAX_SIDE);
  const density = random();
  const [south, north, west, east] = [
    border(random),
    border(random),
    border(random),
    border(random),
  ];
  const horizontal = Bits.from(horizontalEdgeCount(width, height), (index) => {
    const y = Math.floor(index / width);
    const side = y === 0 ? south : y === height ? north : 'random';
    return wall(side, random, density);
  });
  const vertical = Bits.from(verticalEdgeCount(width, height), (index) => {
    const x = index % (width + 1);
    const side = x === 0 ? west : x === width ? east : 'random';
    return wall(side, random, density);
  });
  const cells = width * height;
  const startIndex = random() < 0.8 ? between(random, 0, cells - 1) : undefined;
  const goalChance = random() * Math.min(1, 16 / cells);
  const goals = Array.from({ length: cells }, (_, index) => index).filter(
    (index) => index !== startIndex && random() < goalChance
  );

  return createMaze({
    width,
    height,
    horizontal,
    vertical,
    start: startIndex === undefined ? undefined : cellAt(width, startIndex),
    goals: goals.map((index) => cellAt(width, index)),
  });
}
