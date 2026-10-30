import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { GENERATOR_VERSION, readRecipe, savedGrid, toMaze, type SavedRecipe } from '@/generator';
import { toggleWall, type Edge } from '@/maze';
import {
  contentOf,
  edgeMiddle,
  expectSaved,
  mineCount,
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

/** The card of maze `n` once its maze is built: a card still building is a button too. */
function builtCard(dialog: Locator, n: number): Locator {
  return dialog.getByRole('button', { name: new RegExp(`^#${n}, (?!building$)`) });
}

async function generateAndPick(page: Page, card: number, hint?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Generate' });

  if ((await dialog.getByRole('spinbutton', { name: 'First seed' }).count()) === 0) {
    await dialog.getByRole('button', { name: 'Settings' }).click();
  }

  await dialog.getByRole('spinbutton', { name: 'First seed' }).fill('1');
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
  await builtCard(dialog, 8).waitFor(GENERATION);
  await builtCard(dialog, card).click(GENERATION);
  await dialog.getByRole('heading', { name: new RegExp(`^#${card} of`) }).waitFor();

  if (hint !== undefined) {
    await dialog.getByText(hint).waitFor();
  }

  await dialog.getByRole('button', { name: 'Use this' }).click();
  await waitForMode(page, 'editor');
}

describe('Generate in New maze (beta)', () => {
  test('opens the maze picked as a new maze saved in My mazes, keeps its recipe only with its own walls, and on reopening', async () => {
    const page = await openPage(browser, contexts, app);
    await openGenerate(page, 'New maze');
    await page.getByText('Rules', { exact: true }).click();
    await page.getByRole('switch', { name: 'Never trivial' }).click();
    await generateAndPick(page, 2);

    const title = await page.locator('h1').textContent();
    expect(title).toMatch(/^Generated \d+$/);
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const id = mineId(page) ?? '';
    const recipe = await copiedRecipe(page);
    expect(recipe).toMatchObject({
      version: GENERATOR_VERSION,
      seed: Number(title?.replace('Generated ', '')),
      settings: { size: 16, contest: false },
    });
    expect(recipe.hash).toMatch(/^[0-9a-f]{8}$/);
    const generated = toMaze(savedGrid({ ...recipe, walls: recipe.walls ?? '' }));
    const kept = await expectSaved(page, sameMaze(generated));
    expect(kept).toMatchObject({ name: title, recipe });
    expect(await mineCount(page)).toBe(1);

    const point = await pagePoint(page, generated, edgeMiddle(EDGE));
    await page.mouse.click(point.x, point.y);
    const drawn = await expectSaved(page, sameMaze(toggleWall(generated, EDGE)));
    expect(mineId(page)).toBe(id);
    expect(await mineCount(page)).toBe(1);
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

    await page.reload();
    await waitForMode(page, 'editor');
    expect((await storedMine(page, id))?.recipe).toEqual(recipe);
    expect(await copiedRecipe(page)).toEqual(recipe);

    await page.getByRole('button', { name: 'Back to the library' }).click();
    await waitForMode(page, 'library');
    await openGenerate(page, 'New maze');
    const dialog = page.getByRole('dialog', { name: 'Generate' });

    if ((await dialog.getByRole('combobox', { name: 'Preset' }).count()) === 0) {
      await dialog.getByRole('button', { name: 'Settings' }).click();
    }

    expect(
      await dialog
        .getByRole('combobox', { name: 'Preset' })
        .evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.textContent)
    ).toBe('Custom (from Recommended)');
  });

  test('opens Generate on a new blank maze, which closing leaves unsaved and Use this opens as the new maze, saved', async () => {
    const page = await openPage(browser, contexts, app);
    await openGenerate(page, 'New maze');
    await waitForMode(page, 'editor');
    expect(await page.locator('h1').textContent()).toBe('Untitled maze');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.getByRole('dialog', { name: 'Generate' }).count()).toBe(0);
    expect(await mineCount(page)).toBe(0);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Export' }).waitFor();
    expect(await page.getByRole('menuitem', { name: 'Save to My mazes' }).count()).toBe(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Back to the library' }).click();
    await waitForMode(page, 'library');
    await openGenerate(page, 'New maze');
    await generateAndPick(page, 3, 'Opens as a new maze, saved in My mazes.');
    expect(await page.locator('h1').textContent()).toBe('Generated 3');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    expect(await mineCount(page)).toBe(1);
    expect((await storedMine(page, mineId(page) ?? ''))?.name).toBe('Generated 3');
  });

  test.each([
    [390, 844],
    [360, 780],
  ])('fills a %i × %i phone, and opens the maze picked to view', async (width, height) => {
    const page = await openPage(browser, contexts, app, '#/', { width, height, touch: true });
    await openGenerate(page, 'New maze and more');
    const dialog = page.getByRole('dialog', { name: 'Generate' });
    await expect.poll(() => dialog.boundingBox()).toEqual({ x: 0, y: 0, width, height });

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
    const walls = () =>
      page.locator('[data-open-board] [data-layer="red-walls"]').getAttribute('d');
    const before = await walls();
    await openGenerate(page, 'More actions');
    const dialog = page.getByRole('dialog', { name: 'Generate' });
    await dialog.getByRole('spinbutton', { name: 'First seed' }).fill('1');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await builtCard(dialog, 8).waitFor(GENERATION);
    await builtCard(dialog, 2).click(GENERATION);
    const subtitle = () => page.locator('h1 ~ p').first().textContent();
    await expect.poll(subtitle).toBe('Preview · seed 2');
    expect(await walls()).not.toBe(before);
    expect(await page.getByRole('button', { name: 'Undo' }).count()).toBe(0);
    expect(await mineCount(page)).toBe(0);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect.poll(walls).toBe(before);
    expect(await subtitle()).toBe('Classic, 16 × 16');
    expect(await mineCount(page)).toBe(0);

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

  test('opens a maze from the gallery, steps on, comes back where it was, and keeps the one used', async () => {
    const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`);
    await waitForMode(page, 'editor');
    await openGenerate(page, 'More actions');
    const dialog = page.getByRole('dialog', { name: 'Generate' });
    await dialog.getByRole('spinbutton', { name: 'First seed' }).fill('1');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await builtCard(dialog, 8).waitFor(GENERATION);
    const gallery = dialog.locator('.overflow-y-auto');
    await gallery.evaluate((element) => element.scrollTo({ top: 150 }));
    const scrolled = await gallery.evaluate((element) => element.scrollTop);

    await builtCard(dialog, 3).click(GENERATION);
    await dialog.getByRole('heading', { name: /^#3 of 8 · seed 3/ }).waitFor();
    await dialog.getByRole('button', { name: 'Next maze' }).click();
    await dialog.getByRole('heading', { name: /^#4 of 8 · seed 4/ }).waitFor();
    await expect.poll(() => page.locator('h1 ~ p').first().textContent()).toBe('Preview · seed 4');
    await dialog.getByRole('button', { name: 'Back to the mazes' }).click();
    await dialog.getByRole('list', { name: 'Mazes generated' }).waitFor();
    await expect.poll(() => gallery.evaluate((element) => element.scrollTop)).toBe(scrolled);

    await dialog.getByRole('button', { name: /^#4,/ }).click();
    await dialog.getByRole('button', { name: 'Use this' }).click();
    const replaced = await expectSaved(page, (content) => content.maze.width === 16);
    expect(replaced.recipe).toMatchObject({ seed: 4 });
  });

  test('reopens on the last batch with the maze used marked, and rebuilds a recipe as a batch of its own', async () => {
    const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await waitForMode(page, 'editor');
    await openGenerate(page, 'More actions');
    await generateAndPick(page, 2);

    await openGenerate(page, 'More actions');
    const dialog = page.getByRole('dialog', { name: 'Generate' });
    await dialog
      .getByText(/^Last batch · \d mazes$/)
      .first()
      .waitFor();
    await dialog.getByRole('button', { name: /^#2, in use,/ }).waitFor();
    await builtCard(dialog, 5).click();
    await dialog.getByRole('button', { name: 'Copy recipe' }).click();
    const recipe = await page.evaluate(() => navigator.clipboard.readText());
    const { seed } = readRecipe(recipe);

    await dialog.getByRole('button', { name: 'Settings' }).click();
    await dialog.getByText('Rebuild from a recipe').click();
    await dialog.getByRole('textbox', { name: 'Recipe' }).fill(recipe);
    await dialog.getByRole('button', { name: 'Rebuild' }).click();
    await dialog
      .getByRole('heading', { name: new RegExp(`^#1 of 1 · from a recipe · seed ${seed} `) })
      .waitFor(GENERATION);
    await dialog.getByRole('button', { name: /^Next maze/ }).click();
    await dialog
      .getByRole('heading', { name: new RegExp(`^#2 of 9 · seed ${seed + 1} `) })
      .waitFor(GENERATION);
    await dialog.getByRole('button', { name: 'Back to the mazes' }).click();
    await dialog
      .getByText(`Seeds ${seed}–${seed + 8}`)
      .first()
      .waitFor(GENERATION);
    expect(await dialog.locator('ol[aria-label="Mazes generated"] > li').count()).toBe(9);
    expect(await dialog.getByText('In use').count()).toBe(0);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await openGenerate(page, 'More actions');
    await dialog.getByRole('button', { name: 'New batch' }).click();
    await dialog
      .getByText(`Seeds ${seed + 9}–${seed + 16}`)
      .first()
      .waitFor(GENERATION);
    expect(await dialog.locator('ol[aria-label="Mazes generated"] > li').count()).toBe(8);
  });
});
