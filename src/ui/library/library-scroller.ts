/** The element the library scrolls in (`data-library-scroller`, `LibraryGrid`), once mounted. */
export function libraryScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}

/**
 * Focuses the artboard of `key`, or, when it is not in the grid, the first artboard whose top is
 * on screen, without scrolling.
 */
export function focusArtboard(key?: string): void {
  const all = [...document.querySelectorAll<HTMLElement>('a[data-artboard]')];
  const target =
    all.find((artboard) => artboard.dataset.artboard === key) ??
    all.find((artboard) => artboard.getBoundingClientRect().top >= 0) ??
    all[0];
  target?.focus({ preventScroll: true });
}
