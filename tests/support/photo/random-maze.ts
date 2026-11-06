/**
 * Mazes with walls drawn at random from a seed, bordered, for the recogniser's tests.
 *
 * @module
 */

import { Bits, createMaze, fillBorder, type Maze } from '@/maze';

/** A bordered `size × size` maze whose internal edges each hold a wall with odds of about one in three. */
export function randomMaze(size: number, seed: number): Maze {
  let state = seed;
  const next = () => {
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
  return fillBorder(
    createMaze({
      width: size,
      height: size,
      horizontal: Bits.from((size + 1) * size, () => next() < 0.35),
      vertical: Bits.from(size * (size + 1), () => next() < 0.35),
    })
  );
}
