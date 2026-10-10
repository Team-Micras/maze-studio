import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { toggleWall, type Edge } from '@/maze';
import {
  edgeMiddle,
  expectSaved,
  pagePoint,
  repoContent,
  sameMaze,
} from '@tests/support/e2e/board-page';
import { BASE } from '@tests/support/e2e/serve-app';
import { waitForMode } from '@tests/support/e2e/studio-page';

interface Icon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: string;
}

interface Manifest {
  readonly name: string;
  readonly display: string;
  readonly start_url: string;
  readonly scope: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly Icon[];
}

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null && 'icons' in value && 'name' in value;
}

const app = inject('appUrl');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EDGE: Edge = { direction: 'vertical', x: 6, y: 9 };
let browser: Browser;
const contexts: BrowserContext[] = [];

async function fresh(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  return context.newPage();
}

async function controlled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 20_000,
  });
}

async function precachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.includes('precache')) ?? '');
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('the PWA built for GitHub Pages', () => {
  test('opens the library under its base path', async () => {
    const page = await fresh();
    await page.goto(app);

    await page.locator('a[data-artboard]').first().waitFor();
    expect(await page.title()).toBe('maze-studio');
    expect(
      await page.getByRole('link', { name: 'micromouseonline/mazefiles' }).getAttribute('href')
    ).toBe('https://github.com/micromouseonline/mazefiles');
  });

  test('serves a valid manifest whose icons exist, linked from the page', async () => {
    const page = await fresh();
    await page.goto(app);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const manifestUrl = new URL(href ?? '', app).href;
    const response = await page.request.get(manifestUrl);
    expect(response.ok()).toBe(true);
    const manifest: unknown = await response.json();
    if (!isManifest(manifest)) {
      throw new Error('the manifest has no name or icons');
    }

    expect(manifest.name).toBe('maze-studio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe(BASE);
    expect(manifest.scope).toBe(BASE);
    expect(manifest.theme_color).toBe('#191919');
    expect(manifest.background_color).toBe('#191919');
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const file = await page.request.get(new URL(icon.src, manifestUrl).href);
      expect(file.ok()).toBe(true);
      expect(file.headers()['content-type']).toContain(icon.type);
    }

    const colors = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute('content')));
    expect(colors).toHaveLength(1);
    expect(['#e3e3e3', '#191919']).toContain(colors[0]);
  });

  test('registers the service worker, which precaches the shell and the latin fonts only', async () => {
    const page = await fresh();
    await page.goto(app);
    await controlled(page);

    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.scope
    );
    expect(scope).toBe(app);

    const paths = await precachedPaths(page);
    expect(paths).toEqual(
      expect.arrayContaining([`${BASE}index.html`, `${BASE}manifest.webmanifest`])
    );
    expect(paths.some((path) => /geist-latin-wght/.test(path))).toBe(true);
    expect(paths.some((path) => /geist-mono-latin-ext-wght/.test(path))).toBe(true);
    expect(paths.filter((path) => /cyrillic|vietnamese|symbols/.test(path))).toEqual([]);
  });

  test('reloads offline from the cache', async () => {
    const page = await fresh();
    await page.goto(app);
    await controlled(page);

    await page.context().setOffline(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await page.getByRole('link', { name: 'micromouseonline/mazefiles' }).waitFor();
    await page.locator('a[data-artboard]').first().waitFor();
  });

  test('after the first visit, opens, searches, edits and saves with no network', async () => {
    const page = await fresh();
    await page.goto(app);
    await controlled(page);
    await page.context().setOffline(true);
    await page.reload();
    await page.locator('a[data-artboard]').first().waitFor();

    await page.getByRole('searchbox', { name: 'Search mazes' }).fill('AAMC15Maze');
    await expect.poll(() => page.locator('a[data-artboard]').count()).toBe(1);
    await page.locator(`a[data-artboard="repo:${CLASSIC}"]`).click();
    await waitForMode(page, 'editor');
    const { maze } = await repoContent(CLASSIC);
    const point = await pagePoint(page, maze, edgeMiddle(EDGE));
    await page.mouse.click(point.x, point.y);

    const saved = await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    expect(saved.origin?.path).toBe(CLASSIC);
  });
});
