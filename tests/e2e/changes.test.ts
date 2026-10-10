import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { borderedMaze, encodeMazeCode, hasWall, toggleWall, type Edge, type Maze } from '@/maze';
import {
  contentOf,
  edgeMiddle,
  expectSaved,
  mineCount,
  mineId,
  pagePoint,
  repoContent,
  repoText,
  sameMaze,
  storedMine,
} from '@tests/support/e2e/board-page';
import { openPage, waitForMode } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const ROOT = join(import.meta.dirname, '..', '..');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EDGE: Edge = { direction: 'vertical', x: 6, y: 9 };
const OTHER: Edge = { direction: 'horizontal', x: 3, y: 5 };

let browser: Browser;
const contexts: BrowserContext[] = [];

async function openMaze(hash: string, context?: BrowserContext): Promise<Page> {
  const page =
    context === undefined ? await openPage(browser, contexts, app, hash) : await context.newPage();

  if (context !== undefined) {
    await page.goto(`${app}${hash}`);
    await page.locator('a[data-artboard]').first().waitFor();
  }

  await waitForMode(page, 'editor');
  return page;
}

async function clickEdge(page: Page, maze: Maze, edge: Edge): Promise<void> {
  const point = await pagePoint(page, maze, edgeMiddle(edge));
  await page.mouse.click(point.x, point.y);
}

async function openChanges(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Changes in this session/ }).click();
  await page.getByRole('dialog', { name: 'Changes in this session' }).waitFor();
}

async function discard(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Discard ${name}` }).click();
  await page.getByRole('button', { name: `Confirm discard of ${name}` }).click();
}

function summary(page: Page): Promise<string | null> {
  return page.locator('[data-change] [data-summary]').first().textContent();
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('Changes of the session', () => {
  test('a copy of the repository: Discard deletes it and goes back to the original', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));

    await expect
      .poll(() => page.getByRole('button', { name: 'Changes in this session: 1' }).count())
      .toBe(1);
    await openChanges(page);
    await expect.poll(() => summary(page)).toBe('1 wall removed');
    await discard(page, 'AAMC15Maze (edited)');

    await page.waitForFunction((hash) => window.location.hash === hash, `#/repo/${CLASSIC}`);
    await expect.poll(() => mineCount(page)).toBe(0);
    expect(await page.locator('h1').textContent()).toBe('AAMC15Maze');
    expect(await page.locator('[data-changes-chip]').count()).toBe(0);
  });

  test('a new maze: Discard deletes it and goes back to the library', async () => {
    const page = await openPage(browser, contexts, app);
    await page.getByRole('button', { name: 'New maze' }).click();
    await page.getByRole('menuitem', { name: 'Training, 16 × 16' }).click();
    await waitForMode(page, 'editor');
    const maze = borderedMaze(16, 16);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await openChanges(page);

    await expect.poll(() => summary(page)).toBe('New maze');
    await discard(page, 'Untitled maze');
    await waitForMode(page, 'library');
    await expect.poll(() => mineCount(page)).toBe(0);
  });

  test('a .txt file opened and saved: Discard deletes the copy and goes back to the library', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openPage(browser, contexts, app);
    const folder = mkdtempSync(join(ROOT, 'node_modules', '.tmp', 'changes-file-'));
    const file = join(folder, 'corridor.txt');
    writeFileSync(file, repoText(CLASSIC));

    try {
      await page.locator('input[data-open-file]').setInputFiles(file);
      await page.getByRole('heading', { level: 1, name: 'corridor', exact: true }).waitFor();
      await waitForMode(page, 'editor');
      await clickEdge(page, maze, EDGE);
      await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
      await openChanges(page);
      await discard(page, 'corridor (edited)');

      await waitForMode(page, 'library');
      await expect.poll(() => mineCount(page)).toBe(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('a link saved: Discard deletes the copy and goes back to the link', async () => {
    const { maze } = await repoContent(CLASSIC);
    const code = encodeMazeCode(maze, { name: 'Shared one' });
    const page = await openMaze(`#/m/${code}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await openChanges(page);
    await discard(page, 'Shared one (edited)');

    await page.waitForFunction((hash) => window.location.hash === hash, `#/m/${code}`);
    await expect.poll(() => mineCount(page)).toBe(0);
  });

  test('a maze of Mine from before the session: Discard puts back its state at the start', async () => {
    const { maze } = await repoContent(CLASSIC);
    const first = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(first, maze, EDGE);
    const before = toggleWall(maze, EDGE);
    await expectSaved(first, sameMaze(before));
    const id = mineId(first) ?? '';

    const page = await openMaze(`#/mine/${id}`, first.context());
    await first.close();
    await page.reload();
    await waitForMode(page, 'editor');
    await clickEdge(page, maze, OTHER);
    await expectSaved(page, sameMaze(toggleWall(before, OTHER)));
    await openChanges(page);

    await expect
      .poll(() => summary(page))
      .toBe(hasWall(before, OTHER) ? '1 wall removed' : '1 wall added');
    await discard(page, 'AAMC15Maze (edited)');
    await expectSaved(page, sameMaze(before));
    expect(new URL(page.url()).hash).toBe(`#/mine/${id}`);
    await clickEdge(page, maze, OTHER);
    await expectSaved(page, sameMaze(toggleWall(before, OTHER)));
  });

  test('a change undone stays as "No differences", and the copy stays in Mine', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await page.keyboard.press('Control+z');
    await expectSaved(page, sameMaze(maze));
    await openChanges(page);

    await expect.poll(() => summary(page)).toBe('No differences');
    expect(await mineCount(page)).toBe(1);
  });

  test('Keep takes the item out and keeps the copy, and the chip hides with nothing left', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await openChanges(page);
    await page.getByRole('button', { name: 'Keep AAMC15Maze (edited)' }).click();

    await expect.poll(() => page.locator('[data-changes-chip]').count()).toBe(0);
    await expect.poll(() => page.locator('[data-change]').count()).toBe(0);
    expect(await mineCount(page)).toBe(1);
  });

  test('D shows the diff on the board and hides it again; the thumbnail shows it too', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, OTHER);
    await expectSaved(page, sameMaze(toggleWall(maze, OTHER)));
    await page.locator('#canvas').focus();
    await page.keyboard.press('d');

    await expect.poll(() => page.locator('[data-layer^="diff-"]').count()).toBeGreaterThan(0);
    await page.keyboard.press('d');
    await expect.poll(() => page.locator('[data-layer^="diff-"]').count()).toBe(0);
    await openChanges(page);
    await expect.poll(() => page.locator('[data-change] canvas[data-painted]').count()).toBe(1);
  });
});

describe('Leaving a maze edited in the session', () => {
  test.each(['the Library button', 'the browser Back'])(
    'with %s lands on its copy, with the filter on Mine',
    async (how) => {
      const page = await openPage(browser, contexts, app);
      const artboard = page.locator(`a[data-artboard="repo:${CLASSIC}"]`);
      await page.getByRole('searchbox').fill('AAMC15');
      await artboard.click();
      await waitForMode(page, 'editor');
      const { maze } = await repoContent(CLASSIC);
      await clickEdge(page, maze, EDGE);
      await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
      const id = mineId(page) ?? '';

      if (how === 'the browser Back') {
        await page.goBack();
      } else {
        await page.getByRole('button', { name: 'Back to the library' }).click();
      }

      await waitForMode(page, 'library');

      expect(new URL(page.url()).hash).toBe('#/?src=mine');
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-artboard')))
        .toBe(`mine:${id}`);
      const item = await storedMine(page, id);
      expect(item === undefined ? undefined : contentOf(item).maze.width).toBe(16);
    }
  );
});
