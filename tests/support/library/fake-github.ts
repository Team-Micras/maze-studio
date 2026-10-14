/**
 * A stand-in for GitHub's API and raw host, serving a commit of the mazefiles repository from
 * memory, for the tests of the updater and the repository cache.
 *
 * @module
 */

import { gitBlobSha } from '@/library/blob-sha';
import type { Fetch, RepoState } from '@/library/github-updater';
import type { RepoFile } from '@/library/snapshot';
import { encodeMazeCode, parseMazeText } from '@/maze';

export const OLD_COMMIT = 'a'.repeat(40);
export const NEW_COMMIT = 'b'.repeat(40);
export const API = 'https://api.github.com/repos/micromouseonline/mazefiles';
export const RAW = 'https://raw.githubusercontent.com/micromouseonline/mazefiles';

export const MAZE_A = 'o---o---o\n| G     |\no   o---o\n| S |   |\no---o---o\n';
export const MAZE_B = 'o---o---o\n|     G |\no---o   o\n| S     |\no---o---o\n';
export const MAZE_C = 'o---o\n| S |\no---o\n\n';

export interface Served {
  readonly status?: number;
  /** How long the answer takes, in milliseconds. */
  readonly delayMs?: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export interface FakeGitHub {
  readonly fetch: Fetch;
  readonly requests: { url: string; headers: Record<string, string> }[];
}

export async function repoFile(path: string, text: string): Promise<RepoFile> {
  const parsed = parseMazeText(text, path);

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return {
    path,
    sha: await gitBlobSha(new TextEncoder().encode(text)),
    code: encodeMazeCode(parsed.value.maze, { trailer: parsed.value.trailer }),
  };
}

export async function state(files: Record<string, string>, etag?: string): Promise<RepoState> {
  const entries = await Promise.all(
    Object.entries(files).map(([path, text]) => repoFile(path, text))
  );
  return { commit: OLD_COMMIT, files: entries, etag };
}

/**
 * GitHub at `NEW_COMMIT` holding `files`; `overrides` replaces the answer to a URL, or throws
 * for every request when it is `offline`.
 */
export async function fakeGitHub(
  files: Record<string, string>,
  overrides: Record<string, Served> | 'offline' = {}
): Promise<FakeGitHub> {
  const tree = await Promise.all(
    Object.entries(files).map(async ([path, text]) => ({
      path,
      type: 'blob',
      sha: await gitBlobSha(new TextEncoder().encode(text)),
    }))
  );
  const served: Record<string, Served> = {
    [`${API}/branches/master`]: {
      body: JSON.stringify({ name: 'master', commit: { sha: NEW_COMMIT } }),
      headers: { etag: '"new-etag"' },
    },
    [`${API}/git/trees/${NEW_COMMIT}?recursive=1`]: {
      body: JSON.stringify({
        sha: NEW_COMMIT,
        truncated: false,
        tree: [
          { path: 'classic', type: 'tree', sha: 'c'.repeat(40) },
          { path: 'classic/old-mazes.txt', type: 'tree', sha: 'e'.repeat(40) },
          { path: 'README.md', type: 'blob', sha: 'd'.repeat(40) },
          ...tree,
        ],
      }),
    },
    ...Object.fromEntries(
      Object.entries(files).map(([path, text]) => [
        `${RAW}/${NEW_COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`,
        { body: text },
      ])
    ),
    ...(overrides === 'offline' ? {} : overrides),
  };
  const requests: FakeGitHub['requests'] = [];

  return {
    requests,
    fetch: async (url, init) => {
      requests.push({ url, headers: init?.headers ?? {} });

      if (overrides === 'offline') {
        throw new TypeError('Failed to fetch');
      }

      const answer = served[url] ?? { status: 404, body: 'Not Found' };

      if (answer.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
      }

      return new Response(answer.status === 304 ? null : answer.body, {
        status: answer.status ?? 200,
        headers: answer.headers,
      });
    },
  };
}
