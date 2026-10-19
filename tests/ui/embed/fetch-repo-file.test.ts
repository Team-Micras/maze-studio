import { describe, expect, test } from 'vitest';

import { decodeMazeCode, serializeMazeText } from '@/maze';
import { fetchRepoFile, MAX_FILE_BYTES, rawFileUrl } from '@/ui/embed/fetch-repo-file';
import { MAZE_A } from '@tests/support/library/fake-github';

const PATH = 'classic/br2026-rcx-day1.txt';

function answering(response: Response): {
  urls: string[];
  fetch: (url: string) => Promise<Response>;
} {
  const urls: string[] = [];
  return {
    urls,
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(response);
    },
  };
}

describe('Reading a repository maze the snapshot lacks', () => {
  test('asks raw.githubusercontent.com for the file on the branch, once', async () => {
    const github = answering(new Response(MAZE_A));
    await fetchRepoFile(PATH, github.fetch);

    expect(github.urls).toEqual([
      'https://raw.githubusercontent.com/micromouseonline/mazefiles/master/classic/br2026-rcx-day1.txt',
    ]);
  });

  test('returns the file as the snapshot holds it: its path, blob SHA and compact code', async () => {
    const file = await fetchRepoFile(PATH, answering(new Response(MAZE_A)).fetch);
    const decoded = file === undefined ? undefined : decodeMazeCode(file.code);

    expect(file?.path).toBe(PATH);
    expect(file?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(decoded?.ok === true && serializeMazeText(decoded.value)).toBe(MAZE_A);
  });

  test('gives nothing for a missing file, a text that is no maze or a file over the limit', async () => {
    expect(await fetchRepoFile(PATH, answering(new Response('', { status: 404 })).fetch)).toBe(
      undefined
    );
    expect(await fetchRepoFile(PATH, answering(new Response('not a maze')).fetch)).toBe(undefined);
    expect(
      await fetchRepoFile(PATH, answering(new Response('x'.repeat(MAX_FILE_BYTES + 1))).fetch)
    ).toBe(undefined);
  });

  test('gives nothing, and does not throw, when the network fails', async () => {
    expect(await fetchRepoFile(PATH, () => Promise.reject(new TypeError('offline')))).toBe(
      undefined
    );
  });

  test.each([
    ['a parent folder', 'classic/../README.md'],
    ['a different extension', 'classic/x.json'],
    ['no folder', 'x.txt'],
    ['a query', 'classic/x.txt?a=1'],
    ['a markup name', 'classic/<b>x</b>.txt'],
    ['a scheme', 'https://evil.example/x.txt'],
    ['a backslash', 'classic\\x.txt'],
  ])('does not even ask GitHub for %s, a path another site chose', async (_why, path) => {
    const github = answering(new Response(MAZE_A));

    expect(rawFileUrl(path)).toBe(undefined);
    expect(await fetchRepoFile(path, github.fetch)).toBe(undefined);
    expect(github.urls).toEqual([]);
  });
});
