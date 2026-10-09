/**
 * Single values the app keeps between visits, in the database's `settings` store: the user's
 * preferences and the handle of the local folder they picked.
 *
 * @module
 */

import type { Database } from './database';

const PREFERENCES = 'preferences';
const FOLDER = 'folder-handle';

/** The user's preferences, as plain data; each screen owns its own keys. */
export type Preferences = Readonly<Record<string, unknown>>;

/**
 * The user's preferences and local folder. `Folder` is what the folder is kept as: a
 * `FileSystemDirectoryHandle` in the app.
 */
export class Settings<Folder = FileSystemDirectoryHandle> {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  /** The preferences saved, or none. */
  async preferences(): Promise<Preferences> {
    return (await this.#database.get<Preferences>('settings', PREFERENCES)) ?? {};
  }

  /** Saves `changes` over the preferences saved. */
  async savePreferences(changes: Preferences): Promise<void> {
    await this.#database.put(
      'settings',
      { ...(await this.preferences()), ...changes },
      PREFERENCES
    );
  }

  /** The local folder picked last, if any; its permission must be asked for again. */
  folder(): Promise<Folder | undefined> {
    return this.#database.get<Folder>('settings', FOLDER);
  }

  /** Keeps the local folder the user picked, or forgets it with `undefined`. */
  async saveFolder(folder: Folder | undefined): Promise<void> {
    await (folder === undefined
      ? this.#database.delete('settings', FOLDER)
      : this.#database.put('settings', folder, FOLDER));
  }
}
