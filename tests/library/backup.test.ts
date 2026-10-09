import { describe, expect, test } from 'vitest';

import { BACKUP_INDEX, exportMine, readImport } from '@/library/backup';
import type { MineMaze } from '@/library/mine';
import { readZip, writeZip } from '@/library/zip';
import { createMaze, encodeMazeCode, mazesEqual, parseMazeText, serializeMazeText } from '@/maze';

const TEXT = 'o---o---o\n| G     |\no   o---o\n| S |   |\no---o---o\n';
const encoder = new TextEncoder();

function maze(text: string) {
  const parsed = parseMazeText(text, 'a.txt');

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.value;
}

function item(id: string, name: string, trailer = ''): MineMaze {
  return {
    id,
    name,
    code: encodeMazeCode(maze(TEXT).maze, { trailer }),
    profile: 'halfsize',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    version: 3,
    origin: { path: 'halfsize/x.txt', sha: 'f'.repeat(40) },
  };
}

describe('the backup of Mine', () => {
  test('writes each maze as a .txt with a valid, unique name, and an index', async () => {
    const zip = exportMine([
      item('1', 'My maze ✓', 'notes\n'),
      item('2', 'My maze'),
      { ...item('3', 'bad'), code: '!' },
    ]);
    const read = await readZip(zip);

    if (!read.ok) {
      throw new Error(read.error);
    }

    const files = Object.fromEntries(
      read.value.map((entry) => [entry.name, new TextDecoder().decode(entry.bytes)])
    );
    expect(Object.keys(files)).toEqual(['My-maze.txt', 'My-maze-2.txt', BACKUP_INDEX]);
    expect(files['My-maze.txt']).toBe(`${TEXT}notes\n`);
    expect(JSON.parse(files[BACKUP_INDEX] ?? '')).toEqual([
      {
        file: 'My-maze.txt',
        name: 'My maze ✓',
        profile: 'halfsize',
        createdAt: 1_700_000_000_000,
        origin: { path: 'halfsize/x.txt', sha: 'f'.repeat(40) },
      },
      {
        file: 'My-maze-2.txt',
        name: 'My maze',
        profile: 'halfsize',
        createdAt: 1_700_000_000_000,
        origin: { path: 'halfsize/x.txt', sha: 'f'.repeat(40) },
      },
    ]);
  });

  test('reads a backup back into drafts with their names, profiles, dates and origins', async () => {
    const report = await readImport([
      { name: 'backup.zip', bytes: exportMine([item('1', 'My maze ✓', 'notes\n')]) },
    ]);

    expect(report.skipped).toEqual([]);
    expect(report.drafts).toHaveLength(1);
    expect(report.drafts[0]).toMatchObject({
      name: 'My maze ✓',
      trailer: 'notes\n',
      profile: 'halfsize',
      createdAt: 1_700_000_000_000,
      origin: { path: 'halfsize/x.txt', sha: 'f'.repeat(40) },
    });
    expect(
      mazesEqual(report.drafts[0]?.maze ?? createMaze({ width: 1, height: 1 }), maze(TEXT).maze)
    ).toBe(true);
  });

  test('reads loose .txt files and zips without an index as free mazes named after the file', async () => {
    const report = await readImport([
      { name: 'japan2019.txt', bytes: encoder.encode(TEXT) },
      {
        name: 'more.zip',
        bytes: writeZip([{ name: 'folder/other.TXT', bytes: encoder.encode(TEXT) }]),
      },
    ]);

    expect(report.drafts.map((draft) => [draft.name, draft.profile])).toEqual([
      ['japan2019', 'free'],
      ['other', 'free'],
    ]);
    expect(
      serializeMazeText({ maze: report.drafts[0]?.maze ?? maze(TEXT).maze, trailer: '' })
    ).toBe(TEXT);
  });

  test('leaves out what is not a maze, with the reason', async () => {
    const report = await readImport([
      { name: 'notes.md', bytes: encoder.encode('# notes') },
      { name: 'broken.txt', bytes: encoder.encode('hello\n') },
      { name: 'broken.zip', bytes: encoder.encode('not a zip') },
      {
        name: 'mixed.zip',
        bytes: writeZip([
          { name: 'readme.md', bytes: encoder.encode('x') },
          { name: BACKUP_INDEX, bytes: encoder.encode('not json') },
        ]),
      },
    ]);

    expect(report.drafts).toEqual([]);
    expect(report.skipped).toEqual([
      { name: 'broken.zip', message: 'not a zip archive' },
      { name: 'notes.md', message: 'not a .txt maze file' },
      { name: 'broken.txt', message: expect.stringMatching(/^line 1, column 1: /) },
      { name: 'readme.md', message: 'not a .txt maze file' },
    ]);
  });
});
