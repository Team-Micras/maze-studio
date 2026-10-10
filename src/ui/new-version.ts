/**
 * A new version of the app (DESIGN.md 6 and 12): when the service worker has one waiting, a
 * persistent toast says "New version." with Reload, which stays until it is used or closed.
 *
 * @module
 */

import { showToast } from './toasts';

/** Offers the version waiting; `reload` activates it and reloads the page. */
export function offerReload(reload: () => void): void {
  showToast('New version.', {
    persistent: true,
    action: { label: 'Reload', altText: 'Reload to use the new version', run: reload },
  });
}
