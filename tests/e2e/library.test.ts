import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const app = inject('appUrl');
const BOTTOM_INSET = 72;
const TOP_INSET = 112;
const FILE = `o---o---o---o
|           |
o   o---o   o
| S       G |
o---o---o---o
`;

let browser: Browser;
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

  test('21 finds the six 21×21 mazes', async () => {
    const page = await library();
    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('21');
    await page.waitForFunction(() => document.querySelectorAll('a[data-artboard]').length === 6);

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
      await page.getByRole('heading', { level: 1, name: 'corridor' }).waitFor();

      expect(await page.getByText('Opened from a file').isVisible()).toBe(true);
      expect(new URL(page.url()).hash).toBe('#/');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
