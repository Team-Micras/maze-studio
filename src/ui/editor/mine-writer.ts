/**
 * Autosave (PLAN.md 3.4): the first edit of a maze that is not in My mazes copies it there, and every
 * gesture after that saves the item. One write runs at a time and the latest state wins, so a
 * burst of gestures makes at most one more write.
 *
 * @module
 */

import { uniqueName, type MineLibrary } from '@/library';
import { mazesEqual, type Maze, type Profile } from '@/maze';
import type { MineCopy, OpenMaze } from '@/ui/open-maze';

import { copyName, needsCopy, sessionRecipe, type EditSession } from './edit-session';

/** The item of My mazes a session writes to, with its name. */
export type NamedCopy = MineCopy & { readonly name: string };

/** What the writer tells the editor, naming each session by the maze it opened on. */
export interface MineWriterEvents {
  /** The maze `opened` now has its copy in My mazes, holding `written`. */
  readonly copied: (opened: OpenMaze, copy: NamedCopy, written: Written) => void;
  /** The item of `opened`'s session was saved. */
  readonly saved: (opened: OpenMaze, copy: NamedCopy) => void;
  /** Another tab saved the item, or removed it, since this one read it: nothing more is written. */
  readonly refused: (opened: OpenMaze) => void;
  /** The browser failed to write; the next change tries again. */
  readonly failed: (error: unknown) => void;
}

/** What a session last wrote. */
export interface Written {
  readonly maze: Maze;
  readonly profile: Profile;
}

/** What the writer needs of My mazes. */
export type MineStore = Pick<MineLibrary, 'list' | 'create' | 'save'>;

/**
 * Writes the sessions of the editor to My mazes, one write at a time. Each maze keeps its latest
 * session waiting, so leaving a maze while a write runs never drops its last change. What the
 * writer learns, the copy and the maze last written, belongs to one session, the one that opened
 * on a maze; the last version this tab wrote of each item outlives the sessions, so a session that
 * opened on an older copy of the library, as right after leaving the maze, is not refused.
 */
export class MineWriter {
  readonly #mine: () => Promise<MineStore | undefined>;
  readonly #events: MineWriterEvents;
  readonly #copies = new WeakMap<OpenMaze, NamedCopy>();
  readonly #versions = new Map<string, number>();
  readonly #written = new WeakMap<OpenMaze, Written>();
  readonly #refused = new WeakSet<OpenMaze>();
  readonly #copying = new WeakMap<OpenMaze, Promise<void>>();
  readonly #copiesOnTheirWay = new Set<Promise<void>>();
  readonly #waiting = new Map<OpenMaze, EditSession>();
  #draining: Promise<void> | undefined;

  constructor(mine: () => Promise<MineStore | undefined>, events: MineWriterEvents) {
    this.#mine = mine;
    this.#events = events;
  }

  /** Writes `session` once the writes before it are done, unless a newer one of its maze comes first. */
  write(session: EditSession): void {
    this.#waiting.delete(session.opened);
    this.#waiting.set(session.opened, session);
    this.#draining ??= this.#drain();
  }

  /**
   * Copies `session`'s maze to My mazes under its own name, edited or not, as Save to My mazes does for a
   * link or a file; nothing happens once it has a copy, and a copy on its way is the one. The copy
   * is registered at once, so an edit written meanwhile waits for it and saves into it.
   */
  saveToMine(session: EditSession): Promise<void> {
    if (this.#copies.get(session.opened) !== undefined || session.mine !== undefined) {
      return Promise.resolve();
    }

    return this.#copyOnce(session, true);
  }

  /**
   * Renames `session`'s item of My mazes on the version this tab knows.
   *
   * @returns Whether My mazes took the name; another tab's newer save refuses it.
   */
  async rename(session: EditSession, name: string): Promise<boolean> {
    await this.idle();
    const { opened } = session;
    const copy = this.#copies.get(opened) ?? session.mine;
    const mine = await this.#mine();

    if (copy === undefined || mine === undefined) {
      return false;
    }

    const version = Math.max(copy.version, this.#versions.get(copy.id) ?? 0);
    const result = await mine.save(copy.id, { name }, version);

    if (!result.ok) {
      return false;
    }

    const renamed = { ...copy, name, version: result.value.version };
    this.#copies.set(opened, renamed);
    this.#versions.set(renamed.id, renamed.version);
    this.#events.saved(opened, renamed);
    return true;
  }

  /** The version of item `id` this tab saved last, if it saved one. */
  savedVersion(id: string): number | undefined {
    return this.#versions.get(id);
  }

  /**
   * Resolves once every session asked has been written and every copy asked has been made, or has
   * failed to be, including those asked while it waits.
   */
  async idle(): Promise<void> {
    if (this.#draining === undefined && this.#copiesOnTheirWay.size === 0) {
      return;
    }

    await Promise.allSettled([this.#draining, ...this.#copiesOnTheirWay]);
    await this.idle();
  }

  async #drain(): Promise<void> {
    const next = this.#next();

    if (next === undefined) {
      this.#draining = undefined;
      return;
    }

    try {
      await this.#writeOne(next);
    } catch (error) {
      this.#events.failed(error);
    }

    await this.#drain();
  }

  #next(): EditSession | undefined {
    const [first] = this.#waiting.values();

    if (first !== undefined) {
      this.#waiting.delete(first.opened);
    }

    return first;
  }

  async #writeOne(session: EditSession): Promise<void> {
    const { opened } = session;
    const maze = session.history.present;

    if (this.#refused.has(opened)) {
      return;
    }

    await this.#copying.get(opened);
    const copy = this.#copies.get(opened) ?? session.mine;

    if (copy === undefined) {
      if (needsCopy(session)) {
        await this.#copyOnce(session, false);
      }

      return;
    }

    const { profile } = session;
    const written = this.#written.get(opened) ?? {
      maze: opened.maze,
      profile: opened.document.profile,
    };

    if (mazesEqual(maze, written.maze) && profile === written.profile) {
      return;
    }

    const mine = await this.#mine();
    const version = Math.max(copy.version, this.#versions.get(copy.id) ?? 0);
    const result = await mine?.save(
      copy.id,
      { maze, profile, recipe: sessionRecipe(session) ?? null },
      version
    );

    if (result === undefined) {
      return;
    }

    if (!result.ok) {
      this.#refused.add(opened);
      this.#events.refused(opened);
      return;
    }

    const saved = { ...copy, version: result.value.version };
    this.#copies.set(opened, saved);
    this.#versions.set(saved.id, saved.version);
    this.#written.set(opened, { maze, profile });
    this.#events.saved(opened, saved);
  }

  /** Copies `session`'s maze unless a copy of the same opened maze is already on its way. */
  #copyOnce(session: EditSession, asIs: boolean): Promise<void> {
    const pending = this.#copying.get(session.opened);

    if (pending !== undefined) {
      return pending;
    }

    const copying = this.#copy(session, asIs).catch((error: unknown) => {
      this.#copying.delete(session.opened);
      throw error;
    });
    this.#copying.set(session.opened, copying);
    this.#copiesOnTheirWay.add(copying);
    void copying.then(
      () => this.#copiesOnTheirWay.delete(copying),
      () => this.#copiesOnTheirWay.delete(copying)
    );
    return copying;
  }

  async #copy(session: EditSession, asIs: boolean): Promise<void> {
    const mine = await this.#mine();

    if (mine === undefined) {
      return;
    }

    const { opened, history, profile } = session;
    const taken = (await mine.list()).map((item) => item.name);
    const item = await mine.create({
      name: uniqueName(
        opened.document.created === true || asIs ? opened.name : copyName(opened.name),
        taken
      ),
      maze: history.present,
      trailer: opened.document.trailer,
      profile,
      origin: opened.document.origin,
      recipe: sessionRecipe(session),
    });
    const copy = { id: item.id, version: item.version, name: item.name };
    this.#copies.set(opened, copy);
    this.#versions.set(copy.id, copy.version);
    const written = { maze: history.present, profile };
    this.#written.set(opened, written);
    this.#events.copied(opened, copy, written);
  }
}
