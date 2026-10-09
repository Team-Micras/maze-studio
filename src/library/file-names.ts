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
