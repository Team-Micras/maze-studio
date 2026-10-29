import { afterEach, describe, expect, test } from 'vitest';

import {
  exportMine,
  mineContent,
  MineLibrary,
  openDatabase,
  readImport,
  type Database,
  type MineMaze,
  type PersistentStorage,
} from '@/library';
import { createMaze, mazesEqual, setWall, type Maze } from '@/maze';

const opened: { database: Database; name: string; libraries: MineLibrary[] }[] = [];

afterEach(async () => {
  await Promise.all(
    opened.splice(0).map(({ database, name, libraries }) => {
      libraries.forEach((library) => library.close());
      database.close();
      return new Promise((resolve) => {
        indexedDB.deleteDatabase(name).addEventListener('success', resolve);
      });
    })
  );
});

interface Tab {
  readonly mine: MineLibrary;
  readonly database: Database;
}

/** Two tabs of the app on one database and one channel, both unique to the test. */
async function tabs(storage?: PersistentStorage): Promise<[Tab, Tab]> {
  const name = `mine-test-${crypto.randomUUID()}`;
  const channel = `mine-channel-${crypto.randomUUID()}`;
  let clock = 1_000;
  const make = async (): Promise<Tab> => {
    const database = await openDatabase(name);
    const mine = new MineLibrary(database, {
      channel: new BroadcastChannel(channel),
      storage: storage ?? { persisted: async () => true, persist: async () => true },
      now: () => (clock += 10),
    });
    opened.push({ database, name, libraries: [mine] });
    return { mine, database };
  };

  return [await make(), await make()];
}

function summary(items: readonly MineMaze[]): string[] {
  return items
    .map((item) => {
      const content = mineContent(item);
      return JSON.stringify([
        item.name,
        item.profile,
        item.createdAt,
        item.origin?.path,
        content.ok ? content.value.trailer : '!',
      ]);
    })
    .toSorted((left, right) => left.localeCompare(right));
}

const MAZE = createMaze({ width: 4, height: 3, start: { x: 0, y: 0 }, goals: [{ x: 3, y: 2 }] });

function mazeOf(item: MineMaze | undefined): Maze {
  const content = item === undefined ? undefined : mineContent(item);

  if (content === undefined || !content.ok) {
    throw new Error('the item does not read');
  }

  return content.value.maze;
}

describe('My mazes', () => {
  test('creates, reads, lists, saves and removes', async () => {
    const [{ mine }] = await tabs();
    const first = await mine.create({
      name: 'First',
      maze: MAZE,
      trailer: 'notes\n',
      profile: 'free',
    });
    const second = await mine.create({
      name: 'Second',
      maze: MAZE,
      profile: 'classic',
      origin: { path: 'classic/x.txt', sha: 'a'.repeat(40) },
    });

    expect(first).toMatchObject({ name: 'First', profile: 'free', version: 1 });
    expect(await mine.get(first.id)).toEqual(first);
    expect((await mine.list()).map((item) => item.name)).toEqual(['Second', 'First']);

    const walled = setWall(MAZE, { direction: 'vertical', x: 2, y: 1 }, true);
    const saved = await mine.save(first.id, { maze: walled, name: 'First, edited' }, 1);
    expect(saved).toMatchObject({
      ok: true,
      value: { version: 2, name: 'First, edited', createdAt: first.createdAt },
    });

    const reread = await mine.get(first.id);
    expect(mazesEqual(mazeOf(reread), walled)).toBe(true);
    expect(reread === undefined ? undefined : mineContent(reread)).toMatchObject({
      ok: true,
      value: { trailer: 'notes\n' },
    });
    expect((await mine.list()).map((item) => item.name)).toEqual(['First, edited', 'Second']);

    await mine.remove(second.id);
    expect(await mine.get(second.id)).toBeUndefined();
    expect(await mine.list()).toHaveLength(1);
  });

  test('keeps the recipe of a generated maze until a save drops it, and takes one back', async () => {
    const [{ mine }] = await tabs();
    const recipe = { version: 7, seed: 6001, settings: { size: 16 }, hash: '0123abcd' };
    const item = await mine.create({ name: 'Generated', maze: MAZE, profile: 'classic', recipe });
    const walled = setWall(MAZE, { direction: 'vertical', x: 2, y: 1 }, true);
    await mine.save(item.id, { maze: walled }, 1);

    expect((await mine.get(item.id))?.recipe).toEqual(recipe);
    await mine.save(item.id, { maze: MAZE, recipe: null }, 2);
    expect(Object.hasOwn((await mine.get(item.id)) ?? {}, 'recipe')).toBe(false);
    await mine.save(item.id, { maze: walled, recipe }, 3);
    expect((await mine.get(item.id))?.recipe).toEqual(recipe);
    expect(
      Object.hasOwn(await mine.create({ name: 'Drawn', maze: MAZE, profile: 'free' }), 'recipe')
    ).toBe(false);
  });

  test('refuses a save over a newer version or a removed item, and says which', async () => {
    const [one, other] = await tabs();
    const item = await one.mine.create({ name: 'Shared', maze: MAZE, profile: 'free' });
    const fromOther = await other.mine.save(item.id, { name: 'By the other tab' }, 1);
    expect(fromOther).toMatchObject({ ok: true, value: { version: 2 } });

    const late = await one.mine.save(item.id, { name: 'Late' }, 1);
    expect(late).toMatchObject({
      ok: false,
      error: { reason: 'newer-version', current: { version: 2, name: 'By the other tab' } },
    });
    expect((await one.mine.get(item.id))?.name).toBe('By the other tab');

    await other.mine.remove(item.id);
    expect(await one.mine.save(item.id, { name: 'Gone' }, 2)).toEqual({
      ok: false,
      error: { reason: 'removed' },
    });
  });

  test('tells the other tabs of each write, and not itself', async () => {
    const [one, other] = await tabs();
    let heardByOther = 0;
    let heardBySelf = 0;
    other.mine.subscribe(() => (heardByOther += 1));
    one.mine.subscribe(() => (heardBySelf += 1));

    const item = await one.mine.create({ name: 'Heard', maze: MAZE, profile: 'free' });
    await one.mine.save(item.id, { name: 'Heard twice' }, 1);
    await one.mine.remove(item.id);

    await expect.poll(() => heardByOther).toBe(3);
    expect(heardBySelf).toBe(0);
  });

  test('stops telling a listener once it unsubscribes', async () => {
    const [one, other] = await tabs();
    let heard = 0;
    const stop = other.mine.subscribe(() => (heard += 1));
    let heardAfter = 0;
    const item = await one.mine.create({ name: 'A', maze: MAZE, profile: 'free' });
    await expect.poll(() => heard).toBe(1);

    stop();
    other.mine.subscribe(() => (heardAfter += 1));
    await one.mine.save(item.id, { name: 'B' }, 1);
    await expect.poll(() => heardAfter).toBe(1);
    expect(heard).toBe(1);
  });

  test('asks the browser to keep the storage at the first write only', async () => {
    const calls: string[] = [];
    const storage: PersistentStorage = {
      persisted: async () => {
        calls.push('persisted');
        return false;
      },
      persist: async () => {
        calls.push('persist');
        return false;
      },
    };
    const [{ mine }] = await tabs(storage);

    expect(mine.persistence).toBe('unknown');
    await mine.list();
    expect(calls).toEqual([]);

    const item = await mine.create({ name: 'A', maze: MAZE, profile: 'free' });
    await mine.save(item.id, { name: 'B' }, 1);
    await mine.create({ name: 'C', maze: MAZE, profile: 'free' });
    expect(calls).toEqual(['persisted', 'persist']);
    expect(mine.persistence).toBe('best-effort');
  });

  test('still writes when the browser fails to answer about keeping the storage', async () => {
    const [{ mine }] = await tabs({
      persisted: () => Promise.reject(new Error('no storage manager')),
      persist: () => Promise.reject(new Error('no storage manager')),
    });

    const item = await mine.create({ name: 'Kept anyway', maze: MAZE, profile: 'free' });
    expect(await mine.get(item.id)).toEqual(item);
    expect(mine.persistence).toBe('best-effort');
  });

  test('does not ask again when the storage is already kept', async () => {
    const calls: string[] = [];
    const [{ mine }] = await tabs({
      persisted: async () => {
        calls.push('persisted');
        return true;
      },
      persist: async () => {
        calls.push('persist');
        return true;
      },
    });

    await mine.create({ name: 'A', maze: MAZE, profile: 'free' });
    expect(calls).toEqual(['persisted']);
    expect(mine.persistence).toBe('persistent');
  });

  test('exports every item and imports them back into another browser', async () => {
    const [{ mine }] = await tabs();
    await mine.create({
      name: 'Alpha ✓',
      maze: MAZE,
      trailer: 'from the lab\n',
      profile: 'halfsize',
    });
    await mine.create({
      name: 'Alpha',
      maze: setWall(MAZE, { direction: 'horizontal', x: 1, y: 1 }, true),
      profile: 'classic',
      origin: { path: 'classic/x.txt', sha: 'b'.repeat(40) },
    });
    const before = await mine.list();
    const exported = exportMine(before);
    expect(exported.skipped).toEqual([]);
    const report = await readImport([{ name: 'backup.zip', bytes: exported.zip }]);
    expect(report.skipped).toEqual([]);

    const [{ mine: elsewhere }] = await tabs();
    await Promise.all(report.drafts.map((draft) => elsewhere.create(draft)));
    const after = await elsewhere.list();
    expect(summary(after)).toEqual(summary(before));
    expect(after.every((item) => before.some((old) => mazesEqual(mazeOf(item), mazeOf(old))))).toBe(
      true
    );
  });
});
