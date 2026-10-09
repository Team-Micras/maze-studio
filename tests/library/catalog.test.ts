import { describe, expect, test } from 'vitest';

import { mineCatalog, repoCatalog } from '@/library/catalog';
import { fileStem, uniqueStems } from '@/library/file-names';
import type { MineMaze } from '@/library/mine';
import { loadSnapshot } from '@/library/snapshot';
import { createMaze, encodeMazeCode } from '@/maze';

describe('the catalog', () => {
  test('lists every repository maze with its folder, size, competition and year', async () => {
    const entries = repoCatalog((await loadSnapshot()).files);

    expect(entries).toHaveLength(581);
    expect(entries.find((entry) => entry.name === 'japan2011hef')).toEqual({
      key: 'repo:halfsize/japan2011hef.txt',
      origin: 'repo',
      name: 'japan2011hef',
      category: 'halfsize',
      width: 32,
      height: 32,
      competition: 'Japan',
      year: 2011,
      path: 'halfsize/japan2011hef.txt',
    });
    expect(entries.find((entry) => entry.name === 'AAMC15Maze')).toMatchObject({
      category: 'classic',
      competition: 'AAMC',
      year: 2015,
    });
    expect(entries.find((entry) => entry.name === 'killer')).not.toHaveProperty('competition');
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(581);
  });

  test('lists the items of Mine by their name and profile, leaving out one that does not read', () => {
    const item: MineMaze = {
      id: 'one',
      name: 'My practice maze',
      code: encodeMazeCode(createMaze({ width: 8, height: 5 })),
      profile: 'free',
      createdAt: 1,
      updatedAt: 2,
      version: 1,
      origin: { path: 'classic/japan2019.txt', sha: 'a'.repeat(40) },
    };

    expect(mineCatalog([item, { ...item, id: 'two', code: 'broken!' }])).toEqual([
      {
        key: 'mine:one',
        origin: 'mine',
        name: 'My practice maze',
        category: 'free',
        width: 8,
        height: 5,
        id: 'one',
        path: 'classic/japan2019.txt',
      },
    ]);
  });
});

describe('file names written out', () => {
  test.each([
    ['japan2019', 'japan2019'],
    ['My maze (edited)', 'My-maze-edited'],
    ['Ünïcödé  maze ✓', 'Unicode-maze'],
    ['--a__b--', 'a-b'],
    ['✓✓✓', 'maze'],
    ['', 'maze'],
  ])('%j becomes %j', (name, stem) => {
    expect(fileStem(name)).toBe(stem);
  });

  test('are made unique, ignoring case', () => {
    expect(uniqueStems(['a', 'A', 'a b', 'a-b', 'a'])).toEqual(['a', 'A-2', 'a-b', 'a-b-2', 'a-3']);
  });
});
