import { createServer, type Server } from 'node:http';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { READY_MESSAGE, THEME_MESSAGE } from '@/ui/embed/theme-message';

const app = inject('appUrl');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EMBED = `${app}?embed#/repo/${CLASSIC}`;

let browser: Browser;
let host: Server;
const contexts: BrowserContext[] = [];

async function newPage(width = 1280, height = 800): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  contexts.push(context);
  return context.newPage();
}

/**
 * A page of another site, taller than its viewport, with the embed in a frame in the middle, which
 * sends the frame the dark theme once it says it is ready, as the README shows.
 */
function hostPage(src = EMBED): string {
  return `<!doctype html>
<html lang="en">
  <head><title>Results</title></head>
  <body style="margin: 0">
    <div style="height: 300px"></div>
    <iframe
      src="${src}"
      title="The maze of the final"
      loading="lazy"
      style="display: block; width: 640px; aspect-ratio: 4 / 3; border: 0"
    ></iframe>
    <div style="height: 2000px"></div>
    <script>
      const frame = document.querySelector('iframe');
      window.addEventListener('message', (event) => {
        if (event.source === frame.contentWindow && event.data?.type === '${READY_MESSAGE}') {
          document.body.dataset.ready = 'true';
          frame.contentWindow.postMessage(
            { type: '${THEME_MESSAGE}', theme: 'dark' },
            '${new URL(app).origin}'
          );
        }
      });
    </script>
  </body>
</html>`;
}

/**
 * Serves {@link hostPage} on another port of the loopback, so the frame is of another origin; a
 * page Playwright fulfils counts as public, and Chromium refuses a public page framing a local one.
 */
function serveHost(): Promise<Server> {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url === '/plain' ? hostPage(`${app}#/repo/${CLASSIC}`) : hostPage());
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function hostUrl(path = '/results'): string {
  const address = host.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the host page is not served on a port');
  }

  return `http://127.0.0.1:${address.port}${path}`;
}

beforeAll(async () => {
  browser = await chromium.launch();
  host = await serveHost();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
  await new Promise((resolve) => host?.close(resolve));
});

describe('The embed on the built app', () => {
  test('shows the maze alone, loads none of the editor and registers no service worker', async () => {
    const page = await newPage();
    const requested: string[] = [];
    const scripts: Promise<string>[] = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.endsWith('.js')) {
        scripts.push(response.text());
      }
    });
    await page.goto(EMBED);
    await page.getByRole('img', { name: 'AAMC15Maze, AAMC, 16 by 16' }).waitFor();
    await page.waitForLoadState('load');

    expect(await page.locator('[data-studio-mode], [role="application"], button').count()).toBe(0);
    expect(requested.filter((path) => /\/assets\/(app|radix)-/.test(path))).toEqual([]);
    expect(requested.some((path) => /\/assets\/embed-/.test(path))).toBe(true);
    expect((await Promise.all(scripts)).filter((text) => text.includes('indexedDB'))).toEqual([]);
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
    ).toBe(0);
    expect(await page.getByRole('link', { name: 'Open in maze-studio' }).getAttribute('href')).toBe(
      `${app}#/repo/${CLASSIC}`
    );
  });

  test('in a frame without ?embed is still the embed, and loads none of the app', async () => {
    const page = await newPage();
    const requested: string[] = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await page.goto(hostUrl('/plain'));
    await page
      .frameLocator('iframe')
      .getByRole('img', { name: 'AAMC15Maze, AAMC, 16 by 16' })
      .waitFor();

    expect(await page.frameLocator('iframe').locator('[data-studio-mode], button').count()).toBe(0);
    expect(requested.filter((path) => /\/assets\/(app|radix)-/.test(path))).toEqual([]);
    expect(requested.some((path) => /\/assets\/embed-/.test(path))).toBe(true);
  });

  test('in a frame takes the theme its page posts once it says it is ready', async () => {
    const page = await newPage();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(hostUrl());

    await page.locator('body[data-ready="true"]').waitFor({ state: 'attached' });
    await expect.poll(() => page.frameLocator('iframe').locator('html.dark').count()).toBe(1);
  });

  test('in a frame lets the wheel scroll the page around it', async () => {
    const page = await newPage();
    await page.goto(hostUrl());
    await page
      .frameLocator('iframe')
      .getByRole('img', { name: /^AAMC15Maze,/ })
      .waitFor();
    const box = await page.locator('iframe').boundingBox();

    if (box === null) {
      throw new Error('no frame on the page');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
