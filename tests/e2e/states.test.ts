import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { loadSnapshot } from '@/library/snapshot';
import { readZip } from '@/library/zip';
import { encodeMazeCode, toggleWall, type Edge } from '@/maze';
import {
  edgeMiddle,
  expectSaved,
  pagePoint,
  repoContent,
  repoText,
  sameMaze,
  storeMine,
} from '@tests/support/e2e/board-page';
import { expectToast, openPage, waitForMode } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const ROOT = join(import.meta.dirname, '..', '..');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EDGE: Edge = { direction: 'vertical', x: 6, y: 9 };
const API = 'https://api.github.com/repos/micromouseonline/mazefiles';
const NEWER = 'f'.repeat(40);
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'etag' };

let browser: Browser;
const contexts: BrowserContext[] = [];
const folders: string[] = [];

function scratch(name: string): string {
  const folder = mkdtempSync(join(ROOT, 'node_modules', '.tmp', name));
  folders.push(folder);
  return folder;
}

async function mineMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'My mazes and files' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

function creditNote(page: Page): Promise<string | null> {
  return page.locator('[data-update-note]').textContent();
}

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();

  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe('Empty and error states (DESIGN.md 12)', () => {
  test('the maze list filter that finds nothing says so in a row', async () => {
    const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`);
    await waitForMode(page, 'editor');
    await page.keyboard.press('l');
    await page.getByPlaceholder('Filter mazes…').fill('no maze has this name');

    await page.getByText('No maze matches').waitFor();
    expect(await page.locator('#maze-list [cmdk-item]').count()).toBe(0);
  });

  test('the first save to My mazes where the storage may be cleared says so once', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await context.addInitScript(() => {
      Object.assign(navigator.storage, {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
      });
    });
    const page = await context.newPage();
    await page.goto(`${app}#/repo/${CLASSIC}`);
    await waitForMode(page, 'editor');
    const { maze } = await repoContent(CLASSIC);
    const point = await pagePoint(page, maze, edgeMiddle(EDGE));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));

    await expectToast(page, 'This browser may clear My mazes. Export a backup from the menu.');
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(maze));
    await expect
      .poll(() =>
        page
          .getByRole('region', { name: /^Notifications/ })
          .locator('li', { hasText: 'may clear My mazes' })
          .count()
      )
      .toBeLessThanOrEqual(1);
  });

  test('Export all downloads the readable mazes and details the skipped one with its reason', async () => {
    const page = await openPage(browser, contexts, app);
    const { maze } = await repoContent(CLASSIC);
    await storeMine(page, [
      { id: 'good', name: 'Good maze', code: encodeMazeCode(maze) },
      { id: 'bad', name: 'Broken maze', code: 'not a maze code' },
    ]);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      mineMenu(page, 'Export all'),
    ]);

    expect(download.suggestedFilename()).toMatch(/^maze-studio-mine-\d{4}-\d{2}-\d{2}\.zip$/);
    const path = join(scratch('export-'), download.suggestedFilename());
    await download.saveAs(path);
    const zip = await readZip(new Uint8Array(readFileSync(path)));
    expect(zip.ok && zip.value.map((entry) => entry.name)).toEqual([
      'Good-maze.txt',
      'maze-studio-backup.json',
    ]);

    await expectToast(page, 'Exported 1, skipped 1');
    await page.getByRole('button', { name: 'Details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Skipped in the export' });
    await dialog.waitFor();
    expect(await dialog.getByRole('listitem').count()).toBe(1);
    expect(await dialog.getByRole('listitem').textContent()).toContain('Broken maze');
  });

  test('Import adds, renames on a clash and skips with the reason, then shows My mazes', async () => {
    const page = await openPage(browser, contexts, app);
    const text = repoText(CLASSIC);
    await page.locator('input[data-import]').setInputFiles([
      { name: 'Alpha.txt', mimeType: 'text/plain', buffer: Buffer.from(text) },
      { name: 'alpha.txt', mimeType: 'text/plain', buffer: Buffer.from(text) },
      { name: 'broken.txt', mimeType: 'text/plain', buffer: Buffer.from('o---o\n|x\n') },
      { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# notes\n') },
      { name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.alloc(1024 * 1024 + 1, 0x20) },
    ]);
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await dialog.waitFor();

    const sections = await dialog
      .locator('section')
      .evaluateAll((all) => all.map((section) => section.textContent ?? ''));
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatch(/^Added1Alpha$/);
    expect(sections[1]).toMatch(/^Renamed1alpha 2alpha was taken$/);
    expect(sections[2]).toContain('broken.txt');
    expect(sections[2]).toContain('notes.mdnot a .txt maze file');
    expect(sections[2]).toContain('huge.txtlarger than 1 MiB');

    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForFunction(() => window.location.hash.includes('src=mine'));
    await expect.poll(() => page.locator('a[data-artboard^="mine:"]').count()).toBe(2);
  });

  test('a failed check for updates puts the reason on the credit, with the commit in use', async () => {
    const page = await openPage(browser, contexts, app);
    const { commit } = await loadSnapshot();
    await page.route(`${API}/**`, (route) => route.abort('internetdisconnected'));
    await mineMenu(page, 'Check for updates');

    await expect
      .poll(() => creditNote(page))
      .toBe(`Offline, using the copy from ${commit.slice(0, 7)}`);
  });
});

describe('Check for updates', () => {
  test('a newer commit updates the library and the credit says so', async () => {
    const page = await openPage(browser, contexts, app);
    const snapshot = await loadSnapshot();
    const kept = snapshot.files.slice(1);
    await page.route(`${API}/branches/master`, (route) => json(route, { commit: { sha: NEWER } }));
    await page.route(`${API}/git/trees/${NEWER}?recursive=1`, (route) =>
      json(route, {
        truncated: false,
        tree: kept.map((file) => ({ path: file.path, sha: file.sha, type: 'blob' })),
      })
    );
    await mineMenu(page, 'Check for updates');

    await expect.poll(() => creditNote(page)).toBe('Updated');
    await expect
      .poll(() => page.locator('footer').textContent())
      .toContain(`${kept.length} mazes from micromouseonline/mazefiles at ${NEWER.slice(0, 7)}`);
    await page.reload();
    await page.locator('a[data-artboard]').first().waitFor();
    expect(await page.locator('footer').textContent()).toContain(`at ${NEWER.slice(0, 7)}`);
  });

  test('the same commit leaves the library as it is and says it is up to date', async () => {
    const page = await openPage(browser, contexts, app);
    const { commit, files } = await loadSnapshot();
    await page.route(`${API}/branches/master`, (route) => json(route, { commit: { sha: commit } }));
    await mineMenu(page, 'Check for updates');

    await expect.poll(() => creditNote(page)).toBe('Up to date');
    expect(await page.locator('footer').textContent()).toContain(
      `${files.length} mazes from micromouseonline/mazefiles at ${commit.slice(0, 7)}`
    );
  });
});
