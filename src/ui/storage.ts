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
} from '@/library';

/** The app's stores. */
export interface AppStorage {
  readonly repo: RepoCache;
  readonly mine: MineLibrary;
  readonly settings: Settings;
}

let opened: Promise<AppStorage | undefined> | undefined;

async function open(): Promise<AppStorage | undefined> {
  try {
    const database = await openDatabase(DATABASE_NAME);
    const settings = new Settings(database);
    void settings.forgetFolder().catch(() => undefined);
    return {
      repo: new RepoCache(database, { snapshot: loadSnapshot }),
      mine: new MineLibrary(database),
      settings,
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
