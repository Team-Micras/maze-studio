/**
 * The order of the quick maze list (PLAN.md 3.4): My mazes first, then the repository, each in the
 * catalog's order, and stepping through it.
 *
 * @module
 */

import type { CatalogEntry } from '@/library';

/** The entries in the list's order: My mazes first, then the repository. */
export function listOrder<Entry extends CatalogEntry>(entries: readonly Entry[]): Entry[] {
  return [
    ...entries.filter((entry) => entry.origin === 'mine'),
    ...entries.filter((entry) => entry.origin !== 'mine'),
  ];
}

/**
 * The key `delta` places after `current` in `keys`, wrapping at both ends; the first key when
 * `current` is not there, and `undefined` for an empty list.
 */
export function steppedKey(
  keys: readonly string[],
  current: string | undefined,
  delta: number
): string | undefined {
  if (keys.length === 0) {
    return undefined;
  }

  const index = current === undefined ? -1 : keys.indexOf(current);

  if (index < 0) {
    return keys[0];
  }

  return keys[(((index + delta) % keys.length) + keys.length) % keys.length];
}
