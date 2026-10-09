import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { crc32, readZip, writeZip, type ZipEntry } from '@/library/zip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function names(bytes: Uint8Array): Promise<Record<string, string>> {
  const read = await readZip(bytes);

  if (!read.ok) {
    throw new Error(read.error);
  }

  return Object.fromEntries(read.value.map((entry) => [entry.name, decoder.decode(entry.bytes)]));
}

describe('the zip archive of a backup', () => {
  test('computes the CRC-32 that zip uses', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  test('reads back what it wrote, UTF-8 names and empty files included', async () => {
    const entries: ZipEntry[] = [
      { name: 'japan-2019.txt', bytes: encoder.encode('o---o\n| S |\no---o\n') },
      { name: 'ünï/maze ✓.txt', bytes: encoder.encode('x'.repeat(70_000)) },
      { name: 'empty.txt', bytes: new Uint8Array() },
    ];

    expect(await names(writeZip(entries))).toEqual({
      'japan-2019.txt': 'o---o\n| S |\no---o\n',
      'ünï/maze ✓.txt': 'x'.repeat(70_000),
      'empty.txt': '',
    });
    expect(await names(writeZip([]))).toEqual({});
  });

  test('stamps the entries with the time given, in DOS format', () => {
    const bytes = writeZip(
      [{ name: 'a', bytes: new Uint8Array() }],
      new Date(2026, 9, 8, 21, 30, 10)
    );
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(10, true)).toBe((21 << 11) | (30 << 5) | 5);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 8);
  });

  test('reads a deflated archive made by another tool, folders left out', async () => {
    const bytes = new Uint8Array(
      readFileSync(join(import.meta.dirname, '..', 'support', 'library', 'deflated.zip'))
    );
    expect(await names(bytes)).toEqual({
      'mazes/deflated-maze.txt': 'o---o---o\n| G     |\no   o---o\n| S |   |\no---o---o\n',
      'notes.md': 'hello '.repeat(50),
    });
  });

  test('refuses what is not a zip, a damaged one and a corrupted entry', async () => {
    const good = writeZip([{ name: 'a.txt', bytes: encoder.encode('maze') }]);
    const corrupted = good.slice();
    corrupted[30 + 'a.txt'.length] ^= 0xff;

    expect(await readZip(encoder.encode('not a zip at all, just text'))).toMatchObject({
      ok: false,
    });
    expect(await readZip(new Uint8Array())).toMatchObject({ ok: false });
    expect(await readZip(good.subarray(0, good.length - 30))).toMatchObject({ ok: false });
    expect(await readZip(corrupted)).toEqual({
      ok: false,
      error: 'the zip entry a.txt does not match its checksum',
    });
  });
});
