/**
 * What changed between two mazes of the same size: the walls put and taken, the goal cells
 * marked and unmarked, and the start before and after. The Changes panel summarizes it and the
 * board draws it.
 *
 * @module
 */

import type { Edge } from './edges';
import { cellIndex, horizontalEdgeIndex, verticalEdgeIndex, type Cell, type Maze } from './maze';

/** What changed between two mazes of the same size. */
export interface MazeDiff {
  /** Walls put, east–west edges first, each set in index order. */
  readonly added: readonly Edge[];
  /** Walls taken, in the same order. */
  readonly removed: readonly Edge[];
  /** Cells that became goals. */
  readonly goalsAdded: readonly Cell[];
  /** Cells that stopped being goals. */
  readonly goalsRemoved: readonly Cell[];
  /** The start before; the same cell as `startAfter` when it did not change. */
  readonly startBefore: Cell | undefined;
  /** The start after. */
  readonly startAfter: Cell | undefined;
}

function edgeChanges(before: Maze, after: Maze): { added: Edge[]; removed: Edge[] } {
  const added: Edge[] = [];
  const removed: Edge[] = [];
  const { width, height } = after;

  const compare = (edge: Edge, wasWall: boolean, isWall: boolean): void => {
    if (wasWall !== isWall) {
      (isWall ? added : removed).push(edge);
    }
  };

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      const index = horizontalEdgeIndex(width, x, y);
      compare(
        { direction: 'horizontal', x, y },
        before.horizontal.get(index),
        after.horizontal.get(index)
      );
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      const index = verticalEdgeIndex(width, x, y);
      compare(
        { direction: 'vertical', x, y },
        before.vertical.get(index),
        after.vertical.get(index)
      );
    }
  }

  return { added, removed };
}

function goalsMissingFrom(goals: readonly Cell[], other: readonly Cell[], width: number): Cell[] {
  const kept = new Set(other.map((cell) => cellIndex(width, cell)));
  return goals.filter((cell) => !kept.has(cellIndex(width, cell)));
}

/** The diff from `before` to `after`, or `undefined` when their sizes differ. */
export function diffMazes(before: Maze, after: Maze): MazeDiff | undefined {
  if (before.width !== after.width || before.height !== after.height) {
    return undefined;
  }

  const { added, removed } = edgeChanges(before, after);

  return {
    added,
    removed,
    goalsAdded: goalsMissingFrom(after.goals, before.goals, after.width),
    goalsRemoved: goalsMissingFrom(before.goals, after.goals, after.width),
    startBefore: before.start,
    startAfter: after.start,
  };
}
