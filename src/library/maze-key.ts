/**
 * The keys that name a maze of the library across the app: `repo:<path>`, `mine:<id>` and
 * `folder:<file>`.
 *
 * @module
 */

const MINE = 'mine:';
const FOLDER = 'folder:';

/** The key of the repository's file at `path`. */
export function repoKey(path: string): string {
  return `repo:${path}`;
}

/** The key of the item `id` of My mazes. */
export function mineKey(id: string): string {
  return `${MINE}${id}`;
}

/** The key of the opened folder's file `fileName`. */
export function folderKey(fileName: string): string {
  return `${FOLDER}${fileName}`;
}

/** The id of the item of My mazes `key` names, if it names one. */
export function mineIdOf(key: string | undefined): string | undefined {
  return key?.startsWith(MINE) === true ? key.slice(MINE.length) : undefined;
}

/** The file of the opened folder `key` names, if it names one. */
export function folderFileOf(key: string | undefined): string | undefined {
  return key?.startsWith(FOLDER) === true ? key.slice(FOLDER.length) : undefined;
}
