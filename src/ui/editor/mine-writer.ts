/**
 * Autosave (PLAN.md 3.4): the first edit of a maze that is not in Mine copies it there, and every
 * gesture after that saves the item. One write runs at a time and the latest state wins, so a
 * burst of gestures makes at most one more write.
 *
 * @module
 */

import { uniqueName, type MineLibrary, type MineMaze } from '@/library';
import { mazesEqual, type Maze } from '@/maze';
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

/**
 * Writes the sessions of the editor to Mine, one write at a time. What it learns, the copy's
 * version and the maze last written, belongs to one session, the one that opened on a maze.
 */
export class MineWriter {
  readonly #mine: () => Promise<MineLibrary | undefined>;
  readonly #events: MineWriterEvents;
  readonly #copies = new WeakMap<OpenMaze, NamedCopy>();
  readonly #written = new WeakMap<OpenMaze, Maze>();
  readonly #refused = new WeakSet<OpenMaze>();
  #latest: EditSession | undefined;
  #running = false;

  constructor(mine: () => Promise<MineLibrary | undefined>, events: MineWriterEvents) {
    this.#mine = mine;
    this.#events = events;
  }

  /** Writes `session` as soon as the write before it is done, unless a newer one comes first. */
  write(session: EditSession): void {
    this.#latest = session;

    if (!this.#running) {
      this.#running = true;
      void this.#drain();
    }
  }

  async #drain(): Promise<void> {
    const session = this.#latest;
    this.#latest = undefined;

    if (session === undefined) {
      this.#running = false;
      return;
    }

    try {
      await this.#writeOne(session);
    } catch (error) {
      this.#running = false;
      this.#events.failed(error);
      return;
    }

    await this.#drain();
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

    if (mazesEqual(maze, this.#written.get(opened) ?? opened.maze)) {
      return;
    }

    const mine = await this.#mine();
    const result = await mine?.save(copy.id, { maze }, copy.version);

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
    this.#written.set(opened, maze);
    this.#events.saved(opened, saved);
  }

  async #copy(session: EditSession): Promise<void> {
    const mine = await this.#mine();

    if (mine === undefined) {
      return;
    }

    const { opened, history } = session;
    const taken = (await mine.list()).map((item) => item.name);
    const item = await mine.create({
      name: uniqueName(copyName(opened.name), taken),
      maze: history.present,
      trailer: opened.document.trailer,
      profile: opened.document.profile,
      ...(opened.document.origin === undefined ? {} : { origin: opened.document.origin }),
    });
    const copy = { id: item.id, version: item.version, name: item.name };
    this.#copies.set(opened, copy);
    this.#written.set(opened, history.present);
    this.#events.copied(opened, copy, item);
  }
}
