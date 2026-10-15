/**
 * The previews of pull requests, published at `/maze-studio/pr-<n>/` beside the site, on its origin
 * and under the scope of its service worker.
 *
 * @module
 */

/** A path inside a pull request's preview, which the site's service worker leaves to the network. */
export const PREVIEW_PATH = /\/pr-(\d+)\//;

/** Whether a page at `path` registers the service worker: a preview never does. */
export function registersServiceWorker(path: string): boolean {
  return !PREVIEW_PATH.test(path);
}

/** The database a page at `path` keeps: the site's `name`, or `<name>-pr-<n>` in a preview. */
export function databaseFor(name: string, path: string): string {
  const number = PREVIEW_PATH.exec(path)?.[1];
  return number === undefined ? name : `${name}-pr-${number}`;
}
