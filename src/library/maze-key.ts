/**
 * The keys that name a maze across the app, `<kind>:<value>`: `repo:<path>`, `mine:<id>` and
 * `link:<code>`, which a route can name, and `file:<n>` and `new:<n>`, which it cannot.
 *
 * @module
 */

/** A maze a route can name. */
export type MazeRef =
  | { readonly kind: 'repo'; readonly path: string }
  | { readonly kind: 'mine'; readonly id: string }
  | { readonly kind: 'link'; readonly code: string };

/** The key of the maze `ref` names. */
export function keyOf(ref: MazeRef): string {
  switch (ref.kind) {
    case 'repo':
      return `repo:${ref.path}`;
    case 'mine':
      return `mine:${ref.id}`;
    default:
      return `link:${ref.code}`;
  }
}

/** The key of the item `id` of My mazes. */
export function mineKey(id: string): string {
  return keyOf({ kind: 'mine', id });
}

/** The key of the `id`th `.txt` file opened, or of the `id`th new maze. */
export function looseKey(kind: 'file' | 'new', id: number): string {
  return `${kind}:${id}`;
}

const KINDS = ['repo', 'mine', 'link', 'file', 'new'] as const;

/** The kind of maze `key` names, `file` and `new` included. */
export function kindOf(key: string | undefined): MazeRef['kind'] | 'file' | 'new' | undefined {
  const kind = key?.split(':', 1)[0];
  return KINDS.find((known) => known === kind);
}

/** The maze `key` names, as {@link keyOf} makes them; none for a file or a new maze. */
export function refOf(key: string | undefined): MazeRef | undefined {
  const value = key?.slice(key.indexOf(':') + 1) ?? '';

  switch (kindOf(key)) {
    case 'repo':
      return { kind: 'repo', path: value };
    case 'mine':
      return { kind: 'mine', id: value };
    case 'link':
      return { kind: 'link', code: value };
    default:
      return undefined;
  }
}

/** The id of the item of My mazes `key` names, if it names one. */
export function mineIdOf(key: string | undefined): string | undefined {
  const ref = refOf(key);
  return ref?.kind === 'mine' ? ref.id : undefined;
}
