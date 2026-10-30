import { useSyncExternalStore } from 'react';

const lists = new Map<string, MediaQueryList>();

function listOf(query: string): MediaQueryList {
  const known = lists.get(query);

  if (known !== undefined) {
    return known;
  }

  const list = window.matchMedia(query);
  lists.set(query, list);
  return list;
}

/** Whether a media query matches, updated as it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = listOf(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => listOf(query).matches
  );
}

/** The widest viewport laid out as a phone (DESIGN.md 9.3). */
export const PHONE_QUERY = '(max-width: 720px)';

/** Whether the viewport is laid out as a phone. */
export function usePhoneLayout(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** Whether the main pointer is a finger, where tooltips and the shortcut help are not offered. */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * The narrowest window whose notebook top bar holds the brand, the filters and the actions with
 * the Changes chip on one row; a narrower one puts the filters on a second row.
 */
export const ONE_ROW_TOP_BAR_QUERY = '(min-width: 1340px)';

/** Whether the notebook's top bar is one row (see {@link ONE_ROW_TOP_BAR_QUERY}). */
export function useOneRowTopBar(): boolean {
  return useMediaQuery(ONE_ROW_TOP_BAR_QUERY);
}
