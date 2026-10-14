/**
 * Moving between routes. Opening a maze from the library pushes a history entry, so the
 * browser's Back returns to it; a change of the library's filter replaces the entry, so it
 * survives a reload without filling the history.
 *
 * @module
 */

import { parseRoute, routeHash, type Route } from './routes';

/**
 * Fired on `window` when the app changes the route itself, through the History API, which fires
 * no `hashchange`; the event comes at once, so the new route renders before the next frame.
 */
export const ROUTE_CHANGED = 'maze-studio:route-changed';

function urlOf(route: Route): URL {
  const url = new URL(window.location.href);
  url.hash = routeHash(route);
  return url;
}

/** What the app keeps in a history entry: whether the entry below it is the library's. */
interface EntryState {
  readonly libraryBelow: boolean;
}

function isEntryState(value: unknown): value is EntryState {
  return typeof value === 'object' && value !== null && 'libraryBelow' in value;
}

/**
 * Whether the history entry below the current one is the library's, so the browser's Back returns
 * there: true only for an entry the app pushed from the library.
 */
export function libraryBelow(): boolean {
  const state: unknown = window.history.state;
  return isEntryState(state) && state.libraryBelow;
}

/** Goes to `route`, adding an entry to the history, which remembers whether it left the library. */
export function pushRoute(route: Route): void {
  const state: EntryState = { libraryBelow: currentRoute().kind === 'library' };
  window.history.pushState(state, '', urlOf(route));
  window.dispatchEvent(new Event(ROUTE_CHANGED));
}

/**
 * Goes to `route` in place of the current history entry. A maze put in place of the library's
 * entry has no library below it.
 */
export function replaceRoute(route: Route): void {
  const state: EntryState =
    currentRoute().kind === 'library' && route.kind !== 'library'
      ? { libraryBelow: false }
      : { libraryBelow: libraryBelow() };
  window.history.replaceState(state, '', urlOf(route));
  window.dispatchEvent(new Event(ROUTE_CHANGED));
}

/** The route of the current URL. */
export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}
