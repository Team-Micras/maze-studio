/**
 * What a new name for a maze of My mazes may be (DESIGN.md 12): not empty, and no other maze of My
 * mazes' name, compared without case. Rename and the title field say the same.
 *
 * @module
 */

/** What is said of an empty name. */
export const EMPTY_NAME = 'Name cannot be empty';

/** What is said of a name another maze of My mazes has. */
export const TAKEN_NAME = 'Name already in My mazes. Pick another';

/** Why `name`, trimmed, cannot be taken, or `undefined` when it can. */
export function nameError(name: string, taken: readonly string[]): string | undefined {
  const trimmed = name.trim();

  if (trimmed === '') {
    return EMPTY_NAME;
  }

  return taken.some((other) => other.toLowerCase() === trimmed.toLowerCase())
    ? TAKEN_NAME
    : undefined;
}
