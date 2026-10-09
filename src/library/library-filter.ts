/**
 * What the library shows: one source, maybe one category, and a search (PLAN.md 3.4).
 *
 * @module
 */

import type { CatalogEntry } from './catalog';
import type { SearchIndex } from './search';

/** Where the mazes come from: the repository, Mine, or an opened folder. */
export type LibrarySource = 'repo' | 'mine' | 'folder';

/** A repository folder to show, or `''` for all of them. */
export type LibraryCategory = '' | 'classic' | 'halfsize' | 'training';

/** The library's filter. */
export interface LibraryFilter {
  readonly source: LibrarySource;
  readonly category: LibraryCategory;
  readonly query: string;
}

/** Every source in the order the filter offers them. */
export const LIBRARY_SOURCES: readonly LibrarySource[] = ['repo', 'mine', 'folder'];

/** Every category in the order the filter offers them, all first. */
export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  '',
  'classic',
  'halfsize',
  'training',
];

/** The repository's mazes, every category, no search. */
export const DEFAULT_FILTER: LibraryFilter = { source: 'repo', category: '', query: '' };

/** Whether `value` names a source. */
export function isLibrarySource(value: string): value is LibrarySource {
  return LIBRARY_SOURCES.some((source) => source === value);
}

/** Whether `value` names a category. */
export function isLibraryCategory(value: string): value is LibraryCategory {
  return LIBRARY_CATEGORIES.some((category) => category === value);
}

/** The entries `filter` shows, in their order. */
export function filterCatalog<Entry extends CatalogEntry>(
  entries: readonly Entry[],
  filter: LibraryFilter,
  index: SearchIndex
): Entry[] {
  const shown = entries.filter(
    (entry) =>
      entry.origin === filter.source &&
      (filter.category === '' || entry.category === filter.category)
  );
  return index.search(shown, filter.query);
}
