/**
 * Which shortest routes the app draws (DESIGN.md 6), one choice for the session that the editor's
 * board and Routes panel, the generator's gallery and maze, and the library's thumbnails share.
 * Both start off; each switch turns its route on or off everywhere, and opening a Routes panel
 * changes nothing.
 *
 * @module
 */

import { create } from 'zustand';

import type { RouteSwitches, ShortestRoutes } from '@/maze';

/** Both routes off, as the session starts. */
export const NO_ROUTES: RouteSwitches = { withoutDiagonals: false, withDiagonals: false };

interface ShownRoutes {
  readonly shown: RouteSwitches;
}

/** The session's route switches. */
export const useShownRoutes = create<ShownRoutes>()(() => ({ shown: NO_ROUTES }));

/** Whether `shown` draws any route. */
export function anyRouteShown(shown: RouteSwitches | undefined): boolean {
  return shown !== undefined && (shown.withoutDiagonals || shown.withDiagonals);
}

/** Flips the switch of the route `name`. */
export function toggleRoute(name: keyof ShortestRoutes): void {
  useShownRoutes.setState(({ shown }) => ({ shown: { ...shown, [name]: !shown[name] } }));
}
