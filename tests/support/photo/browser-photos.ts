/**
 * A browser command that reads a file of the local set of maze photos, the folder that
 * `MAZE_PHOTOS` names, which lives outside the repository and so outside what the browser may read.
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { BrowserCommand } from 'vitest/node';

/** The file at `path` in `MAZE_PHOTOS`, in base64, or `null` when the variable is unset. */
export const readMazePhoto: BrowserCommand<[path: string]> = async (_context, path) => {
  const folder = process.env.MAZE_PHOTOS;

  if (folder === undefined || folder === '') {
    return null;
  }

  const full = join(folder, path);

  if (relative(folder, full).startsWith('..')) {
    throw new RangeError(`${path} is outside MAZE_PHOTOS`);
  }

  return (await readFile(full)).toString('base64');
};
