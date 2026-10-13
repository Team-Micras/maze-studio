/** The element the library scrolls in (`data-library-scroller`, `LibraryGrid`), once mounted. */
export function libraryScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}
