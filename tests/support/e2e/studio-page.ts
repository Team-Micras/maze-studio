/**
 * Pages of the built studio for the e2e tests: opening one at a route, the mode it is in, and the
 * camera it shows.
 *
 * @module
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { expect } from 'vitest';

/** How a page is opened. */
export interface PageOptions {
  readonly width?: number;
  readonly height?: number;
  readonly touch?: boolean;
  readonly reduced?: boolean;
}

/** The camera of the world layer, read from its transform. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

/** Opens the app at `app` and `hash` in a new context, kept in `contexts` to close later. */
export async function openPage(
  browser: Browser,
  contexts: BrowserContext[],
  app: string,
  hash = '#/',
  options: PageOptions = {}
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    hasTouch: options.touch ?? false,
    reducedMotion: options.reduced === true ? 'reduce' : 'no-preference',
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${app}${hash}`);
  await page.locator('a[data-artboard]').first().waitFor();
  return page;
}

/** The studio's mode: library, flying-in, editor or flying-out. */
export function studioMode(page: Page): Promise<string | null> {
  return page.locator('[data-studio-mode]').getAttribute('data-studio-mode');
}

/** Waits for the studio to be in `mode`. */
export async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (wanted) =>
      document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === wanted,
    mode
  );
}

/** The camera a world transform shows. */
export function parseCamera(transform: string): Camera {
  const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(transform);
  return { x: Number(match?.[1]), y: Number(match?.[2]), k: Number(match?.[3]) };
}

/** The camera the page shows now. */
export async function worldCamera(page: Page): Promise<Camera> {
  return parseCamera(
    await page.evaluate(
      () => document.querySelector<HTMLElement>('[data-world]')?.style.transform ?? ''
    )
  );
}

/**
 * Expects one toast on screen that says `text`: a toast of the app's viewport, not the copy Radix
 * puts out of sight for screen readers to announce it.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  const toast = page
    .getByRole('region', { name: /^Notifications/ })
    .locator('li', { hasText: text });
  await toast.first().waitFor();
  await expect.poll(() => toast.count()).toBe(1);
  await expect.poll(() => toast.isVisible()).toBe(true);
}
