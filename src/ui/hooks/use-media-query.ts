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
