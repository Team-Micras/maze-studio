import { useEffect, useEffectEvent, useState } from 'react';

import { DEFAULT_FILTER, type LibraryFilter } from '@/library';
import { prefersReducedMotion } from '@/ui/board/use-canvas-camera';
import { useCoarsePointer } from '@/ui/hooks/use-media-query';
import { showToast, TOAST_DURATION_MS } from '@/ui/toasts';

import { libraryScroller } from './library-scroller';

/** How far down, in CSS pixels, the grid may be and still count as at the top for Back. */
const SCROLLED_PX = 8;

/** What the toast says when the next Back leaves the app. */
export const EXIT_HINT = 'Press Back again to exit';

function filtered(filter: LibraryFilter): boolean {
  return (
    filter.source !== DEFAULT_FILTER.source ||
    filter.category !== DEFAULT_FILTER.category ||
    filter.query !== DEFAULT_FILTER.query
  );
}

/**
 * Lets the system's Back step out of the library on a touch screen, one step per Back, beneath any
 * open overlay or selection: it clears the search and the filter together, then scrolls the grid to the top,
 * then shows {@link EXIT_HINT} and leaves the next Back to the system for the toast's lifetime, or
 * until the next tap. Takes the library's filter while the library is on screen, and keeps
 * one `CloseWatcher` meanwhile, created anew after each Back; a tap ends the wait at once so the
 * watcher is back before an overlay that tap opens, and stays beneath it.
 *
 * Chrome lets a watcher created without a user activation since the last one closed be skipped by
 * Back, which then leaves the app: steps taken without a tap between them may end early, never
 * trapping the user.
 */
export function useLibraryBack(
  filter: LibraryFilter | undefined,
  onFilter: (filter: LibraryFilter) => void
): void {
  const touch = useCoarsePointer();
  const [leaving, setLeaving] = useState(false);
  const back = useEffectEvent((): boolean => {
    const scroller = libraryScroller();

    if (filter !== undefined && filtered(filter)) {
      onFilter(DEFAULT_FILTER);
    } else if (scroller !== null && scroller.scrollTop > SCROLLED_PX) {
      scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    } else {
      showToast(EXIT_HINT);
      setLeaving(true);
      return false;
    }

    return true;
  });
  const shown = filter !== undefined;

  useEffect(() => {
    const Watcher = window.CloseWatcher;

    if (!shown || !touch || leaving || Watcher === undefined) {
      return undefined;
    }

    let watcher: CloseWatcher;
    const arm = (): void => {
      watcher = new Watcher();
      watcher.addEventListener('close', () => {
        if (back()) {
          arm();
        }
      });
    };
    arm();
    return () => watcher.destroy();
  }, [shown, touch, leaving]);

  useEffect(() => {
    if (!leaving) {
      return undefined;
    }

    const stay = (): void => setLeaving(false);
    const timer = window.setTimeout(stay, TOAST_DURATION_MS);
    window.addEventListener('pointerdown', stay, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', stay, true);
    };
  }, [leaving]);
}
