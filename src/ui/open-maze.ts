/**
 * Which maze a route opens, from the library or from the route itself.
 *
 * @module
 */

import type { CatalogEntry } from '@/library';
import { decodeMazeCode, type Maze } from '@/maze';

import { categoryLabel, sizeLabel } from './labels';
import type { Library } from './library/use-library';
import type { Route } from './routes';

/** The largest `.txt` file the app opens, 1 MiB: a 64×64 maze is under 40 kB. */
export const MAX_FILE_BYTES = 1024 * 1024;

/** A maze open on screen, its name and the line under it (DESIGN.md 9.2). */
export interface OpenMaze {
  /** What tells it apart: its catalog key, or `link:<code>` and `file:<n>`. */
  readonly key: string;
  readonly maze: Maze;
  readonly name: string;
  readonly detail: string;
}

/** What a route opens: nothing yet, a maze, or nothing at all and why. */
export type Opening =
  | { readonly status: 'waiting' }
  | { readonly status: 'open'; readonly open: OpenMaze }
  | { readonly status: 'missing'; readonly message: string };

const WAITING: Opening = { status: 'waiting' };

/** The maze `route` opens; a route of the library opens none. */
export function openingOf(route: Route, library: Library | undefined): Opening {
  switch (route.kind) {
    case 'library':
      return { status: 'missing', message: '' };
    case 'link': {
      const decoded = decodeMazeCode(route.code);
      return decoded.ok
        ? {
            status: 'open',
            open: {
              key: `link:${route.code}`,
              maze: decoded.value.maze,
              name: decoded.value.name === '' ? 'Shared maze' : decoded.value.name,
              detail: 'Opened from a link',
            },
          }
        : {
            status: 'missing',
            message: `That link does not hold a maze (${decoded.error.message})`,
          };
    }
    case 'folder':
      return { status: 'missing', message: 'Folders open from the library' };
    default:
      break;
  }

  if (library === undefined) {
    return WAITING;
  }

  const key = route.kind === 'repo' ? `repo:${route.path}` : `mine:${route.id}`;
  const entry = library.entries.find((candidate) => candidate.key === key);
  const maze = library.mazeOf(key);

  if (entry === undefined || maze === undefined) {
    return {
      status: 'missing',
      message:
        route.kind === 'repo' ? `No maze at ${route.path}` : 'That maze is no longer in Mine',
    };
  }

  return { status: 'open', open: openEntry(entry, maze) };
}

/** A catalog entry open on screen, with the line DESIGN.md 9.2 gives it. */
export function openEntry(entry: CatalogEntry, maze: Maze): OpenMaze {
  return {
    key: entry.key,
    maze,
    name: entry.name,
    detail:
      entry.origin === 'mine'
        ? 'Saved in Mine'
        : `${categoryLabel(entry.category)}, ${sizeLabel(entry.width, entry.height)}`,
  };
}
