/**
 * A maze of the mazefiles repository that the built-in snapshot lacks, read from GitHub for the
 * embed: a repository published after this build. It takes one request to `raw.githubusercontent.com`,
 * with no API call and no storage, and the embed shows what the file is or says there is no maze.
 *
 * @module
 */

import { gitBlobSha } from '@/library/blob-sha';
import { MAZEFILES } from '@/library/mazefiles';
import type { RepoFile } from '@/library/snapshot';
import { encodeMazeCode, parseMazeText } from '@/maze';

/** The part of `fetch` this uses. */
export type FetchFile = (url: string) => Promise<Response>;

/** The largest maze file read, as the app's Open does. */
export const MAX_FILE_BYTES = 1024 * 1024;

/** Folders and a `.txt` name made of plain characters: another site chose the path. */
const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.txt$/;

/** Where `path` is on the branch of the repository, or `undefined` for a path that is not plain. */
export function rawFileUrl(path: string): string | undefined {
  return SAFE_PATH.test(path)
    ? `https://raw.githubusercontent.com/${MAZEFILES.owner}/${MAZEFILES.name}/${MAZEFILES.branch}/${path}`
    : undefined;
}

/**
 * The maze file at `path` on the repository's branch, as the snapshot holds its files, or
 * `undefined` for a path that is not plain, a file that is not there, one over {@link MAX_FILE_BYTES},
 * one that does not read as a maze, and any failure of the network.
 */
export async function fetchRepoFile(
  path: string,
  fetchFile: FetchFile = (url) => fetch(url)
): Promise<RepoFile | undefined> {
  const url = rawFileUrl(path);

  if (url === undefined) {
    return undefined;
  }

  try {
    const response = await fetchFile(url);

    if (!response.ok) {
      return undefined;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.length > MAX_FILE_BYTES) {
      return undefined;
    }

    const parsed = parseMazeText(new TextDecoder().decode(bytes), path);

    if (!parsed.ok) {
      return undefined;
    }

    return {
      path,
      sha: await gitBlobSha(bytes),
      code: encodeMazeCode(parsed.value.maze, { trailer: parsed.value.trailer }),
    };
  } catch {
    return undefined;
  }
}
