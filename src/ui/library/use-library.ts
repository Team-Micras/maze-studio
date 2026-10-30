import { useEffect, useMemo, useState } from 'react';

import {
  loadSnapshot,
  mineCatalog,
  repoCatalog,
  keyOf,
  mineKey,
  SearchIndex,
  type CatalogEntry,
  type MineMaze,
  type RepoFile,
} from '@/library';
import { decodeMazeCode, profileOfPath, type Maze } from '@/maze';
import type { MazeDocument } from '@/ui/open-maze';
import { appStorage } from '@/ui/storage';

/** Fired on `window` when this tab writes to My mazes, which other tabs learn through My mazes itself. */
const MINE_WRITTEN = 'maze-studio:mine-written';

/** How long the first load may take before the library says it failed; a late load still replaces that. */
const LOAD_TIMEOUT_MS = 10_000;

/** Has every library of this tab load again, after this tab wrote to My mazes. */
export function reloadLibrary(): void {
  window.dispatchEvent(new Event(MINE_WRITTEN));
}

/** Everything the library shows, once loaded. */
export interface Library {
  /** The repository's entries in path order, then My mazes'. */
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

/** What the library is built from: the repository's files and My mazes. */
interface Loaded {
  readonly commit: string;
  readonly files: readonly RepoFile[];
  readonly mine: readonly MineMaze[];
}

function library({ commit, files, mine }: Loaded): Library {
  const repoEntries = repoCatalog(files);
  const mineEntries = mineCatalog(mine);
  const entries = [...repoEntries, ...mineEntries];
  const stored = new Map<string, Stored>([
    ...files.map((file): [string, Stored] => [
      keyOf({ kind: 'repo', path: file.path }),
      {
        code: file.code,
        document: {
          profile: profileOfPath(file.path),
          origin: { path: file.path, sha: file.sha },
          source: { fileName: file.path, irregularities: [], hadCR: false, hadFinalNewline: true },
        },
      },
    ]),
    ...mine.map((item): [string, Stored] => [
      mineKey(item.id),
      {
        code: item.code,
        document: {
          profile: item.profile,
          mine: { id: item.id, version: item.version },
          origin: item.origin,
          recipe: item.recipe,
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

async function loadLibrary(): Promise<Loaded> {
  const storage = await appStorage();

  if (storage === undefined) {
    const snapshot = await loadSnapshot();
    return { commit: snapshot.commit, files: snapshot.files, mine: [] };
  }

  const [copy, mine] = await Promise.all([storage.repo.current(), storage.mine.list()]);
  return { commit: copy.commit, files: copy.files, mine };
}

/** The library as {@link useLibrary} gives it. */
export interface LibraryLoad {
  /** The library, or `undefined` while it loads or when it failed to. */
  readonly library: Library | undefined;
  /** Whether the library could not be read; a later failure keeps the library already shown. */
  readonly failed: boolean;
}

/**
 * The library. It loads again when another tab writes to My mazes, or when this one says it did
 * with {@link reloadLibrary}. A load that fails, or that is still pending after
 * {@link LOAD_TIMEOUT_MS}, is logged with `console.error`.
 */
export function useLibrary(): LibraryLoad {
  const [loaded, setLoaded] = useState<Loaded | 'failed' | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    let started = 0;
    let shown = 0;
    const load = (): void => {
      const order = ++started;
      loadLibrary().then(
        (next) => {
          clearTimeout(slow);

          if (current && order > shown) {
            shown = order;
            setLoaded(next);
          }
        },
        (error: unknown) => {
          clearTimeout(slow);
          console.error('The library could not be read', error);

          if (current) {
            setLoaded((previous) => previous ?? 'failed');
          }
        }
      );
    };

    const slow = setTimeout(() => {
      console.error('The library took too long to load');
      setLoaded((previous) => previous ?? 'failed');
    }, LOAD_TIMEOUT_MS);

    load();
    window.addEventListener(MINE_WRITTEN, load);
    void appStorage().then((storage) => {
      if (current && storage !== undefined) {
        unsubscribe = storage.mine.subscribe(load);
      }
    });

    return () => {
      current = false;
      clearTimeout(slow);
      window.removeEventListener(MINE_WRITTEN, load);
      unsubscribe?.();
    };
  }, []);

  return useMemo(
    () => ({
      library: loaded === undefined || loaded === 'failed' ? undefined : library(loaded),
      failed: loaded === 'failed',
    }),
    [loaded]
  );
}
