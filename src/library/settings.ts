/**
 * What the app keeps between visits in the database's `settings` store: the generator's last
 * settings.
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

/** The generator's settings. */
export class Settings {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  /** Deletes the local folder's handle that versions before its removal kept (decisions.md). */
  async forgetFolder(): Promise<void> {
    await this.#database.delete('settings', FOLDER);
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
