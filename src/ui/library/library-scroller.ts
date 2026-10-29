import type { Insets } from '@/render';

/** The element the library scrolls in (`data-library-scroller`, `LibraryGrid`), once mounted. */
export function libraryScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}

/**
 * The insets of the grid in `scroller`, the bottom one grown by the room its section keeps below
 * the last row for the safe area and the credit's update note.
 */
export function scrolledInsets(scroller: HTMLElement, insets: Insets): Insets {
  const grid = scroller.firstElementChild;
  const below = grid === null ? 0 : Number.parseFloat(getComputedStyle(grid).paddingBottom);
  return { ...insets, bottom: insets.bottom + (Number.isFinite(below) ? below : 0) };
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
