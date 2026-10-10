import { describe, expect, test, vi } from 'vitest';

import { readPickedImports } from '@/ui/library/picked-import';

const MIB = 1024 * 1024;

function picked(name: string, size: number) {
  const bytes = new TextEncoder().encode(name);
  return {
    name,
    size,
    arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>(() => Promise.resolve(bytes.buffer.slice(0))),
  };
}

describe('readPickedImports', () => {
  test('refuses a 2 MiB .txt without reading it, and reads the files within the limits', async () => {
    const huge = picked('huge.txt', 2 * MIB);
    const small = picked('a.txt', 100);
    const backup = picked('backup.zip', 2 * MIB);

    const read = await readPickedImports([huge, small, backup]);

    expect(huge.arrayBuffer).not.toHaveBeenCalled();
    expect(small.arrayBuffer).toHaveBeenCalledOnce();
    expect(backup.arrayBuffer).toHaveBeenCalledOnce();
    expect(read.refused).toEqual([{ name: 'huge.txt', message: 'larger than 1 MiB' }]);
    expect(read.files.map((file) => [file.name, new TextDecoder().decode(file.bytes)])).toEqual([
      ['a.txt', 'a.txt'],
      ['backup.zip', 'backup.zip'],
    ]);
  });

  test('refuses a zip over 32 MiB without reading it', async () => {
    const archive = picked('all.zip', 33 * MIB);

    const read = await readPickedImports([archive]);

    expect(archive.arrayBuffer).not.toHaveBeenCalled();
    expect(read).toEqual({
      files: [],
      refused: [{ name: 'all.zip', message: 'larger than 32 MiB' }],
    });
  });
});
