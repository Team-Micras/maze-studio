/**
 * Which shortest routes the app draws (DESIGN.md 6), one choice for the session that the editor's
 * board and Routes panel, the generator's gallery and maze, and the library's thumbnails share.
 * Nothing is drawn until Routes first opens, which turns both on; the panel's switches turn one
 * each, and the library's Routes toggle, on while either is, turns both on or both off.
 *
 * @module
 */

import { create } from 'zustand';

import type { RouteSwitches, ShortestRoutes } from '@/maze';

/** Both routes on. */
export const ALL_ROUTES: RouteSwitches = { withoutDiagonals: true, withDiagonals: true };

const NO_ROUTES: RouteSwitches = { withoutDiagonals: false, withDiagonals: false };

interface ShownRoutes {
  /** The switches, `undefined` until Routes first opens or the library's toggle is used. */
  readonly shown: RouteSwitches | undefined;
}

/** The session's route switches. */
export const useShownRoutes = create<ShownRoutes>()(() => ({ shown: undefined }));

/** Whether `shown` draws any route. */
export function anyRouteShown(shown: RouteSwitches | undefined): boolean {
  return shown !== undefined && (shown.withoutDiagonals || shown.withDiagonals);
}

/** Turns both routes on, or both off. */
export function showRoutes(on: boolean): void {
  useShownRoutes.setState({ shown: on ? ALL_ROUTES : NO_ROUTES });
}

/** Turns both routes on unless a switch was already used, as Routes opens. */
export function revealRoutes(): void {
  useShownRoutes.setState(({ shown }) => ({ shown: shown ?? ALL_ROUTES }));
}

/** Flips the switch of the route `name`. */
export function toggleRoute(name: keyof ShortestRoutes): void {
  useShownRoutes.setState(({ shown = ALL_ROUTES }) => ({
    shown: { ...shown, [name]: !shown[name] },
  }));
}
