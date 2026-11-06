/**
 * How close a recognised maze comes to the true one.
 *
 * @module
 */

import { hasWall, type Edge, type Maze } from '@/maze';

/**
 * The internal edges of `truth` on which `found` has a wall where `truth` has none or the other way
 * round, east–west edges first; the border is left out, since the recogniser always walls it.
 *
 * @throws {RangeError} When the two mazes differ in size.
 */
export function wrongEdges(found: Maze, truth: Maze): Edge[] {
  if (found.width !== truth.width || found.height !== truth.height) {
    throw new RangeError(
      `a ${found.width}×${found.height} maze cannot be scored against a ${truth.width}×${truth.height} one`
    );
  }

  const edges: Edge[] = [];

  for (let y = 1; y < truth.height; y++) {
    for (let x = 0; x < truth.width; x++) {
      edges.push({ direction: 'horizontal', x, y });
    }
  }

  for (let y = 0; y < truth.height; y++) {
    for (let x = 1; x < truth.width; x++) {
      edges.push({ direction: 'vertical', x, y });
    }
  }

  return edges.filter((edge) => hasWall(found, edge) !== hasWall(truth, edge));
}

/**
 * The share of the internal edges on which `found` agrees with `truth`, from 0 to 1.
 *
 * @throws {RangeError} When the two mazes differ in size.
 */
export function scoreRecognition(found: Maze, truth: Maze): number {
  const internal = (truth.height - 1) * truth.width + truth.height * (truth.width - 1);
  return internal === 0 ? 1 : 1 - wrongEdges(found, truth).length / internal;
}
