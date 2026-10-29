import { describe, expect, test } from 'vitest';

import type { MineChanges, MineDraft, MineMaze, SaveConflict } from '@/library';
import {
  createMaze,
  decodeMazeCode,
  encodeMazeCode,
  failure,
  mazesEqual,
  record,
  redo,
  success,
  toggleWall,
  type Edge,
  type Maze,
  type Result,
  undo,
} from '@/maze';
import {
  openSession,
  withGenerated,
  withProfile,
  type EditSession,
} from '@/ui/editor/edit-session';
import { MineWriter, type MineStore } from '@/ui/editor/mine-writer';
import type { OpenMaze } from '@/ui/open-maze';

const EMPTY = createMaze({ width: 4, height: 4 });

function edge(x: number): Edge {
  return { direction: 'horizontal', x, y: 1 };
}

function opened(name: string, mine?: { id: string; version: number }): OpenMaze {
  return {
    key: mine === undefined ? `repo:classic/${name}.txt` : `mine:${mine.id}`,
    maze: EMPTY,
    name,
    detail: '',
    document: { trailer: '', profile: 'classic', mine },
  };
}

/** A session on `maze`, with the walls `xs` toggled since it opened. */
function edited(maze: OpenMaze, ...xs: number[]): EditSession {
  const session = openSession(maze);
  return {
    ...session,
    history: record(
      session.history,
      xs.reduce((current, x) => toggleWall(current, edge(x)), maze.maze)
    ),
  };
}

function wallsOf(...xs: number[]): Maze {
  return xs.reduce((current, x) => toggleWall(current, edge(x)), EMPTY);
}

/** My mazes in memory, whose writes can be held back and can fail. */
class FakeMine implements MineStore {
  readonly items = new Map<string, MineMaze>();
  readonly log: string[] = [];
  failures = 0;
  #held: Promise<void> = Promise.resolve();
  #release: () => void = () => undefined;
  #ids = 0;

  hold(): void {
    this.#held = new Promise((resolve) => {
      this.#release = resolve;
    });
  }

  release(): void {
    this.#release();
  }

  list(): Promise<MineMaze[]> {
    return Promise.resolve([...this.items.values()]);
  }

  async create(draft: MineDraft): Promise<MineMaze> {
    await this.#held;
    this.#ids += 1;
    const item: MineMaze = {
      id: `u-${this.#ids}`,
      name: draft.name,
      code: encodeMazeCode(draft.maze),
      profile: draft.profile,
      createdAt: 0,
      updatedAt: 0,
      version: 1,
      ...(draft.recipe === undefined ? {} : { recipe: draft.recipe }),
    };
    this.items.set(item.id, item);
    this.log.push(`create ${draft.name}`);
    return item;
  }

  async save(
    id: string,
    changes: MineChanges,
    baseVersion: number
  ): Promise<Result<MineMaze, SaveConflict>> {
    await this.#held;

    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('quota');
    }

    const current = this.items.get(id);

    if (current === undefined || current.version !== baseVersion) {
      this.log.push(`refuse ${id}`);
      return failure(
        current === undefined ? { reason: 'removed' } : { reason: 'newer-version', current }
      );
    }

    const saved: MineMaze = {
      ...current,
      profile: changes.profile ?? current.profile,
      code: changes.maze === undefined ? current.code : encodeMazeCode(changes.maze),
      version: current.version + 1,
      recipe: changes.recipe === undefined ? current.recipe : (changes.recipe ?? undefined),
    };
    this.items.set(id, saved);
    this.log.push(`save ${current.name}`);
    return success(saved);
  }

  mazeNamed(name: string): Maze | undefined {
    const item = [...this.items.values()].find((candidate) => candidate.name === name);
    const decoded = item === undefined ? undefined : decodeMazeCode(item.code);
    return decoded?.ok === true ? decoded.value.maze : undefined;
  }
}

interface Heard {
  readonly refused: OpenMaze[];
  readonly failed: unknown[];
}

function writerOn(mine: FakeMine): { writer: MineWriter; heard: Heard } {
  const heard: Heard = { refused: [], failed: [] };
  const writer = new MineWriter(() => Promise.resolve(mine), {
    copied: () => undefined,
    saved: () => undefined,
    refused: (maze) => heard.refused.push(maze),
    failed: (error) => heard.failed.push(error),
  });
  return { writer, heard };
}

describe('The writer of My mazes', () => {
  test('copies on the first edit, then saves, in the order asked', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const maze = opened('a');
    writer.write(edited(maze, 0));
    await writer.idle();
    writer.write(edited(maze, 0, 1));
    await writer.idle();

    expect(mine.log).toEqual(['create a (edited)', 'save a (edited)']);
    expect(mazesEqual(mine.mazeNamed('a (edited)') ?? EMPTY, wallsOf(0, 1))).toBe(true);
  });

  test('writes only the latest of the sessions asked during a write', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const maze = opened('a');
    mine.hold();
    writer.write(edited(maze, 0));
    writer.write(edited(maze, 0, 1));
    writer.write(edited(maze, 0, 1, 2));
    mine.release();
    await writer.idle();

    expect(mine.log).toEqual(['create a (edited)', 'save a (edited)']);
    expect(mazesEqual(mine.mazeNamed('a (edited)') ?? EMPTY, wallsOf(0, 1, 2))).toBe(true);
  });

  test('keeps the last change of a maze left while a write runs', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const first = opened('a');
    const second = opened('b');
    mine.hold();
    writer.write(edited(first, 0));
    writer.write(edited(first, 0, 1));
    writer.write(edited(second, 2));
    mine.release();
    await writer.idle();

    expect(mine.log).toEqual(['create a (edited)', 'save a (edited)', 'create b (edited)']);
    expect(mazesEqual(mine.mazeNamed('a (edited)') ?? EMPTY, wallsOf(0, 1))).toBe(true);
    expect(mazesEqual(mine.mazeNamed('b (edited)') ?? EMPTY, wallsOf(2))).toBe(true);
  });

  test('saves a maze reopened on the older version the library still had, without a refusal', async () => {
    const mine = new FakeMine();
    const { writer, heard } = writerOn(mine);
    const stored = await mine.create({ name: 'mine one', maze: EMPTY, profile: 'free' });
    mine.log.length = 0;
    writer.write(edited(opened('mine one', { id: stored.id, version: 1 }), 0));
    await writer.idle();
    writer.write(edited(opened('mine one', { id: stored.id, version: 1 }), 0, 1));
    await writer.idle();

    expect(heard.refused).toEqual([]);
    expect(mine.log).toEqual(['save mine one', 'save mine one']);
    expect(mazesEqual(mine.mazeNamed('mine one') ?? EMPTY, wallsOf(0, 1))).toBe(true);
  });

  test('copies a new maze under its own name with the rules chosen, and saves a change of rules', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const fresh: OpenMaze = {
      ...opened('Untitled maze'),
      key: 'new:1',
      document: { trailer: '', profile: 'free', created: true },
    };
    const session = withProfile(edited(fresh, 0), 'training');
    writer.write(session);
    await writer.idle();
    writer.write(withProfile(session, 'classic'));
    await writer.idle();

    expect(mine.log).toEqual(['create Untitled maze', 'save Untitled maze']);
    expect([...mine.items.values()][0]?.profile).toBe('classic');
  });

  test('keeps the recipe only with the walls the generator made: copied with them, dropped on undo, back on redo', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const recipe = { version: 7, seed: 9, settings: { size: 4 }, hash: '0123abcd' };
    const replaced = withGenerated(openSession(opened('Repo')), { maze: wallsOf(1, 2), recipe });
    writer.write(replaced);
    await writer.idle();
    const [copy] = mine.items.values();
    expect(copy?.recipe).toEqual(recipe);

    const undone = { ...replaced, history: undo(replaced.history) };
    writer.write(undone);
    await writer.idle();
    expect(mine.items.get(copy?.id ?? '')?.recipe).toBeUndefined();

    writer.write({ ...undone, history: redo(undone.history) });
    await writer.idle();
    expect(mine.items.get(copy?.id ?? '')?.recipe).toEqual(recipe);
    expect(mine.log).toEqual(['create Repo (edited)', 'save Repo (edited)', 'save Repo (edited)']);
  });

  test('writes the earlier recipe back, never none, when an undo goes past a replace', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const first = { version: 7, seed: 1, settings: { size: 4 } };
    const second = { version: 7, seed: 2, settings: { size: 4 } };
    const session = openSession({
      ...opened('Generated', { id: 'g', version: 1 }),
      maze: wallsOf(1),
      document: { trailer: '', profile: 'classic', mine: { id: 'g', version: 1 }, recipe: first },
    });
    mine.items.set('g', {
      id: 'g',
      name: 'Generated',
      code: encodeMazeCode(wallsOf(1)),
      profile: 'classic',
      createdAt: 0,
      updatedAt: 0,
      version: 1,
      recipe: first,
    });
    const replaced = withGenerated(session, { maze: wallsOf(2), recipe: second });
    writer.write(replaced);
    await writer.idle();
    expect(mine.items.get('g')?.recipe).toEqual(second);

    writer.write({ ...replaced, history: undo(replaced.history) });
    await writer.idle();
    expect(mine.items.get('g')?.recipe).toEqual(first);
    expect(mine.log).toEqual(['save Generated', 'save Generated']);
  });

  test('makes one copy for two Save to My mazes asked at once', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const link: OpenMaze = { ...opened('shared'), key: 'link:abc' };
    const session = openSession(link);
    mine.hold();
    const first = writer.saveToMine(session);
    const second = writer.saveToMine(session);
    mine.release();
    await Promise.all([first, second]);

    expect(mine.log).toEqual(['create shared']);
  });

  test('saves an edit made while Save to My mazes copies, into that copy', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const link: OpenMaze = { ...opened('shared'), key: 'link:abc' };
    mine.hold();
    const saving = writer.saveToMine(openSession(link));
    writer.write(edited(link, 0));
    mine.release();
    await saving;
    await writer.idle();

    expect(mine.log).toEqual(['create shared', 'save shared']);
    expect(mazesEqual(mine.mazeNamed('shared') ?? EMPTY, wallsOf(0))).toBe(true);
  });

  test('idle waits for a Save to My mazes on its way, and for a copy that fails', async () => {
    const mine = new FakeMine();
    const { writer } = writerOn(mine);
    const link: OpenMaze = { ...opened('shared'), key: 'link:abc' };
    mine.hold();
    const saving = writer.saveToMine(openSession(link));
    let idle = false;
    const waiting = writer.idle().then(() => {
      idle = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(idle).toBe(false);
    mine.release();
    await Promise.all([saving, waiting]);
    expect(mine.log).toEqual(['create shared']);

    const failing = new MineWriter(() => Promise.reject(new Error('no storage')), {
      copied: () => undefined,
      saved: () => undefined,
      refused: () => undefined,
      failed: () => undefined,
    });
    const refused = failing.saveToMine(openSession({ ...link, key: 'link:def' }));
    await expect(failing.idle()).resolves.toBeUndefined();
    await expect(refused).rejects.toThrow('no storage');
  });

  test('stops writing a maze another tab saved since, and says so once', async () => {
    const mine = new FakeMine();
    const { writer, heard } = writerOn(mine);
    const stored = await mine.create({ name: 'mine one', maze: EMPTY, profile: 'free' });
    mine.items.set(stored.id, { ...stored, version: 2 });
    mine.log.length = 0;
    const maze = opened('mine one', { id: stored.id, version: 1 });
    writer.write(edited(maze, 0));
    await writer.idle();
    writer.write(edited(maze, 0, 1));
    await writer.idle();

    expect(mine.log).toEqual([`refuse ${stored.id}`]);
    expect(heard.refused).toEqual([maze]);
  });

  test('reports a failed write, goes on with the others, and tries again at the next change', async () => {
    const mine = new FakeMine();
    const { writer, heard } = writerOn(mine);
    const first = opened('a');
    const second = opened('b');
    writer.write(edited(first, 0));
    await writer.idle();
    mine.failures = 1;
    writer.write(edited(first, 0, 1));
    writer.write(edited(second, 3));
    await writer.idle();

    expect(heard.failed).toHaveLength(1);
    expect(mine.log).toEqual(['create a (edited)', 'create b (edited)']);

    writer.write(edited(first, 0, 1, 2));
    await writer.idle();

    expect(mine.log.at(-1)).toBe('save a (edited)');
    expect(mazesEqual(mine.mazeNamed('a (edited)') ?? EMPTY, wallsOf(0, 1, 2))).toBe(true);
  });
});
