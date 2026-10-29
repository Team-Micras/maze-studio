import { describe, expect, test } from 'vitest';

import { DEFAULT_FILTER } from '@/library/library-filter';
import { loadSnapshot } from '@/library/snapshot';
import { borderedMaze, encodeMazeCode, mazesEqual } from '@/maze';
import { EMBED_REFUSED, embedMaze, missingPath, SNAPSHOT_FAILED } from '@/ui/embed/embed-maze';

const CLASSIC = 'classic/AAMC15Maze.txt';

describe('The maze of the embed', () => {
  test('of a repository route comes from the snapshot, with its competition and size in the label', async () => {
    const snapshot = await loadSnapshot();
    const shown = embedMaze({ kind: 'repo', path: CLASSIC }, snapshot);

    expect(shown).toMatchObject({
      status: 'open',
      name: 'AAMC15Maze',
      label: 'AAMC15Maze, AAMC, 16 by 16',
    });
  });

  test('of a repository maze of a known competition names it in the label', async () => {
    expect(
      embedMaze({ kind: 'repo', path: 'halfsize/japan2016hef.txt' }, await loadSnapshot())
    ).toMatchObject({ status: 'open', label: 'japan2016hef, Japan, 32 by 32' });
  });

  test('of a repository route waits for the snapshot', () => {
    expect(embedMaze({ kind: 'repo', path: CLASSIC }, 'loading')).toEqual({
      status: 'waiting',
    });
  });

  test('of a repository route says so when the snapshot does not load', () => {
    expect(embedMaze({ kind: 'repo', path: CLASSIC }, 'failed')).toEqual({
      status: 'missing',
      message: SNAPSHOT_FAILED,
    });
  });

  test('of a path the snapshot lacks says so, without the path another site chose', async () => {
    const snapshot = await loadSnapshot();

    expect(embedMaze({ kind: 'repo', path: 'classic/<b>x</b>.txt' }, snapshot)).toEqual({
      status: 'missing',
      message: 'No maze at that path',
    });
  });

  test('of a path the snapshot lacks waits for the fetch, then shows the file it found', async () => {
    const snapshot = await loadSnapshot();
    const route = {
      kind: 'repo',
      path: 'classic/maze-studio-absent-test.txt',
    } as const;
    const [found] = snapshot.files;

    expect(embedMaze(route, snapshot, { status: 'loading' })).toEqual({
      status: 'waiting',
    });
    expect(embedMaze(route, snapshot, { status: 'done', file: undefined })).toMatchObject({
      status: 'missing',
    });
    expect(found).toBeDefined();
    expect(
      embedMaze(route, snapshot, {
        status: 'done',
        file: found && { ...found, path: route.path },
      })
    ).toMatchObject({
      status: 'open',
      name: 'maze-studio-absent-test',
    });
  });

  test('of a path the snapshot has ignores the fetch', async () => {
    const snapshot = await loadSnapshot();

    expect(
      embedMaze({ kind: 'repo', path: CLASSIC }, snapshot, {
        status: 'loading',
      })
    ).toMatchObject({
      status: 'open',
      name: 'AAMC15Maze',
    });
  });

  test('missingPath names the repository path a loaded snapshot lacks, and nothing else', async () => {
    const snapshot = await loadSnapshot();
    const absent = {
      kind: 'repo',
      path: 'classic/maze-studio-absent-test.txt',
    } as const;

    expect(missingPath(absent, snapshot)).toBe(absent.path);
    expect(missingPath({ kind: 'repo', path: CLASSIC }, snapshot)).toBe(undefined);
    expect(missingPath({ kind: 'link', code: 'x' }, snapshot)).toBe(undefined);
    expect(missingPath(absent, 'loading')).toBe(undefined);
  });

  test('of a link decodes it without the snapshot', () => {
    const maze = borderedMaze(5, 3);
    const shown = embedMaze(
      { kind: 'link', code: encodeMazeCode(maze, { name: 'Club final' }) },
      'loading'
    );

    expect(shown).toMatchObject({
      status: 'open',
      name: 'Club final',
      label: 'Club final, 5 by 3',
    });
    expect(shown.status === 'open' && mazesEqual(shown.maze, maze)).toBe(true);
  });

  test('of a link without a name is a shared maze', () => {
    expect(
      embedMaze({ kind: 'link', code: encodeMazeCode(borderedMaze(4, 4)) }, 'failed')
    ).toMatchObject({ name: 'Shared maze', label: 'Shared maze, 4 by 4' });
  });

  test('of a link that does not decode says so', () => {
    expect(embedMaze({ kind: 'link', code: 'not-a-maze' }, 'failed')).toMatchObject({
      status: 'missing',
      message: expect.stringMatching(/^That link does not hold a maze \(.+\)$/),
    });
  });

  test.each([
    ['the library', { kind: 'library', filter: DEFAULT_FILTER }],
    ['My mazes', { kind: 'mine', id: '6f1c0b2e-1d7a-4c35-9f43-8a0f2b51e9aa' }],
    ['the folder', { kind: 'folder', file: 'maze.txt' }],
  ] as const)('of %s is refused', async (_where, route) => {
    expect(embedMaze(route, await loadSnapshot())).toEqual({
      status: 'missing',
      message: EMBED_REFUSED,
    });
  });
});
