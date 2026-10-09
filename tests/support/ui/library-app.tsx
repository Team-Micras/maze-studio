/**
 * The whole app on its library route, for browser tests of the shell.
 *
 * @module
 */

import { expect } from 'vitest';
import { render } from 'vitest-browser-react';

import { App } from '@/ui/app';
import { settled } from '@tests/support/ui/animations';

/** The artboards in the DOM. */
export function artboards(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('a[data-artboard]')];
}

/** Mounts the app at `hash` and waits for the library's artboards. */
export async function mountApp(hash = '#/'): Promise<void> {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${hash}`
  );
  await render(<App />);
  await expect.poll(() => artboards().length, { timeout: 20_000 }).toBeGreaterThan(0);
  await settled();
}
