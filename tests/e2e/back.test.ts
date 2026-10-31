import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { armed, pressBack, spyOnWatchers } from '@tests/support/e2e/close-watchers';
import { expectToast, waitForMode } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');

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
async function phone(prepare: () => void, at = ''): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(context);
  await context.addInitScript(prepare);
  const page = await context.newPage();
  await page.goto(`${app}${at}`);
  await page.locator('a[data-artboard]').first().waitFor({ state: 'attached' });
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

describe('Back on a phone with CloseWatcher', () => {
  test('closes the open overlay through its watcher, pushing no history entry', async () => {
    const page = await phone(spyOnWatchers);
    expect(await page.evaluate(() => window.watchers !== undefined)).toBe(true);
    const maze = await openMaze(page);
    const entries = await historyLength(page);

    await openGenerate(page);
    expect(await armed(page)).toBe(1);
    await pressBack(page);
    await page.getByRole('dialog', { name: 'Generate' }).waitFor({ state: 'detached' });
    expect(await hash(page)).toBe(maze);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menu').waitFor();
    await pressBack(page);
    await page.getByRole('menu').waitFor({ state: 'detached' });
    expect(await hash(page)).toBe(maze);
    expect(await historyLength(page)).toBe(entries);
    expect(await armed(page)).toBe(0);
  });
});

describe('Back on a new maze not edited yet', () => {
  test('returns to the library instead of leaving the app', async () => {
    const page = await phone(spyOnWatchers);
    const library = await hash(page);

    await page.getByRole('button', { name: 'New maze and more' }).tap();
    await page.getByRole('menuitem', { name: 'Classic, 16 × 16' }).tap();
    await waitForMode(page, 'editor');
    await pressBack(page);

    await waitForMode(page, 'library');
    expect(await hash(page)).toBe(library);
  });
});

function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('[data-library-scroller]')?.scrollTop ?? 0);
}

describe('Back on the library', () => {
  test('clears the search and the filter together', async () => {
    const page = await phone(spyOnWatchers);
    const search = page.getByRole('searchbox', { name: 'Search mazes' });
    await page.evaluate(() => {
      window.location.hash = '#/?cat=classic&q=japan';
    });
    await expect.poll(() => search.inputValue()).toBe('japan');

    await pressBack(page);

    await expect.poll(() => hash(page)).toBe('#/');
    expect(await search.inputValue()).toBe('');
    expect(await armed(page)).toBe(1);
  });

  test('scrolls a scrolled grid back to the top', async () => {
    const page = await phone(spyOnWatchers);
    const library = await hash(page);
    await page.evaluate(() => document.querySelector('[data-library-scroller]')?.scrollTo(0, 1500));
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(1000);

    await pressBack(page);

    await expect.poll(() => scrollTop(page)).toBe(0);
    expect(await hash(page)).toBe(library);
    expect(await armed(page)).toBe(1);
  });

  test('at the top, shows the exit hint and lets the next Back leave until the toast is gone or the next tap', async () => {
    const page = await phone(spyOnWatchers);
    await page.clock.install();
    expect(await armed(page)).toBe(1);

    await pressBack(page);

    await expectToast(page, 'Press Back again to exit');
    expect(await armed(page)).toBe(0);
    await page.clock.runFor(2500);
    await expect.poll(() => armed(page)).toBe(1);

    await pressBack(page);
    expect(await armed(page)).toBe(0);
    await page.touchscreen.tap(4, 600);
    expect(await armed(page)).toBe(0);
    await page.getByRole('searchbox', { name: 'Search mazes' }).tap();
    await expect.poll(() => armed(page)).toBe(1);
  });

  test('closes an open overlay before stepping', async () => {
    const page = await phone(spyOnWatchers);
    await page.evaluate(() => {
      window.location.hash = '#/?q=japan';
    });
    await expect.poll(() => hash(page)).toBe('#/?q=japan');
    await page.getByRole('button', { name: 'New maze and more' }).tap();
    await page.getByRole('menu').waitFor();
    expect(await armed(page)).toBe(2);

    await pressBack(page);

    await page.getByRole('menu').waitFor({ state: 'detached' });
    expect(await hash(page)).toBe('#/?q=japan');
    expect(await armed(page)).toBe(1);
  });

  test('at the top, goes back to the maze the library was opened from, with no hint', async () => {
    const maze = '#/repo/classic/001-anomaly-test.txt';
    const page = await phone(spyOnWatchers, maze);
    await waitForMode(page, 'editor');
    await page.getByRole('button', { name: 'Back to the library' }).tap();
    await waitForMode(page, 'library');

    await pressBack(page);

    await waitForMode(page, 'editor');
    expect(await hash(page)).toBe(maze);
    expect(await page.getByText('Press Back again to exit').count()).toBe(0);
  });

  test('at the top, takes no step for Escape, even one still held', async () => {
    const page = await phone(spyOnWatchers);

    await page.keyboard.press('Escape');

    await page.waitForTimeout(300);
    expect(await page.getByText('Press Back again to exit').count()).toBe(0);
    expect(await armed(page)).toBe(1);

    await page.keyboard.down('Escape');
    await page.waitForTimeout(100);
    await pressBack(page);

    await expectToast(page, 'Press Back again to exit');
  });
});
