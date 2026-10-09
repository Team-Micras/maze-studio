import { describe, expect, test } from 'vitest';

import { isUpdateDue, UPDATE_INTERVAL_MS, updateFromGitHub } from '@/library/github-updater';
import { decodeMazeCode, serializeMazeText } from '@/maze';
import {
  API,
  fakeGitHub,
  MAZE_A,
  MAZE_B,
  MAZE_C,
  NEW_COMMIT,
  RAW,
  state,
  type FakeGitHub,
} from '@tests/support/library/fake-github';

function rateLimited(status: number): Promise<FakeGitHub> {
  return fakeGitHub(
    {},
    {
      [`${API}/branches/master`]: {
        status,
        body: '{"message":"API rate limit exceeded"}',
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1760000000' },
      },
    }
  );
}

function texts(result: Awaited<ReturnType<typeof updateFromGitHub>>): Record<string, string> {
  if (result.status !== 'updated') {
    throw new Error(`the update ${result.status}`);
  }

  return Object.fromEntries(
    result.state.files.map((file) => {
      const decoded = decodeMazeCode(file.code);
      return [file.path, decoded.ok ? serializeMazeText(decoded.value) : ''];
    })
  );
}

describe('updating from GitHub', () => {
  test('asks with the last ETag and changes nothing on a 304', async () => {
    const github = await fakeGitHub(
      { 'classic/a.txt': MAZE_A },
      { [`${API}/branches/master`]: { status: 304, headers: { etag: '"old-etag"' } } }
    );
    const result = await updateFromGitHub(await state({}, '"old-etag"'), github.fetch);

    expect(result).toEqual({ status: 'unchanged', etag: '"old-etag"' });
    expect(github.requests).toHaveLength(1);
    expect(github.requests[0]?.headers['If-None-Match']).toBe('"old-etag"');
  });

  test('changes nothing when the branch is still at the same commit', async () => {
    const github = await fakeGitHub({ 'classic/a.txt': MAZE_A });
    const current = { ...(await state({ 'classic/a.txt': MAZE_A })), commit: NEW_COMMIT };
    expect(await updateFromGitHub(current, github.fetch)).toEqual({
      status: 'unchanged',
      etag: '"new-etag"',
    });
    expect(github.requests).toHaveLength(1);
  });

  test('downloads only new and changed maze files, by commit, and drops removed ones', async () => {
    const github = await fakeGitHub({
      'classic/a.txt': MAZE_A,
      'classic/b.txt': MAZE_A,
      'halfsize/c d.txt': MAZE_C,
    });
    const current = await state({
      'classic/a.txt': MAZE_A,
      'classic/b.txt': MAZE_B,
      'training/gone.txt': MAZE_B,
    });
    const result = await updateFromGitHub(current, github.fetch);

    expect(result).toMatchObject({
      status: 'updated',
      added: ['halfsize/c d.txt'],
      changed: ['classic/b.txt'],
      removed: ['training/gone.txt'],
      skipped: [],
      state: { commit: NEW_COMMIT, etag: '"new-etag"' },
    });
    expect(texts(result)).toEqual({
      'classic/a.txt': MAZE_A,
      'classic/b.txt': MAZE_A,
      'halfsize/c d.txt': MAZE_C,
    });
    expect(
      github.requests.map((request) => request.url).filter((url) => url.startsWith(RAW))
    ).toEqual(
      expect.arrayContaining([
        `${RAW}/${NEW_COMMIT}/classic/b.txt`,
        `${RAW}/${NEW_COMMIT}/halfsize/c%20d.txt`,
      ])
    );
    expect(github.requests.filter((request) => request.url.startsWith(RAW))).toHaveLength(2);
    expect(github.requests.some((request) => request.url.includes('/master/'))).toBe(false);
  });

  test('skips a file that does not read as a maze, with its reason, and keeps the rest', async () => {
    const github = await fakeGitHub({
      'classic/a.txt': MAZE_A,
      'classic/broken.txt': 'not a maze\n',
    });
    const result = await updateFromGitHub(await state({}), github.fetch);

    expect(result).toMatchObject({
      status: 'updated',
      added: ['classic/a.txt'],
      skipped: [
        { path: 'classic/broken.txt', message: expect.stringMatching(/^line 1, column 1: /) },
      ],
    });
    expect(Object.keys(texts(result))).toEqual(['classic/a.txt']);
  });

  test('fails and changes nothing when a file does not match its blob SHA', async () => {
    const github = await fakeGitHub(
      { 'classic/a.txt': MAZE_A, 'classic/b.txt': MAZE_B },
      { [`${RAW}/${NEW_COMMIT}/classic/b.txt`]: { body: MAZE_A } }
    );
    expect(await updateFromGitHub(await state({}), github.fetch)).toMatchObject({
      status: 'failed',
      reason: 'sha-mismatch',
      message: expect.stringContaining('classic/b.txt'),
    });
  });

  test('fails with no network', async () => {
    const github = await fakeGitHub({}, 'offline');
    expect(await updateFromGitHub(await state({}), github.fetch)).toMatchObject({
      status: 'failed',
      reason: 'offline',
    });
  });

  test('fails when the rate limit is used up, and says when it resets', async () => {
    expect(await updateFromGitHub(await state({}), (await rateLimited(403)).fetch)).toMatchObject({
      status: 'failed',
      reason: 'rate-limited',
      retryAt: 1_760_000_000_000,
    });
    expect(await updateFromGitHub(await state({}), (await rateLimited(429)).fetch)).toMatchObject({
      reason: 'rate-limited',
    });
  });

  test('fails on another HTTP error, or an answer of the wrong shape', async () => {
    const forbidden = await fakeGitHub(
      {},
      { [`${API}/branches/master`]: { status: 403, headers: { 'x-ratelimit-remaining': '12' } } }
    );
    const notJson = await fakeGitHub({}, { [`${API}/branches/master`]: { body: '<html>' } });
    const noCommit = await fakeGitHub({}, { [`${API}/branches/master`]: { body: '{}' } });
    const truncated = await fakeGitHub(
      {},
      { [`${API}/git/trees/${NEW_COMMIT}?recursive=1`]: { body: '{"tree":[],"truncated":true}' } }
    );
    const missingFile = await fakeGitHub(
      { 'classic/a.txt': MAZE_A },
      { [`${RAW}/${NEW_COMMIT}/classic/a.txt`]: { status: 404 } }
    );

    expect(await updateFromGitHub(await state({}), forbidden.fetch)).toMatchObject({
      reason: 'http-error',
    });
    expect(await updateFromGitHub(await state({}), notJson.fetch)).toMatchObject({
      reason: 'bad-response',
    });
    expect(await updateFromGitHub(await state({}), noCommit.fetch)).toMatchObject({
      reason: 'bad-response',
    });
    expect(await updateFromGitHub(await state({}), truncated.fetch)).toMatchObject({
      reason: 'bad-response',
    });
    expect(await updateFromGitHub(await state({}), missingFile.fetch)).toMatchObject({
      reason: 'http-error',
    });
  });

  test('checks automatically at most once a day', () => {
    expect(isUpdateDue(undefined, 0)).toBe(true);
    expect(isUpdateDue(1000, 1000 + UPDATE_INTERVAL_MS - 1)).toBe(false);
    expect(isUpdateDue(1000, 1000 + UPDATE_INTERVAL_MS)).toBe(true);
  });
});
