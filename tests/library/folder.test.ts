import { describe, expect, test } from 'vitest';

import {
  folderCatalog,
  folderPermission,
  readFolder,
  writeFolderFile,
  type FolderHandle,
} from '@/library';

const CORRIDOR = `o---o---o
|       |
o   o   o
|       |
o---o---o
`;

/** A folder in memory, its permission set by `permission`. */
function memoryFolder(
  files: Record<string, string>,
  permission: PermissionState = 'granted',
  granted: PermissionState = 'granted'
): FolderHandle & { readonly files: Record<string, string>; asked: number } {
  const folder = {
    kind: 'directory' as const,
    name: 'mazes',
    files,
    asked: 0,
    async *values() {
      yield { kind: 'directory' as const, name: 'nested' };

      for (const name of Object.keys(files)) {
        yield fileHandle(name);
      }
    },
    getFileHandle: (name: string) => Promise.resolve(fileHandle(name)),
    queryPermission: () => Promise.resolve(permission),
    requestPermission: () => {
      folder.asked += 1;
      return Promise.resolve(granted);
    },
  };
  const fileHandle = (name: string) => ({
    kind: 'file' as const,
    name,
    getFile: () =>
      Promise.resolve({
        size: (files[name] ?? '').length,
        text: () => Promise.resolve(files[name] ?? ''),
      }),
    createWritable: () => {
      let written = '';
      return Promise.resolve({
        write: (text: string) => {
          written += text;
          return Promise.resolve();
        },
        close: () => {
          files[name] = written;
          return Promise.resolve();
        },
      });
    },
  });
  return folder;
}

describe('A local folder', () => {
  test('reads its .txt mazes by name, skips what does not parse, and ignores the rest', async () => {
    const folder = memoryFolder({
      'b.txt': CORRIDOR,
      'a.txt': CORRIDOR,
      'broken.txt': 'not a maze',
      'notes.md': '# notes',
    });
    const contents = await readFolder(folder);

    expect(contents.name).toBe('mazes');
    expect(contents.files.map((file) => file.fileName)).toEqual(['a.txt', 'b.txt']);
    expect(contents.skipped).toBe(1);
    expect(
      folderCatalog(contents.files).map((entry) => [entry.key, entry.name, entry.origin])
    ).toEqual([
      ['folder:a.txt', 'a', 'folder'],
      ['folder:b.txt', 'b', 'folder'],
    ]);
  });

  test('writes a maze back over its file', async () => {
    const folder = memoryFolder({ 'a.txt': CORRIDOR });
    await writeFolderFile(folder, 'a.txt', 'new text');

    expect(folder.files['a.txt']).toBe('new text');
  });

  test('asks for permission only when told to', async () => {
    const prompt = memoryFolder({}, 'prompt');

    expect(await folderPermission(prompt)).toBe(false);
    expect(prompt.asked).toBe(0);
    expect(await folderPermission(prompt, { write: true, ask: true })).toBe(true);
    expect(prompt.asked).toBe(1);
    expect(await folderPermission(memoryFolder({}, 'prompt', 'denied'), { ask: true })).toBe(false);
  });
});
