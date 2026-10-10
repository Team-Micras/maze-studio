/**
 * A new version of the app (DESIGN.md 6 and 12): when the service worker has one waiting, a
 * persistent toast says "New version." with Reload, which stays until it is used or closed.
 *
 * @module
 */

import { writesSettled } from './editor/pending-writes';
import { showToast } from './toasts';

/**
 * Offers the version waiting; Reload waits for the writes to Mine on their way (`settle`), then
 * `reload` activates the new version and reloads the page.
 */
export function offerReload(reload: () => void, settle: () => Promise<void> = writesSettled): void {
  showToast('New version.', {
    persistent: true,
    action: {
      label: 'Reload',
      altText: 'Reload to use the new version',
      run: () => void settle().then(reload, reload),
    },
  });
}
