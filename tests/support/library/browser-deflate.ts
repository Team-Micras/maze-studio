/**
 * A browser command that deflates zeros on the Node side, so a browser test can hold a zip bomb
 * of a gibibyte without making one in the page: zlib streams the zeros from one small buffer, and
 * only the deflated bytes, about a thousandth of them, come back, in base64.
 *
 * @module
 */

import { createDeflateRaw } from 'node:zlib';

import type { BrowserCommand } from 'vitest/node';

const CHUNK = 1024 * 1024;

/** Deflates `size` zero bytes and returns them in base64. */
export const deflateZeros: BrowserCommand<[size: number]> = async (_context, size) => {
  const deflate = createDeflateRaw({ level: 9 });
  const parts: Buffer[] = [];
  deflate.on('data', (part: Buffer) => parts.push(part));
  const done = new Promise((resolve, reject) => {
    deflate.on('end', resolve);
    deflate.on('error', reject);
  });
  const zeros = Buffer.alloc(CHUNK);

  for (let written = 0; written < size; written += CHUNK) {
    if (!deflate.write(zeros.subarray(0, Math.min(CHUNK, size - written)))) {
      await new Promise((resolve) => deflate.once('drain', resolve));
    }
  }

  deflate.end();
  await done;
  return Buffer.concat(parts).toString('base64');
};
