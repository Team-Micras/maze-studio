/**
 * A small promise wrapper over the app's IndexedDB database, with its three stores:
 *
 * - `repo-files`: the repository's maze files fetched from GitHub, by path;
 * - `mine`: the user's own mazes, by id;
 * - `settings`: single values by key, such as the cached repository's commit and the handle of a
 *   local folder.
 *
 * @module
 */

/** The stores of the database. */
export type StoreName = 'repo-files' | 'mine' | 'settings';

/** The writes of one transaction of {@link Database.write}. */
export interface StoreWriter {
  /** Writes `value`, at `key` for the `settings` store, at its own key for the others. */
  put(store: StoreName, value: unknown, key?: string): void;
  /** Deletes every value of a store. */
  clear(store: StoreName): void;
}

/** The database's name in the browser. */
export const DATABASE_NAME = 'maze-studio';

const SCHEMA_VERSION = 1;

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB request failed'))
    );
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    );
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    );
  });
}

/** The open database. */
export class Database {
  readonly #database: IDBDatabase;

  constructor(database: IDBDatabase) {
    this.#database = database;
  }

  /** The value at `key`, if there is one. */
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const transaction = this.#database.transaction(store, 'readonly');
    return result<T | undefined>(transaction.objectStore(store).get(key));
  }

  /** Every value of a store, in key order. */
  async getAll<T>(store: StoreName): Promise<T[]> {
    const transaction = this.#database.transaction(store, 'readonly');
    return result<T[]>(transaction.objectStore(store).getAll());
  }

  /** Writes `value`, at `key` for the `settings` store, at its own key for the others. */
  async put(store: StoreName, value: unknown, key?: string): Promise<void> {
    const transaction = this.#database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    await finished(transaction);
  }

  /** Deletes the value at `key`. */
  async delete(store: StoreName, key: string): Promise<void> {
    const transaction = this.#database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(key);
    await finished(transaction);
  }

  /**
   * Writes to several stores in one transaction, all or nothing: if `run` throws, nothing it
   * wrote is kept.
   *
   * @param run Makes the writes; it may not wait on anything else.
   */
  async write(stores: readonly StoreName[], run: (writer: StoreWriter) => void): Promise<void> {
    const transaction = this.#database.transaction([...stores], 'readwrite');
    const done = finished(transaction);

    try {
      run({
        put: (store, value, key) => {
          transaction.objectStore(store).put(value, key);
        },
        clear: (store) => {
          transaction.objectStore(store).clear();
        },
      });
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }

    await done;
  }

  /**
   * Reads the value at `key` and writes what `change` makes of it, in one transaction, so no
   * other tab writes in between. When `change` returns `undefined`, nothing is written.
   *
   * @returns What `change` returned.
   */
  async update<T, R extends T | undefined>(
    store: StoreName,
    key: string,
    change: (current: T | undefined) => R
  ): Promise<R> {
    const transaction = this.#database.transaction(store, 'readwrite');
    const objects = transaction.objectStore(store);
    const next = change(await result<T | undefined>(objects.get(key)));

    if (next !== undefined) {
      objects.put(next);
    }

    await finished(transaction);
    return next;
  }

  /** Closes the connection. */
  close(): void {
    this.#database.close();
  }
}

/**
 * Opens the database, creating its stores the first time.
 *
 * @param name The database's name; another one keeps tests apart.
 * @param factory `indexedDB`, unless given.
 */
export async function openDatabase(
  name: string = DATABASE_NAME,
  factory: IDBFactory = indexedDB
): Promise<Database> {
  const request = factory.open(name, SCHEMA_VERSION);
  request.addEventListener('upgradeneeded', () => {
    const database = request.result;

    if (!database.objectStoreNames.contains('repo-files')) {
      database.createObjectStore('repo-files', { keyPath: 'path' });
    }

    if (!database.objectStoreNames.contains('mine')) {
      database.createObjectStore('mine', { keyPath: 'id' });
    }

    if (!database.objectStoreNames.contains('settings')) {
      database.createObjectStore('settings');
    }
  });

  return new Database(await result(request));
}
