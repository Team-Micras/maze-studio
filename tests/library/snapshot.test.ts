import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { gitBlobSha } from '@/library/blob-sha';
import { loadSnapshot, readSnapshot } from '@/library/snapshot';
import { decodeMazeCode, serializeMazeText } from '@/maze';

const MAZEFILES = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles');

function git(...args: string[]): string {
  return execFileSync('git', ['-C', MAZEFILES, ...args], { encoding: 'utf8' }).trim();
}

function committedFiles(): { path: string; sha: string }[] {
  return git('ls-tree', '-r', 'HEAD')
    .split('\n')
    .flatMap((line) => {
      const [, sha, path] = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line) ?? [];
      return sha !== undefined && path?.endsWith('.txt') && path.includes('/')
        ? [{ path, sha }]
        : [];
    })
    .toSorted((left, right) => (left.path < right.path ? -1 : 1));
}

describe('the built-in snapshot, the anchor of the pinned hash', () => {
  test('is of the commit the submodule pins, with every maze file and its blob SHA', async () => {
    const snapshot = await loadSnapshot();
    expect(snapshot.commit).toBe(git('rev-parse', 'HEAD'));
    expect(snapshot.files.map(({ path, sha }) => ({ path, sha }))).toEqual(committedFiles());
  });

  test('gives back every file byte for byte from its code', async () => {
    const snapshot = await loadSnapshot();
    const checks = await Promise.all(
      snapshot.files.map(async (file) => {
        const decoded = decodeMazeCode(file.code);
        const bytes = readFileSync(join(MAZEFILES, file.path));
        const text = decoded.ok ? serializeMazeText(decoded.value) : '';
        const sha = await gitBlobSha(new TextEncoder().encode(text));
        const same =
          decoded.ok &&
          decoded.value.name === '' &&
          text === bytes.toString('utf8') &&
          sha === file.sha;
        return same ? undefined : file.path;
      })
    );

    expect(checks.filter((path) => path !== undefined)).toEqual([]);
  });

  test('computes git blob SHAs as git does', async () => {
    expect(await gitBlobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a'
    );
  });

  test('refuses a malformed snapshot', () => {
    expect(() => readSnapshot({ commit: 'x', files: [] })).toThrow(TypeError);
    expect(() => readSnapshot({ commit: 'a'.repeat(40), files: [{ path: 'p' }] })).toThrow(
      TypeError
    );
    expect(readSnapshot({ commit: 'a'.repeat(40), files: [] }).files).toEqual([]);
  });
});
