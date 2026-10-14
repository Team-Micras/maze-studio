/**
 * The handle of the local folder the user picked, kept between visits in the database's
 * `settings` store.
 *
 * @module
 */

import type { Database } from './database';

const FOLDER = 'folder-handle';

/**
 * The user's local folder. `Folder` is what the folder is kept as: a `FileSystemDirectoryHandle`
 * in the app.
 */
export class Settings<Folder = FileSystemDirectoryHandle> {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
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
