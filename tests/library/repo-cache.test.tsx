import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  openDatabase,
  RepoCache,
  Settings,
  UPDATE_INTERVAL_MS,
  type Database,
  type Snapshot,
} from '@/library';
import {
  API,
  fakeGitHub,
  MAZE_A,
  MAZE_B,
  MAZE_C,
  NEW_COMMIT,
  OLD_COMMIT,
  state,
} from '@tests/support/library/fake-github';

const opened: { database: Database; name: string }[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    opened.splice(0).map(({ database, name }) => {
      database.close();
      return new Promise((resolve) => {
        indexedDB.deleteDatabase(name).addEventListener('success', resolve);
      });
    })
  );
});

async function freshDatabase(): Promise<Database> {
  const name = `repo-test-${crypto.randomUUID()}`;
  const db = await openDatabase(name);
  opened.push({ database: db, name });
  return db;
}

async function snapshot(): Promise<Snapshot> {
  return state({ 'classic/a.txt': MAZE_A, 'classic/b.txt': MAZE_B });
}

describe('the repository cache', () => {
  test('shows the built-in snapshot until an update stores a newer commit', async () => {
    const db = await freshDatabase();
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A, 'halfsize/c.txt': MAZE_C });
    let now = 1_000_000;
    const built = await snapshot();
    const cache = new RepoCache(db, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => now,
    });

    expect(await cache.current()).toMatchObject({ source: 'snapshot', commit: OLD_COMMIT });
    expect(await cache.check()).toMatchObject({
      status: 'updated',
      added: ['halfsize/c.txt'],
      removed: ['classic/b.txt'],
    });

    const updated = await cache.current();
    expect(updated).toMatchObject({ source: 'github', commit: NEW_COMMIT, etag: '"new-etag"' });
    expect(updated.files.map((file) => file.path)).toEqual(['classic/a.txt', 'halfsize/c.txt']);
    expect(await cache.meta()).toMatchObject({
      commit: NEW_COMMIT,
      snapshotCommit: OLD_COMMIT,
      checkedAt: now,
      skipped: [],
    });

    now += UPDATE_INTERVAL_MS - 1;
    expect(await cache.check()).toEqual({ status: 'not-due' });
    expect(github.requests).toHaveLength(3);

    expect(await cache.check(true)).toEqual({ status: 'unchanged', etag: '"new-etag"' });
    expect(await cache.meta()).toMatchObject({ commit: NEW_COMMIT, checkedAt: now });
    expect((await cache.current()).source).toBe('github');
  });

  test('leaves out a stored file that is malformed, and reports it', async () => {
    const db = await freshDatabase();
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A });
    const built = await snapshot();
    const cache = new RepoCache(db, { snapshot: async () => built, fetch: github.fetch });
    await cache.check();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await db.put('repo-files', { path: 'classic/broken.txt', sha: 42 });

    const copy = await cache.current();
    expect(copy.files.map((file) => file.path)).toEqual(['classic/a.txt']);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('keeps the etag it has when an unchanged answer carries none', async () => {
    const db = await freshDatabase();
    const files = { 'classic/a.txt': MAZE_A };
    const built = await snapshot();
    let github = await fakeGitHub(files);
    const cache = new RepoCache(db, {
      snapshot: async () => built,
      fetch: (url, init) => github.fetch(url, init),
      now: () => 1,
    });
    await cache.check();

    github = await fakeGitHub(files, { [`${API}/branches/master`]: { status: 304 } });
    expect(await cache.check(true)).toEqual({ status: 'unchanged', etag: '"new-etag"' });
    expect(github.requests[0]?.headers).toMatchObject({ 'If-None-Match': '"new-etag"' });
    expect(await cache.meta()).toMatchObject({ commit: NEW_COMMIT, etag: '"new-etag"' });
  });

  test('stores the files and the commit they belong to together, or neither', async () => {
    const db = await freshDatabase();
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A });
    const built = await snapshot();
    const cache = new RepoCache(db, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => 1,
    });
    const write: Database['write'] = (stores, run) =>
      db.write(stores, (writer) => {
        run(writer);
        writer.put('repo-files', { path: 'classic/broken.txt' }, 'not allowed with a key path');
      });
    const failing = new Proxy(db, {
      get: (target, property) => {
        const value: unknown = property === 'write' ? write : Reflect.get(target, property);
        return typeof value === 'function' && property !== 'write' ? value.bind(target) : value;
      },
    });
    const stores: (readonly string[])[] = [];
    const watching = new Proxy(db, {
      get: (target, property) => {
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function'
          ? (...args: unknown[]) => {
              if (property === 'write' && Array.isArray(args[0])) {
                stores.push(args[0]);
              }
              return Reflect.apply(value, target, args);
            }
          : value;
      },
    });
    const broken = new RepoCache(failing, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => 1,
    });

    await expect(broken.check()).rejects.toThrow(/in-line keys/);
    expect(await cache.current()).toMatchObject({ source: 'snapshot' });
    expect(await cache.meta()).toEqual({});

    await new RepoCache(watching, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => 1,
    }).check();
    expect(stores).toEqual([['repo-files', 'settings']]);
    expect(await cache.current()).toMatchObject({ source: 'github' });
  });

  test('keeps what it has and remembers why when a check fails', async () => {
    const db = await freshDatabase();
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A });
    const offline = await fakeGitHub({}, 'offline');
    const built = await snapshot();
    let now = 5_000;
    await new RepoCache(db, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => now,
    }).check();

    now += UPDATE_INTERVAL_MS;
    const cache = new RepoCache(db, {
      snapshot: async () => built,
      fetch: offline.fetch,
      now: () => now,
    });
    expect(await cache.check()).toMatchObject({ status: 'failed', reason: 'offline' });
    expect(await cache.current()).toMatchObject({ source: 'github', commit: NEW_COMMIT });
    expect(await cache.meta()).toMatchObject({
      checkedAt: now,
      error: { reason: 'offline' },
      commit: NEW_COMMIT,
    });
  });

  test('remembers when the rate limit resets', async () => {
    const db = await freshDatabase();
    const limited = await fakeGitHub(
      {},
      {
        [`${API}/branches/master`]: {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' },
        },
      }
    );
    const built = await snapshot();
    const cache = new RepoCache(db, {
      snapshot: async () => built,
      fetch: limited.fetch,
      now: () => 1,
    });

    await cache.check();
    expect(await cache.meta()).toMatchObject({
      error: { reason: 'rate-limited', retryAt: 1_800_000_000_000 },
    });
    expect((await cache.current()).source).toBe('snapshot');
  });

  test('drops a copy made from an older snapshot when the app ships a new one', async () => {
    const db = await freshDatabase();
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A });
    const built = await snapshot();
    await new RepoCache(db, {
      snapshot: async () => built,
      fetch: github.fetch,
      now: () => 1,
    }).check();

    const shipped: Snapshot = { ...built, commit: 'c'.repeat(40) };
    const cache = new RepoCache(db, {
      snapshot: async () => shipped,
      fetch: github.fetch,
      now: () => 2,
    });
    expect(await cache.current()).toMatchObject({ source: 'snapshot', commit: 'c'.repeat(40) });
  });
});

describe('the settings', () => {
  test('keep the handle of a local folder, and forget it (a stand-in: Chromium crashes reading a real one back in a test context)', async () => {
    const settings = new Settings<{ kind: string; name: string }>(await freshDatabase());
    const folder = { kind: 'directory', name: 'mazes' };

    expect(await settings.folder()).toBeUndefined();
    await settings.saveFolder(folder);
    expect(await settings.folder()).toEqual({ kind: 'directory', name: 'mazes' });
    await settings.saveFolder(undefined);
    expect(await settings.folder()).toBeUndefined();
  });

  test("keep the generator's last settings and preset, beside the folder", async () => {
    const settings = new Settings<{ kind: string; name: string }>(await freshDatabase());
    const saved = { preset: 'japan', settings: { size: 16, path: [57, 99] } };

    expect(await settings.generator()).toBeUndefined();
    await settings.saveFolder({ kind: 'directory', name: 'mazes' });
    await settings.saveGenerator(saved);
    expect(await settings.generator()).toEqual(saved);
    expect(await settings.folder()).toEqual({ kind: 'directory', name: 'mazes' });
  });
});
