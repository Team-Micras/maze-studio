/** What the library says when it shows no maze: Mine is empty, or nothing matches. */
export function emptyTitle(mineIsEmpty: boolean): string {
  return mineIsEmpty ? 'Nothing in Mine yet' : 'No mazes match';
}
