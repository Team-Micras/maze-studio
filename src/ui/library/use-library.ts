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
import { decodeMazeCode, type Maze } from '@/maze';
import { appStorage } from '@/ui/storage';

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
}

function library(commit: string, files: readonly RepoFile[], mine: readonly MineMaze[]): Library {
  const repoEntries = repoCatalog(files);
  const mineEntries = mineCatalog(mine);
  const entries = [...repoEntries, ...mineEntries];
  const codes = new Map<string, string>([
    ...files.map((file): [string, string] => [`repo:${file.path}`, file.code]),
    ...mine.map((item): [string, string] => [`mine:${item.id}`, item.code]),
  ]);
  const decoded = new Map<string, Maze>();

  return {
    entries,
    index: new SearchIndex(entries),
    commit,
    repoCount: repoEntries.length,
    mineCount: mineEntries.length,
    mazeOf: (key) => {
      const known = decoded.get(key);

      if (known !== undefined) {
        return known;
      }

      const code = codes.get(key);
      const result = code === undefined ? undefined : decodeMazeCode(code);

      if (result?.ok !== true) {
        return undefined;
      }

      decoded.set(key, result.value.maze);
      return result.value.maze;
    },
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
 * The library, or `undefined` while it loads. It loads again when another tab writes to Mine.
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
    void appStorage().then((storage) => {
      if (current && storage !== undefined) {
        unsubscribe = storage.mine.subscribe(load);
      }
    });

    return () => {
      current = false;
      unsubscribe?.();
    };
  }, []);

  return loaded;
}
