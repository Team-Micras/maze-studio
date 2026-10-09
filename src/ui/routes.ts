/**
 * The routes in the URL's hash (PLAN.md 3.4, DESIGN.md 14): the library with its filter as query
 * keys that differ from the default, and the four ways to open a maze.
 *
 * @module
 */

import {
  DEFAULT_FILTER,
  isLibraryCategory,
  isLibrarySource,
  type LibraryFilter,
} from '@/library/library-filter';

/** A place in the app. */
export type Route =
  | { readonly kind: 'library'; readonly filter: LibraryFilter }
  | { readonly kind: 'repo'; readonly path: string }
  | { readonly kind: 'mine'; readonly id: string }
  | { readonly kind: 'folder'; readonly file: string }
  | { readonly kind: 'link'; readonly code: string };

/** The library with the default filter. */
export const LIBRARY_ROUTE: Route = { kind: 'library', filter: DEFAULT_FILTER };

const MAZE_PREFIXES = { repo: '/repo/', mine: '/mine/', folder: '/folder/', link: '/m/' } as const;

function decodePath(path: string): string | undefined {
  try {
    const decoded = path.split('/').map(decodeURIComponent);
    return decoded.every((segment) => segment !== '') ? decoded.join('/') : undefined;
  } catch {
    return undefined;
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function libraryFilter(query: string): LibraryFilter {
  const params = new URLSearchParams(query);
  const source = params.get('src') ?? '';
  const category = params.get('cat') ?? '';
  return {
    source: isLibrarySource(source) ? source : DEFAULT_FILTER.source,
    category: isLibraryCategory(category) ? category : DEFAULT_FILTER.category,
    query: params.get('q') ?? DEFAULT_FILTER.query,
  };
}

function mazeRoute(path: string): Route | undefined {
  for (const [kind, prefix] of Object.entries(MAZE_PREFIXES)) {
    const rest = path.startsWith(prefix) ? decodePath(path.slice(prefix.length)) : undefined;

    if (rest === undefined) {
      continue;
    }

    switch (kind) {
      case 'repo':
        return { kind: 'repo', path: rest };
      case 'mine':
        return { kind: 'mine', id: rest };
      case 'folder':
        return { kind: 'folder', file: rest };
      default:
        return { kind: 'link', code: rest };
    }
  }

  return undefined;
}

/** The route a hash names; anything it does not understand is the library with the default filter. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const [where = '', query = ''] = path.split(/\?(.*)/s);

  if (where === '' || where === '/') {
    return { kind: 'library', filter: libraryFilter(query) };
  }

  return mazeRoute(where) ?? LIBRARY_ROUTE;
}

/** The hash of a route; the library writes only the filter keys that differ from the default. */
export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'library': {
      const params = new URLSearchParams();
      const { filter } = route;

      if (filter.source !== DEFAULT_FILTER.source) {
        params.set('src', filter.source);
      }

      if (filter.category !== DEFAULT_FILTER.category) {
        params.set('cat', filter.category);
      }

      if (filter.query !== DEFAULT_FILTER.query) {
        params.set('q', filter.query);
      }

      const query = params.toString();
      return query === '' ? '#/' : `#/?${query}`;
    }
    case 'repo':
      return `#${MAZE_PREFIXES.repo}${encodePath(route.path)}`;
    case 'mine':
      return `#${MAZE_PREFIXES.mine}${encodeURIComponent(route.id)}`;
    case 'folder':
      return `#${MAZE_PREFIXES.folder}${encodePath(route.file)}`;
    default:
      return `#${MAZE_PREFIXES.link}${encodeURIComponent(route.code)}`;
  }
}
