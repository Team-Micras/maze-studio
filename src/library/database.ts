/**
 * A small promise wrapper over the app's IndexedDB database, with its three stores:
 *
 * - `repo-files`: the repository's maze files fetched from GitHub, by path;
 * - `mine`: the user's own mazes, by id;
 * - `settings`: single values by key, such as the cached repository's commit.
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

/** A record {@link Database.readable} left out: its key, what it holds if it read, and why. */
export interface SkippedRecord {
  readonly key: IDBValidKey;
  readonly value?: unknown;
  readonly reason: string;
}

/** What {@link Database.readable} read: the values it accepted and the records it left out. */
export interface ReadableRecords<T> {
  readonly values: T[];
  readonly skipped: readonly SkippedRecord[];
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

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/**
 * The database. Its connection reopens on the next use once closed, by {@link Database.close} or
 * by the browser, so a page frozen in the background can let go of it.
 */
export class Database {
  #connection: Promise<IDBDatabase> | undefined;
  readonly #reopen: () => Promise<IDBDatabase>;

  private constructor(reopen: () => Promise<IDBDatabase>) {
    this.#reopen = reopen;
  }

  /** A database on the connections `reopen` opens, once the first is open. */
  static async open(reopen: () => Promise<IDBDatabase>): Promise<Database> {
    const database = new Database(reopen);
    await database.#open();
    return database;
  }

  #held(connection: Promise<IDBDatabase>): Promise<IDBDatabase> {
    const held = connection.then(
      (database) => {
        database.addEventListener('close', () => {
          if (this.#connection === held) {
            this.#connection = undefined;
          }
        });
        return database;
      },
      (error: unknown) => {
        if (this.#connection === held) {
          this.#connection = undefined;
        }

        throw error;
      }
    );
    return held;
  }

  #open(): Promise<IDBDatabase> {
    this.#connection ??= this.#held(this.#reopen());
    return this.#connection;
  }

  /** The value at `key`, if there is one. */
  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const transaction = (await this.#open()).transaction(store, 'readonly');
    return result<T | undefined>(transaction.objectStore(store).get(key));
  }

  /** Every value of a store, in key order. */
  async getAll<T>(store: StoreName): Promise<T[]> {
    const transaction = (await this.#open()).transaction(store, 'readonly');
    return result<T[]>(transaction.objectStore(store).getAll());
  }

  /**
   * Every value of a store that `valid` accepts, in key order, and the records left out. When the
   * browser cannot read the store at once, the values are read one by one, so one it cannot read is
   * left out instead of failing them all. Each record left out is reported with `console.warn`.
   */
  async readable<T>(
    store: StoreName,
    valid: (value: unknown) => value is T
  ): Promise<ReadableRecords<T>> {
    const objects = (await this.#open()).transaction(store, 'readonly').objectStore(store);
    const [keys, all] = await Promise.allSettled([
      result(objects.getAllKeys()),
      result<unknown[]>(objects.getAll()),
    ]);

    if (keys.status === 'rejected') {
      throw keys.reason;
    }

    if (all.status === 'rejected') {
      console.warn(`Could not read the ${store} store at once, reading it one by one`, all.reason);
    }

    const reads =
      all.status === 'fulfilled'
        ? all.value.map((value): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value }))
        : await Promise.allSettled(keys.value.map((key) => this.get<unknown>(store, key)));
    const values: T[] = [];
    const skipped: SkippedRecord[] = [];
    reads.forEach((read, index) => {
      const key = keys.value[index] ?? index;

      if (read.status === 'rejected') {
        skipped.push({ key, reason: reasonOf(read.reason) });
      } else if (valid(read.value)) {
        values.push(read.value);
      } else {
        skipped.push({ key, value: read.value, reason: 'the stored record is malformed' });
      }
    });
    skipped.forEach((record) => console.warn(`Skipped a record of ${store}`, record));

    return { values, skipped };
  }

  /** Writes `value`, at `key` for the `settings` store, at its own key for the others. */
  async put(store: StoreName, value: unknown, key?: string): Promise<void> {
    const transaction = (await this.#open()).transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    await finished(transaction);
  }

  /** Deletes the value at `key`. */
  async delete(store: StoreName, key: string): Promise<void> {
    const transaction = (await this.#open()).transaction(store, 'readwrite');
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
    const transaction = (await this.#open()).transaction([...stores], 'readwrite');
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
    const transaction = (await this.#open()).transaction(store, 'readwrite');
    const objects = transaction.objectStore(store);
    const next = change(await result<T | undefined>(objects.get(key)));

    if (next !== undefined) {
      objects.put(next);
    }

    await finished(transaction);
    return next;
  }

  /** Closes the connection; the next use opens another. */
  close(): void {
    void this.#connection?.then((database) => database.close()).catch(() => undefined);
    this.#connection = undefined;
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
  return Database.open(() => connect(name, factory));
}

function connect(name: string, factory: IDBFactory): Promise<IDBDatabase> {
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

  return result(request);
}
