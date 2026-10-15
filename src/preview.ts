/**
 * The previews of pull requests, published at `/maze-studio/pr-<n>/` beside the site, under the
 * scope of the site's service worker.
 *
 * @module
 */

/** A path inside a pull request's preview, which the site's service worker leaves to the network. */
export const PREVIEW_PATH = /\/pr-\d+\//;

/** Whether a build served under `base` registers the service worker: a preview never does. */
export function registersServiceWorker(base: string): boolean {
  return !PREVIEW_PATH.test(base);
}
