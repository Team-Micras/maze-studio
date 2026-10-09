import { useEffect, useState } from 'react';

import {
  loadSnapshot,
  mineCatalog,
  repoCatalog,
  SearchIndex,
  type CatalogEntry,
  type MineMaze,
  type RepoFile,
} from '@/library';
import { decodeMazeCode, profileOfPath, type Maze } from '@/maze';
import type { MazeDocument } from '@/ui/open-maze';
import { appStorage } from '@/ui/storage';

/** Fired on `window` when this tab writes to Mine, which other tabs learn through Mine itself. */
const MINE_WRITTEN = 'maze-studio:mine-written';

/** Has every library of this tab load again, after this tab wrote to Mine. */
export function reloadLibrary(): void {
  window.dispatchEvent(new Event(MINE_WRITTEN));
}

/** Everything the library shows, once loaded. */
export interface Library {
  /** The repository's entries in path order, then Mine's. */
  readonly entries: readonly CatalogEntry[];
  readonly index: SearchIndex;
  /** The repository commit the entries come from. */
  readonly commit: string;
  readonly repoCount: number;
  readonly mineCount: number;
  /** The maze of an entry, decoded on first use. */
  readonly mazeOf: (key: string) => Maze | undefined;
  /** What the maze of an entry carries besides its walls, decoded on first use. */
  readonly documentOf: (key: string) => MazeDocument | undefined;
}

interface Stored {
  readonly code: string;
  readonly document: Omit<MazeDocument, 'trailer'>;
}

interface Decoded {
  readonly maze: Maze;
  readonly document: MazeDocument;
}

function library(commit: string, files: readonly RepoFile[], mine: readonly MineMaze[]): Library {
  const repoEntries = repoCatalog(files);
  const mineEntries = mineCatalog(mine);
  const entries = [...repoEntries, ...mineEntries];
  const stored = new Map<string, Stored>([
    ...files.map((file): [string, Stored] => [
      `repo:${file.path}`,
      {
        code: file.code,
        document: { profile: profileOfPath(file.path), origin: { path: file.path, sha: file.sha } },
      },
    ]),
    ...mine.map((item): [string, Stored] => [
      `mine:${item.id}`,
      {
        code: item.code,
        document: {
          profile: item.profile,
          mine: { id: item.id, version: item.version },
          ...(item.origin === undefined ? {} : { origin: item.origin }),
        },
      },
    ]),
  ]);
  const decoded = new Map<string, Decoded>();
  const decode = (key: string): Decoded | undefined => {
    const known = decoded.get(key);

    if (known !== undefined) {
      return known;
    }

    const item = stored.get(key);
    const result = item === undefined ? undefined : decodeMazeCode(item.code);

    if (item === undefined || result?.ok !== true) {
      return undefined;
    }

    const fresh = {
      maze: result.value.maze,
      document: { ...item.document, trailer: result.value.trailer },
    };
    decoded.set(key, fresh);
    return fresh;
  };

  return {
    entries,
    index: new SearchIndex(entries),
    commit,
    repoCount: repoEntries.length,
    mineCount: mineEntries.length,
    mazeOf: (key) => decode(key)?.maze,
    documentOf: (key) => decode(key)?.document,
  };
}

async function loadLibrary(): Promise<Library> {
  const storage = await appStorage();

  if (storage === undefined) {
    const snapshot = await loadSnapshot();
    return library(snapshot.commit, snapshot.files, []);
  }

  const [copy, mine] = await Promise.all([storage.repo.current(), storage.mine.list()]);
  return library(copy.commit, copy.files, mine);
}

/**
 * The library, or `undefined` while it loads. It loads again when another tab writes to Mine, or
 * when this one says it did with {@link reloadLibrary}.
 */
export function useLibrary(): Library | undefined {
  const [loaded, setLoaded] = useState<Library | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    const load = (): void => {
      void loadLibrary().then((next) => {
        if (current) {
          setLoaded(next);
        }
      });
    };

    load();
    window.addEventListener(MINE_WRITTEN, load);
    void appStorage().then((storage) => {
      if (current && storage !== undefined) {
        unsubscribe = storage.mine.subscribe(load);
      }
    });

    return () => {
      current = false;
      window.removeEventListener(MINE_WRITTEN, load);
      unsubscribe?.();
    };
  }, []);

  return loaded;
}
