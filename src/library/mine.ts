/**
 * "My mazes": the user's own mazes, kept in the browser.
 *
 * Every item has a version that each save raises. A save names the version it was made from; if
 * another tab saved a newer one in between, or removed the item, the save is refused, so the tab
 * that would overwrite newer work turns read-only and says so until it reloads. Every write is
 * announced to the other tabs through a `BroadcastChannel`, so they can refresh their lists and
 * learn early that what they show is out of date.
 *
 * The first write of a session asks the browser to keep the site's storage (`persist()`), so it
 * is not cleared under storage pressure, as Safari does after a week without a visit. If the
 * browser fails to answer, the write goes on and the storage counts as best-effort.
 *
 * @module
 */

import {
  decodeMazeCode,
  encodeMazeCode,
  failure,
  success,
  type Maze,
  type Profile,
  type Result,
} from '@/maze';

import type { Database } from './database';

/** The channel the tabs of the app announce their writes on. */
export const MINE_CHANNEL = 'maze-studio-mine';

/** Where an item of My mazes was copied from, when it came from the repository. */
export interface MineOrigin {
  readonly path: string;
  readonly sha: string;
}

/**
 * How the generator made a maze of My mazes, kept as it gave it: the generator's version, the
 * settings and seed, and the wall hash of what it built, with any other field it adds (the walls,
 * the goal cells). My mazes keeps it as data; the interface reads it back through the generator's
 * own checks before rebuilding anything from it.
 */
export interface MineRecipe {
  readonly version: number;
  readonly seed: number;
  readonly settings: object;
  readonly hash?: string;
}

const PROFILES: readonly Profile[] = ['classic', 'halfsize', 'training', 'free'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Whether `value` is one of the profiles. */
export function isProfile(value: unknown): value is Profile {
  return PROFILES.some((profile) => profile === value);
}

/** Whether `value` has the shape of a {@link MineOrigin}. */
export function isMineOrigin(value: unknown): value is MineOrigin {
  return isRecord(value) && typeof value.path === 'string' && typeof value.sha === 'string';
}

/** Whether `value` has the shape of a {@link MineRecipe}, as a backup's index must give it. */
export function isMineRecipe(value: unknown): value is MineRecipe {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    Number.isInteger(value.version) &&
    'seed' in value &&
    Number.isInteger(value.seed) &&
    'settings' in value &&
    typeof value.settings === 'object' &&
    value.settings !== null &&
    (!('hash' in value) || value.hash === undefined || typeof value.hash === 'string')
  );
}

/** A maze of My mazes, as stored. */
export interface MineMaze {
  readonly id: string;
  readonly name: string;
  /** The compact code of the maze, with the text after its grid and no name. */
  readonly code: string;
  readonly profile: Profile;
  /** When it was created and last saved, in milliseconds since the epoch. */
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 1 when created, raised by each save. */
  readonly version: number;
  readonly origin?: MineOrigin;
  /** How the generator made its walls, while they are the ones it made. */
  readonly recipe?: MineRecipe;
}

/** Whether `value` has the shape of a stored {@link MineMaze}. */
export function isMineMaze(value: unknown): value is MineMaze {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.code === 'string' &&
    isProfile(value.profile) &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt) &&
    Number.isInteger(value.version) &&
    (value.origin === undefined || isMineOrigin(value.origin)) &&
    (value.recipe === undefined || isMineRecipe(value.recipe))
  );
}

/** An item of My mazes that could not be read: its id, its name when it has one, and why. */
export interface UnreadableMine {
  readonly id: string;
  readonly name: string;
  readonly message: string;
}

/** What {@link MineLibrary.read} gives: the items, and those that could not be read. */
export interface MineRead {
  readonly items: MineMaze[];
  readonly unreadable: readonly UnreadableMine[];
}

/** What a new item of My mazes is made of. */
export interface MineDraft {
  readonly name: string;
  readonly maze: Maze;
  readonly trailer?: string;
  readonly profile: Profile;
  readonly origin?: MineOrigin;
  readonly recipe?: MineRecipe;
  /** The creation time, for an item restored from a backup; now, unless given. */
  readonly createdAt?: number;
}

/** What a save changes. */
export interface MineChanges {
  readonly name?: string;
  readonly maze?: Maze;
  readonly trailer?: string;
  readonly profile?: Profile;
  /** The generator's recipe of the walls saved, or `null` when they are no longer the ones it made. */
  readonly recipe?: MineRecipe | null;
}

/** Why a save was refused: another tab saved a newer version, or removed the item. */
export interface SaveConflict {
  readonly reason: 'newer-version' | 'removed';
  /** The item as it now is, when it still exists. */
  readonly current?: MineMaze;
}

/** Whether the browser keeps the site's storage: unknown before the first write. */
export type Persistence = 'unknown' | 'persistent' | 'best-effort';

/** The parts of `navigator.storage` My mazes uses. */
export interface PersistentStorage {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

/** The part of a `BroadcastChannel` My mazes uses. */
export interface NoticeChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** What My mazes runs on; the browser's own by default. */
export interface MineOptions {
  readonly channel?: NoticeChannel;
  readonly storage?: PersistentStorage;
  readonly now?: () => number;
  readonly newId?: () => string;
}

/** The maze and the text after its grid of an item. */
export function mineContent(item: MineMaze): Result<{ maze: Maze; trailer: string }, string> {
  const decoded = decodeMazeCode(item.code);
  return decoded.ok
    ? success({ maze: decoded.value.maze, trailer: decoded.value.trailer })
    : failure(decoded.error.message);
}

function changedCode(current: MineMaze, changes: MineChanges): string {
  if (changes.maze === undefined && changes.trailer === undefined) {
    return current.code;
  }

  const stored = mineContent(current);
  const maze = changes.maze ?? (stored.ok ? stored.value.maze : undefined);

  if (maze === undefined) {
    throw new TypeError(
      `the stored maze of ${current.id} cannot be read, so only a new maze can replace it`
    );
  }

  return encodeMazeCode(maze, {
    trailer: changes.trailer ?? (stored.ok ? stored.value.trailer : ''),
  });
}

/** The user's own mazes. */
export class MineLibrary {
  readonly #database: Database;
  readonly #channel: NoticeChannel;
  readonly #storage: PersistentStorage | undefined;
  readonly #now: () => number;
  readonly #newId: () => string;
  #persistence: Persistence = 'unknown';

  constructor(database: Database, options: MineOptions = {}) {
    this.#database = database;
    this.#channel = options.channel ?? new BroadcastChannel(MINE_CHANNEL);
    this.#storage =
      options.storage ?? (typeof navigator === 'undefined' ? undefined : navigator.storage);
    this.#now = options.now ?? Date.now;
    this.#newId = options.newId ?? (() => crypto.randomUUID());
  }

  /** Whether the browser keeps the site's storage, as learned at the first write. */
  get persistence(): Persistence {
    return this.#persistence;
  }

  /** Every item, the most recently saved first; one that cannot be read is left out and reported. */
  async list(): Promise<MineMaze[]> {
    return (await this.read()).items;
  }

  /** Every item, the most recently saved first, and those that could not be read, with why. */
  async read(): Promise<MineRead> {
    const { values, skipped } = await this.#database.readable('mine', isMineMaze);
    return {
      items: values.toSorted((left, right) => right.updatedAt - left.updatedAt),
      unreadable: skipped.map(({ key, value, reason }) => {
        const id = typeof key === 'string' ? key : JSON.stringify(key);
        const name = isRecord(value) && typeof value.name === 'string' ? value.name : id;
        return { id, name, message: reason };
      }),
    };
  }

  /** The item with `id`, if there is one. */
  get(id: string): Promise<MineMaze | undefined> {
    return this.#database.get<MineMaze>('mine', id);
  }

  /**
   * Stores a new item, at version 1.
   *
   * @throws {RangeError} When the trailer is too long for the compact code.
   */
  async create(draft: MineDraft): Promise<MineMaze> {
    await this.#persist();
    const now = this.#now();
    const item: MineMaze = {
      id: this.#newId(),
      name: draft.name,
      code: encodeMazeCode(draft.maze, { trailer: draft.trailer ?? '' }),
      profile: draft.profile,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      version: 1,
      origin: draft.origin,
      ...(draft.recipe === undefined ? {} : { recipe: draft.recipe }),
    };
    await this.#database.put('mine', item);
    this.#announce();
    return item;
  }

  /**
   * Saves `changes` over the item, if it is still at `baseVersion`.
   *
   * @returns The saved item, or why the save was refused.
   * @throws {RangeError} When the trailer is too long for the compact code.
   */
  async save(
    id: string,
    changes: MineChanges,
    baseVersion: number
  ): Promise<Result<MineMaze, SaveConflict>> {
    await this.#persist();
    let conflict: SaveConflict | undefined;
    const saved = await this.#database.update<MineMaze, MineMaze | undefined>(
      'mine',
      id,
      (current) => {
        if (current === undefined || current.version !== baseVersion) {
          conflict =
            current === undefined ? { reason: 'removed' } : { reason: 'newer-version', current };
          return undefined;
        }

        return this.#changed(current, changes);
      }
    );

    if (saved === undefined) {
      return failure(conflict ?? { reason: 'removed' });
    }

    this.#announce();
    return success(saved);
  }

  /** Removes the item, if there is one. */
  async remove(id: string): Promise<void> {
    await this.#database.delete('mine', id);
    this.#announce();
  }

  /**
   * Calls `listener` for each write another tab announces.
   *
   * @returns What stops listening.
   */
  subscribe(listener: () => void): () => void {
    const receive = () => listener();
    this.#channel.addEventListener('message', receive);
    return () => this.#channel.removeEventListener('message', receive);
  }

  /** Stops announcing and listening. */
  close(): void {
    this.#channel.close();
  }

  #changed(current: MineMaze, changes: MineChanges): MineMaze {
    const next: MineMaze = {
      ...current,
      name: changes.name ?? current.name,
      profile: changes.profile ?? current.profile,
      code: changedCode(current, changes),
      updatedAt: this.#now(),
      version: current.version + 1,
      ...(changes.recipe ? { recipe: changes.recipe } : {}),
    };

    if (changes.recipe === null) {
      Reflect.deleteProperty(next, 'recipe');
    }

    return next;
  }

  #announce(): void {
    this.#channel.postMessage(null);
  }

  async #persist(): Promise<void> {
    if (this.#persistence !== 'unknown' || this.#storage === undefined) {
      return;
    }

    try {
      const kept = (await this.#storage.persisted()) || (await this.#storage.persist());
      this.#persistence = kept ? 'persistent' : 'best-effort';
    } catch {
      this.#persistence = 'best-effort';
    }
  }
}
