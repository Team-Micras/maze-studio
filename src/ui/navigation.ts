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

/** Goes to `route`, adding an entry to the history. */
export function pushRoute(route: Route): void {
  window.history.pushState(null, '', urlOf(route));
  window.dispatchEvent(new Event(ROUTE_CHANGED));
}

/** Goes to `route` in place of the current history entry. */
export function replaceRoute(route: Route): void {
  window.history.replaceState(window.history.state, '', urlOf(route));
  window.dispatchEvent(new Event(ROUTE_CHANGED));
}

/** The route of the current URL. */
export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}
