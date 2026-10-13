/** What the library says when it shows no maze: My mazes is empty, or nothing matches. */
export function emptyTitle(mineIsEmpty: boolean): string {
  return mineIsEmpty ? 'Nothing in My mazes yet' : 'No mazes match';
}
