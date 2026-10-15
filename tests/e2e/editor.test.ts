import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import {
  borderedMaze,
  edgeOfCell,
  encodeMazeCode,
  hasWall,
  paintWalls,
  serializeMazeText,
  toggleWall,
  type Edge,
  type Maze,
} from '@/maze';
import { DATABASE_NAME } from '@/library/database';
import { boardGeometry } from '@/render';
import {
  contentOf,
  edgeMiddle,
  mineId,
  pagePoint,
  repoContent,
  repoText,
  sameMaze,
  expectSaved,
} from '@tests/support/e2e/board-page';
import {
  openPage,
  waitForMode,
  worldCamera,
  type PageOptions,
} from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const ROOT = join(import.meta.dirname, '..', '..');
const CLASSIC = 'classic/AAMC15Maze.txt';
const HALFSIZE = 'halfsize/japan2011hef.txt';
const MINE_ROUTE = /^#\/mine\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHONE: PageOptions = { width: 390, height: 844, touch: true };

let browser: Browser;
const contexts: BrowserContext[] = [];

type Post = readonly [number, number];

/** The posts a walk through `corners` passes, one cell at a time. */
function walk(corners: readonly Post[]): Post[] {
  const posts: Post[] = [corners[0] ?? [0, 0]];

  for (const [x, y] of corners.slice(1)) {
    for (let last = posts.at(-1); last !== undefined && (last[0] !== x || last[1] !== y);) {
      const next: Post = [last[0] + Math.sign(x - last[0]), last[1] + Math.sign(y - last[1])];
      posts.push(next);
      last = next;
    }
  }

  return posts;
}

/** The wall slots between consecutive posts. */
function slots(posts: readonly Post[]): Edge[] {
  return posts.slice(1).map(([x, y], index) => {
    const [px, py] = posts[index] ?? [x, y];
    return py === y
      ? { direction: 'horizontal', x: Math.min(px, x), y }
      : { direction: 'vertical', x, y: Math.min(py, y) };
  });
}

/** `maze` with a stroke over `edges`, which paints unless its first edge has a wall. */
function stroked(maze: Maze, edges: readonly Edge[]): Maze {
  const [first] = edges;
  return first === undefined ? maze : paintWalls(maze, edges, !hasWall(maze, first));
}

async function openMaze(path: string, options: PageOptions = {}): Promise<Page> {
  const page = await openPage(browser, contexts, app, `#/repo/${path}`, options);
  await waitForMode(page, 'editor');
  return page;
}

/** Draws through `corners` with the mouse in one gesture, `steps` moves to a cell. */
async function stroke(
  page: Page,
  maze: Maze,
  corners: readonly Post[],
  { steps = 4 }: { steps?: number } = {}
): Promise<void> {
  const posts = walk(corners);
  const [[x0, y0] = [0, 0], [x1, y1] = [0, 0]] = posts;
  const start = await pagePoint(page, maze, { u: x0 + (x1 - x0) * 0.2, v: y0 + (y1 - y0) * 0.2 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (const [x, y] of corners.slice(1)) {
    const point = await pagePoint(page, maze, { u: x, v: y });
    const cells = Math.max(1, Math.round(Math.hypot(x, y)));
    await page.mouse.move(point.x, point.y, { steps: Math.max(1, steps * cells) });
  }

  await page.mouse.up();
}

async function cellOnPage(page: Page, maze: Maze): Promise<number> {
  const box = await page.locator('[data-open-board] svg[data-board]').boundingBox();
  const geometry = boardGeometry(maze);
  return ((box?.width ?? 0) / geometry.width) * geometry.pitch;
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('The wall tool', () => {
  test('draws an L, a U and a zigzag, each in one gesture', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const shapes: readonly (readonly Post[])[] = [
      [
        [1, 1],
        [4, 1],
        [4, 4],
      ],
      [
        [6, 4],
        [6, 1],
        [9, 1],
        [9, 4],
      ],
      [
        [10, 6],
        [11, 6],
        [11, 7],
        [12, 7],
        [12, 8],
        [13, 8],
        [13, 9],
      ],
    ];
    let expected = maze;

    for (const shape of shapes) {
      await stroke(page, maze, shape);
      expected = stroked(expected, slots(walk(shape)));
    }

    await expectSaved(page, sameMaze(expected));

    for (const _ of shapes) {
      await page.keyboard.press('Control+z');
    }

    await expectSaved(page, sameMaze(maze));
  });

  test('keeps a straight line with ±40 % of tremor free of perpendiculars', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const start = await pagePoint(page, maze, { u: 1.2, v: 12 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();

    for (let step = 1; step <= 32; step++) {
      const point = await pagePoint(page, maze, {
        u: 1 + step * 0.25,
        v: 12 + (step % 2 === 0 ? 0.4 : -0.4),
      });
      await page.mouse.move(point.x, point.y);
    }

    await page.mouse.up();

    await expectSaved(
      page,
      sameMaze(
        stroked(
          maze,
          slots(
            walk([
              [1, 12],
              [9, 12],
            ])
          )
        )
      )
    );
  });

  test('walks every post of a fast move, leaving no gap', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const start = await pagePoint(page, maze, { u: 1.2, v: 14 });
    const end = await pagePoint(page, maze, { u: 13, v: 14 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 1 });
    await page.mouse.up();

    await expectSaved(
      page,
      sameMaze(
        stroked(
          maze,
          slots(
            walk([
              [1, 14],
              [13, 14],
            ])
          )
        )
      )
    );
  });

  test('locks the stroke on its axis while Shift is held', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await page.keyboard.down('Shift');
    await stroke(page, maze, [
      [2, 7],
      [5, 7],
      [5, 10],
      [8, 10],
    ]);
    await page.keyboard.up('Shift');

    await expectSaved(
      page,
      sameMaze(
        stroked(
          maze,
          slots(
            walk([
              [2, 7],
              [8, 7],
            ])
          )
        )
      )
    );
  });

  test('a click toggles the nearest slot, one step each', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const edge: Edge = { direction: 'vertical', x: 6, y: 9 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(maze));
    await page.keyboard.press('Control+z');

    await expectSaved(page, sameMaze(toggleWall(maze, edge)));
  });

  test('draws a closed cell with the mouse alone', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const cell = { x: 3, y: 10 };
    const sides = (['north', 'east', 'south', 'west'] as const).map((side) =>
      edgeOfCell(cell, side)
    );

    for (const edge of sides) {
      if (!hasWall(maze, edge)) {
        const point = await pagePoint(page, maze, edgeMiddle(edge));
        await page.mouse.click(point.x, point.y);
      }
    }

    await expectSaved(page, sameMaze(paintWalls(maze, sides, true)));
  });
});

describe('The first edit of a maze that is not in My mazes', () => {
  test('of a repository maze copies it to My mazes as "<name> (edited)", replacing the route, and leaves the original', async () => {
    const { maze, trailer } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const length = await page.evaluate(() => window.history.length);
    const edge: Edge = { direction: 'horizontal', x: 4, y: 5 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));

    expect(new URL(page.url()).hash).toMatch(MINE_ROUTE);
    expect(await page.evaluate(() => window.history.length)).toBe(length);
    await expect.poll(() => page.locator('h1').textContent()).toBe('AAMC15Maze (edited)');
    const item = await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    expect(item.origin?.path).toBe(CLASSIC);
    expect(contentOf(item).trailer).toBe(trailer);

    await page.goto(`${app}#/repo/${CLASSIC}`);
    await waitForMode(page, 'editor');
    expect(await page.locator('h1').textContent()).toBe('AAMC15Maze');
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.locator('h1').textContent()).toBe('AAMC15Maze (edited) 2');
  });

  test('of a link copies it too, under its own name', async () => {
    const { maze } = await repoContent(CLASSIC);
    const code = encodeMazeCode(maze, { name: 'Shared one' });
    const page = await openPage(browser, contexts, app, `#/m/${code}`);
    await waitForMode(page, 'editor');
    const edge: Edge = { direction: 'horizontal', x: 9, y: 9 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));

    expect(new URL(page.url()).hash).toMatch(MINE_ROUTE);
    await expect.poll(() => page.locator('h1').textContent()).toBe('Shared one (edited)');
    await expectSaved(page, sameMaze(toggleWall(maze, edge)));
  });

  test('of a .txt file copies it with the text after its grid', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openPage(browser, contexts, app);
    const folder = mkdtempSync(join(ROOT, 'node_modules', '.tmp', 'edit-file-'));
    const file = join(folder, 'corridor.txt');
    writeFileSync(file, `${repoText(CLASSIC)}Notes after the grid\n`);

    try {
      await page.locator('input[data-open-file]').setInputFiles(file);
      await page.getByRole('heading', { level: 1, name: 'corridor', exact: true }).waitFor();
      await waitForMode(page, 'editor');
      const edge: Edge = { direction: 'vertical', x: 5, y: 12 };
      const point = await pagePoint(page, maze, edgeMiddle(edge));
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));

      await expect.poll(() => page.locator('h1').textContent()).toBe('corridor (edited)');
      const item = await expectSaved(page, sameMaze(toggleWall(maze, edge)));
      expect(contentOf(item).trailer).toBe('Notes after the grid\n');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('in a tab whose copy another tab saved since, turns read-only and says so', async () => {
    const { maze } = await repoContent(CLASSIC);
    const first = await openMaze(CLASSIC);
    const click = async (page: Page, edge: Edge): Promise<void> => {
      const point = await pagePoint(page, maze, edgeMiddle(edge));
      await page.mouse.click(point.x, point.y);
    };
    const a: Edge = { direction: 'horizontal', x: 2, y: 9 };
    const b: Edge = { direction: 'horizontal', x: 12, y: 9 };
    const c: Edge = { direction: 'vertical', x: 7, y: 3 };
    await click(first, a);
    await expectSaved(first, sameMaze(toggleWall(maze, a)));
    const second = await first.context().newPage();
    await second.goto(`${app}#/mine/${mineId(first) ?? ''}`);
    await waitForMode(second, 'editor');
    await click(second, b);
    const both = toggleWall(toggleWall(maze, a), b);
    await expectSaved(second, sameMaze(both));
    await click(first, c);

    await expect
      .poll(() =>
        first
          .locator('p[aria-live="polite"]', { hasText: 'Opened in another tab. Reload to edit.' })
          .count()
      )
      .toBe(1);
    expect(await first.getByRole('radio', { name: 'Wall' }).isDisabled()).toBe(true);
    await first.waitForTimeout(300);
    await expectSaved(first, sameMaze(both));
  });

  test('undone to the start, saves the original file byte for byte', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await stroke(page, maze, [
      [3, 3],
      [3, 6],
      [6, 6],
    ]);
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    await page.keyboard.press('Control+z');
    const item = await expectSaved(page, sameMaze(maze));

    expect(serializeMazeText(contentOf(item))).toBe(repoText(CLASSIC));
  });
});

describe('A new maze before its first edit', () => {
  test('takes a name from its title, which its copy in My mazes keeps', async () => {
    const page = await openPage(browser, contexts, app);
    await page.getByRole('button', { name: 'New maze' }).first().click();
    await page.getByRole('menuitem', { name: 'Training, 16 × 16' }).click();
    await waitForMode(page, 'editor');
    await page.getByRole('button', { name: 'Untitled maze' }).click();
    await page
      .getByRole('dialog', { name: 'Rename' })
      .getByRole('textbox', { name: 'Name' })
      .fill('Practice run');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => page.locator('h1').textContent()).toBe('Practice run');
    expect(new URL(page.url()).hash).toBe('#/');
    const maze = borderedMaze(16, 16);
    const edge: Edge = { direction: 'horizontal', x: 4, y: 5 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    const saved = await expectSaved(page, sameMaze(toggleWall(maze, edge)));

    expect(saved.name).toBe('Practice run');
    expect(await page.locator('h1').textContent()).toBe('Practice run');
  });
});

describe('The Library button while editing', () => {
  test.each(
    (['new', 'file'] as const).flatMap((kind) =>
      (['#/', '#/?src=mine'] as const).flatMap((start) =>
        (['button', 'back'] as const).map((way) => ({ kind, start, way }))
      )
    )
  )(
    'leaves a $kind maze opened at $start by the $way once its first edit put it in My mazes',
    async ({ kind, start, way }) => {
      const page = await openPage(browser, contexts, app);

      if (start !== '#/') {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, start);
        await page.getByRole('heading', { name: 'Nothing in My mazes yet' }).waitFor();
      }

      const { maze: classic } = await repoContent(CLASSIC);
      const maze = kind === 'new' ? borderedMaze(16, 16) : classic;

      if (kind === 'new') {
        await page.getByRole('button', { name: 'New maze' }).first().click();
        await page.getByRole('menuitem', { name: 'Training, 16 × 16' }).click();
      } else {
        const file = join(mkdtempSync(join(ROOT, 'node_modules', '.tmp', 'library-')), 'a.txt');
        writeFileSync(file, repoText(CLASSIC));
        await page.locator('input[data-open-file]').setInputFiles(file);
      }

      await waitForMode(page, 'editor');
      const edge: Edge = { direction: 'horizontal', x: 4, y: 5 };
      const point = await pagePoint(page, maze, edgeMiddle(edge));
      await page.mouse.click(point.x, point.y);
      await expectSaved(page, sameMaze(toggleWall(maze, edge)));

      if (way === 'button') {
        await page.getByRole('button', { name: 'Back to the library' }).click();
      } else {
        await page.goBack();
      }

      await waitForMode(page, 'library');
      await page.waitForTimeout(800);
      expect(await page.locator('[data-studio-mode]').getAttribute('data-studio-mode')).toBe(
        'library'
      );
      expect(new URL(page.url()).hash).toMatch(/^#\/(\?.*)?$/);
      await page.goForward();
      await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
      await waitForMode(page, 'editor');
    }
  );

  test('leaves a repository maze opened from the library after its first edit', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openPage(browser, contexts, app);
    await page.locator(`a[data-artboard="repo:${CLASSIC}"]`).click();
    await waitForMode(page, 'editor');
    const edge: Edge = { direction: 'horizontal', x: 4, y: 5 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    await page.getByRole('button', { name: 'Back to the library' }).click();

    await waitForMode(page, 'library');
  });
});

describe('The maze list after an edit', () => {
  test('says the edited maze is saved in My mazes, and keeps saying so while the arrows switch', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const edge: Edge = { direction: 'horizontal', x: 4, y: 5 };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    await page.mouse.click(point.x, point.y);
    await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    await page.keyboard.press('l');
    const state = page.locator('[data-save-state]');

    await expect.poll(() => state.textContent()).toBe('AAMC15Maze (edited) is saved in My mazes');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () => document.querySelector('h1')?.textContent !== 'AAMC15Maze (edited)'
    );
    expect(await state.textContent()).toBe('AAMC15Maze (edited) is saved in My mazes');
  });

  test('says nothing for a maze of My mazes not edited in this session', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openPage(browser, contexts, app);
    await page.evaluate(
      ([database, code]) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(database);
          request.addEventListener('error', () =>
            reject(request.error ?? new Error('no database'))
          );
          request.addEventListener('success', () => {
            const db = request.result;
            const transaction = db.transaction('mine', 'readwrite');
            transaction.objectStore('mine').put({
              id: 'kept',
              name: 'Kept maze',
              code,
              profile: 'classic',
              createdAt: 1,
              updatedAt: 1,
              version: 1,
            });
            transaction.addEventListener('complete', () => {
              db.close();
              resolve();
            });
          });
        }),
      [DATABASE_NAME, encodeMazeCode(maze)] as const
    );
    await page.evaluate(() => window.history.replaceState(null, '', '#/mine/kept'));
    await page.reload();
    await waitForMode(page, 'editor');
    await page.keyboard.press('l');
    await page.getByPlaceholder('Filter mazes…').waitFor();

    expect(await page.locator('[data-save-state]').textContent()).toBe('');
  });

  test('says nothing for a maze not edited', async () => {
    const page = await openMaze(CLASSIC);
    await page.keyboard.press('l');
    await page.getByPlaceholder('Filter mazes…').waitFor();

    expect(await page.locator('[data-save-state]').textContent()).toBe('');
  });
});

describe('The Library button after ] put another maze in place', () => {
  test.each(['file', 'new', 'repo'] as const)(
    'returns to the library from a %s maze, never out of the app',
    async (kind) => {
      const page = await openPage(browser, contexts, app);

      if (kind === 'file') {
        const file = join(mkdtempSync(join(ROOT, 'node_modules', '.tmp', 'pin-')), 'a.txt');
        writeFileSync(file, repoText(CLASSIC));
        await page.locator('input[data-open-file]').setInputFiles(file);
      } else if (kind === 'new') {
        await page.getByRole('button', { name: 'New maze' }).first().click();
        await page.getByRole('menuitem', { name: 'Training, 16 × 16' }).click();
      } else {
        await page.locator(`a[data-artboard="repo:${CLASSIC}"]`).click();
      }

      await waitForMode(page, 'editor');
      const before = await page.locator('h1').textContent();
      await page.locator('[role="application"]').focus();
      await page.keyboard.press(']');
      await page.waitForFunction(
        (title) => document.querySelector('h1')?.textContent !== title,
        before
      );
      await page.getByRole('button', { name: 'Back to the library' }).click();

      await waitForMode(page, 'library');
      expect(new URL(page.url()).origin).toBe(new URL(app).origin);
      expect(new URL(page.url()).hash).toMatch(/^#\/(\?.*)?$/);
    }
  );
});

describe('The keyboard cursor', () => {
  test('on the canvas, the first arrow shows the cursor and the next ones move it', async () => {
    const page = await openMaze(CLASSIC);
    await page.locator('#canvas').focus();

    expect(await page.locator('[data-layer="cursor"]').count()).toBe(0);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('[data-layer="cursor"]').count()).toBe(1);
    await expect.poll(() => page.getByText(/^Cell \(0, 0\)/).count()).toBe(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');

    await expect.poll(() => page.getByText(/^Cell \(1, 1\)/).count()).toBe(1);
  });

  test('in the tools island, → moves the focus, ↓ moves the cursor, Shift and ↑ toggle its north wall', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    await page.getByRole('radio', { name: 'Hand' }).focus();
    await page.keyboard.press('ArrowRight');

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Wall');
    expect(await page.locator('[data-layer="cursor"]').count()).toBe(0);

    await page.getByRole('radio', { name: 'Wall' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.locator('[data-layer="cursor"]').count()).toBe(1);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('canvas');

    await page.getByRole('radio', { name: 'Wall' }).focus();
    await page.keyboard.press('Shift+ArrowUp');

    await expectSaved(page, sameMaze(toggleWall(maze, edgeOfCell({ x: 0, y: 0 }, 'north'))));
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('canvas');
  });

  test('draws a closed cell with the keyboard alone', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC);
    const cell = { x: 2, y: 1 };
    await page.locator('#canvas').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    let expected = maze;

    for (const [key, side] of [
      ['ArrowUp', 'north'],
      ['ArrowRight', 'east'],
      ['ArrowDown', 'south'],
      ['ArrowLeft', 'west'],
    ] as const) {
      await page.keyboard.press(`Shift+${key}`);
      expected = toggleWall(expected, edgeOfCell(cell, side));
    }

    await expectSaved(page, sameMaze(expected));
  });

  test('keeps the view on the cursor', async () => {
    const page = await openMaze(CLASSIC);
    await page.locator('#canvas').focus();

    for (let zoom = 0; zoom < 6; zoom++) {
      await page.keyboard.press('+');
    }

    await page.keyboard.press('ArrowRight');

    for (let step = 0; step < 15; step++) {
      await page.keyboard.press('ArrowRight');
    }

    for (let step = 0; step < 15; step++) {
      await page.keyboard.press('ArrowUp');
    }

    const box = await page.locator('[data-layer="cursor"]').boundingBox();

    expect(box).not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(72 - 1);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440 - 72 + 1);
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(80 - 1);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900 - 108 + 1);
  });
});

/** A phone `width` px wide with a `.txt` named `name` open, and how much of the title shows and needs. */
async function openTxt(
  width: number,
  name: string
): Promise<{ page: Page; shown: number; needed: number }> {
  const page = await openPage(browser, contexts, app, '#/', { width, height: 800, touch: true });
  await page.getByRole('button', { name: 'New maze and more' }).tap();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Open a .txt file…' }).tap(),
  ]);
  await chooser.setFiles({
    name: `${name}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(repoText(CLASSIC)),
  });
  await waitForMode(page, 'editor');
  await page.getByRole('button', { name: 'More actions' }).waitFor();
  const widths = await page.evaluate(() => {
    const title = document.querySelector('h1');
    return { shown: title?.clientWidth ?? 0, needed: title?.scrollWidth ?? 0 };
  });
  return { page, ...widths };
}

describe('A press on the board with the quick list open', () => {
  test.each([
    ['a notebook', {}],
    ['a phone', PHONE],
  ] as const)('on %s keeps the maze shown and edits it at once', async (_where, options) => {
    const page = await openMaze(CLASSIC, options);
    const touch = options === PHONE;

    if (touch) {
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
      await page.getByRole('button', { name: 'Maze list' }).tap();
    } else {
      await page.keyboard.press('l');
    }

    await page.locator('[cmdk-item]').first().waitFor();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent !== 'AAMC15Maze');
    const key =
      (await page.locator('[cmdk-item][aria-selected="true"]').getAttribute('data-value')) ?? '';
    const path = key.slice('repo:'.length);
    const { maze } = await repoContent(path);
    const sheet = touch
      ? await page.getByRole('dialog', { name: 'Maze list' }).boundingBox()
      : null;
    const visible = async (y: number): Promise<boolean> => {
      const at = await pagePoint(page, maze, edgeMiddle({ direction: 'vertical', x: 8, y }));
      return at.y > 80 && at.y < (sheet?.y ?? Infinity) - 10;
    };
    let row = maze.height - 2;

    while (row > 0 && !(await visible(row))) {
      row -= 1;
    }

    const edge: Edge = { direction: 'vertical', x: 8, y: row };
    const point = await pagePoint(page, maze, edgeMiddle(edge));
    expect(await visible(row)).toBe(true);
    expect(new URL(page.url()).hash).toBe(`#/repo/${CLASSIC}`);

    if (touch) {
      await page.touchscreen.tap(point.x, point.y);
    } else {
      await page.mouse.click(point.x, point.y);
    }

    const saved = await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    expect(saved.origin?.path).toBe(path);
    expect(
      await page.getByRole('button', { name: 'Maze list' }).getAttribute('aria-expanded')
    ).toBe('false');
    expect(await page.locator('[cmdk-item]').count()).toBe(0);
  });
});

describe('The title of a .txt on a phone', () => {
  test.each([360, 412])(
    'at %i px wide shows the whole name, and Save to My mazes is in ⋯ only while looking',
    async (width) => {
      const whole = await openTxt(width, 'Training corridor');
      const long = await openTxt(width, 'Open maze from the Japan 2026 contest final');
      console.info(
        `${width} px: whole ${whole.shown}/${whole.needed}, long ${long.shown}/${long.needed}`
      );

      expect(whole.needed).toBeLessThanOrEqual(whole.shown);
      expect(long.shown).toBeGreaterThanOrEqual(whole.needed);
      const { page } = whole;
      expect(await page.getByRole('button', { name: 'Save to My mazes' }).count()).toBe(0);
      await page.getByRole('button', { name: 'More actions' }).tap();
      await page.getByRole('menuitem', { name: 'Download .txt' }).waitFor();
      expect(await page.getByRole('menuitem', { name: 'Save to My mazes' }).count()).toBe(1);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
      await page.getByRole('button', { name: 'More actions' }).tap();
      await page.getByRole('menuitem', { name: 'Download .txt' }).waitFor();
      expect(await page.getByRole('menuitem', { name: 'Save to My mazes' }).count()).toBe(0);
    }
  );
});

/** The top islands of the editor and the title's shown width, once they have settled. */
async function topIslands(
  page: Page
): Promise<{ title: DOMRect; actions: DOMRect; name: number; width: number }> {
  await page.getByRole('button', { name: 'More actions' }).waitFor();
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const [title, actions] = [
      ...document.querySelectorAll('[data-chrome="editor"] header > *'),
    ].map((island) => island.getBoundingClientRect());
    return {
      title: title ?? new DOMRect(),
      actions: actions ?? new DOMRect(),
      name: document.querySelector('h1')?.clientWidth ?? 0,
      width: window.innerWidth,
    };
  });
}

/** Expects the two top islands apart, inside the screen, and the name at least `minimum` px wide. */
async function expectIslandsApart(page: Page, state: string, minimum = 80): Promise<void> {
  const { title, actions, name, width } = await topIslands(page);
  console.info(
    `${width} px ${state}: title ${title.left}-${title.right}, actions ${actions.left}-${actions.right}, name ${name}`
  );
  expect(title.right).toBeLessThanOrEqual(actions.left);
  expect(actions.right).toBeLessThanOrEqual(width);
  expect(name).toBeGreaterThanOrEqual(minimum);
}

describe('The top islands on a phone', () => {
  test.each([360, 412])(
    'at %i px never overlap, with a long name, Changes and Checks, looking and editing',
    async (width) => {
      const { maze } = await repoContent(CLASSIC);
      const page = await openPage(browser, contexts, app, `#/repo/${CLASSIC}`, {
        width,
        height: 800,
        touch: true,
      });
      await waitForMode(page, 'editor');
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
      const point = await pagePoint(page, maze, edgeMiddle({ direction: 'vertical', x: 8, y: 8 }));
      await page.touchscreen.tap(point.x, point.y);
      await page.locator('[data-changes-chip]').first().waitFor();
      await expectIslandsApart(page, 'repo copy, editing');

      const name = 'br2024-robochallenge-final-maze';
      await page.evaluate(
        (hash) => {
          window.location.hash = hash;
        },
        `#/m/${encodeMazeCode(maze, { name })}`
      );
      await expect.poll(() => page.locator('h1').textContent()).toBe(name);
      await expectIslandsApart(page, 'link, editing');
      await page.getByRole('button', { name: 'Done editing, back to viewing' }).tap();
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
      await expectIslandsApart(page, 'link, looking');

      await page.getByRole('button', { name: 'Back to the library' }).tap();
      await waitForMode(page, 'library');
      await page.getByRole('button', { name: 'New maze and more' }).tap();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: 'Open a .txt file…' }).tap(),
      ]);
      await chooser.setFiles({
        name: `${name}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(repoText(CLASSIC)),
      });
      await waitForMode(page, 'editor');
      await expectIslandsApart(page, '.txt, looking');
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
      await expectIslandsApart(page, '.txt, editing');
    }
  );
});

/** A phone with the classic maze edited once, so it is a maze of My mazes in Changes. */
async function editedOnPhone(): Promise<Page> {
  const { maze } = await repoContent(CLASSIC);
  const page = await openMaze(CLASSIC, PHONE);
  const edge: Edge = { direction: 'vertical', x: 8, y: 8 };
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
  const point = await pagePoint(page, maze, edgeMiddle(edge));
  await page.touchscreen.tap(point.x, point.y);
  await expectSaved(page, sameMaze(toggleWall(maze, edge)));
  return page;
}

describe('Round 3 on a phone', () => {
  test('a tap on the title opens Rename, whose Save renames', async () => {
    const page = await editedOnPhone();
    await page.getByRole('button', { name: 'AAMC15Maze (edited)' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Rename' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Practice run');
    await dialog.getByRole('button', { name: 'Save' }).tap();

    await expect.poll(() => page.locator('h1').textContent()).toBe('Practice run');
  });

  test('the title takes a tap 20 px above and below its middle, and is described as Rename', async () => {
    const page = await editedOnPhone();
    const title = page.getByRole('button', { name: 'AAMC15Maze (edited)' });
    await title.waitFor();
    const reached = await title.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      return [y - 20, y + 20].map(
        (at) => document.elementFromPoint(x, at)?.closest('button') === button
      );
    });
    const description = await title.evaluate(
      (button) =>
        document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent
    );

    expect(reached).toEqual([true, true]);
    expect(description).toBe('Rename');
  });

  test('Show changes names D as its shortcut but shows no key', async () => {
    const page = await editedOnPhone();
    await page.locator('[data-changes-chip]').first().tap();
    const show = page.getByRole('button', { name: 'Show changes' });
    await show.waitFor();

    expect(await show.getAttribute('aria-keyshortcuts')).toBe('D');
    expect(await show.locator('kbd').count()).toBe(0);
  });
});

describe('Editing on a phone', () => {
  test('Edit brings the tools, a tap edits at the fit, and the eye goes back to viewing', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC, PHONE);
    const edge: Edge = { direction: 'vertical', x: 8, y: 8 };
    const tapEdge = async (): Promise<void> => {
      const point = await pagePoint(page, maze, edgeMiddle(edge));
      await page.touchscreen.tap(point.x, point.y);
    };

    await tapEdge();
    expect(await page.getByRole('toolbar', { name: 'Tools' }).count()).toBe(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();
    await page.getByRole('toolbar', { name: 'Tools' }).waitFor();

    await tapEdge();
    await expectSaved(page, sameMaze(toggleWall(maze, edge)));

    await page.getByRole('button', { name: 'Done editing, back to viewing' }).tap();
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    expect(await page.getByRole('toolbar', { name: 'Tools' }).count()).toBe(0);
  });

  test.each([CLASSIC, HALFSIZE])(
    'on %s at 390 × 844, a tap edits at the fit, however small the cells',
    async (path) => {
      const { maze } = await repoContent(path);
      const page = await openMaze(path, PHONE);
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      await page.getByRole('toolbar', { name: 'Tools' }).waitFor();
      const edge: Edge = {
        direction: 'vertical',
        x: Math.floor(maze.width / 2),
        y: Math.floor(maze.height / 2),
      };
      const point = await pagePoint(page, maze, edgeMiddle(edge));

      expect(await cellOnPage(page, maze)).toBeLessThan(28);
      await page.touchscreen.tap(point.x, point.y);
      await expectSaved(page, sameMaze(toggleWall(maze, edge)));
    }
  );

  test('in edit mode, a second finger takes back the walls the first one painted', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC, PHONE);
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();

    for (let zoom = 0; zoom < 3; zoom++) {
      await page.getByRole('button', { name: 'Zoom in' }).tap();
    }

    const walls = (): Promise<string[]> =>
      page.evaluate(() =>
        ['red-walls', 'bare-walls'].map(
          (name) => document.querySelector(`[data-layer="${name}"]`)?.getAttribute('d') ?? ''
        )
      );
    const untouched = await walls();
    const session = await page.context().newCDPSession(page);
    const finger = async (
      type: 'touchStart' | 'touchMove',
      points: readonly { u: number; v: number }[]
    ) => {
      const touchPoints = await Promise.all(
        points.map(async (point, index) => ({
          ...(await pagePoint(page, maze, point)),
          id: index + 1,
        }))
      );
      await session.send('Input.dispatchTouchEvent', { type, touchPoints });
    };
    await finger('touchStart', [{ u: 6.2, v: 8 }]);

    for (let step = 1; step <= 8; step++) {
      await finger('touchMove', [{ u: 6.2 + step * 0.25, v: 8 }]);
    }

    await expect.poll(walls).not.toEqual(untouched);
    await finger('touchStart', [
      { u: 8.2, v: 8 },
      { u: 8.2, v: 10 },
    ]);
    await finger('touchMove', [
      { u: 8.2, v: 9 },
      { u: 8.2, v: 11 },
    ]);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);

    expect(await walls()).toEqual(untouched);
    expect(new URL(page.url()).hash).toBe(`#/repo/${CLASSIC}`);
  });

  test('in edit mode, a finger previews its slot, and a second one pans and leaves the walls alone', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(CLASSIC, PHONE);
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();

    for (let zoom = 0; zoom < 3; zoom++) {
      await page.getByRole('button', { name: 'Zoom in' }).tap();
    }

    const point = await pagePoint(page, maze, edgeMiddle({ direction: 'vertical', x: 8, y: 8 }));
    const before = await worldCamera(page);
    const session = await page.context().newCDPSession(page);
    const walls = (): Promise<string[]> =>
      page.evaluate(() =>
        ['red-walls', 'bare-walls'].map(
          (name) => document.querySelector(`[data-layer="${name}"]`)?.getAttribute('d') ?? ''
        )
      );
    const untouched = await walls();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1 }],
    });

    await expect.poll(() => page.locator('[data-layer="preview"]').count()).toBe(1);
    expect(await walls()).toEqual(untouched);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: point.x, y: point.y, id: 1 },
        { x: point.x + 60, y: point.y, id: 2 },
      ],
    });

    for (let step = 1; step <= 5; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: point.x, y: point.y + step * 12, id: 1 },
          { x: point.x + 60, y: point.y + step * 12, id: 2 },
        ],
      });
    }

    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);

    expect((await worldCamera(page)).y - before.y).toBeCloseTo(60, 0);
    expect(new URL(page.url()).hash).toBe(`#/repo/${CLASSIC}`);
    expect(await walls()).toEqual(untouched);
  });
});
