/**
 * What the app keeps between visits in the database's `settings` store: the handle of the local
 * folder the user picked and the generator's last settings.
 *
 * @module
 */

import type { Database } from './database';

const FOLDER = 'folder-handle';

const GENERATOR = 'generator';

/**
 * The generator's settings of the last run on this device and the preset they started from, kept
 * as data: the interface checks them with the generator's own checks before using them.
 */
export interface SavedGenerator {
  readonly preset: string;
  readonly settings: object;
}

/**
 * The user's local folder and the generator's settings. `Folder` is what the folder is kept as: a `FileSystemDirectoryHandle`
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

  /** The generator's settings of the last run, if any were kept. */
  generator(): Promise<SavedGenerator | undefined> {
    return this.#database.get<SavedGenerator>('settings', GENERATOR);
  }

  /** Keeps the generator's settings for the next visit. */
  async saveGenerator(saved: SavedGenerator): Promise<void> {
    await this.#database.put('settings', saved, GENERATOR);
  }
}
