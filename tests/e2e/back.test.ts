import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { waitForMode } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');

declare global {
  interface Window {
    watchers?: CloseWatcher[];
  }
}

let browser: Browser;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

/** The owner's Android phone, with `prepare` run in the page before the app loads. */
async function phone(prepare: () => void): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(context);
  await context.addInitScript(prepare);
  const page = await context.newPage();
  await page.goto(app);
  await page.locator('a[data-artboard]').first().waitFor();
  return page;
}

async function openMaze(page: Page): Promise<string> {
  await page.locator('a[data-artboard]').first().click();
  await waitForMode(page, 'editor');
  return page.evaluate(() => window.location.hash);
}

async function openGenerate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Generate…/ }).click();
  await page.getByRole('dialog', { name: 'Generate' }).waitFor();
}

function hash(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
}

function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

describe('Back on a phone without CloseWatcher', () => {
  test('leaves the history alone as an overlay opens and closes', async () => {
    const page = await phone(() => {
      delete window.CloseWatcher;
    });
    const maze = await openMaze(page);
    const entries = await historyLength(page);
    const state = () => page.evaluate(() => JSON.stringify(window.history.state));
    const before = await state();

    await openGenerate(page);
    expect(await historyLength(page)).toBe(entries);
    expect(await state()).toBe(before);
    await page
      .getByRole('dialog', { name: 'Generate' })
      .getByRole('button', { name: 'Close' })
      .click();
    await page.getByRole('dialog', { name: 'Generate' }).waitFor({ state: 'detached' });

    expect(await hash(page)).toBe(maze);
    expect(await historyLength(page)).toBe(entries);
    expect(await state()).toBe(before);
  });
});

function spyOnWatchers(): void {
  const Native = window.CloseWatcher;

  if (Native !== undefined) {
    window.watchers = [];
    window.CloseWatcher = class extends Native {
      constructor() {
        super();
        window.watchers?.push(this);
      }

      override destroy(): void {
        window.watchers = window.watchers?.filter((watcher) => watcher !== this);
        super.destroy();
      }
    };
  }
}

describe('Back on a phone with CloseWatcher', () => {
  test('closes the open overlay through its watcher, pushing no history entry', async () => {
    const page = await phone(spyOnWatchers);
    expect(await page.evaluate(() => window.watchers !== undefined)).toBe(true);
    const maze = await openMaze(page);
    const entries = await historyLength(page);
    const back = () => page.evaluate(() => window.watchers?.at(-1)?.requestClose());

    await openGenerate(page);
    expect(await page.evaluate(() => window.watchers?.length)).toBe(1);
    await back();
    await page.getByRole('dialog', { name: 'Generate' }).waitFor({ state: 'detached' });
    expect(await hash(page)).toBe(maze);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menu').waitFor();
    await back();
    await page.getByRole('menu').waitFor({ state: 'detached' });
    expect(await hash(page)).toBe(maze);
    expect(await historyLength(page)).toBe(entries);
    expect(await page.evaluate(() => window.watchers?.length)).toBe(0);
  });
});

describe('Back on a new maze not edited yet', () => {
  test('returns to the library instead of leaving the app', async () => {
    const page = await phone(spyOnWatchers);
    const library = await hash(page);

    await page.getByRole('button', { name: 'New maze and more' }).tap();
    await page.getByRole('menuitem', { name: 'Classic, 16 × 16' }).tap();
    await waitForMode(page, 'editor');
    await page.evaluate(() => window.watchers?.at(-1)?.requestClose());

    await waitForMode(page, 'library');
    expect(await hash(page)).toBe(library);
  });
});
