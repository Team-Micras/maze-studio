import { expect, test } from 'vitest';
import { commands } from 'vitest/browser';

import { crc32, MAX_ENTRY_BYTES, readZip } from '@/library/zip';
import { craftZip } from '@tests/support/library/craft-zip';

const GIBIBYTE = 1024 * 1024 * 1024;

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

test('refuses a gibibyte bomb that declares a small size, quickly, in Chromium', async () => {
  const bomb = fromBase64(await commands.deflateZeros(GIBIBYTE));
  const zip = craftZip([
    {
      name: 'bomb.txt',
      method: 8,
      data: bomb,
      size: MAX_ENTRY_BYTES,
      crc: crc32(new Uint8Array(0)),
    },
  ]);
  expect(zip.length).toBeLessThan(2 * 1024 * 1024);

  const started = performance.now();
  const read = await readZip(zip);
  const elapsed = performance.now() - started;

  expect(read).toEqual({ ok: false, error: 'the zip entry bomb.txt is larger than it declares' });
  expect(elapsed).toBeLessThan(200);
}, 120_000);
