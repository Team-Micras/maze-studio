/**
 * A value computed once per maze and remembered while the maze lives, as a maze never changes.
 *
 * @module
 */

import type { Maze } from './maze';

/** What {@link mazeMemo} remembers per maze. */
export interface MazeMemo<T> {
  /** The value of `maze`, computed on first use. */
  readonly get: (maze: Maze) => T;
  /** Remembers `value` as that of `maze`, computed elsewhere, as in a worker. */
  readonly remember: (maze: Maze, value: T) => void;
  /** Whether the value of `maze` is known, so {@link MazeMemo.get} returns at once. */
  readonly known: (maze: Maze) => boolean;
}

/** A memo of `compute` per maze. */
export function mazeMemo<T>(compute: (maze: Maze) => T): MazeMemo<T> {
  const memo = new WeakMap<Maze, { readonly value: T }>();
  return {
    get: (maze) => {
      const known = memo.get(maze);

      if (known !== undefined) {
        return known.value;
      }

      const value = compute(maze);
      memo.set(maze, { value });
      return value;
    },
    remember: (maze, value) => {
      memo.set(maze, { value });
    },
    known: (maze) => memo.has(maze),
  };
}
