/**
 * A spy on the page's close watchers, for the e2e tests of Back: the watchers armed, newest last,
 * and Back as Chrome gives it.
 *
 * @module
 */

import type { Page } from 'playwright';

declare global {
  interface Window {
    watchers?: CloseWatcher[];
  }
}

/** Keeps `window.watchers` up to date; run in the page before the app loads. */
export function spyOnWatchers(): void {
  const Native = window.CloseWatcher;

  if (Native !== undefined) {
    window.watchers = [];
    window.CloseWatcher = class extends Native {
      constructor() {
        super();
        window.watchers?.push(this);
        this.addEventListener('close', () => {
          window.watchers = window.watchers?.filter((watcher) => watcher !== this);
        });
      }

      override destroy(): void {
        window.watchers = window.watchers?.filter((watcher) => watcher !== this);
        super.destroy();
      }
    };
  }
}

/** Back as Chrome gives it: a close request to the newest watcher. */
export function pressBack(page: Page): Promise<void> {
  return page.evaluate(() => window.watchers?.at(-1)?.requestClose());
}

/** How many watchers are armed: created, neither closed nor destroyed. */
export function armed(page: Page): Promise<number | undefined> {
  return page.evaluate(() => window.watchers?.length);
}
