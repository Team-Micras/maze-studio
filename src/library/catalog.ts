/**
 * The catalog: one entry per maze the library lists, from the repository or from Mine, with what
 * search and filters need.
 *
 * @module
 */

import { decodeMazeCode, type Profile } from '@/maze';

import { mazeOrigin } from './maze-names';
import type { MineMaze } from './mine';
import type { RepoFile } from './snapshot';

/** One maze in the library. */
export interface CatalogEntry {
  /** Unique across both origins: `repo:<path>` or `mine:<id>`. */
  readonly key: string;
  readonly origin: 'repo' | 'mine';
  /** The file name without folder and `.txt` for the repository; the name given for Mine. */
  readonly name: string;
  /** The repository folder, or the profile of an item of Mine. */
  readonly category: string;
  readonly width: number;
  readonly height: number;
  readonly competition?: string;
  readonly year?: number;
  /** The path in the repository, for a repository maze, or the one an item of Mine came from. */
  readonly path?: string;
  /** The id of an item of Mine. */
  readonly id?: string;
}

function stemOf(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.txt$/, '');
}

/** The entries of the repository's files, in path order; a file whose code does not read is left out. */
export function repoCatalog(files: readonly RepoFile[]): CatalogEntry[] {
  return files.flatMap((file) => {
    const decoded = decodeMazeCode(file.code);

    if (!decoded.ok) {
      return [];
    }

    const name = stemOf(file.path);
    return [
      {
        key: `repo:${file.path}`,
        origin: 'repo',
        name,
        category: file.path.split('/')[0] ?? '',
        width: decoded.value.maze.width,
        height: decoded.value.maze.height,
        path: file.path,
        ...mazeOrigin(name),
      },
    ];
  });
}

/** The entries of Mine, in the order given; an item whose code does not read is left out. */
export function mineCatalog(items: readonly MineMaze[]): CatalogEntry[] {
  return items.flatMap((item) => {
    const decoded = decodeMazeCode(item.code);
    const category: Profile = item.profile;

    return decoded.ok
      ? [
          {
            key: `mine:${item.id}`,
            origin: 'mine',
            name: item.name,
            category,
            width: decoded.value.maze.width,
            height: decoded.value.maze.height,
            id: item.id,
            ...(item.origin === undefined ? {} : { path: item.origin.path }),
          },
        ]
      : [];
  });
}
