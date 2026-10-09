/**
 * Moving between routes. Opening a maze from the library pushes a history entry, so the
 * browser's Back returns to it; a change of the library's filter replaces the entry, so it
 * survives a reload without filling the history.
 *
 * @module
 */

import { parseRoute, routeHash, type Route } from './routes';

/** Fired on `window` when the route changes without a `hashchange`, as `replaceState` does. */
export const ROUTE_REPLACED = 'maze-studio:route-replaced';

/** Goes to `route`, adding an entry to the history. */
export function pushRoute(route: Route): void {
  window.location.hash = routeHash(route);
}

/** Goes to `route` in place of the current history entry. */
export function replaceRoute(route: Route): void {
  const url = new URL(window.location.href);
  url.hash = routeHash(route);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(ROUTE_REPLACED));
}

/** The route of the current URL. */
export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}
