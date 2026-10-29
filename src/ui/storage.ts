/**
 * The browser storage the app runs on, opened once: the repository's cache, My mazes and the settings. When the
 * browser gives no IndexedDB, as some private windows do, there is none, and the library shows
 * the built-in snapshot alone.
 *
 * @module
 */

import {
  DATABASE_NAME,
  loadSnapshot,
  MineLibrary,
  openDatabase,
  RepoCache,
  Settings,
  type FolderHandle,
} from '@/library';

/** The app's stores. */
export interface AppStorage {
  readonly repo: RepoCache;
  readonly mine: MineLibrary;
  /** The handle of the local folder. */
  readonly settings: Settings<FolderHandle>;
}

let opened: Promise<AppStorage | undefined> | undefined;

async function open(): Promise<AppStorage | undefined> {
  try {
    const database = await openDatabase(DATABASE_NAME);
    return {
      repo: new RepoCache(database, { snapshot: loadSnapshot }),
      mine: new MineLibrary(database),
      settings: new Settings<FolderHandle>(database),
    };
  } catch {
    return undefined;
  }
}

/** The app's storage, opened on first use, or `undefined` when the browser has none. */
export function appStorage(): Promise<AppStorage | undefined> {
  opened ??= open();
  return opened;
}
