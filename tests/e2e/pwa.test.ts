import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

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

const ROOT = join(import.meta.dirname, '..', '..');
const BUILDS = join(ROOT, 'node_modules', '.tmp');
const BASE = '/maze-studio/';

let dist: string;
let server: PreviewServer;
let app: string;
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
  mkdirSync(BUILDS, { recursive: true });
  dist = mkdtempSync(join(BUILDS, 'pwa-e2e-'));
  execFileSync('bunx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', BASE_PATH: BASE },
    stdio: 'pipe',
  });
  server = await preview({
    configFile: false,
    root: ROOT,
    base: BASE,
    logLevel: 'silent',
    build: { outDir: dist },
    preview: { port: 0, host: '127.0.0.1' },
  });
  const local = server.resolvedUrls?.local[0] ?? '';
  app = new URL(BASE, local).href;
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
  await server?.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('the PWA built for GitHub Pages', () => {
  test('opens the page under its base path', async () => {
    const page = await fresh();
    await page.goto(app);

    await page.getByRole('heading', { level: 1, name: 'maze-studio' }).waitFor();
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
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
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
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute('media')));
    expect(colors).toEqual(
      expect.arrayContaining(['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)'])
    );
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
    await page.getByRole('heading', { level: 1, name: 'maze-studio' }).waitFor();
  });
});
