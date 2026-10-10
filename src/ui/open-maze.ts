/**
 * Which maze a route opens, from the library or from the route itself.
 *
 * @module
 */

import type { CatalogEntry, MineOrigin } from '@/library';
import { decodeMazeCode, type Maze, type MazeTextSource, type Profile } from '@/maze';

import { categoryLabel, sizeLabel } from './labels';
import type { Library } from './library/use-library';
import type { Route } from './routes';

/** The largest `.txt` file the app opens, 1 MiB: a 64×64 maze is under 40 kB. */
export const MAX_FILE_BYTES = 1024 * 1024;

/** The item of Mine a maze is, and the version on screen. */
export interface MineCopy {
  readonly id: string;
  readonly version: number;
}

/** What a maze carries besides its walls, which a copy in Mine keeps (PLAN.md 3.1). */
export interface MazeDocument {
  /** The text after the grid. */
  readonly trailer: string;
  /** The rules it is checked by: the repository folder's, Mine's own, or free. */
  readonly profile: Profile;
  /** The repository file it is or was copied from. */
  readonly origin?: MineOrigin;
  /** The item of Mine it is, when it is one. */
  readonly mine?: MineCopy;
  /** The file it was read from, for the rules of the file, while it is unchanged. */
  readonly source?: MazeTextSource;
  /** Whether it was made in the app, so that its copy in Mine keeps its name. */
  readonly created?: boolean;
}

/** A maze open on screen, its name and the line under it (DESIGN.md 9.2). */
export interface OpenMaze {
  /** What tells it apart: its catalog key, or `link:<code>` and `file:<n>`. */
  readonly key: string;
  readonly maze: Maze;
  readonly name: string;
  readonly detail: string;
  readonly document: MazeDocument;
}

/** The document of a maze that comes from nowhere in particular, as a link or a file. */
export function looseDocument(trailer = ''): MazeDocument {
  return { trailer, profile: 'free' };
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
              document: looseDocument(decoded.value.trailer),
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

  const key = mazeKeyOf(route);
  const entry = library.entries.find((candidate) => candidate.key === key);
  const open = entry === undefined ? undefined : openEntry(entry, library);

  if (open === undefined) {
    return {
      status: 'missing',
      message:
        route.kind === 'repo' ? `No maze at ${route.path}` : 'That maze is no longer in Mine',
    };
  }

  return { status: 'open', open };
}

/**
 * A catalog entry open on screen, with the line DESIGN.md 9.2 gives it, or `undefined` when its
 * maze does not read.
 */
export function openEntry(entry: CatalogEntry, library: Library): OpenMaze | undefined {
  const maze = library.mazeOf(entry.key);
  const document = library.documentOf(entry.key);

  if (maze === undefined || document === undefined) {
    return undefined;
  }

  return {
    key: entry.key,
    maze,
    name: entry.name,
    detail:
      entry.origin === 'mine'
        ? 'Saved in Mine'
        : `${categoryLabel(entry.category)}, ${sizeLabel(entry.width, entry.height)}`,
    document,
  };
}

/** The key of the maze `route` opens, as {@link OpenMaze.key} has it; none for the library. */
export function mazeKeyOf(route: Route): string | undefined {
  switch (route.kind) {
    case 'library':
      return undefined;
    case 'repo':
      return `repo:${route.path}`;
    case 'mine':
      return `mine:${route.id}`;
    case 'folder':
      return `folder:${route.file}`;
    default:
      return `link:${route.code}`;
  }
}

/** The route of the maze a key names, as {@link mazeKeyOf} makes them; none for a file or a new maze. */
export function routeOfKey(key: string): Route | undefined {
  const [kind = '', ...rest] = key.split(':');
  const value = rest.join(':');

  switch (kind) {
    case 'repo':
      return { kind: 'repo', path: value };
    case 'mine':
      return { kind: 'mine', id: value };
    case 'folder':
      return { kind: 'folder', file: value };
    case 'link':
      return { kind: 'link', code: value };
    default:
      return undefined;
  }
}
