/**
 * Updating the library's copy of the mazefiles repository from GitHub, without logging in:
 *
 * 1. `GET /repos/<owner>/<name>/branches/<branch>`, with the last `ETag` in `If-None-Match`,
 *    gives the branch's commit; a 304 or the same commit means there is nothing new.
 * 2. `GET /repos/<owner>/<name>/git/trees/<commit>?recursive=1` lists every file with its blob SHA.
 * 3. Only the maze files that are new or changed are downloaded from `raw.githubusercontent.com`,
 *    by commit and never by branch, since the raw host caches a branch for minutes; each one's
 *    blob SHA is checked against the tree.
 *
 * A file that does not read as a maze is skipped with its reason. No network, the API's rate
 * limit, a SHA that does not match or a response of the wrong shape fail the whole update, which
 * then changes nothing; the caller keeps what it has and tries again later.
 *
 * @module
 */

import { encodeMazeCode, parseMazeText } from '@/maze';

import { gitBlobSha } from './blob-sha';
import { MAZEFILES, type MazeRepository } from './mazefiles';
import type { RepoFile } from './snapshot';

/** How long after a check the next automatic one is due. */
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How many files an update downloads at once. */
export const DOWNLOADS_AT_ONCE = 6;

/** The repository's maze files as the library has them. */
export interface RepoState {
  readonly commit: string;
  readonly files: readonly RepoFile[];
  /** The `ETag` of the last branch response, to ask GitHub only for a change. */
  readonly etag?: string;
}

/** A file of the new commit that was left out, and why. */
export interface SkippedFile {
  readonly path: string;
  readonly message: string;
}

/** Why an update failed. */
export type UpdateFailure =
  | 'offline'
  | 'rate-limited'
  | 'sha-mismatch'
  | 'http-error'
  | 'bad-response';

/** What an update did. */
export type UpdateResult =
  | { readonly status: 'unchanged'; readonly etag?: string }
  | {
      readonly status: 'updated';
      readonly state: RepoState;
      readonly added: readonly string[];
      readonly changed: readonly string[];
      readonly removed: readonly string[];
      readonly skipped: readonly SkippedFile[];
    }
  | {
      readonly status: 'failed';
      readonly reason: UpdateFailure;
      readonly message: string;
      /** When the rate limit resets, in milliseconds since the epoch, if GitHub said. */
      readonly retryAt?: number;
    };

/** The part of `fetch` the updater uses. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

interface TreeEntry {
  readonly path: string;
  readonly sha: string;
}

class UpdateFailed extends Error {
  readonly reason: UpdateFailure;
  readonly retryAt?: number;

  constructor(reason: UpdateFailure, message: string, retryAt?: number) {
    super(message);
    this.reason = reason;
    this.retryAt = retryAt;
  }
}

/** Whether an automatic check is due, at most one a day. */
export function isUpdateDue(lastCheckedAt: number | undefined, now: number): boolean {
  return lastCheckedAt === undefined || now - lastCheckedAt >= UPDATE_INTERVAL_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMazePath(path: string): boolean {
  return path.includes('/') && path.endsWith('.txt');
}

async function request(
  fetchFile: Fetch,
  url: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  let response: Response;

  try {
    response = await fetchFile(url, { headers });
  } catch {
    throw new UpdateFailed('offline', 'GitHub could not be reached; check the connection');
  }

  const remaining = response.headers.get('x-ratelimit-remaining');

  if (response.status === 429 || (response.status === 403 && remaining === '0')) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    throw new UpdateFailed(
      'rate-limited',
      "GitHub's limit of requests without logging in is used up for now",
      Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined
    );
  }

  if (!response.ok && response.status !== 304) {
    throw new UpdateFailed('http-error', `GitHub answered ${response.status} for ${url}`);
  }

  return response;
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new UpdateFailed(
      'bad-response',
      `GitHub sent something that is not JSON from ${response.url}`
    );
  }
}

function branchCommit(body: unknown): string {
  const sha = isRecord(body) && isRecord(body.commit) ? body.commit.sha : undefined;

  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new UpdateFailed('bad-response', "GitHub's answer about the branch has no commit");
  }

  return sha;
}

function treeEntries(body: unknown): TreeEntry[] {
  if (!isRecord(body) || !Array.isArray(body.tree) || body.truncated === true) {
    throw new UpdateFailed('bad-response', "GitHub's list of files is missing or cut short");
  }

  return body.tree
    .filter(
      (entry): entry is { path: string; sha: string; type: string } =>
        isRecord(entry) &&
        entry.type === 'blob' &&
        typeof entry.path === 'string' &&
        typeof entry.sha === 'string'
    )
    .filter((entry) => isMazePath(entry.path))
    .map(({ path, sha }) => ({ path, sha }))
    .toSorted((left, right) => (left.path < right.path ? -1 : 1));
}

function rawUrl(repository: MazeRepository, commit: string, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${commit}/${encoded}`;
}

async function download(
  fetchFile: Fetch,
  repository: MazeRepository,
  commit: string,
  entry: TreeEntry
): Promise<RepoFile | SkippedFile> {
  const response = await request(fetchFile, rawUrl(repository, commit, entry.path));
  const bytes = new Uint8Array(await response.arrayBuffer());

  if ((await gitBlobSha(bytes)) !== entry.sha) {
    throw new UpdateFailed(
      'sha-mismatch',
      `${entry.path} did not arrive as GitHub listed it; nothing was changed`
    );
  }

  const parsed = parseMazeText(new TextDecoder().decode(bytes), entry.path);

  if (!parsed.ok) {
    return {
      path: entry.path,
      message: `line ${parsed.error.line}, column ${parsed.error.column}: ${parsed.error.message}`,
    };
  }

  try {
    return {
      path: entry.path,
      sha: entry.sha,
      code: encodeMazeCode(parsed.value.maze, { trailer: parsed.value.trailer }),
    };
  } catch (error) {
    return { path: entry.path, message: error instanceof Error ? error.message : String(error) };
  }
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let stopped = false;
  const work = async (): Promise<void> => {
    const index = next;
    next += 1;
    const item = items[index];

    if (stopped || index >= items.length || item === undefined) {
      return;
    }

    try {
      results[index] = await map(item);
    } catch (error) {
      stopped = true;
      throw error;
    }

    await work();
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return results;
}

async function update(
  current: RepoState,
  fetchFile: Fetch,
  repository: MazeRepository
): Promise<UpdateResult> {
  const api = `https://api.github.com/repos/${repository.owner}/${repository.name}`;
  const accept = { Accept: 'application/vnd.github+json' };
  const branch = await request(fetchFile, `${api}/branches/${repository.branch}`, {
    ...accept,
    ...(current.etag === undefined ? {} : { 'If-None-Match': current.etag }),
  });
  const etag = branch.headers.get('etag') ?? current.etag;

  if (branch.status === 304) {
    return { status: 'unchanged', etag };
  }

  const commit = branchCommit(await json(branch));

  if (commit === current.commit) {
    return { status: 'unchanged', etag };
  }

  const tree = treeEntries(
    await json(await request(fetchFile, `${api}/git/trees/${commit}?recursive=1`, accept))
  );
  const known = new Map(current.files.map((file) => [file.path, file]));
  const fetched = await mapLimited(tree, DOWNLOADS_AT_ONCE, async (entry) => {
    const kept = known.get(entry.path);
    return kept?.sha === entry.sha ? kept : download(fetchFile, repository, commit, entry);
  });
  const files = fetched.filter((file): file is RepoFile => 'sha' in file);
  const listed = new Set(tree.map((entry) => entry.path));

  return {
    status: 'updated',
    state: { commit, files, etag },
    added: files.filter((file) => !known.has(file.path)).map((file) => file.path),
    changed: files
      .filter((file) => known.has(file.path) && known.get(file.path)?.sha !== file.sha)
      .map((file) => file.path),
    removed: current.files.filter((file) => !listed.has(file.path)).map((file) => file.path),
    skipped: fetched.filter((file): file is SkippedFile => 'message' in file),
  };
}

/**
 * Brings `current` up to the branch's latest commit.
 *
 * @param current The files the library has, with the commit and `ETag` they came with.
 * @param fetchFile `fetch`, or a stand-in for it.
 * @param repository The repository to follow; mazefiles unless given.
 */
export async function updateFromGitHub(
  current: RepoState,
  fetchFile: Fetch,
  repository: MazeRepository = MAZEFILES
): Promise<UpdateResult> {
  try {
    return await update(current, fetchFile, repository);
  } catch (error) {
    if (error instanceof UpdateFailed) {
      return {
        status: 'failed',
        reason: error.reason,
        message: error.message,
        ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }),
      };
    }

    throw error;
  }
}
