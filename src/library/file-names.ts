/**
 * File names for mazes written out, which always pass the repository's name rule.
 *
 * @module
 */

/** A file stem of letters, digits and `-` only, from any name; `maze` when nothing is left. */
export function fileStem(name: string): string {
  const stem = name
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^A-Za-z0-9-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  return stem === '' ? 'maze' : stem;
}

/** Stems for `names`, in order, each made unique by `-2`, `-3`... after the first. */
export function uniqueStems(names: readonly string[]): string[] {
  const taken = new Set<string>();

  return names.map((name) => {
    const stem = fileStem(name);
    let unique = stem;

    for (let copy = 2; taken.has(unique.toLowerCase()); copy++) {
      unique = `${stem}-${copy}`;
    }

    taken.add(unique.toLowerCase());
    return unique;
  });
}

/**
 * `name`, or `name 2`, `name 3`... the first that no name in `taken` already is, comparing without
 * case, so that every name shown in My mazes is its own.
 */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((known) => known.toLowerCase()));
  let unique = name;

  for (let copy = 2; used.has(unique.toLowerCase()); copy++) {
    unique = `${name} ${copy}`;
  }

  return unique;
}
