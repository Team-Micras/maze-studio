import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { decodeMazeCode, encodeMazeCode, parseMazeText } from '@/maze';
import { mineCount, storeMine } from '@tests/support/e2e/board-page';
import { pressBack, spyOnWatchers } from '@tests/support/e2e/close-watchers';

const ROOT = join(import.meta.dirname, '..', '..');
const app = inject('appUrl');
const BOTTOM_INSET = 72;
const TOP_INSET = 112;
const HOME_INDICATOR = 34;
const FILE = `o---o---o---o
|           |
o   o---o   o
| S       G |
o---o---o---o
`;

let browser: Browser;

/** How many mazes of this size the snapshot the app was built with holds. */
function mazesOfSize(width: number, height: number): number {
  const snapshot: { files: { code: string }[] } = JSON.parse(
    readFileSync(join(ROOT, 'src', 'library', 'snapshot.json'), 'utf8')
  );
  return snapshot.files.filter((file) => {
    const decoded = decodeMazeCode(file.code);
    return decoded.ok && decoded.value.maze.width === width && decoded.value.maze.height === height;
  }).length;
}
const contexts: BrowserContext[] = [];

async function library(hash = '#/'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${app}${hash}`);
  await page.locator('a[data-artboard]').first().waitFor();
  return page;
}

async function labels(page: Page): Promise<string[]> {
  return page
    .locator('a[data-artboard]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label') ?? ''));
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('The library of the built app', () => {
  test('finds a maze by search and opens it', async () => {
    const page = await library();
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('japan2011hef');
    await page.getByRole('link', { name: 'japan2011hef, Japan, 32 by 32' }).click();

    await page.getByRole('heading', { level: 1, name: 'japan2011hef' }).waitFor();
    expect(new URL(page.url()).hash).toBe('#/repo/halfsize/japan2011hef.txt');

    await page.goBack();
    await page.getByRole('link', { name: 'japan2011hef, Japan, 32 by 32' }).waitFor();
    expect(new URL(page.url()).hash).toBe('#/?q=japan2011hef');
  });

  test('japan 2011 finds japan2011hef and nothing from another year', async () => {
    const page = await library();
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('japan 2011');
    await page.waitForFunction(() => document.querySelectorAll('a[data-artboard]').length < 20);
    const found = await labels(page);

    expect(found).toContain('japan2011hef, Japan, 32 by 32');
    expect(found.every((label) => /2011/.test(label))).toBe(true);
  });

  test('21 finds every 21×21 maze', async () => {
    const expected = mazesOfSize(21, 21);
    const page = await library();
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('21');
    await page.waitForFunction(
      (count) => document.querySelectorAll('a[data-artboard]').length === count,
      expected
    );

    expect(expected).toBeGreaterThanOrEqual(6);
    expect((await labels(page)).every((label) => label.endsWith('21 by 21'))).toBe(true);
  });

  test('keeps the filters through a reload', async () => {
    const page = await library();
    await page.getByRole('radio', { name: 'Half size' }).click();
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('japan');
    await page.waitForFunction(() => window.location.hash === '#/?cat=halfsize&q=japan');
    await page.reload();
    await page.locator('a[data-artboard]').first().waitFor();

    expect(await page.getByRole('radio', { name: 'Half size' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(await page.getByRole('searchbox', { name: 'Search mazes' }).inputValue()).toBe('japan');
    expect((await labels(page)).every((label) => /^japan/i.test(label))).toBe(true);
  });

  test('Tab onto an artboard below the screen brings the camera to it, and it stays mounted', async () => {
    const page = await library();
    const target = await page.evaluate(() => {
      const boards = [...document.querySelectorAll<HTMLAnchorElement>('a[data-artboard]')];
      const index = boards.findIndex(
        (board) => board.getBoundingClientRect().top > window.innerHeight
      );
      boards[index - 1]?.focus();
      return boards[index]?.dataset.artboard;
    });
    await page.keyboard.press('Tab');
    const focused = page.locator(`a[data-artboard="${target}"]`);
    await page.waitForFunction(
      (key) => document.activeElement?.getAttribute('data-artboard') === key,
      target
    );
    await page.waitForTimeout(100);
    const box = await focused.boundingBox();

    expect(box?.y ?? 0).toBeGreaterThanOrEqual(TOP_INSET - 1);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900 - BOTTOM_INSET + 1);

    await page.mouse.move(720, 450);
    for (let step = 0; step < 10; step++) {
      await page.mouse.wheel(0, 2000);
    }

    await page.waitForTimeout(200);
    expect(await focused.count()).toBe(1);
    expect(await focused.evaluate((element) => element === document.activeElement)).toBe(true);
    expect(((await focused.boundingBox())?.y ?? 0) + 1000).toBeLessThan(0);
  });

  test('opens a local .txt file', async () => {
    const page = await library();
    const folder = mkdtempSync(join(ROOT, 'node_modules', '.tmp', 'open-file-'));
    const file = join(folder, 'corridor.txt');
    writeFileSync(file, FILE);

    try {
      await page.locator('input[data-open-file]').setInputFiles(file);
      await page.getByRole('heading', { level: 1, name: 'corridor', exact: true }).waitFor();

      expect(await page.getByText('Opened from a file').isVisible()).toBe(true);
      expect(new URL(page.url()).hash).toBe('#/');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

/** A library with three mazes of My mazes, filtered to them, on a phone or a notebook. */
async function mineLibrary(touch: boolean): Promise<Page> {
  const context = await browser.newContext({
    viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    hasTouch: touch,
  });
  contexts.push(context);
  await context.addInitScript(spyOnWatchers);
  const page = await context.newPage();
  await page.goto(`${app}#/`);
  await page.locator('a[data-artboard]').first().waitFor();
  const parsed = parseMazeText(FILE, 'mine.txt');
  const code = parsed.ok ? encodeMazeCode(parsed.value.maze) : '';
  await storeMine(
    page,
    ['one', 'two', 'three'].map((id) => ({ id, name: `Maze ${id}`, code }))
  );
  await page.evaluate(() => {
    window.location.hash = '#/?src=mine';
  });
  await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(3);
  return page;
}

function artboard(page: Page, id: string) {
  return page.locator(`a[data-artboard="mine:${id}"]`);
}

/** Holds a finger on `target` for `ms`, moving it `drift` px down on the way. */
async function holdFinger(page: Page, target: string, ms: number, drift = 0): Promise<void> {
  const box = await page.locator(target).boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });

  if (drift > 0) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + drift, id: 1 }],
    });
  }

  await page.waitForTimeout(ms);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Holds the mouse on artboard `id` for `ms`. */
async function holdMouse(page: Page, id: string, ms: number): Promise<void> {
  const box = await page.locator(`a[data-artboard="mine:${id}"]`).boundingBox();
  const x = (box?.x ?? 0) + 30;
  const y = (box?.y ?? 0) + 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

function selection(page: Page) {
  return page.getByRole('toolbar', { name: 'Selection' });
}

/** A page of the library at `hash` above a 34 px home indicator. */
async function aboveHomeIndicator(width: number, height: number, hash: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 720 });
  contexts.push(context);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: HOME_INDICATOR } });
  await page.goto(`${app}${hash}`);
  await page.locator('a[data-artboard]').first().waitFor();
  return page;
}

/** Scrolls the grid to its end and gives the bottom of its lowest artboard. */
async function lowestAtTheEnd(page: Page): Promise<number> {
  await page
    .locator('[data-library-scroller]')
    .evaluate((scroller) => scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(300);
  return page
    .locator('a[data-artboard]')
    .evaluateAll((links) => Math.max(...links.map((link) => link.getBoundingClientRect().bottom)));
}

describe('The top bar and the grid', () => {
  let classicScrollbars: Browser;

  beforeAll(async () => {
    classicScrollbars = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  });

  afterAll(async () => {
    await classicScrollbars?.close();
  });

  test.each([1285, 1275])(
    'agree at %i px on one row or two, with scrollbars that take room, the first row 52 px below the filters',
    async (width) => {
      const context = await classicScrollbars.newContext({ viewport: { width, height: 900 } });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(`${app}#/?cat=training`);
      await page.locator('a[data-artboard]').first().waitFor();
      const gap = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-library-scroller]');
        const filters = document.querySelector('search > div')?.getBoundingClientRect();
        const first = document.querySelector('a[data-artboard]')?.getBoundingClientRect();
        return {
          scrollbar: window.innerWidth - (scroller?.clientWidth ?? 0),
          below: Math.round((first?.top ?? 0) - (filters?.bottom ?? 0)),
        };
      });

      expect(gap.scrollbar).toBeGreaterThan(0);
      expect(gap.below).toBe(52);
    }
  );
});

describe('The library above a home indicator', () => {
  test.each([
    ['phone', 390, 844, 12],
    ['notebook', 1440, 900, 18],
  ])(
    'ends its grid above the credit on a %s, so the last row shows whole',
    async (_, width, height, gap) => {
      const page = await aboveHomeIndicator(width, height, '#/?cat=training');
      const lowest = await lowestAtTheEnd(page);
      const credit = await page.locator('footer p').first().boundingBox();

      expect(credit?.y).toBeCloseTo(height - HOME_INDICATOR - gap - 32, 0);
      expect(lowest).toBeLessThanOrEqual(credit?.y ?? 0);
    }
  );

  test('ends its grid above the update note a phone stacks over the credit', async () => {
    const page = await aboveHomeIndicator(390, 844, '#/?cat=training');
    await page.route('https://api.github.com/**', () => undefined);
    await page.getByRole('button', { name: 'New maze and more' }).tap();
    await page.getByRole('menuitem', { name: 'Check for updates' }).tap();
    const note = page.locator('[data-update-note]');
    await note.getByText('Checking for updates…').waitFor();
    const lowest = await lowestAtTheEnd(page);

    expect(lowest).toBeLessThanOrEqual((await note.boundingBox())?.y ?? 0);
  });

  test('Tab onto an artboard below the screen brings it above the credit', async () => {
    const page = await aboveHomeIndicator(1440, 900, '#/');
    const target = await page.evaluate(() => {
      const boards = [...document.querySelectorAll<HTMLAnchorElement>('a[data-artboard]')];
      const index = boards.findIndex(
        (board) => board.getBoundingClientRect().top > window.innerHeight
      );
      boards[index - 1]?.focus();
      return boards[index]?.dataset.artboard;
    });
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      (key) => document.activeElement?.getAttribute('data-artboard') === key,
      target
    );
    await page.waitForTimeout(100);
    const box = await page.locator(`a[data-artboard="${target}"]`).boundingBox();

    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      900 - BOTTOM_INSET - HOME_INDICATOR + 1
    );
  });
});

describe('Selecting in My mazes', () => {
  test('on a phone: a held finger selects, a tap toggles, Delete takes two taps, Cancel, Esc and Back leave', async () => {
    const page = await mineLibrary(true);
    await holdFinger(page, 'a[data-artboard="mine:one"]', 700);

    await expect.poll(() => selection(page).textContent()).toContain('1 selected');
    expect(await artboard(page, 'one').getAttribute('aria-checked')).toBe('true');
    await artboard(page, 'two').tap();
    await expect.poll(() => selection(page).textContent()).toContain('2 selected');
    await artboard(page, 'one').tap();
    await expect.poll(() => selection(page).textContent()).toContain('1 selected');
    expect(new URL(page.url()).hash).toBe('#/?src=mine');
    await selection(page).getByRole('button', { name: 'Cancel' }).tap();
    await expect.poll(() => selection(page).count()).toBe(0);
    expect(await artboard(page, 'two').getAttribute('aria-checked')).toBeNull();

    await holdFinger(page, 'a[data-artboard="mine:one"]', 700);
    await selection(page).waitFor();
    await page.keyboard.press('Escape');
    await expect.poll(() => selection(page).count()).toBe(0);
    expect(new URL(page.url()).hash).toBe('#/?src=mine');

    await holdFinger(page, 'a[data-artboard="mine:one"]', 700);
    await selection(page).waitFor();
    await pressBack(page);
    await expect.poll(() => selection(page).count()).toBe(0);
    expect(new URL(page.url()).hash).toBe('#/?src=mine');

    await holdFinger(page, 'a[data-artboard="mine:one"]', 700, 40);
    await page.waitForTimeout(200);
    expect(await selection(page).count()).toBe(0);
    expect(new URL(page.url()).hash).toBe('#/?src=mine');

    await holdFinger(page, 'a[data-artboard="mine:one"]', 700);
    await artboard(page, 'two').tap();
    await selection(page).getByRole('button', { name: 'Delete' }).tap();
    expect(await page.locator('a[data-artboard^="mine:"]').count()).toBe(3);
    await selection(page).getByRole('button', { name: 'Confirm delete' }).tap();
    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(1);
    expect(await artboard(page, 'three').count()).toBe(1);
    expect(await selection(page).count()).toBe(0);
  });

  test('on a phone, the bar keeps its count on one line and the credit gives way to it', async () => {
    const page = await mineLibrary(true);
    const credit = page.locator('footer p').first();
    await holdFinger(page, 'a[data-artboard="mine:one"]', 700);
    await selection(page).waitFor();

    const count = await selection(page)
      .getByText('1 selected')
      .evaluate((span) => ({
        height: span.getBoundingClientRect().height,
        line: Number.parseFloat(getComputedStyle(span).lineHeight),
      }));
    expect(count.height).toBeLessThan(count.line * 1.5);
    expect(await credit.isVisible()).toBe(false);

    await selection(page).getByRole('button', { name: 'Cancel' }).tap();
    await expect.poll(() => credit.isVisible()).toBe(true);
  });

  test('on a phone, a held finger in the repo selects nothing', async () => {
    const page = await mineLibrary(true);
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await expect.poll(() => page.locator('a[data-artboard^="repo:"]').count()).toBeGreaterThan(0);
    const first = await page
      .locator('a[data-artboard^="repo:"]')
      .first()
      .getAttribute('data-artboard');
    const session = await page.context().newCDPSession(page);
    const box = await page.locator(`a[data-artboard="${first}"]`).boundingBox();
    const point = { x: (box?.x ?? 0) + 20, y: (box?.y ?? 0) + 20, id: 1 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(700);

    expect(await selection(page).count()).toBe(0);
    expect(await page.locator('[role="checkbox"]').count()).toBe(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  });

  test('on a notebook: a held mouse selects, Space toggles the focused one, and Delete takes the copy out of Changes', async () => {
    const page = await mineLibrary(false);
    await artboard(page, 'three').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
    );
    const board = await page.locator('[data-open-board] svg[data-board]').boundingBox();
    await page.mouse.click(
      (board?.x ?? 0) + (board?.width ?? 0) / 2 + 1,
      (board?.y ?? 0) + (board?.height ?? 0) / 2
    );
    await page.locator('[data-changes-chip]').first().waitFor();
    await page.getByRole('button', { name: 'Back to the library' }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'library'
    );

    const box = await artboard(page, 'three').boundingBox();
    await page.mouse.move((box?.x ?? 0) + 30, (box?.y ?? 0) + 30);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect.poll(() => selection(page).textContent()).toContain('1 selected');
    expect(new URL(page.url()).hash).toBe('#/?src=mine');
    await artboard(page, 'one').focus();
    await page.keyboard.press(' ');
    await expect.poll(() => selection(page).textContent()).toContain('2 selected');
    await selection(page).getByRole('button', { name: 'Delete' }).click();
    await selection(page).getByRole('button', { name: 'Confirm delete' }).click();

    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(1);
    await expect.poll(() => page.locator('[data-changes-chip]').count()).toBe(0);
  });

  test('a search counts and deletes only the selected mazes it shows, and Delete keeps the search', async () => {
    const page = await mineLibrary(false);
    await holdMouse(page, 'one', 700);
    await artboard(page, 'two').click();
    await expect.poll(() => selection(page).textContent()).toContain('2 selected');
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('three');
    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(1);

    await expect.poll(() => selection(page).textContent()).toContain('0 selected');
    expect(await selection(page).getByRole('button', { name: 'Delete' }).isDisabled()).toBe(true);
    await artboard(page, 'three').click();
    await selection(page).getByRole('button', { name: 'Delete' }).click();
    await selection(page).getByRole('button', { name: 'Confirm delete' }).click();

    await expect.poll(() => mineCount(page)).toBe(2);
    expect(new URL(page.url()).hash).toBe('#/?src=mine&q=three');
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('');
    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(2);
  });

  test('a mouse that moves 15 px while held selects nothing', async () => {
    const page = await mineLibrary(false);
    const box = await artboard(page, 'one').boundingBox();
    const x = (box?.x ?? 0) + 30;
    const y = (box?.y ?? 0) + 30;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 15, y, { steps: 3 });
    await page.waitForTimeout(700);

    expect(await selection(page).count()).toBe(0);
    await page.mouse.up();
  });

  test('a mouse pressed on an artboard and released far away selects nothing', async () => {
    const page = await mineLibrary(false);
    const box = await artboard(page, 'one').boundingBox();
    await page.mouse.move((box?.x ?? 0) + 30, (box?.y ?? 0) + 30);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(700);
    await page.mouse.up();

    expect(await selection(page).count()).toBe(0);
  });

  test('Shift and Space on a focused artboard start selecting, and opening a maze clears it', async () => {
    const page = await mineLibrary(false);
    await artboard(page, 'one').focus();
    await page.keyboard.press('Shift+Space');
    await expect.poll(() => selection(page).textContent()).toContain('1 selected');
    expect(
      await page
        .locator('[data-selection-count][aria-live="polite"]', { hasText: '1 selected' })
        .count()
    ).toBe(1);

    await page.evaluate(() => {
      window.location.hash = '#/mine/two';
    });
    await page.getByRole('heading', { level: 1, name: 'Maze two' }).waitFor();
    await page.getByRole('button', { name: 'Back to the library' }).click();
    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(3);

    expect(await selection(page).count()).toBe(0);
    expect(await page.locator('[role="checkbox"]').count()).toBe(0);
  });
});
