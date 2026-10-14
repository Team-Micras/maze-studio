import { describe, expect, test } from 'vitest';

import { folderFileOf, keyOf, kindOf, looseKey, mineIdOf, refOf, type MazeRef } from '@/library';

describe('maze keys', () => {
  test.each<[MazeRef, string]>([
    [{ kind: 'repo', path: 'classic/AAMC15Maze.txt' }, 'repo:classic/AAMC15Maze.txt'],
    [{ kind: 'repo', path: 'odd/a:b.txt' }, 'repo:odd/a:b.txt'],
    [{ kind: 'mine', id: 'u-1' }, 'mine:u-1'],
    [{ kind: 'folder', file: 'one:two.txt' }, 'folder:one:two.txt'],
    [{ kind: 'link', code: 'AQID' }, 'link:AQID'],
  ])('name %o as %s and back', (ref, key) => {
    expect(keyOf(ref)).toBe(key);
    expect(refOf(key)).toEqual(ref);
  });

  test('name loose mazes apart, which no route names', () => {
    expect(looseKey('file', 3)).toBe('file:3');
    expect(looseKey('new', 3)).toBe('new:3');
    expect(kindOf('file:3')).toBe('file');
    expect(kindOf('odd:3')).toBeUndefined();
    expect(refOf('file:3')).toBeUndefined();
    expect(refOf('new:3')).toBeUndefined();
    expect(refOf(undefined)).toBeUndefined();
  });

  test('read the id of My mazes and the folder file only from their own kind', () => {
    expect(mineIdOf('mine:u:1')).toBe('u:1');
    expect(mineIdOf('folder:mine:u')).toBeUndefined();
    expect(folderFileOf('folder:a:b.txt')).toBe('a:b.txt');
    expect(folderFileOf('repo:folder:x')).toBeUndefined();
  });
});
