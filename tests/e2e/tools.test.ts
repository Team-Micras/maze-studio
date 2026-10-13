import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import {
  borderedMaze,
  clearArea,
  presetMaze,
  setGoalArea,
  setGoals,
  setStart,
  toggleGoal,
  toggleWall,
  wallRectangle,
  type Cell,
  type CellArea,
  type Edge,
  type Maze,
} from '@/maze';
import {
  contentOf,
  edgeMiddle,
  expectSaved,
  mineCount,
  mineId,
  pagePoint,
  repoContent,
  sameMaze,
} from '@tests/support/e2e/board-page';
import { openPage, waitForMode, worldCamera } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const CLASSIC = 'classic/AAMC15Maze.txt';

let browser: Browser;
const contexts: BrowserContext[] = [];

async function openMaze(path: string): Promise<Page> {
  const page = await openPage(browser, contexts, app, `#/repo/${path}`);
  await waitForMode(page, 'editor');
  return page;
}

/** Picks a tool by its key, from the canvas. */
async function pickTool(page: Page, key: string): Promise<void> {
  await page.locator('#canvas').focus();
  await page.keyboard.press(key);
}

async function cellCenter(page: Page, maze: Maze, cell: Cell) {
  return pagePoint(page, maze, { u: cell.x + 0.5, v: cell.y + 0.5 });
}

/** Presses on `from`'s cell and releases on `to`'s, with the mouse, Shift held if asked. */
async function dragCells(
  page: Page,
  maze: Maze,
  from: Cell,
  to: Cell,
  { shift = false }: { shift?: boolean } = {}
): Promise<void> {
  const start = await cellCenter(page, maze, from);
  const end = await cellCenter(page, maze, to);

  if (shift) {
    await page.keyboard.down('Shift');
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();

  if (shift) {
    await page.keyboard.up('Shift');
  }
}

async function clickCell(page: Page, maze: Maze, cell: Cell, shift = false): Promise<void> {
  await dragCells(page, maze, cell, cell, { shift });
}

/** Moves the keyboard cursor from where it shows first, (0, 0) or the start, to `cell`. */
async function cursorTo(page: Page, from: Cell, cell: Cell): Promise<void> {
  await page.locator('#canvas').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  const moves = [
    ...Array.from({ length: Math.abs(cell.x - from.x) }, () =>
      cell.x > from.x ? 'ArrowRight' : 'ArrowLeft'
    ),
    ...Array.from({ length: Math.abs(cell.y - from.y) }, () =>
      cell.y > from.y ? 'ArrowUp' : 'ArrowDown'
    ),
  ];

  for (const key of moves) {
    await page.keyboard.press(key);
  }
}

const AREA: CellArea = { from: { x: 2, y: 2 }, to: { x: 5, y: 4 } };

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('The cell tools with the mouse', () => {
  test('the rectangle walls in the cells dragged over', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await pickTool(page, 'r');
    await dragCells(page, maze, AREA.from, AREA.to);

    await expectSaved(page, sameMaze(wallRectangle(maze, AREA)));
  });

  test('the clear area takes away the walls inside the cells dragged over', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await pickTool(page, 'c');
    await dragCells(page, maze, AREA.to, AREA.from);

    await expectSaved(page, sameMaze(clearArea(maze, AREA)));
  });

  test('the start goes where it is clicked', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await pickTool(page, 's');
    await clickCell(page, maze, { x: 3, y: 6 });

    await expectSaved(page, sameMaze(setStart(maze, { x: 3, y: 6 })));
  });

  test('the goal: a click replaces it, a drag sets an area, Shift and a click add and remove, Shift and a drag is a drag', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await pickTool(page, 'g');
    await clickCell(page, maze, { x: 3, y: 3 });
    let expected = setGoals(maze, [{ x: 3, y: 3 }]);
    await expectSaved(page, sameMaze(expected));

    await clickCell(page, maze, { x: 10, y: 10 }, true);
    expected = toggleGoal(expected, { x: 10, y: 10 });
    await expectSaved(page, sameMaze(expected));
    await clickCell(page, maze, { x: 3, y: 3 }, true);
    expected = toggleGoal(expected, { x: 3, y: 3 });
    await expectSaved(page, sameMaze(expected));
    expect(expected.goals).toEqual([{ x: 10, y: 10 }]);

    await dragCells(page, maze, { x: 12, y: 12 }, { x: 13, y: 14 }, { shift: true });
    expected = setGoalArea(expected, { from: { x: 12, y: 12 }, to: { x: 13, y: 14 } });
    await expectSaved(page, sameMaze(expected));
    expect(expected.goals).toHaveLength(6);
  });
});

describe('The cell tools with the keyboard alone', () => {
  test('the rectangle and the clear area take two corners, each with Enter', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const origin = maze.start ?? { x: 0, y: 0 };
    await pickTool(page, 'r');
    await cursorTo(page, origin, AREA.from);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-layer="selection"]').count()).toBe(1);
    await cursorTo(page, AREA.from, AREA.to);
    await page.keyboard.press('Enter');
    let expected = wallRectangle(maze, AREA);
    await expectSaved(page, sameMaze(expected));

    await page.keyboard.press('c');
    await page.keyboard.press('Enter');
    await cursorTo(page, AREA.to, AREA.from);
    await page.keyboard.press('Enter');
    expected = clearArea(expected, AREA);
    await expectSaved(page, sameMaze(expected));
    expect(await page.locator('[data-layer="selection"]').count()).toBe(0);
  });

  test('the start takes Enter, and the goal two corners or Shift and Enter', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const origin = maze.start ?? { x: 0, y: 0 };
    await pickTool(page, 's');
    await cursorTo(page, origin, { x: 4, y: 1 });
    await page.keyboard.press('Enter');
    let expected = setStart(maze, { x: 4, y: 1 });
    await expectSaved(page, sameMaze(expected));

    await page.keyboard.press('g');
    await page.keyboard.press('Enter');
    await cursorTo(page, { x: 4, y: 1 }, { x: 5, y: 2 });
    await page.keyboard.press('Enter');
    expected = setGoalArea(expected, { from: { x: 4, y: 1 }, to: { x: 5, y: 2 } });
    await expectSaved(page, sameMaze(expected));
    expect(expected.start).toBeUndefined();

    await page.keyboard.press('Shift+Enter');
    expected = toggleGoal(expected, { x: 5, y: 2 });
    await expectSaved(page, sameMaze(expected));
    expect(expected.goals).toHaveLength(3);
  });

  test('Escape drops the corner Enter marked', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await pickTool(page, 'r');
    await cursorTo(page, maze.start ?? { x: 0, y: 0 }, { x: 3, y: 3 });
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-layer="selection"]').count()).toBe(1);
    await page.keyboard.press('Escape');

    await expect.poll(() => page.locator('[data-layer="selection"]').count()).toBe(0);
    expect(mineId(page)).toBeUndefined();
  });
});

describe('Close outer walls', () => {
  test('closes the border with B and from the menu', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const border: Edge = { direction: 'horizontal', x: 9, y: 0 };
    const point = await pagePoint(page, maze, edgeMiddle(border));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, border)));
    await page.keyboard.press('b');
    await expectSaved(page, sameMaze(maze));

    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, border)));
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Close outer walls/ }).click();
    await expectSaved(page, sameMaze(maze));
  });
});

describe('A finding of the checks', () => {
  test('clicked, brings its place on screen and marks it', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const border: Edge = { direction: 'vertical', x: 16, y: 14 };
    const point = await pagePoint(page, maze, edgeMiddle(border));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, border)));
    await page.locator('#canvas').focus();

    for (let zoom = 0; zoom < 8; zoom++) {
      await page.keyboard.press('+');
    }

    const before = await worldCamera(page);
    await page.getByRole('button', { name: /^Checks: 1 error/ }).click();
    await page.locator('[data-finding="closed-border"]').click();
    await expect.poll(() => page.locator('[data-layer="focus-area"]').count()).toBe(1);
    const box = await page.locator('[data-layer="focus-area"]').boundingBox();

    expect((await worldCamera(page)).x).not.toBeCloseTo(before.x, 0);
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });
});

describe('New maze', () => {
  test('of a custom 7 × 5 opens with its border only, and comes to My mazes at its first edit as "Untitled maze"', async () => {
    const page = await openPage(browser, contexts, app);
    await page.getByRole('button', { name: 'New maze' }).click();
    await page.getByRole('menuitem', { name: 'Custom size…' }).click();
    await page.getByRole('spinbutton', { name: 'Width' }).fill('7');
    await page.getByRole('spinbutton', { name: 'Height' }).fill('5');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await waitForMode(page, 'editor');
    const maze = borderedMaze(7, 5);

    expect(await page.locator('h1').textContent()).toBe('Untitled maze');
    expect(new URL(page.url()).hash).toBe('#/');
    expect(await mineCount(page)).toBe(0);

    const edge: Edge = { direction: 'vertical', x: 3, y: 2 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const item = await expectSaved(page, sameMaze(toggleWall(maze, edge)));

    expect(item.name).toBe('Untitled maze');
    expect(contentOf(item).maze.width).toBe(7);
    expect(await mineCount(page)).toBe(1);
  });

  test.each([
    ['classic', 'Classic, 16 × 16'],
    ['halfsize', 'Half size, 32 × 32'],
  ] as const)('%s opens with the start and the goal of the plan', async (preset, label) => {
    const page = await openPage(browser, contexts, app);
    await page.getByRole('button', { name: 'New maze' }).click();
    await page.getByRole('menuitem', { name: label }).click();
    await waitForMode(page, 'editor');
    const maze = presetMaze(preset);
    const edge: Edge = { direction: 'horizontal', x: 3, y: 3 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    const item = await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    const saved = contentOf(item).maze;
    const [low, high] = preset === 'classic' ? [7, 8] : [15, 16];

    expect(saved.start).toEqual({ x: 0, y: 0 });
    expect(saved.goals).toEqual(
      setGoalArea(saved, { from: { x: low, y: low }, to: { x: high, y: high } }).goals
    );
    expect(item.profile).toBe(preset);
  });
});

describe('The shortcut help', () => {
  test('opens with ? and from the menu, and Escape closes it', async () => {
    const page = await openMaze(CLASSIC);
    await page.locator('#canvas').focus();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await help.waitFor();
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();

    await expect.poll(() => help.isVisible()).toBe(true);
  });

  test('is not offered on a touch screen', async () => {
    const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`, {
      width: 390,
      height: 844,
      touch: true,
    });
    await waitForMode(page, 'editor');
    await page.getByRole('button', { name: 'More actions' }).tap();
    await page.getByRole('menuitem', { name: /Close outer walls/ }).waitFor();

    expect(await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).count()).toBe(0);
  });
});
