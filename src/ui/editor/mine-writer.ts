/**
 * Autosave (PLAN.md 3.4): the first edit of a maze that is not in Mine copies it there, and every
 * gesture after that saves the item. One write runs at a time and the latest state wins, so a
 * burst of gestures makes at most one more write.
 *
 * @module
 */

import { uniqueName, type MineLibrary, type MineMaze } from '@/library';
import { mazesEqual, type Maze, type Profile } from '@/maze';
import type { MineCopy, OpenMaze } from '@/ui/open-maze';

import { copyName, needsCopy, type EditSession } from './edit-session';

/** The item of Mine a session writes to, with its name. */
export type NamedCopy = MineCopy & { readonly name: string };

/** What the writer tells the editor, naming each session by the maze it opened on. */
export interface MineWriterEvents {
  /** The maze `opened` now has its copy in Mine. */
  readonly copied: (opened: OpenMaze, copy: NamedCopy, item: MineMaze) => void;
  /** The item of `opened`'s session was saved. */
  readonly saved: (opened: OpenMaze, copy: NamedCopy) => void;
  /** Another tab saved the item, or removed it, since this one read it: nothing more is written. */
  readonly refused: (opened: OpenMaze) => void;
  /** The browser failed to write; the next change tries again. */
  readonly failed: (error: unknown) => void;
}

/** What a session last wrote. */
interface Written {
  readonly maze: Maze;
  readonly profile: Profile;
}

/** What the writer needs of Mine. */
export type MineStore = Pick<MineLibrary, 'list' | 'create' | 'save'>;

/**
 * Writes the sessions of the editor to Mine, one write at a time. Each maze keeps its latest
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
   * Copies `session`'s maze to Mine under its own name, edited or not, as Save to Mine does for a
   * link or a file; nothing happens once it has a copy.
   */
  async saveToMine(session: EditSession): Promise<void> {
    await this.idle();

    if (this.#copies.get(session.opened) === undefined && session.mine === undefined) {
      await this.#copy(session, true);
    }
  }

  /**
   * Renames `session`'s item of Mine on the version this tab knows.
   *
   * @returns Whether Mine took the name; another tab's newer save refuses it.
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

  /** Resolves once every session asked has been written, or has failed to be. */
  async idle(): Promise<void> {
    await this.#draining;
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

    const copy = this.#copies.get(opened) ?? session.mine;

    if (copy === undefined) {
      if (needsCopy(session)) {
        await this.#copy(session);
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
    const result = await mine?.save(copy.id, { maze, profile }, version);

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

  async #copy(session: EditSession, asIs = false): Promise<void> {
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
      ...(opened.document.origin === undefined ? {} : { origin: opened.document.origin }),
    });
    const copy = { id: item.id, version: item.version, name: item.name };
    this.#copies.set(opened, copy);
    this.#versions.set(copy.id, copy.version);
    this.#written.set(opened, { maze: history.present, profile });
    this.#events.copied(opened, copy, item);
  }
}
