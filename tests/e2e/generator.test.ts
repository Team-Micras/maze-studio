import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { GENERATOR_VERSION, readRecipe, savedGrid, toMaze, type SavedRecipe } from '@/generator';
import { toggleWall, type Edge } from '@/maze';
import {
  contentOf,
  edgeMiddle,
  expectSaved,
  mineId,
  pagePoint,
  repoContent,
  sameMaze,
  storedMine,
} from '@tests/support/e2e/board-page';
import { expectToast, openPage, waitForMode } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EDGE: Edge = { direction: 'horizontal', x: 4, y: 5 };
const GENERATION = { timeout: 60_000 };

let browser: Browser;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

async function openGenerate(page: Page, menu: string): Promise<void> {
  await page.getByRole('button', { name: menu }).first().click();
  const item = page.getByRole('menuitem', { name: /^Generate…/ });
  expect(await item.textContent()).toContain('Beta');
  await item.click();
  await page.getByRole('dialog', { name: 'Generate' }).waitFor();
}

async function generateAndPick(page: Page, card: number, hint?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Generate' });
  await dialog.getByRole('spinbutton', { name: 'First seed' }).fill('1');
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
  await dialog.getByRole('button', { name: /^#8,/ }).waitFor(GENERATION);
  await dialog.getByRole('button', { name: new RegExp(`^#${card},`) }).click();

  if (hint !== undefined) {
    await dialog.getByText(hint).waitFor();
  }

  await dialog.getByRole('button', { name: 'Use this' }).click();
  await waitForMode(page, 'editor');
}

describe('Generate in New maze (beta)', () => {
  test('opens the maze picked as a new maze, keeps its recipe only with its own walls, and on reopening', async () => {
    const page = await openPage(browser, contexts, app);
    await openGenerate(page, 'New maze');
    await page.getByText('Rules', { exact: true }).click();
    await page.getByRole('switch', { name: 'Never trivial' }).click();
    await generateAndPick(page, 2);

    const title = await page.locator('h1').textContent();
    expect(title).toMatch(/^Generated \d+$/);
    expect(new URL(page.url()).hash).toBe('#/');
    const recipe = await copiedRecipe(page);
    expect(recipe).toMatchObject({
      version: GENERATOR_VERSION,
      seed: Number(title?.replace('Generated ', '')),
      settings: { size: 16, contest: false },
    });
    expect(recipe.hash).toMatch(/^[0-9a-f]{8}$/);

    const generated = toMaze(savedGrid({ ...recipe, walls: recipe.walls ?? '' }));
    const point = await pagePoint(page, generated, edgeMiddle(EDGE));
    await page.mouse.click(point.x, point.y);
    const drawn = await expectSaved(page, sameMaze(toggleWall(generated, EDGE)));
    expect(drawn.name).toBe(title);
    expect(drawn.profile).toBe('classic');
    expect(drawn.recipe).toBeUndefined();
    await page.getByRole('button', { name: 'More actions' }).click();
    expect(await page.getByRole('menuitem', { name: 'Copy recipe' }).count()).toBe(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Undo' }).click();
    const saved = await expectSaved(
      page,
      (content) => sameMaze(generated)(content) && mineId(page) !== undefined
    );
    await expect
      .poll(async () => (await storedMine(page, mineId(page) ?? ''))?.recipe)
      .toEqual(recipe);
    expect(saved.name).toBe(title);

    const id = mineId(page) ?? '';
    await page.reload();
    await waitForMode(page, 'editor');
    expect((await storedMine(page, id))?.recipe).toEqual(recipe);
    expect(await copiedRecipe(page)).toEqual(recipe);

    await page.getByRole('button', { name: 'Back to the library' }).click();
    await waitForMode(page, 'library');
    await openGenerate(page, 'New maze');
    expect(
      await page
        .getByRole('dialog', { name: 'Generate' })
        .getByText('Custom (from Recommended) · 16 × 16, 60–100 cells')
        .count()
    ).toBe(1);
  });

  test('is a sheet on a phone, and opens the maze picked to view', async () => {
    const page = await openPage(browser, contexts, app, '#/', {
      width: 390,
      height: 844,
      touch: true,
    });
    await openGenerate(page, 'New maze and more');
    const box = await page.getByRole('dialog', { name: 'Generate' }).boundingBox();
    expect(box).toMatchObject({ x: 0, width: 390 });
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(844, 0);

    await generateAndPick(page, 1);
    expect(await page.locator('h1').textContent()).toMatch(/^Generated \d+$/);
    expect(await page.getByRole('button', { name: 'Edit' }).count()).toBe(1);
  });
});

/** The recipe Copy recipe of the ⋯ menu puts on the clipboard. */
async function copiedRecipe(page: Page): Promise<SavedRecipe> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Copy recipe' }).click();
  await expectToast(page, 'Recipe copied');
  return readRecipe(await page.evaluate(() => navigator.clipboard.readText()));
}

describe('Generate in the editor (beta)', () => {
  test('replaces the walls of the open maze as one step, which Undo takes back', async () => {
    const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`);
    await waitForMode(page, 'editor');
    const original = (await repoContent(CLASSIC)).maze;
    await openGenerate(page, 'More actions');
    await generateAndPick(page, 1, 'Replaces the maze on the board. Undo brings it back.');

    const replaced = await expectSaved(page, (content) => !sameMaze(original)(content));
    expect(replaced.recipe).toMatchObject({ version: GENERATOR_VERSION, settings: { size: 16 } });
    expect(await page.locator('h1').textContent()).toBe(replaced.name);
    const recipe = await copiedRecipe(page);
    expect(recipe).toEqual(replaced.recipe);
    const generated = toMaze(savedGrid({ ...recipe, walls: recipe.walls ?? '' }));
    expect(sameMaze(generated)(contentOf(replaced))).toBe(true);

    await page.getByRole('button', { name: 'Undo' }).click();
    const undone = await expectSaved(page, sameMaze(original));
    expect(undone.recipe).toBeUndefined();
    expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(true);
  });
});
