/**
 * The library's copy of the repository: the built-in snapshot until an update from GitHub
 * brings a newer commit, which is then kept in the database. A copy made from an older snapshot
 * is dropped when the app ships a new one, which the next check brings up to date again.
 *
 * @module
 */

import type { Database } from './database';
import {
  isUpdateDue,
  updateFromGitHub,
  type Fetch,
  type RepoState,
  type SkippedFile,
  type UpdateFailure,
  type UpdateResult,
} from './github-updater';
import type { RepoFile, Snapshot } from './snapshot';

const META = 'repo-meta';

/** What the database remembers about the copy and the last check. */
export interface RepoMeta {
  /** The commit of the files in `repo-files`, when an update stored some. */
  readonly commit?: string;
  /** The commit of the built-in snapshot the stored files replaced. */
  readonly snapshotCommit?: string;
  readonly etag?: string;
  /** When GitHub was last asked, in milliseconds since the epoch. */
  readonly checkedAt?: number;
  /** Why the last check failed, if it did. */
  readonly error?: {
    readonly reason: UpdateFailure;
    readonly message: string;
    readonly retryAt?: number;
  };
  /** The files the last update left out. */
  readonly skipped?: readonly SkippedFile[];
}

/** The repository's files as the library shows them, and where they come from. */
export interface RepoCopy extends RepoState {
  readonly source: 'snapshot' | 'github';
}

/** What a check did: nothing when it was not due, or the update's result. */
export type CheckResult = { readonly status: 'not-due' } | UpdateResult;

/** What the cache runs on; the browser's own by default. */
export interface RepoCacheOptions {
  readonly snapshot: () => Promise<Snapshot>;
  readonly fetch?: Fetch;
  readonly now?: () => number;
}

/** The library's copy of the repository. */
export class RepoCache {
  readonly #database: Database;
  readonly #snapshot: () => Promise<Snapshot>;
  readonly #fetch: Fetch;
  readonly #now: () => number;

  constructor(database: Database, options: RepoCacheOptions) {
    this.#database = database;
    this.#snapshot = options.snapshot;
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#now = options.now ?? Date.now;
  }

  /** What the database remembers about the copy and the last check. */
  async meta(): Promise<RepoMeta> {
    return (await this.#database.get<RepoMeta>('settings', META)) ?? {};
  }

  /** The files the library shows: those of the last update, or the built-in snapshot's. */
  async current(): Promise<RepoCopy> {
    const [snapshot, meta] = await Promise.all([this.#snapshot(), this.meta()]);

    if (meta.commit !== undefined && meta.snapshotCommit === snapshot.commit) {
      const files = await this.#database.getAll<RepoFile>('repo-files');
      return {
        source: 'github',
        commit: meta.commit,
        files,
        etag: meta.etag,
      };
    }

    return { source: 'snapshot', commit: snapshot.commit, files: snapshot.files };
  }

  /**
   * Asks GitHub for a newer commit and keeps what it brings; on failure, keeps what there is and
   * remembers why.
   *
   * @param force Check even if the last check was less than a day ago, as the update button does.
   */
  async check(force = false): Promise<CheckResult> {
    const meta = await this.meta();
    const now = this.#now();

    if (!force && !isUpdateDue(meta.checkedAt, now)) {
      return { status: 'not-due' };
    }

    const [copy, snapshot] = await Promise.all([this.current(), this.#snapshot()]);
    const result = await updateFromGitHub(copy, this.#fetch);
    const checked: RepoMeta = {
      ...(copy.source === 'github' ? { commit: copy.commit, snapshotCommit: snapshot.commit } : {}),
      skipped: meta.skipped,
      etag: copy.etag,
      checkedAt: now,
    };

    if (result.status === 'updated') {
      const updated: RepoMeta = {
        commit: result.state.commit,
        snapshotCommit: snapshot.commit,
        etag: result.state.etag,
        checkedAt: now,
        skipped: result.skipped,
      };
      await this.#database.write(['repo-files', 'settings'], (writer) => {
        writer.clear('repo-files');
        result.state.files.forEach((file) => writer.put('repo-files', file));
        writer.put('settings', updated, META);
      });
    } else if (result.status === 'unchanged') {
      await this.#save({ ...checked, etag: result.etag ?? checked.etag });
    } else {
      await this.#save({
        ...checked,
        error: {
          reason: result.reason,
          message: result.message,
          retryAt: result.retryAt,
        },
      });
    }

    return result;
  }

  #save(meta: RepoMeta): Promise<void> {
    return this.#database.put('settings', meta, META);
  }
}
