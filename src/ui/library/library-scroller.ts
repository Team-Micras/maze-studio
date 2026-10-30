import type { Insets, LibraryKind } from '@/render';

/** The element the library scrolls in (`data-library-scroller`, `LibraryGrid`), once mounted. */
export function libraryScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}

/**
 * The scroll speed, in CSS pixels a millisecond, past which the grid counts as flung: 33 px a
 * frame, under what one sharp paint a frame keeps up with at four times throttling (decisions.md).
 */
const FLING_SPEED = 2;

/** How long after its last scroll event the grid still counts as flung, in milliseconds. */
const FLING_HOLD_MS = 50;

let lastScroll = { top: 0, at: Number.NEGATIVE_INFINITY, speed: 0 };

/** Notes that the grid scrolled to `top`, for {@link libraryFlung}. */
export function noteLibraryScroll(top: number): void {
  const at = performance.now();
  lastScroll = { top, at, speed: Math.abs(top - lastScroll.top) / Math.max(1, at - lastScroll.at) };
}

/** Whether the grid moves faster than {@link FLING_SPEED}, its last scroll event that recent. */
export function libraryFlung(): boolean {
  return lastScroll.speed > FLING_SPEED && performance.now() - lastScroll.at < FLING_HOLD_MS;
}

/** The library's layout on a phone, or on a notebook whose top bar is one row or two. */
export function libraryKind(phone: boolean, oneRowTopBar: boolean): LibraryKind {
  if (phone) {
    return 'phone';
  }

  return oneRowTopBar ? 'notebook' : 'stacked';
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
