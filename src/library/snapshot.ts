/**
 * The mazes of the mazefiles repository built into the app, at the commit the submodule pins, so
 * the library opens offline. `scripts/snapshot-mazefiles.ts` writes `snapshot.json`; the app loads
 * it on demand, outside the entry chunk.
 *
 * @module
 */

/** One maze file of the repository. */
export interface RepoFile {
  /** Its path in the repository, such as `classic/japan2019.txt`. */
  readonly path: string;
  /** Its git blob SHA-1. */
  readonly sha: string;
  /** The compact code of its maze, with the text after the grid and no name. */
  readonly code: string;
}

/** The maze files of the repository at one commit. */
export interface Snapshot {
  /** The commit the files come from. */
  readonly commit: string;
  /** The files, sorted by path. */
  readonly files: readonly RepoFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Whether `value` has the shape of a {@link RepoFile}. */
export function isRepoFile(value: unknown): value is RepoFile {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.sha === 'string' &&
    /^[0-9a-f]{40}$/.test(value.sha) &&
    typeof value.code === 'string'
  );
}

/**
 * Checks that `value` has the shape of a snapshot.
 *
 * @throws {TypeError} When it does not.
 */
export function readSnapshot(value: unknown): Snapshot {
  if (
    !isRecord(value) ||
    typeof value.commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.commit) ||
    !Array.isArray(value.files) ||
    !value.files.every(isRepoFile)
  ) {
    throw new TypeError('the built-in snapshot of the mazes is malformed');
  }

  return { commit: value.commit, files: value.files };
}

/** Loads the built-in snapshot, from its own chunk. */
export async function loadSnapshot(): Promise<Snapshot> {
  const module: { default: unknown } = await import('./snapshot.json');
  return readSnapshot(module.default);
}
