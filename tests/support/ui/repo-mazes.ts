/**
 * Mazes of the pinned mazefiles commit for browser tests, read from the built-in snapshot.
 *
 * @module
 */

import { loadSnapshot } from '@/library/snapshot';
import { decodeMazeCode, type Maze } from '@/maze';

/** A 16×16, a 21×21 and a 32×32 maze of the repository. */
export const REPO_MAZES = {
  classic: 'classic/AAMC15Maze.txt',
  taiwan: 'halfsize/taiwan2015hef.txt',
  halfsize: 'halfsize/japan2016hef.txt',
} as const;

/** The maze of the repository file at `path`. */
export async function repoMaze(path: string): Promise<Maze> {
  const snapshot = await loadSnapshot();
  const file = snapshot.files.find((entry) => entry.path === path);

  if (file === undefined) {
    throw new Error(`the snapshot has no ${path}`);
  }

  const decoded = decodeMazeCode(file.code);

  if (!decoded.ok) {
    throw new Error(`${path} does not decode: ${decoded.error.message}`);
  }

  return decoded.value.maze;
}
